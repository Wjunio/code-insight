import { Worker } from 'node:worker_threads';
import type { AnalysisInput, AnalysisReport } from '../reports/report-types';

export function runAnalysis(workerPath: string, input: AnalysisInput, signal?: AbortSignal): Promise<AnalysisReport | null> {
  return runWorker<AnalysisReport>(workerPath, input, signal);
}
export function runWorker<T>(workerPath: string, input: unknown, signal?: AbortSignal): Promise<T | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Análise cancelada.')); return; }
    const worker = new Worker(workerPath, { workerData: input });
    let settled = false;
    const finish = (error?: Error, report?: T | null): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      void worker.terminate();
      if (error) reject(error); else resolve(report ?? null);
    };
    const cancel = (): void => finish(new Error('Análise cancelada.'));
    signal?.addEventListener('abort', cancel, { once: true });
    worker.once('message', (report: T | null) => finish(undefined, report));
    worker.once('error', error => finish(error));
    worker.once('exit', code => { if (!settled) finish(new Error(`Analisador encerrou sem relatório (código ${code}).`)); });
  });
}
