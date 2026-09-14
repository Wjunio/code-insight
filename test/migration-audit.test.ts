import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { analyzeProject } from '../src/analyzers/analysis-service';
import { flattenRoutes } from '../src/routes/route-types';
import { excelReport } from '../src/reports/excel-report';
import type { AnalysisInput } from '../src/reports/report-types';

const rule = { id: 'input', type: 'element' as const, source: 'input', target: 'app-input', enabled: true };
function analyze(sources: Record<string, string>, mode: AnalysisInput['mode'] = 'complete', migrationRules = [rule]) {
  const report = analyzeProject({ projectId: 'audit', projectName: 'Audit', mode, migrationRules,
    files: Object.entries({ 'package.json': '{"dependencies":{"@angular/core":"19.0.0"}}', ...sources }).map(([path, content]) => ({ path, content })) });
  assert.ok(report?.audit); return report;
}
function fixture(standalone: boolean, template: string, extra = '') {
  return { 'page.ts': `import {Component} from '@angular/core'; ${extra}
    @Component({standalone:${standalone},template:${JSON.stringify(template)}}) export class Page {}`,
  'routes.ts': `import {Routes} from '@angular/router'; import {Page} from './page'; const routes:Routes=[{path:'page',component:Page}];` };
}

for (const [standalone, html, expected] of [
  [true, '<app-input/>', 'COMPLETED'], [true, '<input><input><input>', 'PARTIAL'],
  [false, '<app-input/>', 'PENDING'], [false, '<input>', 'PENDING']] as const) {
  test(`route final status ${standalone}, ${html} => ${expected}`, () => {
    const report = analyze(fixture(standalone, html));
    const route = report.routes!.tree[0]!;
    assert.equal(route.audit?.standalone, standalone);
    assert.equal(route.audit?.finalStatus, expected);
    assert.equal(route.audit?.pendingOccurrences, html.split('<input>').length - 1);
    assert.equal(Object.values(report.audit!.routeCounts!).reduce((a, b) => a + b, 0), report.routes!.totalRoutes);
    for (const id of route.audit!.pendingItemIds) {
      const item = report.audit!.items.find(i => i.id === id)!;
      assert.ok(item.routeIds.includes(route.id)); assert.ok(item.line > 0); assert.ok(item.column > 0);
    }
  });
}

test('unresolved route and missing template are inconclusive, absent rules are not analyzed', () => {
  const dynamic = analyze({ 'r.ts': `import {Routes} from '@angular/router'; const routes:Routes=[{path:getPath(),loadComponent:()=>import('./missing')}];` });
  assert.equal(dynamic.routes!.tree[0]!.audit!.finalStatus, 'INCONCLUSIVE');
  const missing = analyze({ ...fixture(true, ''), 'page.ts': `import {Component} from '@angular/core'; @Component({standalone:true,templateUrl:'./missing.html'}) export class Page {}` });
  assert.equal(missing.routes!.tree[0]!.audit!.finalStatus, 'INCONCLUSIVE');
  const noRules = analyze(fixture(true, '<input>'), 'complete', []);
  assert.equal(noRules.routes!.tree[0]!.audit!.finalStatus, 'NOT_ANALYZED');
  assert.equal(noRules.routes!.tree[0]!.audit!.pendingOccurrences, null);
});

test('complete and route analysis independently populate every sheet from a fresh snapshot', async () => {
  for (const mode of ['complete', 'routes'] as const) {
    const report = analyze(fixture(false, '<input><app-input/>'), mode);
    assert.ok(report.structural); assert.ok(report.ui); assert.ok(report.routes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await excelReport(report)) as unknown as ExcelJS.Buffer);
    assert.deepEqual(workbook.worksheets.map(s => s.name), ['Resumo', 'Rotas', 'Pendências', 'Detalhes Rotas', 'Estrutural', 'UI Migration', 'Arquivos', 'Ocorrências', 'Avisos', 'Histórico']);
    for (const sheet of workbook.worksheets) {
      assert.ok(sheet.autoFilter); assert.equal(sheet.views[0]?.state, 'frozen');
      if (sheet.name !== 'Avisos') assert.ok(sheet.rowCount > 3, sheet.name);
    }
    const routes = workbook.getWorksheet('Rotas')!;
    assert.equal(routes.rowCount, report.routes.totalRoutes + 3);
    assert.equal(routes.getCell('C4').value, 'Não');
    assert.equal(routes.getCell('I4').value, 'Pendente');
    const pending = workbook.getWorksheet('Pendências')!;
    assert.equal(pending.rowCount, report.audit!.items.filter(i => i.status !== 'migrated').length + 3);
  }
});

test('zero routes is analyzed; individual structural/UI flows keep explicit not-analyzed routes', async () => {
  const complete = analyze({});
  assert.equal(complete.routes?.totalRoutes, 0);
  assert.deepEqual(complete.audit?.routeCounts, { COMPLETED: 0, PARTIAL: 0, PENDING: 0, INCONCLUSIVE: 0, NOT_ANALYZED: 0 });
  for (const mode of ['structural', 'ui'] as const) {
    const report = analyze(fixture(true, '<input>'), mode);
    assert.equal(report.routes, undefined); assert.equal(report.audit?.routeCounts, null);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await excelReport(report)) as unknown as ExcelJS.Buffer);
    assert.match(String(workbook.getWorksheet('Rotas')!.getCell('A2').value), /Não analisado/);
  }
});

test('shared external templates have one item with all explicit routes; unrelated HTML stays global', () => {
  const report = analyze({
    'p.ts': `import {Component} from '@angular/core';
      @Component({templateUrl:'./shared.html'}) export class A {}
      @Component({templateUrl:'./shared.html'}) export class B {}`,
    'shared.html': '<input>', 'global.html': '<input>',
    'r.ts': `import {Routes} from '@angular/router'; import {A,B} from './p'; const routes:Routes=[{path:'a',component:A},{path:'b',component:B}];`
  });
  assert.equal(report.ui!.totalOccurrences, 2);
  const shared = report.audit!.items.filter(i => i.file === 'shared.html');
  assert.equal(shared.length, 1); assert.equal(shared[0]!.routeIds.length, 2);
  assert.equal(report.audit!.items.find(i => i.file === 'global.html')!.routeIds.length, 0);
  for (const route of report.routes!.tree) assert.equal(route.audit!.pendingOccurrences, 1);
});

test('inline templates in one TS file are attributed by range, with original coordinates', () => {
  const report = analyze({
    'p.ts': `import {Component} from '@angular/core';
      @Component({template:'<input>'}) export class A {}
      @Component({template:'<app-input/>'}) export class B {}`,
    'r.ts': `import {Routes} from '@angular/router'; import {A,B} from './p'; const routes:Routes=[{path:'a',component:A},{path:'b',component:B}];`
  });
  assert.equal(report.routes!.tree[0]!.audit!.pendingOccurrences, 1);
  assert.equal(report.routes!.tree[1]!.audit!.pendingOccurrences, 0);
  assert.equal(report.audit!.items.find(i => i.status === 'pending')!.line, 2);
});

test('standalone route retains local transitive component and NgModule dependencies, with cycle protection', () => {
  const report = analyze({
    'p.ts': `import {Component,NgModule} from '@angular/core';
      @Component({standalone:false,template:'<input>'}) export class Old {}
      @NgModule({declarations:[Old],imports:[Shared]}) export class Shared {}
      @Component({standalone:true,imports:[Shared],template:'<app-input/>'}) export class Page {}`,
    'r.ts': `import {Routes} from '@angular/router'; import {Page} from './p'; const routes:Routes=[{path:'page',component:Page}];`
  });
  const route = report.routes!.tree[0]!;
  assert.equal(route.audit!.standalone, true); assert.equal(route.audit!.finalStatus, 'PARTIAL');
  assert.equal(route.audit!.moduleIds.length, 1); assert.equal(route.audit!.componentIds.length, 2);
  assert.equal(route.audit!.pendingOccurrences, 1);
  assert.ok(report.audit!.items.some(i => i.category === 'Dependência de NgModule'));
});

test('lazy NgModule is pending even with a standalone page; direct loadComponent has no module dependency', () => {
  const report = analyze({
    'p.ts': `import {Component,NgModule} from '@angular/core'; import {RouterModule} from '@angular/router';
      @Component({standalone:true,template:'<app-input/>'}) export class Page {}
      @NgModule({imports:[RouterModule.forChild([{path:'',component:Page}])]}) export class Feature {}`,
    'r.ts': `import {Routes} from '@angular/router'; const routes:Routes=[{path:'module',loadChildren:()=>import('./p').then(m=>m.Feature)},
      {path:'direct',loadComponent:()=>import('./p').then(m=>m.Page)}];`
  });
  const nodes = flattenRoutes(report.routes!.tree);
  assert.equal(nodes[1]!.audit!.finalStatus, 'PARTIAL');
  assert.equal(nodes[2]!.audit!.finalStatus, 'COMPLETED');
  assert.equal(nodes[2]!.audit!.moduleIds.length, 0);
});

test('unresolved imports never imply completed; aliases resolve local dependencies', () => {
  const report = analyze({
    'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@local/*":["src/*"]}}}',
    'src/p.ts': `import {Component} from '@angular/core'; import {Aux} from '@local/aux'; @Component({standalone:true,imports:[Aux],template:'<app-input/>'}) export class Page {}`,
    'src/aux.ts': `import {Component} from '@angular/core'; @Component({standalone:false,template:'<input>'}) export class Aux {}`,
    'r.ts': `import {Routes} from '@angular/router'; import {Page} from '@local/p'; const routes:Routes=[{path:'p',component:Page}];`
  });
  assert.equal(report.routes!.tree[0]!.audit!.finalStatus, 'PARTIAL');
  const unknown = analyze({ ...fixture(true, ''), 'page.ts': `import {Component} from '@angular/core'; import {External} from 'missing'; @Component({standalone:true,imports:[External],template:''}) export class Page {}` });
  assert.equal(unknown.routes!.tree[0]!.audit!.finalStatus, 'INCONCLUSIVE');
});

test('eager RouterModule configuration links its NgModule by syntax, including imported route arrays', () => {
  const report = analyze({ ...fixture(true, '<app-input/>'),
    'routes.ts': `import {Routes} from '@angular/router'; import {Page} from './page'; export const routes:Routes=[{path:'page',component:Page}];`,
    'routing-module.ts': `import {NgModule} from '@angular/core'; import {RouterModule} from '@angular/router'; import {routes} from './routes';
      @NgModule({imports:[RouterModule.forRoot(routes)]}) export class Routing {}`
  });
  assert.equal(report.routes!.tree[0]!.audit!.finalStatus, 'PARTIAL');
  assert.equal(report.routes!.tree[0]!.audit!.moduleIds.length, 1);
});

test('schema 3/4 export remains readable without inventing an audit', async () => {
  const report = analyze(fixture(true, '<app-input/>'));
  report.schemaVersion = 4;
  delete report.audit;
  for (const route of report.routes!.tree) delete route.audit;
  report.structural = null; report.ui = null;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excelReport(report)) as unknown as ExcelJS.Buffer);
  assert.equal(workbook.getWorksheet('Rotas')!.getCell('I4').value, 'Não analisada');
  assert.match(String(workbook.getWorksheet('Pendências')!.getCell('A2').value), /Não analisado/);
});
