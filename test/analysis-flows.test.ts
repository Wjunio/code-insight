import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProject } from '../src/analyzers/analysis-service';
import { analysisReportText, reportJson } from '../src/reports/report-generator';
import type { AnalysisInput } from '../src/reports/report-types';

const base: AnalysisInput = { projectId: 'test', projectName: 'test', files: [],
  migrationRules: [{ id: 'input', type: 'element', source: 'input', target: 'custom-input', enabled: true }] };
const angular = [
  { path: 'package.json', content: '{"dependencies":{"@angular/core":"19.0.0"}}' },
  { path: 'a.ts', content: "import {Component} from '@angular/core'; @Component({templateUrl:'./a.html'}) class A {} @Component({templateUrl:'./a.html'}) class B {}" },
  { path: 'a.html', content: '<input>' }
];
test('UI funciona em HTML puro sem Angular e sem métricas estruturais', () => {
  const report = analyzeProject({ ...base, mode: 'ui', files: [{ path: 'index.html', content: '<input>' }] });
  assert.ok(report); assert.equal(report.structural, null); assert.equal(report.ui?.totalOccurrences, 1);
  assert.equal(report.schemaVersion, 3); assert.doesNotMatch(analysisReportText(report), /Progresso estrutural/);
  assert.deepEqual(JSON.parse(reportJson(report)), report);
});
test('fluxos estrutural e completo exigem Angular', () => {
  for (const mode of ['structural', 'complete'] as const) assert.equal(analyzeProject({ ...base, mode }), null);
});
test('completo separa métricas e deduplica template compartilhado', () => {
  const report = analyzeProject({ ...base, files: angular });
  assert.ok(report); assert.equal(report.mode, 'complete');
  assert.equal(report.structural?.angular.totalComponents, 2); assert.equal(report.ui?.totalOccurrences, 1);
  assert.equal(report.ui?.analyzedTemplates, 1);
  assert.match(analysisReportText(report), /exclusivo Angular/);
  assert.match(analysisReportText(report), /Progresso estrutural: 100/);
});
test('estrutural não avalia regras nem templates faltantes', () => {
  const report = analyzeProject({ ...base, mode: 'structural', files: angular.slice(0, 2) });
  assert.ok(report); assert.equal(report.ui, null); assert.deepEqual(report.structural?.warnings, []);
  assert.doesNotMatch(analysisReportText(report), /MIGRAÇÃO DE INTERFACE/);
});
test('UI inclui HTML não referenciado e conserva múltiplos templates inline', () => {
  const report = analyzeProject({ ...base, mode: 'ui', files: [
    { path: 'a.ts', content: "import {Component} from '@angular/core'; @Component({template:'<input>'}) class A {} @Component({template:'<input>'}) class B {}" },
    { path: 'extra.html', content: '<input>' }
  ] });
  assert.equal(report?.ui?.totalOccurrences, 3); assert.equal(report?.ui?.analyzedTemplates, 3);
  assert.deepEqual(report?.ui?.warnings, []);
});
test('formatos ainda não suportados são sinalizados sem alegar análise React', () => {
  const report = analyzeProject({ ...base, mode: 'ui', files: [{ path: 'a.tsx', content: 'export const A = () => <input />;' }] });
  assert.equal(report?.ui?.analyzedTemplates, 0); assert.equal(report?.ui?.totalOccurrences, 0);
  assert.ok(report?.ui?.warnings.some(w => w.includes('não analisados')));
});
