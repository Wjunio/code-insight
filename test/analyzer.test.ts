import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { AngularProjectAnalyzer } from '../src/analyzers/project-analyzer';
import type { AnalysisInput } from '../src/reports/report-types';
import { reportJson, reportText } from '../src/reports/report-generator';
import { countElements, validateMappings } from '../src/analyzers/rules/migration-rules';
import { runAnalysis } from '../src/utils/run-analysis';

const core = "import { Component, NgModule, Directive } from '@angular/core';\n";
test('Angular 14, 15 e 18 mantêm default false; 19 muda para true', () => {
  const code = core + '@Component({}) class A {} @Component({standalone:true}) class B {} @Component({standalone:false}) class C {}';
  for (const major of [14, 15, 18, 19]) {
    const report = analyze({ 'a.ts': code }, `${major}.0.0`);
    assert.deepEqual(report.components.map(c => c.standalone), [major >= 19, true, false]);
    assert.equal(report.angular.unknownComponents, 0);
  }
});
function input(sources: Record<string, string>, version: string | null = '18.2.0'): AnalysisInput {
  return { projectName: 'fixture', projectId: 'fixture-id', componentMappings: { input: 'sisbr-input-text', 'mat-icon': 'sisbr-icon' },
    files: Object.entries({ ...(version ? { 'package.json': JSON.stringify({ dependencies: { '@angular/core': version } }) } : {}), ...sources }).map(([path, content]) => ({ path, content })) };
}
function analyze(sources: Record<string, string>, version: string | null = '18.2.0') {
  const report = new AngularProjectAnalyzer().analyze(input(sources, version));
  assert.ok(report);
  return report;
}
test('TypeScript sem Angular e decorator homônimo não são Angular', () => {
  assert.equal(new AngularProjectAnalyzer().analyze(input({ 'main.ts': 'const a = 1;' }, null)), null);
  assert.equal(new AngularProjectAnalyzer().analyze(input({ 'main.ts': "import {Component} from 'other'; @Component({}) class A {}" }, null)), null);
});
test('detecta Angular por package.json, angular.json ou decorators importados', () => {
  assert.equal(analyze({}).framework, 'Angular');
  assert.equal(analyze({ 'angular.json': '{}' }, null).angular.totalComponents, 0);
  assert.equal(analyze({ 'a.ts': core + '@Component({standalone:true}) class A {}' }, null).angular.standaloneComponents, 1);
});
test('standalone explícito e defaults antes/depois de Angular 19', () => {
  const code = core + '@Component({}) class A {} @Component({standalone:false}) class B {} @Component({standalone:true}) class C {}';
  assert.equal(analyze({ 'a.ts': code }, '^18.0.0').angular.standaloneComponents, 1);
  assert.equal(analyze({ 'a.ts': code }, '^19.0.0').angular.standaloneComponents, 2);
});
test('versão ambígua e expressão dinâmica permanecem inconclusivas', () => {
  const report = analyze({ 'a.ts': core + '@Component({}) class A {} @Component({standalone: flag}) class B {} @Component(meta) class C {}' }, '>=18');
  assert.equal(report.angular.unknownComponents, 3);
  assert.equal(report.angular.migrationPercentage, 0);
  assert.ok(report.warnings.length >= 3);
});
test('spreads e shorthand não implicam defaults', () => {
  const report = analyze({ 'a.ts': core + '@Component({...meta}) class A {} @Component({standalone}) class B {} @Component({standalone:true,...meta}) class C {}' }, '19.0.0');
  assert.equal(report.angular.unknownComponents, 3);
});
test('propriedade computada posterior pode sobrescrever standalone', () => {
  assert.equal(analyze({ 'a.ts': core + '@Component({standalone:true,[key]:false}) class A {}' }, '19.0.0').angular.unknownComponents, 1);
});
test('NgModules resolvem aliases, barrels e arrays sem contar directives', () => {
  const report = analyze({
    'a.ts': core + '@Component({standalone:false}) export class A {} @Directive({}) export class D {}',
    'index.ts': "export { A, D } from './a';",
    'm.ts': core + "import { A as Alias, D } from './index'; const ITEMS = [Alias, D]; @NgModule({declarations:[...ITEMS]}) class M {} @NgModule({declarations:[Alias]}) class N {}"
  });
  assert.equal(report.angular.totalModules, 2);
  assert.equal(report.angular.moduleComponents, 1);
  assert.equal(report.angular.declaredModuleComponents, 1);
  assert.equal(report.components[0]?.declaredIn.length, 2);
  assert.equal(report.modules[0]?.componentIds.length, 1);
  assert.equal(report.modules[0]?.unresolvedDeclarations.length, 0);
});
test('classes homônimas em arquivos distintos não são confundidas', () => {
  const report = analyze({ 'a.ts': core + '@Component({}) export class A {}', 'b.ts': core + '@Component({}) export class A {}',
    'm.ts': core + "import { A } from './b'; @NgModule({declarations:[A]}) class M {}" });
  assert.equal(report.components.find(c => c.file === 'a.ts')?.declaredIn.length, 0);
  assert.equal(report.components.find(c => c.file === 'b.ts')?.declaredIn.length, 1);
});
test('imports namespace e aliases de decorators', () => {
  const report = analyze({ 'a.ts': "import * as ng from '@angular/core'; import {Component as C} from '@angular/core'; @ng.Component({standalone:true}) class A {} @C({standalone:false}) class B {}" });
  assert.equal(report.angular.totalComponents, 2);
  assert.equal(report.angular.migrationPercentage, 50);
});
test('percentual arredondado e projeto sem componentes', () => {
  assert.equal(analyze({ 'a.ts': core + '@Component({standalone:true}) class A {} @Component({}) class B {} @Component({}) class C {}' }).angular.migrationPercentage, 33.33);
  assert.equal(analyze({}).angular.migrationPercentage, 0);
});
test('input e mat-icon em templates inline/externos sem duplicar template compartilhado', () => {
  const report = analyze({
    'a.ts': core + '@Component({template:`<input><mat-icon></mat-icon>`}) class A {} @Component({templateUrl:"./shared.html"}) class B {} @Component({templateUrl:"./shared.html"}) class C {}',
    'shared.html': '<input/><input disabled><mat-icon>home</mat-icon>', 'unrelated.html': '<input>' });
  assert.equal(report.migrationRules.find(r => r.source === 'input')?.occurrences, 3);
  assert.equal(report.migrationRules.find(r => r.source === 'mat-icon')?.occurrences, 2);
  assert.deepEqual(report.migrationRules[0]?.files, ['a.ts', 'shared.html']);
});
test('scanner ignora comentários, atributos, interpolação, scripts e nomes parecidos', () => {
  const counts = countElements(`<!-- <input> --> <input-extra> {{ '<input>' }} <div title="<input>"></div> <script>const x = '<input>';</script><style>/* <input> */</style><INPUT/><mat-icon></mat-icon>`);
  assert.equal(counts.get('input'), 1); assert.equal(counts.get('mat-icon'), 1);
});
test('valida configurações e rejeita regex e valores inesperados', () => {
  assert.throws(() => validateMappings({ '.*': 'x' })); assert.throws(() => validateMappings({ input: 42 }));
  assert.throws(() => validateMappings([])); assert.deepEqual(validateMappings({}), {});
});
test('JSON contém IDs, data e schema para histórico; texto mostra métricas', () => {
  const report = analyze({ 'a.ts': core + '@Component({}) class A {}' });
  assert.deepEqual(JSON.parse(reportJson(report)), report); assert.equal(report.schemaVersion, 1);
  assert.equal(report.projectId, 'fixture-id'); assert.ok(Number.isFinite(Date.parse(report.analyzedAt)));
  assert.notEqual(report.analysisId, analyze({}).analysisId); assert.match(reportText(report), /Não Standalone: 1/);
});
test('versão mais próxima em monorepo determina default', () => {
  const report = analyze({ 'apps/old/package.json': '{"dependencies":{"@angular/core":"18.2.0"}}',
    'apps/old/a.ts': core + '@Component({}) class A {}', 'apps/new/a.ts': core + '@Component({}) class A {}' }, '19.0.0');
  assert.equal(report.angular.moduleComponents, 1); assert.equal(report.angular.standaloneComponents, 1);
});
test('declarações não resolvidas, sintaxe inválida e template ausente geram avisos', () => {
  const report = analyze({ 'a.ts': core + '@Component({templateUrl:"missing.html"}) class A {} @NgModule({declarations:load()}) class M {} const broken = ;' });
  assert.ok(report.warnings.some(w => w.includes('template não encontrado')));
  assert.ok(report.modules[0]?.unresolvedDeclarations.length); assert.ok(report.warnings.length >= 3);
});
test('worker executa análise real sem vscode', async () => {
  const report = await runAnalysis(join(__dirname, '../src/workers/analysis-worker.js'), input({ 'a.ts': core + '@Component({standalone:true}) class A {}' }));
  assert.equal(report?.structural?.angular.standaloneComponents, 1);
});
test('worker respeita cancelamento antes e durante execução', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runAnalysis(join(__dirname, '../src/workers/analysis-worker.js'), input({}), controller.signal), /cancelada/);
  const active = new AbortController(); const promise = runAnalysis(join(__dirname, '../src/workers/analysis-worker.js'), input({}), active.signal);
  active.abort(); await assert.rejects(promise, /cancelada/);
});
test('falha ao iniciar worker é propagada', async () => {
  await assert.rejects(runAnalysis(join(__dirname, 'missing-worker.js'), input({})));
});
