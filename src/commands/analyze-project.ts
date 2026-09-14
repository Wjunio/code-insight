import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import type { AnalysisReport } from '../reports/report-types';
import { readRuleConfiguration } from '../utils/rule-configuration';
import { readWorkspace } from '../utils/workspace-files';
import { runAnalysis } from '../utils/run-analysis';
import { analysisReportText } from '../reports/report-generator';
import { ExcelReportExporter, JsonReportExporter } from '../export/report-exporter';

export function registerCommands(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  let latest: { report: AnalysisReport; folder: vscode.WorkspaceFolder } | undefined;
  let running = false;
  const controllers = new Set<AbortController>();
  context.subscriptions.push({ dispose: () => controllers.forEach(c => c.abort()) });
  const execute = async (mode: AnalysisReport['mode']): Promise<void> => {
    if (running) { void vscode.window.showInformationMessage('Uma análise já está em andamento.'); return; }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { void vscode.window.showInformationMessage('Abra uma pasta ou workspace para analisar o projeto.'); return; }
    running = true;
    try {
      const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Selecione o projeto a analisar' });
      if (!folder) return;
      latest = undefined;
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Code Insight', cancellable: true }, async (progress, token) => {
        const controller = new AbortController();
        controllers.add(controller);
        const cancellation = token.onCancellationRequested(() => controller.abort());
        try {
          progress.report({ message: 'Lendo arquivos do projeto…' });
          const files = await readWorkspace(folder, token);
          if (token.isCancellationRequested) return;
          const migrationRules = mode === 'structural' ? [] : await readRuleConfiguration(folder);
          progress.report({ message: `Analisando ${files.length} arquivos…` });
          const report = await runAnalysis(context.asAbsolutePath('dist/src/workers/analysis-worker.js'), {
            projectName: folder.name, projectId: createHash('sha256').update(folder.uri.toString()).digest('hex'), files, migrationRules, mode
          }, controller.signal);
          if (token.isCancellationRequested) return;
          if (!report) { void vscode.window.showInformationMessage('Projeto Angular não identificado. Este fluxo exige Angular. Use UI Migration para HTML e templates Angular suportados.'); return; }
          latest = { report, folder };
          output.clear(); output.appendLine(analysisReportText(report)); output.show(true);
        } finally { cancellation.dispose(); controllers.delete(controller); }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      if (error instanceof vscode.CancellationError || message === 'Análise cancelada.') void vscode.window.showInformationMessage('Análise cancelada.');
      else void vscode.window.showErrorMessage(`Code Insight: ${message}`);
    } finally { running = false; }
  };
  for (const [command, mode] of [
    ['codeInsight.analyzeProject', 'complete'],
    ['codeInsight.analyzeStructural', 'structural'],
    ['codeInsight.analyzeUi', 'ui'],
    ['codeInsight.analyzeRoutes', 'routes']
  ] as const) context.subscriptions.push(vscode.commands.registerCommand(command, () => execute(mode)));
  let exporting = false;
  const exportReport = async (jsonOnly = false): Promise<void> => {
    if (exporting) { void vscode.window.showInformationMessage('Uma exportação já está em andamento.'); return; }
    const snapshot = latest;
    if (!snapshot) { void vscode.window.showInformationMessage('Execute uma análise Code Insight antes de exportar.'); return; }
    exporting = true;
    try {
      const format = jsonOnly ? 'json' : (await vscode.window.showQuickPick([
        { label: 'Excel (.xlsx)', description: 'Recomendado para leitura e acompanhamento', format: 'xlsx' },
        { label: 'JSON (.json)', description: 'Dados completos para integrações', format: 'json' }
      ], { placeHolder: 'Escolha o formato do relatório' }))?.format;
      if (!format) return;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(snapshot.folder.uri, `Code-Insight-Report.${format}`),
        filters: format === 'xlsx' ? { Excel: ['xlsx'] } : { JSON: ['json'] }, saveLabel: 'Exportar relatório'
      });
      if (!uri) return;
      let exists = false;
      try { await vscode.workspace.fs.stat(uri); exists = true; }
      catch (error) { if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error; }
      if (exists && await vscode.window.showWarningMessage('O arquivo já existe. Deseja substituí-lo?', { modal: true }, 'Substituir') !== 'Substituir') return;
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Exportando Code Insight', cancellable: true }, async (_progress, token) => {
        const controller = new AbortController(); controllers.add(controller);
        const cancellation = token.onCancellationRequested(() => controller.abort());
        try {
          if (token.isCancellationRequested) return;
          const exporter = format === 'xlsx' ? new ExcelReportExporter(context.asAbsolutePath('dist/src/workers/excel-worker.js')) : new JsonReportExporter();
          const bytes = await exporter.export(snapshot.report, controller.signal);
          if (token.isCancellationRequested) return;
          await vscode.workspace.fs.writeFile(uri, bytes);
          void vscode.window.showInformationMessage(`Relatório ${format === 'xlsx' ? 'Excel' : 'JSON'} exportado.`);
        } finally { cancellation.dispose(); controllers.delete(controller); }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      if (message === 'Análise cancelada.') void vscode.window.showInformationMessage('Exportação cancelada.');
      else void vscode.window.showErrorMessage(`Falha ao exportar: ${message}`);
    }
    finally { exporting = false; }
  };
  context.subscriptions.push(vscode.commands.registerCommand('codeInsight.exportReport', () => exportReport()));
  context.subscriptions.push(vscode.commands.registerCommand('codeInsight.exportJsonReport', () => exportReport(true)));
}
