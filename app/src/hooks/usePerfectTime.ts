import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStemStore } from '../store/stemStore';
import { useProjectStore } from '../store/projectStore';
import { perfectTimeAnalyze } from '../engine/tauri';
import type { DetectiveEventPayload } from '../engine/types';

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function usePerfectTime() {
  const stems = useStemStore((s) => s.stems);
  const setStemDetectiveResult = useStemStore((s) => s.setStemDetectiveResult);
  const setStemProcessingState = useStemStore((s) => s.setStemProcessingState);
  const projectBpm = useProjectStore((s) => s.project.bpm);

  // 1. Escuta de eventos concluídos do backend Tauri
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DetectiveEventPayload>('perfect_time_analyzed', (event) => {
        const payload = event.payload;
        console.log('[PerfectTime] Evento de análise recebido:', payload);

        // Acessa o estado mais recente para evitar recriação de efeito
        const currentStems = useStemStore.getState().stems;
        const trackId = Object.keys(currentStems).find(
          (id) => currentStems[id]?.filePath === payload.stem_path
        );

        // Fail-safe: se a stem foi removida pelo usuário durante a análise, ignora a injeção
        if (!trackId || !currentStems[trackId]) {
          console.warn('[PerfectTime] Análise concluída, mas a stem foi deletada. Ignorando.');
          return;
        }

        if (payload.status === 'success' && payload.result) {
          setStemDetectiveResult(trackId, payload.result);
          const nextState = payload.result.requires_manual_anchors
            ? 'awaiting_anchors'
            : 'processed';
          setStemProcessingState(trackId, nextState);
        } else {
          console.error('[PerfectTime] Erro de análise do Detetive para a track:', trackId, payload.error);
          setStemProcessingState(trackId, 'idle');
        }
      });
    };

    setupListener().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [setStemDetectiveResult, setStemProcessingState]);

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

