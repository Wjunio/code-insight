import type { AnalysisReport } from '../reports/report-types';
import { reportJson } from '../reports/report-generator';
import { runWorker } from '../utils/run-analysis';

export interface ReportExporter {
  export(report: AnalysisReport, signal?: AbortSignal): Promise<Uint8Array>;
}
export class JsonReportExporter implements ReportExporter {
  async export(report: AnalysisReport): Promise<Uint8Array> { return Buffer.from(reportJson(report), 'utf8'); }
}
export class ExcelReportExporter implements ReportExporter {
  constructor(private readonly workerPath: string) {}
  async export(report: AnalysisReport, signal?: AbortSignal): Promise<Uint8Array> {
    const bytes = await runWorker<Uint8Array>(this.workerPath, report, signal);
    if (!bytes) throw new Error('Exportador Excel encerrou sem arquivo.');
    return bytes;
  }
}
