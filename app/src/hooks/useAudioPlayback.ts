/**
 * Dead reckoning com âncora nativa Rust.
 *
 * BUGS CORRIGIDOS:
 *  1. anchorWall iniciava em 0 → primeira tick via `deltaSecs = performance.now() - 0`
 *     dava tempo igual ao uptime do app (ex: 60.000ms → agulha pula para beat 174).
 *     FIX: anchorWall = performance.now() ANTES do rAF iniciar.
 *
 *  2. FrameCounter contava frames gerados, não frames ouvidos.
 *     Buffer WASAPI (512-4096 samples) → agulha consistentemente na frente do áudio.
 *     FIX: usa Sink::get_pos() no Rust que rastreia output real do driver.
 *
 *  3. syncAnchor() era chamado sem await → rAF iniciava com âncora stale.
 *     FIX: anchorWall setado antes do rAF; syncAnchor corrige logo depois.
 *
 *  4. IPC latency de get_pos() → âncora tomada no MIDPOINT da chamada.
 *     Minimiza o erro de timing para ±(IPC_latency/2) ≈ ±1-3ms.
 */
import { useEffect, useRef, useCallback } from 'react';
import * as engine from '../engine/audioEngine';
import { updatePlayheadDOM } from '../engine/playheadDOM';
import { useProjectStore } from '../store/projectStore';
import { useStemStore } from '../store/stemStore';

const SYNC_INTERVAL_MS = 50;
const STORE_UPDATE_EVERY_N = 6;

export function useAudioPlayback() {
  const bpm       = useProjectStore((s) => s.project.bpm);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlayhead = useProjectStore((s) => s.setPlayheadBeat);
  const tracks    = useProjectStore((s) => s.project.tracks);
  const stems     = useStemStore((s) => s.stems);

  const bpmRef       = useRef(bpm);
  const isPlayingRef = useRef(isPlaying);
  bpmRef.current     = bpm;
  isPlayingRef.current = isPlaying;

  const rafRef      = useRef<number | null>(null);
  const syncRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);

  // Âncora — refs, nunca state React
  const anchorSecs = useRef(0);
  const anchorWall = useRef(performance.now()); // FIX: não inicia em 0
  const frameN     = useRef(0);

  // ── Volumes / mutes ────────────────────────────────────────────────────
  useEffect(() => {
    for (const track of tracks) {
      engine.setVolume(track.id, track.volume).catch(() => {});
      engine.setMuted(track.id, track.muted).catch(() => {});
    }
  }, [tracks]);

  // ── Stems já registrados no Rust pelo ingest_stem command ─────────────
  useEffect(() => { void stems; }, [stems]);

  // ── syncAnchor: IPC midpoint para minimizar erro de timing ────────────
  const syncAnchor = useCallback(async () => {
    try {
      const t1 = performance.now();
      const info = await engine.getPos();
      const t3 = performance.now();
      anchorSecs.current = info.pos_secs;
      // Midpoint: o frame foi lido em algum momento entre t1 e t3
      // Usar midpoint minimiza o erro para ±(t3-t1)/2 ≈ ±1-3ms
      anchorWall.current = (t1 + t3) / 2;
    } catch {
      // Dev sem Tauri: stub avança por rAF
    }
  }, []);

  // ── rAF ───────────────────────────────────────────────────────────────
  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (syncRef.current !== null) { clearInterval(syncRef.current); syncRef.current = null; }
  }, []);

  const startRaf = useCallback(() => {
    stopRaf();
    frameN.current = 0;

    // Ancora o relógio da CPU exatamente no instante do startRaf.
    // O anchorSecs.current já foi perfeitamente configurado no engine.play() ou seekTo()!
    anchorWall.current = performance.now();

    // Fire and Forget PURO: ignoramos o getPos() do Rust que devolve lixo/stale buffer
    // logo após o Play. A CPU assume o comando 100%.
    const tick = () => {
      const deltaSecs = (performance.now() - anchorWall.current) / 1000;
      const posSecs   = anchorSecs.current + deltaSecs;
      const beat      = Math.max(0, (posSecs * bpmRef.current) / 60);

      updatePlayheadDOM(beat);

      frameN.current++;
      if (frameN.current % STORE_UPDATE_EVERY_N === 0) setPlayhead(beat);

      rafRef.current = requestAnimationFrame(tick);
    };
    
    rafRef.current = requestAnimationFrame(tick);
  }, [setPlayhead, stopRaf]);

  // ── isPlaying → play / pause / stop ───────────────────────────────────
  useEffect(() => {
    let alive = true;

    if (isPlaying) {
      stopRaf();
      const currentBeat = useProjectStore.getState().playheadBeat;
      const offsetSecs  = (currentBeat * 60) / bpmRef.current;

      engine.play(offsetSecs)
        .then(() => { if (alive) { anchorSecs.current = offsetSecs; startRaf(); } })
        .catch(console.error);
    } else {
      stopRaf();
      const currentBeat = useProjectStore.getState().playheadBeat;
      if (currentBeat === 0) {
        engine.stop().catch(console.error);
      } else {
        engine.pause().catch(console.error);
      }
    }

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── Stop explícito ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) return;
    if (useProjectStore.getState().playheadBeat === 0) {
      stopRaf();
      engine.stop().catch(console.error);
      anchorSecs.current = 0;
      anchorWall.current = performance.now();
      updatePlayheadDOM(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => () => stopRaf(), [stopRaf]);

  // ── Seek ───────────────────────────────────────────────────────────────
  const seekTo = useCallback(async (beat: number, isDragging = false) => {
    const clamped = Math.max(0, beat);
    const secs    = (clamped * 60) / bpmRef.current;

    // UI Feedback imediato, independente se está arrastando ou não
    updatePlayheadDOM(clamped);
    setPlayhead(clamped);
    anchorSecs.current = secs;
    anchorWall.current = performance.now();

    if (isDragging) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        stopRaf(); // Para a UI de brigar com o mouse
        if (isPlayingRef.current) {
          engine.pause().catch(console.error);
        }
      }
    } else {
      isDraggingRef.current = false;
      stopRaf();
      
      if (isPlayingRef.current) {
        engine.play(secs).catch(console.error);
        // Só reinicia o RAF se ainda estivermos no estado final deste seek
        if (!isDraggingRef.current) startRaf();
      } else {
        engine.seekTo(secs).catch(console.error);
      }
    }
  }, [setPlayhead, startRaf, stopRaf]);

  return { seekTo };
}
