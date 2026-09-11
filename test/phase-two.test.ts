import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { analyzeProject } from '../src/analyzers/analysis-service';
import { validateRules } from '../src/analyzers/rules/rule-config';
import { analyzeRules } from '../src/analyzers/rules/migration-rules';
import { ExcelReportExporter, JsonReportExporter } from '../src/export/report-exporter';
import { isInAnalysisScope } from '../src/utils/file-scope';

const defaultRule = { id: 'input', type: 'element', source: 'input', target: 'custom-input' };
test('Excel apresenta status de regra e rejeita texto acima do limite de célula', async () => {
  const report = analyze('<custom-input/>', [defaultRule, { ...defaultRule, id: 'missing', source: 'button', target: 'custom-button' }]);
  const exporter = new ExcelReportExporter(join(__dirname, '../src/workers/excel-worker.js'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await exporter.export(report)) as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('UI Migration')!;
  assert.equal(sheet.getCell('K3').value, 'Status');
  assert.equal(sheet.getCell('K4').value, 'Concluída');
  assert.equal(sheet.getCell('K5').value, 'Pendente');
  assert.equal(workbook.getWorksheet('Resumo')?.getCell('B24').value, 'Não analisado');
  report.projectName = 'x'.repeat(32768);
  await assert.rejects(exporter.export(report), /limite de célula/);
  assert.equal(JSON.parse(Buffer.from(await new JsonReportExporter().export(report)).toString()).projectName.length, 32768);
});
test('metadados computados sinalizam templates e declarações possivelmente ocultos', () => {
  const report = analyzeProject({ projectName: 'test', projectId: 'test', files: [{ path: 'a.ts', content:
    "import {Component, NgModule} from '@angular/core'; @Component({template:'<input>', [key]: value}) class A {} @NgModule({declarations:[A], [key]: value}) class M {}" }] });
  assert.ok(report?.ui?.warnings.some(w => w.includes('computadas')));
  assert.ok(report?.structural?.modules[0]?.unresolvedDeclarations.length);
});
test('escopo exclui dependências, builds, caches e .vscode sem excluir nomes parecidos', () => {
  for (const directory of ['node_modules', 'dist', '.angular', 'coverage', '.git', '.vscode']) {
    assert.equal(isInAnalysisScope(`${directory}/x.html`), false);
    assert.equal(isInAnalysisScope(`app\\${directory}\\x.ts`), false);
  }
  assert.equal(isInAnalysisScope('src/distribution/x.html'), true);
  assert.equal(isInAnalysisScope('src/app.spec.ts'), false);
  assert.equal(isInAnalysisScope('src/app.ts'), true);
});
function analyze(content: string, rules: unknown[] = [defaultRule]) {
  const report = analyzeProject({ mode: 'ui', projectName: 'Projeto de teste', projectId: 'fixture',
    files: [{ path: 'index.html', content }], migrationRules: validateRules(rules) });
  assert.ok(report); return report;
}
test('3 origens e 2 destinos: total 5, migrados 2, restantes 3, progresso 40%', () => {
  const report = analyze('<input><input><input><custom-input/><custom-input/>');
  assert.equal(report.ui?.totalOccurrences, 5); assert.equal(report.ui?.resolvedOccurrences, 2);
  assert.equal(report.ui?.remainingOccurrences, 3); assert.equal(report.ui?.progressPercentage, 40);
  assert.equal(report.overallPercentage, 40);
  assert.deepEqual(report.ui?.files[0], { file: 'index.html', ruleId: 'input', source: 'input', target: 'custom-input',
    totalOccurrences: 5, resolvedOccurrences: 2, remainingOccurrences: 3, progressPercentage: 40 });
});
test('destinos de classe, atributo e valor; targetType muda para elemento', () => {
  const cases = [
    { type: 'class', source: 'old', target: 'new', html: '<a class="old"></a><span class="new"></span>' },
    { type: 'attribute', source: 'old', target: 'new', html: '<input old><input new>' },
    { type: 'attribute-value', attribute: 'kind', source: 'old', target: 'new', html: '<a kind="old"></a><b kind="new"></b>' },
    { type: 'attribute', element: 'input', source: 'matInput', target: 'custom-input', targetType: 'element', html: '<input matInput><custom-input/>' }
  ];
  for (const { html, ...rule } of cases) {
    const report = analyze(html, [{ id: 'test', ...rule }]);
    assert.equal(report.ui?.totalOccurrences, 2); assert.equal(report.ui?.progressPercentage, 50);
  }
});
test('zero total, apenas destinos e coexistência de origem/destino no mesmo elemento', () => {
  assert.equal(analyze('').ui?.progressPercentage, 0);
  assert.equal(analyze('<custom-input/>').ui?.migrationRules[0]?.status, 'completed');
  const report = analyze('<a class="old new"></a>', [{ id: 'x', type: 'class', source: 'old', target: 'new' }]);
  assert.equal(report.ui?.remainingOccurrences, 1); assert.equal(report.ui?.resolvedOccurrences, 0);
});
test('prioridade, especificidade e empate por ID independem da ordem da configuração', () => {
  const rules = validateRules([defaultRule, { id: 'specific', type: 'attribute', element: 'input', source: 'matInput', target: 'custom', targetType: 'element' }]);
  const content = [{ file: 'a.html', content: '<input matInput>' }];
  assert.equal(analyzeRules(content, rules).find(r => r.ruleId === 'specific')?.remainingOccurrences, 1);
  assert.equal(analyzeRules(content, [{ ...rules[0]!, priority: 10 }, rules[1]!])[0]?.remainingOccurrences, 1);
  const shared = validateRules([{ ...defaultRule, id: 'b' }, { ...defaultRule, id: 'a' }]);
  const winner = (r: typeof shared) => analyzeRules([{ file: 'a.html', content: '<custom-input/>' }], r).find(x => x.totalOccurrences)?.ruleId;
  assert.equal(winner(shared), 'a'); assert.equal(winner([...shared].reverse()), 'a');
});
test('Excel real reabre com sete abas, métricas, filtros, percentuais e strings literais', async () => {
  const report = analyze('<input><custom-input/>');
  report.projectName = '=HYPERLINK("http://example.com")';
  const exporter = new ExcelReportExporter(join(__dirname, '../src/workers/excel-worker.js'));
  const bytes = await exporter.export(report);
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), 'PK');
  const folder = await mkdtemp(join(tmpdir(), 'code-insight-excel-'));
  const path = join(folder, 'Code-Insight-Report.xlsx');
  await writeFile(path, bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile(path) as unknown as ExcelJS.Buffer);
  assert.deepEqual(workbook.worksheets.map(s => s.name), ['Resumo', 'Estrutural', 'UI Migration', 'Arquivos', 'Ocorrências', 'Avisos', 'Histórico']);
  assert.equal(workbook.getWorksheet('Resumo')?.getCell('B4').value, report.projectName);
  assert.equal(workbook.getWorksheet('Resumo')?.getCell('B7').value, 'Não analisado');
  assert.equal(workbook.getWorksheet('Resumo')?.getCell('B20').value, 0.5);
  const sheet = workbook.getWorksheet('UI Migration')!;
  assert.equal(sheet.getCell('F3').value, 'Total'); assert.equal(sheet.getCell('G3').value, 'Migrados');
  assert.equal(sheet.getCell('F4').value, 2); assert.equal(sheet.getCell('G4').value, 1);
  assert.equal(sheet.getCell('I4').value, 0.5); assert.equal(sheet.getCell('I4').numFmt, '0.00%');
  assert.ok(sheet.autoFilter); assert.equal(sheet.views[0]?.state, 'frozen');
  assert.equal(workbook.getWorksheet('Ocorrências')?.getCell('I4').value, 'Pendente');
  assert.equal(workbook.getWorksheet('Ocorrências')?.getCell('I5').value, 'Migrado');
  assert.equal(workbook.getWorksheet('Histórico')?.rowCount, 4);
  assert.deepEqual(JSON.parse(Buffer.from(await new JsonReportExporter().export(report)).toString()), report);
});
test('Excel aceita UI não analisada e snapshots anteriores sem inventar dados', async () => {
  const report = analyzeProject({ mode: 'structural', projectId: 'fixture', projectName: 'test', files: [{ path: 'angular.json', content: '{}' }] });
  assert.ok(report);
  report.history = [{ projectId: 'fixture', analysisId: 'old', analyzedAt: '2026-01-01T00:00:00Z', mode: 'ui', structuralPercentage: null, uiPercentage: 25 }];
  const bytes = await new ExcelReportExporter(join(__dirname, '../src/workers/excel-worker.js')).export(report);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  assert.equal(workbook.getWorksheet('Resumo')?.getCell('B20').value, 'Não analisado');
  assert.equal(workbook.getWorksheet('UI Migration')?.rowCount, 3);
  assert.equal(workbook.getWorksheet('Histórico')?.rowCount, 5);
});
test('Excel cancela worker e propaga falha ao iniciar', async () => {
  const report = analyze('<input>');
  const controller = new AbortController();
  const result = new ExcelReportExporter(join(__dirname, '../src/workers/excel-worker.js')).export(report, controller.signal);
  controller.abort(); await assert.rejects(result, /cancelada/);
  await assert.rejects(new ExcelReportExporter(join(__dirname, 'missing.js')).export(report));
});

test('JSON consolida avisos e Excel preserva declarações de NgModules', async () => {
  const files = [{ path: 'a.ts', content: "import {Component, NgModule} from '@angular/core'; @Component({standalone:false}) class A {} @NgModule({declarations:[A, missing()]}) class M {} const broken = ;" }];
  const report = analyzeProject({ mode: 'complete', projectName: 'test', projectId: 'test', files });
  assert.ok(report?.structural);
  assert.ok(report.ui?.warnings.length);
  assert.deepEqual(report.warnings, [...new Set([...report.structural.warnings, ...report.ui.warnings])]);
  const json = JSON.parse(Buffer.from(await new JsonReportExporter().export(report)).toString());
  assert.deepEqual(json.warnings, report.warnings);
  const bytes = await new ExcelReportExporter(join(__dirname, '../src/workers/excel-worker.js')).export(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Estrutural')!;
  assert.equal(sheet.getCell('G3').value, 'Declarações');
  assert.equal(sheet.getCell('G5').value, report.structural.modules[0]?.declarations.join('\n'));
  assert.equal(sheet.getCell('H5').value, report.structural.modules[0]?.unresolvedDeclarations.join('\n'));
  assert.match(String(sheet.getCell('H5').value), /missing/);
  assert.equal(workbook.getWorksheet('Resumo')?.getCell('B24').value, 1);
});
