import ts from 'typescript';
import type { AnalysisInput, AnalysisReport } from './report-types';
import type { AuditItem, AuditStatus, RouteAudit } from './audit-types';
import type { Template } from '../analyzers/rules/rule-types';
import { collectComponentTemplates } from '../analyzers/angular/component-analyzer';
import { angularDecorator, createProgram, location, metadata, property, resolveDeclaration } from '../utils/typescript';
import { flattenRoutes } from '../routes/route-types';

const scope = 'Componentes das rotas e ancestrais, imports locais transitivos e templates declarados. NgModules exigem revisão; CSS, runtime e código de pacotes externos não são auditados. Concluída significa sem pendências conhecidas neste escopo.';

/** A single registry of work items, with many-to-many route/component references. */
export function consolidateAudit(input: AnalysisInput, report: AnalysisReport): void {
  const program = createProgram(input.files, true);
  const checker = program.getTypeChecker();
  const contents = new Map(input.files.map(f => [f.path, f.content]));
  const components = new Map(report.structural?.components.map(c => [c.id, c]));
  const modules = new Map(report.structural?.modules.map(m => [m.id, m]));
  const classes = new Map<string, ts.ClassDeclaration>();
  const templates = new Map<string, Template[]>();
  const edges = new Map<string, Set<string>>();
  const items = new Map<string, AuditItem>();
  const ownItems = new Map<string, Set<string>>();
  const routeModules = new Map<string, Set<string>>();
  const position = (node: ts.Node) => {
    const source = node.getSourceFile();
    const loc = source.getLineAndCharacterOfPosition(node.getStart());
    return { file: source.fileName.replace('/project/', ''), line: loc.line + 1, column: loc.character + 1 };
  };
  const add = (item: AuditItem, owner?: string): void => {
    items.set(item.id, item);
    if (owner) { const ids = ownItems.get(owner) ?? new Set<string>(); ids.add(item.id); ownItems.set(owner, ids); }
  };
  const issue = (owner: string, node: ts.Node, category: string, action: string, pending = false) => {
    const loc = position(node);
    const id = `${category}:${owner}:${loc.line}:${loc.column}:${action}`;
    add({ id, type: pending ? 'STRUCTURAL' : 'RESOLUTION', category, source: node.getText().slice(0, 180), target: '', ...loc,
      status: pending ? 'pending' : 'inconclusive', action, componentIds: components.has(owner) ? [owner] : [], routeIds: [] }, owner);
  };
  const registerModuleRoutes = (owner: string, expression: ts.Expression, active = new Set<ts.Node>()): void => {
    if (active.has(expression) || active.size > 200) return;
    const next = new Set(active).add(expression);
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isSpreadElement(expression)) {
      registerModuleRoutes(owner, expression.expression, next); return;
    }
    if (ts.isArrayLiteralExpression(expression)) { expression.elements.forEach(e => registerModuleRoutes(owner, e, next)); return; }
    if (ts.isObjectLiteralExpression(expression)) {
      const loc = position(expression); const key = `${loc.file}:${loc.line}:${loc.column}`;
      const owners = routeModules.get(key) ?? new Set<string>(); owners.add(owner); routeModules.set(key, owners);
      const children = property(expression, 'children'); if (children) registerModuleRoutes(owner, children, next);
      return;
    }
    const declaration = resolveDeclaration(expression, checker);
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && (declaration.parent.flags & ts.NodeFlags.Const)) registerModuleRoutes(owner, declaration.initializer, next);
  };
  for (const source of program.getSourceFiles()) {
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) classes.set(location(node).id, node);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const [id, node] of classes) {
    const component = angularDecorator(node, 'Component', checker);
    const module = angularDecorator(node, 'NgModule', checker);
    if (!component && !module) continue;
    const object = metadata((component ?? module)!);
    if (component && report.ui) {
      const collected = new Map<string, Template>();
      const warnings: string[] = [];
      collectComponentTemplates(node, component, contents, collected, warnings);
      templates.set(id, [...collected.values()]);
      if (!collected.size && !warnings.length) warnings.push('Template não localizado; revisar componente.');
      for (const warning of warnings) issue(id, node, 'Template', warning);
    }
    if (!report.structural) continue;
    if (component) {
      const state = components.get(id);
      if (report.structural && state?.standalone !== true) issue(id, node, 'Standalone', state?.standalone === false
        ? `Migrar ${state.name} para Standalone.` : 'Verificar versão Angular e metadados standalone.', state?.standalone === false);
      if (state?.standalone && state.declaredIn.length) issue(id, node, 'Declaração em NgModule', `Revisar ${state.name}: Standalone ainda declarado em NgModule.`, true);
      for (const moduleId of state?.declaredIn ?? []) {
        const linked = edges.get(id) ?? new Set<string>(); linked.add(moduleId); edges.set(id, linked);
      }
    }
    if (!object || object.properties.some(p => ts.isSpreadAssignment(p) || (p.name && ts.isComputedPropertyName(p.name)))) {
      issue(id, node, 'Metadados', 'Revisar metadados indiretos: dependências não determinadas.');
    }
    if (program.getSyntacticDiagnostics(node.getSourceFile()).length) issue(id, node, 'Sintaxe', 'Corrigir ou revisar erros sintáticos antes de concluir a migração.');
    const dependencies = edges.get(id) ?? new Set<string>();
    edges.set(id, dependencies);
    const walk = (expression: ts.Expression, active = new Set<ts.Node>()): void => {
      if (active.has(expression) || active.size > 100) { issue(id, expression, 'Import', 'Revisar dependência circular ou limite de resolução.'); return; }
      const next = new Set(active).add(expression);
      if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isSpreadElement(expression)) { walk(expression.expression, next); return; }
      if (ts.isArrayLiteralExpression(expression)) { expression.elements.forEach(e => walk(e, next)); return; }
      if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
        && ['forRoot', 'forChild'].includes(expression.expression.name.text)) {
        const binding = checker.getSymbolAtLocation(expression.expression.expression)?.declarations?.[0];
        if (binding && ts.isImportSpecifier(binding) && (binding.propertyName ?? binding.name).text === 'RouterModule') {
          const declaration = binding.parent.parent.parent;
          if (ts.isImportDeclaration(declaration) && ts.isStringLiteral(declaration.moduleSpecifier) && declaration.moduleSpecifier.text === '@angular/router') {
            if (module && expression.arguments[0]) registerModuleRoutes(id, expression.arguments[0]);
            return;
          }
        }
      }
      const declaration = resolveDeclaration(expression, checker);
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && (declaration.parent.flags & ts.NodeFlags.Const)) { walk(declaration.initializer, next); return; }
      if (declaration && ts.isClassDeclaration(declaration)) {
        const target = location(declaration).id;
        if (components.has(target) || modules.has(target)) dependencies.add(target);
        else issue(id, expression, 'Dependência', `Revisar dependência fora do escopo de componentes/NgModules: ${expression.getText()}.`);
        return;
      }
      issue(id, expression, 'Import', `Revisar import não resolvido: ${expression.getText()}.`);
    };
    // Declared/exported classes belong to the module scope; do not infer template selectors.
    for (const key of module ? ['imports', 'declarations', 'exports'] : ['imports']) {
      const expression = property(object, key);
      if (expression) walk(expression);
    }
  }
  for (const dependencies of edges.values()) for (const member of dependencies) {
    const module = modules.get(member);
    if (!module || items.has(`module:${member}`)) continue;
    add({ id: `module:${member}`, type: 'STRUCTURAL', category: 'Dependência de NgModule', source: module.name,
      target: 'Revisar imports/rotas standalone', file: module.file, line: module.line,
      column: position(classes.get(member)!).column, status: 'pending', action: `Revisar dependência de ${module.name}; substituir por imports/rotas standalone quando aplicável.`,
      componentIds: [], routeIds: [] }, member);
  }
  // Create each UI occurrence once. Exact inline offsets avoid attributing two classes in one TS file to each other.
  const byFile = new Map<string, { owner: string; start: number; end: number }[]>();
  for (const [owner, list] of templates) for (const template of list) {
    const ranges = byFile.get(template.file) ?? [];
    ranges.push({ owner, start: template.sourceOffsets?.[0] ?? 0,
      end: template.sourceOffsets ? (template.sourceOffsets.at(-1) ?? -1) + 1 : Infinity });
    byFile.set(template.file, ranges);
  }
  const lineStarts = new Map<string, number[]>();
  const offset = (file: string, line: number, column: number): number => {
    let starts = lineStarts.get(file);
    if (!starts) {
      starts = [0]; const content = contents.get(file) ?? '';
      for (let i = 0; i < content.length; i++) if (content[i] === '\n') starts.push(i + 1);
      lineStarts.set(file, starts);
    }
    return (starts[line - 1] ?? 0) + column - 1;
  };
  report.ui?.migrationRules.forEach((rule, r) => rule.matches.forEach((match, m) => {
    const at = offset(match.file, match.line, match.column);
    const owners = [...new Set((byFile.get(match.file) ?? []).filter(t => at >= t.start && at < t.end).map(t => t.owner))];
    const item: AuditItem = { id: `ui:${r}:${m}`, type: 'UI', category: match.type, ruleId: match.ruleId,
      source: match.source, target: match.target, file: match.file, line: match.line, column: match.column,
      status: match.status, action: match.status === 'pending' ? `${match.source} → ${match.target}` : 'Destino encontrado',
      componentIds: owners, routeIds: [], occurrence: { rule: r, match: m } };
    add(item); for (const owner of owners) { const ids = ownItems.get(owner) ?? new Set<string>(); ids.add(item.id); ownItems.set(owner, ids); }
  }));
  const nodes = flattenRoutes(report.routes?.tree ?? []);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const byName = new Map([...classes].map(([id, node]) => [`${position(node).file}#${location(node).name}`, id]));
  const closures = new Map<string, Set<string>>();
  const closure = (start: string): Set<string> => {
    if (closures.has(start)) return closures.get(start)!;
    const result = new Set<string>(); const queue = [start];
    while (queue.length) { const id = queue.pop()!; if (result.has(id)) continue; result.add(id); queue.push(...(edges.get(id) ?? [])); }
    closures.set(start, result); return result;
  };
  const counts: Record<AuditStatus, number> = { COMPLETED: 0, PARTIAL: 0, PENDING: 0, INCONCLUSIVE: 0, NOT_ANALYZED: 0 };
  for (const node of [...nodes].reverse()) {
    const members = new Set<string>();
    const ids = new Set<string>();
    let cursor: typeof node | undefined = node;
    while (cursor) {
      const loc = cursor.sourceLocation;
      for (const owner of routeModules.get(`${loc.file}:${loc.line}:${loc.column}`) ?? []) {
        for (const member of closure(owner)) members.add(member);
      }
      for (const key of [`${cursor.componentFile}#${cursor.componentName}`, `${cursor.loadChildren?.file}#${cursor.loadChildren?.name}`]) {
        const target = byName.get(key); if (target) for (const member of closure(target)) members.add(member);
      }
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    // Container routes summarize their children. Occurrences shared by children stay unique.
    if (!node.componentName) for (const child of node.children) {
      for (const id of [...(child.audit?.componentIds ?? []), ...(child.audit?.moduleIds ?? [])]) members.add(id);
      for (const id of [...(child.audit?.pendingItemIds ?? []), ...(child.audit?.occurrenceIds ?? [])]) ids.add(id);
    }
    for (const member of members) {
      for (const id of ownItems.get(member) ?? []) ids.add(id);
      const module = modules.get(member);
      if (module) {
        const id = `module:${member}`;
        if (!items.has(id)) add({ id, type: 'STRUCTURAL', category: 'Dependência de NgModule', source: module.name,
          target: 'Revisar migração para imports/rotas standalone', file: module.file, line: module.line,
          column: position(classes.get(member)!).column, status: 'pending', action: `Revisar dependência de ${module.name}; substituir por imports/rotas standalone quando aplicável.`,
          componentIds: [], routeIds: [] });
        ids.add(id);
      }
    }
    const direct = components.get(byName.get(`${node.componentFile}#${node.componentName}`) ?? '');
    if (node.status === 'partial' || node.fullPath === null || (node.type !== 'redirect' && !direct && !node.children.length)) {
      const id = `route:${node.id}`;
      add({ id, type: 'RESOLUTION', category: 'Rota', source: node.fullPath ?? 'Rota dinâmica', target: '',
        ...node.sourceLocation, status: 'inconclusive', action: 'Resolver rota, destino ou metadados; consultar Avisos.', componentIds: [], routeIds: [] });
      ids.add(id);
    }
    const selected = [...ids].map(id => items.get(id)!);
    for (const item of selected) if (!item.routeIds.includes(node.id)) item.routeIds.push(node.id);
    const ui = selected.filter(i => i.type === 'UI');
    const pending = selected.filter(i => i.status !== 'migrated');
    const structuralPending = pending.some(i => i.type === 'STRUCTURAL');
    const uncertain = pending.some(i => i.status === 'inconclusive');
    const applicable = members.size > 0;
    const uiAnalyzed = !!report.ui && (!applicable || report.ui.totalRules > 0);
    const structuralUncertain = pending.some(i => i.status === 'inconclusive' && i.category !== 'Template');
    const structuralStatus: AuditStatus = !report.structural ? 'NOT_ANALYZED' : structuralUncertain ? 'INCONCLUSIVE' : structuralPending ? 'PENDING' : 'COMPLETED';
    const uiStatus: AuditStatus = !uiAnalyzed ? 'NOT_ANALYZED' : uncertain ? 'INCONCLUSIVE' : ui.some(i => i.status === 'pending') ? 'PENDING' : 'COMPLETED';
    const standalone = direct?.standalone ?? null;
    const finalStatus: AuditStatus = uncertain ? 'INCONCLUSIVE' : structuralPending && standalone !== true ? 'PENDING' : !report.structural || !uiAnalyzed ? 'NOT_ANALYZED'
      : pending.length ? standalone === true ? 'PARTIAL' : 'PENDING' : 'COMPLETED';
    const actions = [...new Set(pending.map(i => i.type === 'UI' ? `Migrar ${ui.filter(u => u.status === 'pending').length} ocorrências de UI.` : i.action))];
    if (!uiAnalyzed) actions.push(report.ui ? 'Configurar regras de UI e executar novamente.' : 'Executar análise de UI.');
    if (!report.structural) actions.push('Executar análise estrutural.');
    const audit: RouteAudit = { standalone, componentIds: [...members].filter(id => components.has(id)), moduleIds: [...members].filter(id => modules.has(id)),
      structuralStatus, uiStatus, totalOccurrences: uiAnalyzed ? ui.length : null,
      migratedOccurrences: uiAnalyzed ? ui.filter(i => i.status === 'migrated').length : null,
      pendingOccurrences: uiAnalyzed ? ui.filter(i => i.status === 'pending').length : null,
      occurrenceIds: ui.map(i => i.id), pendingItemIds: pending.map(i => i.id),
      affectedFiles: [...new Set(pending.map(i => i.file))], nextActions: actions,
      warnings: pending.filter(i => i.status === 'inconclusive').map(i => i.action), finalStatus };
    node.audit = audit;
    counts[finalStatus]++;
  }
  const all = [...items.values()];
  const warnings = [...new Set(all.filter(i => i.status === 'inconclusive').map(i => `${i.file}:${i.line}:${i.column}: ${i.action}`))];
  report.audit = { items: all, warnings, routeCounts: report.routes ? counts : null, scope,
    status: all.some(i => i.status === 'inconclusive') || counts.INCONCLUSIVE || report.warnings.length ? 'INCONCLUSIVE'
      : !report.structural || !report.ui || !report.ui.totalRules || counts.NOT_ANALYZED ? 'NOT_ANALYZED'
        : all.some(i => i.status === 'pending') ? 'PENDING' : 'COMPLETED' };
  report.warnings = [...new Set([...report.warnings, ...warnings])];
}
