import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { join } from 'node:path';
import type * as vscode from 'vscode';

test('comandos: workspace ausente, não Angular, análise real, exportação e erro de escrita', async () => {
  const messages: string[] = [];
  const errors: string[] = [];
  const output: string[] = [];
  const handlers = new Map<string, () => Promise<void>>();
  const uri = (path: string) => ({ path, toString: () => `file://${path}` });
  const folder = { name: 'fixture', uri: uri('/fixture'), index: 0 };
  const second = { name: 'second', uri: uri('/second'), index: 1 };
  let selectedFolder = folder;
  const secondSources: Record<string, string> = {
    'index.html': '<button><new-button/>',
    '.code-insight.json': JSON.stringify({ migrationRules: [{ id: 'second', type: 'element', source: 'button', target: 'new-button' }] })
  };
  let folders: unknown[] | undefined;
  let sources: Record<string, string> = { 'a.ts': 'const x = 1;' };
  let written = '';
  let rejectWrite = false;
  let saveCancelled = false;
  let selectedFormat: 'json' | 'xlsx' | undefined = 'json';
  let overwrite = true;
  let writtenBytes = new Uint8Array();
  let pickCount = 0;
  let cancelAnalysis = false;
  const documents: { uri: ReturnType<typeof uri>; getText(): string }[] = [];
  const subscriptions: { dispose(): unknown }[] = [];
  const disposable = () => ({ dispose: () => undefined });
  class FileSystemError extends Error { code = 'FileNotFound'; }
  const api = {
    FileSystemError,
    CancellationError: class extends Error {},
    ProgressLocation: { Notification: 15 },
    RelativePattern: class { constructor(public base: typeof folder) {} },
    Uri: { joinPath: (base: ReturnType<typeof uri>, name: string) => uri(`${base.path}/${name}`) },
    workspace: {
      get workspaceFolders() { return folders; },
      textDocuments: documents,
      findFiles: async (pattern: { base: typeof folder }) => Object.keys(pattern.base.uri.path === '/second' ? secondSources : sources)
        .map(name => uri(`${pattern.base.uri.path}/${name}`)),
      getConfiguration: () => ({ get: () => ({ input: 'sisbr-input-text' }) }),
      fs: {
        stat: async () => ({ size: 100 }),
        readFile: async (file: { path: string }) => {
          const content = file.path.startsWith('/second/') ? secondSources[file.path.slice('/second/'.length)] : sources[file.path.replace('/fixture/', '')];
          if (content === undefined) throw new FileSystemError();
          return Buffer.from(content);
        },
        writeFile: async (_uri: unknown, data: Uint8Array) => {
          if (rejectWrite) throw new Error('Sem permissão para escrever');
          written = Buffer.from(data).toString('utf8');
          writtenBytes = Uint8Array.from(data);
        }
      }
    },
    commands: { registerCommand: (id: string, callback: () => Promise<void>) => { handlers.set(id, callback); return disposable(); } },
    window: {
      showQuickPick: async () => selectedFormat ? { format: selectedFormat } : undefined,
      showWarningMessage: async () => overwrite ? 'Substituir' : undefined,
      showInformationMessage: async (message: string) => { messages.push(message); },
      showErrorMessage: async (message: string) => { errors.push(message); },
      showWorkspaceFolderPick: async () => { pickCount++; return selectedFolder; },
      showSaveDialog: async () => saveCancelled ? undefined : uri('/fixture/code-insight-report.json'),
      withProgress: async (_options: unknown, task: (progress: unknown, token: unknown) => Promise<void>) => task(
        { report: () => undefined }, { isCancellationRequested: cancelAnalysis, onCancellationRequested: disposable })
    }
  };
  // The only mocked boundary is VS Code; scanning, worker, AST and JSON are real.
  const loader = Module as unknown as { _load(id: string, ...args: unknown[]): unknown };
  const original = loader._load;
  loader._load = function (id, ...args) { return id === 'vscode' ? api : original.call(this, id, ...args); };
  try {
    const { registerCommands } = await import('../src/commands/analyze-project.js');
    registerCommands({ subscriptions, asAbsolutePath: (path: string) => join(__dirname, '../..', path) } as unknown as vscode.ExtensionContext,
      { appendLine: (text: string) => output.push(text), clear: () => { output.length = 0; }, show: () => undefined } as unknown as vscode.OutputChannel);
  } finally { loader._load = original; }
  const analyze = handlers.get('codeInsight.analyzeProject');
  const exportReport = handlers.get('codeInsight.exportReport');
  assert.ok(analyze); assert.ok(exportReport);
  try {
    await analyze(); assert.match(messages.at(-1) ?? '', /Abra uma pasta/);
    await exportReport(); assert.match(messages.at(-1) ?? '', /antes de exportar/);
    folders = [folder]; await analyze(); assert.match(messages.at(-1) ?? '', /Projeto Angular não identificado/);
    sources = { 'package.json': '{"dependencies":{"@angular/core":"19.0.0"}}',
      'a.ts': "import {Component} from '@angular/core'; @Component({template:'<input>'}) class A {}" };
    folders = [folder, { name: 'second', uri: uri('/second'), index: 1 }];
    await analyze(); assert.equal(pickCount, 1); assert.match(output.join('\n'), /Standalone: 1/);
    await exportReport();
    const report = JSON.parse(written) as import('../src/reports/report-types').AnalysisReport;
    assert.equal(report.structural?.angular.totalComponents, 1); assert.equal(report.ui?.migrationRules[0]?.occurrences, 1);
    sources['.code-insight.json'] = JSON.stringify({ migrationRules: [
      { id: 'custom', type: 'element', source: 'input', target: 'outro-input', enabled: true }
    ] });
    await analyze(); await exportReport();
    assert.equal(JSON.parse(written).ui.migrationRules[0].target, 'outro-input');
    documents.push({ uri: uri('/fixture/.code-insight.json'), getText: () => '{"migrationRules":[]}' });
    await analyze(); await exportReport(); assert.deepEqual(JSON.parse(written).ui.migrationRules, []);
    documents.length = 0;
    sources['.code-insight.json'] = '{ invalid';
    await analyze(); assert.match(errors.at(-1) ?? '', /JSON inválido/);
    await exportReport(); assert.match(messages.at(-1) ?? '', /antes de exportar/);
    const structural = handlers.get('codeInsight.analyzeStructural');
    const ui = handlers.get('codeInsight.analyzeUi');
    assert.ok(structural); assert.ok(ui);
    await structural(); await exportReport(); assert.equal(JSON.parse(written).ui, null);
    sources['.code-insight.json'] = '{"migrationRules":[]}';
    await analyze(); await exportReport(); assert.deepEqual(JSON.parse(written).ui.migrationRules, []);
    saveCancelled = true; written = ''; await exportReport(); assert.equal(written, '');
    saveCancelled = false; rejectWrite = true; await exportReport(); assert.match(errors.at(-1) ?? '', /Sem permissão/);
    sources = { 'a.ts': 'const x = 1;' }; await analyze(); await exportReport();
    assert.match(messages.at(-1) ?? '', /antes de exportar/);
    rejectWrite = false;
    sources = { 'index.html': '<input>' };
    await ui(); await exportReport();
    assert.equal(JSON.parse(written).structural, null);
    assert.equal(JSON.parse(written).ui.totalOccurrences, 1);
    selectedFolder = second;
    await ui(); await exportReport();
    assert.equal(JSON.parse(written).projectName, 'second');
    assert.equal(JSON.parse(written).ui.migrationRules[0].ruleId, 'second');
    assert.equal(JSON.parse(written).ui.totalOccurrences, 2);
    selectedFolder = folder;
    documents.push({ uri: uri('/fixture/index.html'), getText: () => '<input><input>' });
    await ui(); await exportReport();
    assert.equal(JSON.parse(written).ui.totalOccurrences, 2);
    documents[0] = { uri: uri('/fixture/index.html'), getText: () => 'x'.repeat(5 * 1024 * 1024 + 1) };
    await ui(); assert.match(errors.at(-1) ?? '', /5 MB/);
    documents[0] = { uri: uri('/fixture/.code-insight.json'), getText: () => ' '.repeat(1024 * 1024 + 1) };
    await ui(); assert.match(errors.at(-1) ?? '', /1 MB/);
    documents.length = 0;
    const savedSources = sources;
    sources = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`file-${i}.html`, '']));
    const largeContent = 'x'.repeat(5 * 1024 * 1024);
    for (const name of Object.keys(sources)) documents.push({ uri: uri(`/fixture/${name}`), getText: () => largeContent });
    await ui(); assert.match(errors.at(-1) ?? '', /100 MB/);
    await exportReport(); assert.match(messages.at(-1) ?? '', /antes de exportar/);
    documents.length = 0;
    sources = savedSources;
    cancelAnalysis = true;
    const errorCount = errors.length;
    await ui();
    assert.equal(errors.length, errorCount);
    await exportReport(); assert.match(messages.at(-1) ?? '', /antes de exportar/);
    cancelAnalysis = false;
    await ui();
    selectedFormat = undefined; written = ''; await exportReport(); assert.equal(written, '');
    selectedFormat = 'xlsx'; overwrite = false; await exportReport(); assert.equal(written, '');
    overwrite = true; await exportReport();
    assert.equal(Buffer.from(writtenBytes).subarray(0, 2).toString(), 'PK');
  } finally { subscriptions.forEach(s => s.dispose()); }
});
