import { parentPort, workerData } from 'node:worker_threads';
import type { AnalysisInput } from '../reports/report-types';
import { analyzeProject } from '../analyzers/analysis-service';

if (!parentPort) throw new Error('Analisador deve executar em uma worker thread.');
parentPort.postMessage(analyzeProject(workerData as AnalysisInput));
