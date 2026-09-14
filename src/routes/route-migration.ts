import ts from 'typescript';
import type { AnalysisInput, ProjectReport } from '../reports/report-types';
import { angularDecorator, createProgram, location } from '../utils/typescript';
import { collectComponentTemplates } from '../analyzers/angular/component-analyzer';
import { analyzeRules } from '../analyzers/rules/migration-rules';
import type { Template } from '../analyzers/rules/rule-types';
import { flattenRoutes, type RouteMapReport } from './route-types';

/** Associate templates by their decorator, never by filename conventions. */
export function enrichRouteMigration(input: AnalysisInput, routes: RouteMapReport, structural: ProjectReport | null): void {
  const program = createProgram(input.files);
  const checker = program.getTypeChecker();
  const contents = new Map(input.files.map(f => [f.path, f.content]));
  const components = new Map(structural?.components.map(c => [`${c.file}#${c.name}`, c]));
  const layouts = new Map<string, { templates: Template[]; warnings: string[] }>();
  for (const source of program.getSourceFiles()) {
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        const decorator = angularDecorator(node, 'Component', checker);
        if (decorator) {
          const templates = new Map<string, Template>();
          const warnings: string[] = [];
          collectComponentTemplates(node, decorator, contents, templates, warnings);
          const info = location(node);
          layouts.set(`${info.file}#${info.name}`, { templates: [...templates.values()], warnings });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const cache = new Map<string, NonNullable<ReturnType<typeof flattenRoutes>[number]['migration']>>();
  for (const node of flattenRoutes(routes.tree)) {
    const key = `${node.componentFile}#${node.componentName}`;
    if (!node.componentName && !node.componentFile) {
      const redirect = node.type === 'redirect';
      const group = node.children.length > 0;
      node.migration = { structural: redirect || group ? 'Não se aplica' : 'Inconclusivo',
        layout: redirect || group ? 'Não se aplica' : 'Inconclusivo', remaining: null, files: [],
        actions: redirect ? [`Redireciona para ${typeof node.redirectTo === 'string' ? node.redirectTo || '(rota vazia)' : 'destino não resolvido'}`]
          : group ? ['Ver rotas filhas.'] : ['Resolver o destino da rota para avaliar a migração.'] };
      continue;
    }
    if (cache.has(key)) { node.migration = cache.get(key)!; continue; }
    const component = components.get(key);
    const layout = layouts.get(key);
    const actions: string[] = [];
    const state = component?.standalone;
    if (state === false) actions.push(`Migrar ${component!.name} para standalone${component!.declaredIn.length ? `; revisar declarações em ${component!.declaredIn.join(', ')}` : ''}.`);
    else if (state !== true) actions.push('Verificar componente e configuração standalone.');
    const rules = analyzeRules(layout?.templates ?? [], input.migrationRules ?? input.componentMappings ?? {});
    const pending = rules.filter(r => r.remainingOccurrences > 0);
    const unknown = !layout?.templates.length || !!layout.warnings.length;
    const configured = rules.some(r => r.status !== 'ignored');
    for (const rule of pending) actions.push(`${rule.type}${rule.attribute ? ` (${rule.attribute})` : ''}: ${rule.source} → ${rule.target} (${rule.remainingOccurrences})`);
    if (!configured) actions.push('Configurar regras de migração de layout em .code-insight.json.');
    if (unknown) actions.push(...(layout?.warnings.length ? layout.warnings : ['Verificar template: não localizado ou não resolvido.']));
    node.migration = {
      structural: state === true ? 'Standalone' : state === false ? 'Pendente' : 'Inconclusivo',
      layout: !configured ? 'Sem regras' : unknown ? 'Inconclusivo' : pending.length ? 'Pendente' : 'Sem pendências nas regras',
      remaining: configured && !unknown ? pending.reduce((sum, r) => sum + r.remainingOccurrences, 0) : null,
      actions, files: [...new Set([...(component ? [`${component.file}:${component.line}`] : []), ...(layout?.templates.map(t => t.file) ?? [])])]
    };
    cache.set(key, node.migration);
  }
}
