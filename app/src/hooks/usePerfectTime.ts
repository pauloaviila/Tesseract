import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStemStore } from '../store/stemStore';
import { useProjectStore } from '../store/projectStore';
import { perfectTimeAnalyze, perfectTimeProcess } from '../engine/tauri';
import type { DetectiveEventPayload, ProcessedEventPayload } from '../engine/types';
import { pbRegisterStem } from '../engine/audioEngine';

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function clearTrackWarp(trackId: string) {
  const stem = useStemStore.getState().stems[trackId];
  if (!stem) return;
  useStemStore.getState().clearStemPerfectTimeResult(trackId);
  pbRegisterStem(trackId, stem.filePath);
}

export async function triggerPerfectTimeProcess(trackId: string, projectBpm: number) {
  const stem = useStemStore.getState().stems[trackId];
  if (!stem || !stem.detectiveResult) return;
  
  useStemStore.getState().setStemProcessingState(trackId, 'analyzing');
  
  if (!IS_TAURI) {
    console.log(`[PerfectTime] Mocking browser warp process for track: ${trackId}`);
    setTimeout(() => {
      useStemStore.getState().setStemPerfectTimeResult(trackId, {
        output_path: stem.filePath,
        stretch_ratio: 1.0,
        method_used: 'Slicing',
        architect_suggestion: {
          suggested_beat: 0,
          suggested_bar: 0,
          confidence: stem.detectiveResult?.confidence ?? 1.0,
          collision_warning: false,
          collision_element_id: null,
        }
      });
    }, 1000);
    return;
  }
  
  try {
    await perfectTimeProcess(stem.filePath, projectBpm, stem.anchors ?? null, stem.detectiveResult);
  } catch (err) {
    console.error('[PerfectTime] Erro ao chamar perfectTimeProcess:', err);
    useStemStore.getState().setStemProcessingState(trackId, stem.detectiveResult.requires_manual_anchors ? 'awaiting_anchors' : 'idle');
  }
}

export function usePerfectTime() {
  const stems = useStemStore((s) => s.stems);
  const setStemDetectiveResult = useStemStore((s) => s.setStemDetectiveResult);
  const setStemProcessingState = useStemStore((s) => s.setStemProcessingState);
  const setStemPerfectTimeResult = useStemStore((s) => s.setStemPerfectTimeResult);
  const projectBpm = useProjectStore((s) => s.project.bpm);

  // 1. Escuta de eventos concluídos do backend Tauri (Análise e Processamento)
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlistenAnalyze: (() => void) | undefined;
    let unlistenProcess: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenAnalyze = await listen<DetectiveEventPayload>('perfect_time_analyzed', (event) => {
        const payload = event.payload;
        console.log('[PerfectTime] Evento de análise recebido:', payload);

        const currentStems = useStemStore.getState().stems;
        const trackId = Object.keys(currentStems).find(
          (id) => currentStems[id]?.filePath === payload.stem_path
        );

        if (!trackId || !currentStems[trackId]) {
          console.warn('[PerfectTime] Análise concluída, mas a stem foi deletada. Ignorando.');
          return;
        }

        if (payload.status === 'success' && payload.result) {
          setStemDetectiveResult(trackId, payload.result);
          
          // Inicializa âncoras baseadas nos transientes detectados
          const bpm = useProjectStore.getState().project.bpm;
          const initialAnchors = payload.result.transients_ms.map((tMs) => {
            const beat = (tMs / 1000) * (bpm / 60);
            return {
              time_ms: tMs,
              beat: Math.round(beat * 8) / 8, // snap to 1/8 beat
            };
          });
          useStemStore.getState().setStemAnchors(trackId, initialAnchors);

          const nextState = payload.result.requires_manual_anchors
            ? 'awaiting_anchors'
            : 'processed';
          
          setStemProcessingState(trackId, nextState);
          
          // Se não precisa de âncoras manuais, já dispara o processamento automático
          if (!payload.result.requires_manual_anchors) {
            triggerPerfectTimeProcess(trackId, bpm);
          }
        } else {
          console.error('[PerfectTime] Erro de análise do Detetive para a track:', trackId, payload.error);
          setStemProcessingState(trackId, 'idle');
        }
      });

      unlistenProcess = await listen<ProcessedEventPayload>('perfect_time_processed', (event) => {
        const payload = event.payload;
        console.log('[PerfectTime] Evento de processamento recebido:', payload);

        const currentStems = useStemStore.getState().stems;
        const trackId = Object.keys(currentStems).find(
          (id) => currentStems[id]?.filePath === payload.stem_path
        );

        if (!trackId || !currentStems[trackId]) {
          console.warn('[PerfectTime] Processamento concluído, mas a stem foi deletada. Ignorando.');
          return;
        }

        if (payload.status === 'success' && payload.result) {
          setStemPerfectTimeResult(trackId, payload.result);
          pbRegisterStem(trackId, payload.result.output_path);
        } else {
          console.error('[PerfectTime] Erro de processamento para a track:', trackId, payload.error);
          setStemProcessingState(
            trackId,
            currentStems[trackId].detectiveResult?.requires_manual_anchors ? 'awaiting_anchors' : 'idle'
          );
        }
      });
    };

    setupListeners().catch(console.error);

    return () => {
      if (unlistenAnalyze) unlistenAnalyze();
      if (unlistenProcess) unlistenProcess();
    };
  }, [setStemDetectiveResult, setStemProcessingState, setStemPerfectTimeResult]);

  // 2. Scheduler e Acionador automático com limite de concorrência (max 2)
  useEffect(() => {
    // Passo 2a: Enfileira novos stems (sem estado ou 'idle')
    Object.keys(stems).forEach((trackId) => {
      const stem = stems[trackId];
      if (stem && (!stem.processingState || stem.processingState === 'idle')) {
        setStemProcessingState(trackId, 'queued');
      }
    });

    // Passo 2b: Conta quantas estão atualmente analisando
    const activeAnalyses = Object.keys(stems).filter(
      (trackId) => stems[trackId]?.processingState === 'analyzing'
    );

    if (activeAnalyses.length >= 2) {
      // Limite de concorrência atingido
      return;
    }

    // Passo 2c: Pega os próximos da fila
    const queuedStems = Object.keys(stems).filter(
      (trackId) => stems[trackId]?.processingState === 'queued'
    );

    const slotsAvailable = 2 - activeAnalyses.length;
    const toStart = queuedStems.slice(0, slotsAvailable);

    toStart.forEach((trackId) => {
      const stem = stems[trackId];
      if (!stem) return;

      // Altera o estado para 'analyzing'
      setStemProcessingState(trackId, 'analyzing');

      if (!IS_TAURI) {
        // No browser dev, gera resultados stub imediatamente
        console.log(`[PerfectTime] Mocking browser analysis for track: ${trackId}`);
        setTimeout(() => {
          // Fail-safe no mock caso a stem tenha sido deletada
          const currentStems = useStemStore.getState().stems;
          if (!currentStems[trackId]) {
            console.warn(`[PerfectTime] Análise mock concluída, mas a stem ${trackId} foi deletada. Ignorando.`);
            return;
          }
          setStemDetectiveResult(trackId, {
            bpm_estimated: projectBpm,
            confidence: 0.95,
            requires_manual_anchors: false,
            transients_ms: Array.from({ length: 16 }, (_, i) => i * 500),
            material_class: 'Percussive',
            spectral_flux_variance: 0.25,
            spectral_flatness: 0.45,
            band_weights: [0.8, 0.6, 0.4],
          });
          setStemProcessingState(trackId, 'processed');
        }, 1000);
        return;
      }

      console.log(`[PerfectTime] Iniciando análise automática para ${trackId}: ${stem.filePath} a ${projectBpm} BPM`);

      perfectTimeAnalyze(stem.filePath, projectBpm)
        .then((queued) => {
          console.log(`[PerfectTime] Job enfileirado com ID ${queued.job_id} para a track ${trackId}`);
        })
        .catch((err) => {
          console.error(`[PerfectTime] Falha ao enfileirar análise para ${trackId}:`, err);
          setStemProcessingState(trackId, 'idle');
        });
    });
  }, [stems, projectBpm, setStemProcessingState, setStemDetectiveResult]);
}

