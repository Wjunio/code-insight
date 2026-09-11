import { parentPort, workerData } from 'node:worker_threads';
import type { AnalysisReport } from '../reports/report-types';
import { excelReport } from '../reports/excel-report';

void excelReport(workerData as AnalysisReport).then(bytes => parentPort?.postMessage(bytes));
