import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { analyzeProject } from '../src/analyzers/analysis-service';
import { flattenRoutes } from '../src/routes/route-types';
import { analysisReportText, reportJson } from '../src/reports/report-generator';
import { excelReport } from '../src/reports/excel-report';
import { runAnalysis } from '../src/utils/run-analysis';
import type { AnalysisInput } from '../src/reports/report-types';

function input(sources: Record<string, string>): AnalysisInput {
  return { mode: 'routes', projectId: 'routes-test', projectName: 'Example',
    files: Object.entries(sources).map(([path, content]) => ({ path, content })) };
}
function analyze(sources: Record<string, string>) {
  const report = analyzeProject(input(sources));
  assert.ok(report?.routes);
  return report;
}
const page = `import {Component} from '@angular/core'; @Component({}) export class Page {}`;

test('component, arbitrary filename, nested children, empty paths, parameters and reverse relationship', () => {
  const report = analyze({ 'src/config/navigation.ts': `import {Routes as Navigation} from '@angular/router';
    import {Page as Renamed} from '../page';
    export const WHATEVER: Navigation = [{path:'admin', children:[{path:'', component:Renamed},
      {path:'usuarios', children:[{path:'permissoes', component:Renamed}]}]},
      {path:'parceiro/:id/:slug',component:Renamed}, {path:':id',component:Renamed}];`, 'src/page.ts': page });
  const nodes = flattenRoutes(report.routes!.tree);
  assert.deepEqual(nodes.map(n => n.fullPath), ['/admin', '/admin', '/admin/usuarios', '/admin/usuarios/permissoes', '/parceiro/:id/:slug', '/:id']);
  assert.equal(nodes[1]?.path, '');
  assert.equal(nodes[1]?.componentFile, 'src/page.ts');
  assert.equal(nodes[1]?.componentName, 'Page');
  assert.equal(report.routes!.componentRoutes[0]?.routeIds.length, 4);
  assert.deepEqual(report.warnings, []);
  assert.equal(new Set(nodes.map(n => n.id)).size, nodes.length);
});

for (const selection of ['m => m.Page', 'module => module.Page', '({Page}) => Page', '({Page: P}) => P']) {
  test(`loadComponent resolves barrel and callback ${selection}`, () => {
    const report = analyze({ 'routing.ts': `import {Routes} from '@angular/router';
      export default [{path:'dashboard',loadComponent:()=>import('./barrel').then(${selection})}] satisfies Routes;`,
    'barrel/index.ts': `export {Page} from '../page';`, 'page.ts': page });
    assert.equal(report.routes!.tree[0]?.componentFile, 'page.ts');
    assert.equal(report.routes!.tree[0]?.type, 'lazy-component');
    assert.deepEqual(report.warnings, []);
  });
}

test('lazy routing imports child routes under each mounting path without duplicate roots', () => {
  const report = analyze({ 'entry.ts': `import {provideRouter} from '@angular/router';
    provideRouter([{path:'app', children:[
      {path:'a',loadChildren:()=>import('./feature.routing').then(m=>m.OTHER)},
      {path:'b',loadChildren:()=>import('./feature.routing').then(m=>m.OTHER)}]}]);`,
  'feature.routing.ts': `import {Routes} from '@angular/router'; import {Page} from './page';
    export const OTHER: Routes = [{path:'',component:Page}, {path:'vendas',component:Page}];`, 'page.ts': page });
  assert.deepEqual(flattenRoutes(report.routes!.tree).map(n => n.fullPath), ['/app', '/app/a', '/app/a', '/app/a/vendas', '/app/b', '/app/b', '/app/b/vendas']);
  assert.equal(report.routes!.tree.length, 1);
  assert.deepEqual(report.warnings, []);
});

for (const direct of [false, true]) {
  test(`loadChildren module follows imported routing module and default route (direct=${direct})`, () => {
    const report = analyze({ 'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"funcionalidade/*":["src/features/*"]}}}',
      'src/entry.ts': `import {provideRouter} from '@angular/router'; provideRouter([
        {path:'destino',loadChildren:()=>import('funcionalidade/destino/component.module')${direct ? '' : '.then(m=>m.FeatureModule)'}}]);`,
      'src/features/destino/component.module.ts': `import {NgModule} from '@angular/core'; import {Routing} from './component.routing';
        @NgModule({imports:[Routing]}) export ${direct ? 'default' : ''} class FeatureModule {}`,
      'src/features/destino/component.routing.ts': `import {NgModule} from '@angular/core'; import {RouterModule} from '@angular/router';
        import {Page} from '../page'; const definitions = [{path:'',component:Page},{path:'child',component:Page}];
        @NgModule({imports:[RouterModule.forChild(definitions)]}) export class Routing {}`,
      'src/features/page.ts': page });
    assert.deepEqual(flattenRoutes(report.routes!.tree).map(n => n.fullPath), ['/destino', '/destino', '/destino/child']);
    assert.deepEqual(report.warnings, []);
  });
}

test('direct import of routing default export follows nested routes', () => {
  const report = analyze({ 'entry.ts': `import {Routes} from '@angular/router'; export const a:Routes=[{path:'x',loadChildren:()=>import('./routing')}];`,
    'routing.ts': `import {Routes} from '@angular/router'; export default [{path:'',children:[{path:'child',redirectTo:'/home'}]}] satisfies Routes;` });
  assert.deepEqual(flattenRoutes(report.routes!.tree).map(n => n.fullPath), ['/x', '/x', '/x/child']);
  assert.deepEqual(report.warnings, []);
});

test('guards, data, extensions of menu, redirects and wildcard remain distinct', () => {
  const report = analyze({ 'routing.ts': `import * as router from '@angular/router';
    const TITLE='Dashboard'; function authGuard() { throw new Error('must not run'); }
    export const definitions:router.Routes=[{path:'dashboard',canActivate:[authGuard],
      canMatch:[()=>import('./guard').then(m=>m.auth)],data:{title:TITLE,description:'Sales',requiredPermissions:['read']},
      menu:{icon:'home',visible:false}}, {path:'**',redirectTo:''}];`,
    'guard.ts': `export function auth() { throw new Error('must not run'); }` });
  const node = report.routes!.tree[0]!;
  assert.deepEqual(node.data, { title: 'Dashboard', description: 'Sales', requiredPermissions: ['read'] });
  assert.deepEqual(node.metadata, { menu: { icon: 'home', visible: false } });
  assert.equal(node.guards.canActivate?.[0]?.name, 'authGuard');
  assert.equal(node.guards.canMatch?.[0]?.file, 'guard.ts');
  assert.equal(report.routes!.tree[1]?.type, 'redirect');
  assert.equal(report.routes!.tree[1]?.wildcard, true);
  assert.equal(report.routes!.redirectRoutes, 1);
  assert.deepEqual(report.warnings, []);
});

test('unresolved configurations, imports, metadata and matcher warn without executing expressions', () => {
  const report = analyze({ 'routing.ts': `import {Routes} from '@angular/router';
    function factory() { throw new Error('must not run'); }
    const a:Routes=factory(); const b:Routes=[{path:factory(),data:{title:factory()},matcher:factory,
      loadComponent:()=>import('./absent').then(m=>m.Page)}, {path:'lazy',loadChildren:()=>import('./absent')},
      {path:'spread', ...factory()}];` });
  assert.ok(report.warnings.some(w => w.includes('configuration detected')));
  assert.ok(report.warnings.some(w => w.includes('loadComponent')));
  assert.ok(report.warnings.some(w => w.includes('loadChildren')));
  assert.ok(report.warnings.some(w => w.includes('matcher')));
  assert.equal(report.routes!.tree[0]?.fullPath, null);
  assert.equal(report.routes!.tree[0]?.componentFile, undefined);
  assert.equal(report.routes!.tree[0]?.status, 'partial');
  assert.equal(report.routes!.tree[2]?.path, null);
});

test('circular children terminate with a warning', () => {
  const report = analyze({ 'routing.ts': `import {Routes} from '@angular/router'; const a:Routes=[{path:'a',children:b}]; const b:Routes=[{path:'b',children:a}];` });
  assert.equal(report.routes!.totalRoutes, 2);
  assert.ok(report.warnings.some(w => w.includes('Circular')));
});

test('local fake Routes and RouterModule are not Angular evidence', () => {
  assert.equal(analyzeProject(input({ 'routing.ts': `type Routes=unknown[]; const x:Routes=[{path:'fake'}]; const RouterModule={forRoot:()=>{}}; RouterModule.forRoot([]);` })), null);
});

test('routing with a menu type extending Angular Route preserves extensions', () => {
  const report = analyze({ 'menu.ts': `import {Route} from '@angular/router'; export interface MenuRoute extends Route { icon:string }`,
    'routing.ts': `import {MenuRoute} from './menu'; const definition:MenuRoute[]=[{path:'home',icon:'home',data:{title:'Home'}}];` });
  assert.equal(report.routes!.tree[0]?.fullPath, '/home');
  assert.deepEqual(report.routes!.tree[0]?.metadata, { icon: 'home' });
});

test('spreads, aliases, multiple disconnected configurations and legacy lazy NgModule', () => {
  const report = analyze({ 'root.ts': `import {RouterModule} from '@angular/router';
    const segment={path:'home',redirectTo:''}; const shared=[segment]; RouterModule.forRoot([...shared,{path:'old',loadChildren:'./old#Old'}]);`,
    'old.ts': `import {NgModule} from '@angular/core'; import {RouterModule} from '@angular/router';
      @NgModule({imports:[RouterModule.forChild([{path:'',redirectTo:'child'}])]}) export class Old {}`,
    'extra.ts': `import {Routes} from '@angular/router'; const extra:Routes=[{path:'extra',redirectTo:''}];` });
  assert.deepEqual(flattenRoutes(report.routes!.tree).map(n => n.fullPath), ['/home', '/old', '/old', '/extra']);
  assert.deepEqual(report.warnings, []);
});

test('missing named/default exports never guess another route configuration', () => {
  const report = analyze({ 'entry.ts': `import {Routes} from '@angular/router'; const a:Routes=[{path:'x',loadChildren:()=>import('./target')}];`,
    'target.ts': `export const unrelated=[{path:'wrong'}];` });
  assert.equal(report.routes!.totalRoutes, 1);
  assert.ok(report.warnings.some(w => w.includes('loadChildren')));
});

test('dynamic children inherit unknown full path and all cyclic groups remain visible', () => {
  const report = analyze({ 'entry.ts': `import {Routes} from '@angular/router';
    const roots:Routes=[{path:getPath(),children:[{path:'child'}]}];
    const a:Routes=[{path:'a',children:b}]; const b:Routes=[{path:'b',children:a}];` });
  assert.equal(report.routes!.tree[0]?.children[0]?.fullPath, null);
  assert.ok(flattenRoutes(report.routes!.tree).some(n => n.path === 'a'));
  assert.ok(report.warnings.some(w => w.includes('Circular')));
});

test('JSON, output, Excel and worker expose the route report', async () => {
  const snapshot = input({ 'navigation.ts': `import {Routes} from '@angular/router'; const routes:Routes=[{path:'**',redirectTo:''}];` });
  const report = await runAnalysis(resolve('dist/src/workers/analysis-worker.js'), snapshot, new AbortController().signal);
  assert.ok(report?.routes);
  assert.equal(report.schemaVersion, 4);
  assert.equal(report.structural, null); assert.equal(report.ui, null);
  assert.equal(JSON.parse(reportJson(report)).routes.totalRoutes, 1);
  assert.match(analysisReportText(report), /ANGULAR ROUTE MAP/);
  assert.doesNotMatch(analysisReportText(report), /Progresso geral/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excelReport(report)) as unknown as ExcelJS.Buffer);
  assert.equal(workbook.getWorksheet('Rotas')?.getCell('A4').value, '/**');
  assert.equal(workbook.getWorksheet('Rotas')?.getCell('C4').value, 'redirect');
});
