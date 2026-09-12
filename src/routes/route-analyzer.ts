import ts from 'typescript';
import { createModuleResolver } from '../utils/module-resolution';
import type { AnalysisInput } from '../reports/report-types';
import type { ProjectAnalyzer } from '../analyzers/project-analyzer';
import { createProgram, resolveDeclaration, angularDecorator, property, metadata } from '../utils/typescript';
import { detectProject } from '../analyzers/angular/project-detector';
import { flattenRoutes, type RouteMapNode, type RouteMapReport, type RouteReference } from './route-types';

/** Resolves only syntax and symbols in the supplied snapshot. Never imports project code. */
export class AngularRouteAnalyzer implements ProjectAnalyzer<RouteMapReport> {
  analyze(input: AnalysisInput): RouteMapReport | null {
    return new RouteParser(input).analyze();
  }
}

class RouteParser {
  private readonly program;
  private readonly checker;
  private readonly resolveModule;
  private readonly warnings = new Set<string>();
  private readonly candidates = new Set<ts.Expression>();
  private readonly roots = new Set<ts.Expression>();
  private readonly used = new Set<ts.Expression>();
  private sequence = 0;
  private warningCount = 0;
  constructor(private readonly input: AnalysisInput) {
    this.program = createProgram(input.files, true);
    this.resolveModule = createModuleResolver(input.files, true);
    this.checker = this.program.getTypeChecker();
  }
  private warn(node: ts.Node, message: string): void {
    this.warningCount++;
    const s = node.getSourceFile();
    this.warnings.add(`${s.fileName.replace('/project/', '')}:${s.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${message}`);
  }
  private router(node: ts.Node, name: string, seen = new Set<ts.Node>()): boolean {
    if (seen.has(node)) return false;
    seen.add(node);
    const binding = ts.isQualifiedName(node) ? node.left : ts.isPropertyAccessExpression(node) ? node.expression : node;
    const declaration = this.checker.getSymbolAtLocation(binding)?.declarations?.[0];
    if (!declaration) return false;
    let imported: string | undefined;
    if (ts.isImportSpecifier(declaration)) imported = (declaration.propertyName ?? declaration.name).text;
    if (ts.isNamespaceImport(declaration)) imported = ts.isQualifiedName(node) ? node.right.text : ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
    let parent: ts.Node = declaration;
    while (parent.parent && !ts.isImportDeclaration(parent)) parent = parent.parent;
    if (imported === name && ts.isImportDeclaration(parent) && ts.isStringLiteral(parent.moduleSpecifier) && parent.moduleSpecifier.text === '@angular/router') return true;
    // Local type aliases can extend Routes for application-specific menu metadata.
    if (ts.isTypeAliasDeclaration(declaration)) return this.routeType(declaration.type, seen);
    return false;
  }
  private routeType(type: ts.TypeNode, seen = new Set<ts.Node>()): boolean {
    if (ts.isTypeReferenceNode(type)) return this.router(type.typeName, 'Routes', seen);
    if (ts.isArrayTypeNode(type)) return this.routeElementType(type.elementType, seen);
    if (ts.isParenthesizedTypeNode(type)) return this.routeType(type.type, seen);
    if (ts.isIntersectionTypeNode(type) || ts.isUnionTypeNode(type)) return type.types.some(t => this.routeType(t, seen));
    return false;
  }
  private routeElementType(type: ts.TypeNode, seen: Set<ts.Node>): boolean {
    if (ts.isParenthesizedTypeNode(type)) return this.routeElementType(type.type, seen);
    if (ts.isIntersectionTypeNode(type)) return type.types.some(t => this.routeElementType(t, seen));
    if (!ts.isTypeReferenceNode(type) || seen.has(type)) return false;
    const next = new Set(seen).add(type);
    if (this.router(type.typeName, 'Route', next)) return true;
    let symbol = this.checker.getSymbolAtLocation(type.typeName);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    const d = symbol?.declarations?.[0];
    if (d && ts.isTypeAliasDeclaration(d)) return this.routeElementType(d.type, next);
    if (d && ts.isInterfaceDeclaration(d)) return (d.heritageClauses ?? []).some(h => h.types.some(t => this.router(t.expression, 'Route')));
    return false;
  }
  private unwrap(expression: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
    return expression;
  }
  private valueExpression(expression: ts.Expression, seen = new Set<ts.Node>()): ts.Expression {
    expression = this.unwrap(expression);
    if (seen.has(expression)) return expression;
    seen.add(expression);
    const d = resolveDeclaration(expression, this.checker);
    if (d && ts.isVariableDeclaration(d) && d.initializer && (d.parent.flags & ts.NodeFlags.Const)) return this.valueExpression(d.initializer, seen);
    if (d && ts.isExportAssignment(d)) return this.valueExpression(d.expression, seen);
    return expression;
  }
  private unknown(expression: ts.Expression): unknown {
    this.warn(expression, 'Dynamic route metadata could not be resolved.');
    return { kind: 'unknown', expression: expression.getText() };
  }
  private value(expression: ts.Expression, seen = new Set<ts.Node>()): unknown {
    const e = this.valueExpression(expression);
    if (seen.has(e) || seen.size > 100) return this.unknown(e);
    const next = new Set(seen).add(e);
    if (ts.isStringLiteralLike(e)) return e.text;
    if (ts.isNumericLiteral(e)) return Number(e.text);
    if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (e.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand) && e.operator === ts.SyntaxKind.MinusToken) return -Number(e.operand.text);
    if (ts.isArrayLiteralExpression(e)) return e.elements.map(item => this.value(item, next));
    if (ts.isObjectLiteralExpression(e)) {
      return Object.fromEntries([...this.fields(e, next)].map(([key, v]) => [key, this.value(v, next)]));
    }
    return this.unknown(e);
  }
  private fields(object: ts.ObjectLiteralExpression, seen = new Set<ts.Node>()): Map<string, ts.Expression> {
    const result = new Map<string, ts.Expression>();
    for (const p of object.properties) {
      if (ts.isSpreadAssignment(p)) {
        const spread = this.valueExpression(p.expression);
        if (ts.isObjectLiteralExpression(spread) && !seen.has(spread)) {
          for (const [k, v] of this.fields(spread, new Set(seen).add(spread))) result.set(k, v);
        } else {
          this.warn(p, 'Dynamic route metadata could not be resolved (spread).');
          // A dynamic spread may overwrite every preceding property.
          for (const key of result.keys()) result.set(key, p.expression);
          result.set('__unknownSpread', p.expression);
        }
      } else if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
        if (ts.isPropertyAssignment(p)) result.set(p.name.text, p.initializer);
        else if (ts.isShorthandPropertyAssignment(p)) {
          const d = this.checker.getShorthandAssignmentValueSymbol(p)?.valueDeclaration;
          result.set(p.name.text, d && ts.isVariableDeclaration(d) && d.initializer ? d.initializer : p.name);
        } else this.warn(p, 'Dynamic route metadata could not be resolved (method).');
      } else {
        this.warn(p, 'Dynamic route metadata could not be resolved (computed property).');
        if (ts.isPropertyAssignment(p)) {
          result.clear();
          result.set('__unknownComputedProperty', p.initializer);
        }
      }
    }
    return result;
  }
  private returned(expression: ts.Expression): ts.Expression | undefined {
    expression = this.unwrap(expression);
    if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) return undefined;
    if (!ts.isBlock(expression.body)) return this.unwrap(expression.body);
    const statements = expression.body.statements;
    return statements.length === 1 && ts.isReturnStatement(statements[0]!) ? statements[0]!.expression : undefined;
  }
  private lazy(expression: ts.Expression): { reference: RouteReference; declaration?: ts.Declaration } {
    const result: RouteReference = { name: 'unknown', expression: expression.getText() };
    let body = this.returned(expression);
    let exportName = 'default';
    if (body && ts.isCallExpression(body) && ts.isPropertyAccessExpression(body.expression) && body.expression.name.text === 'then') {
      const callback = body.arguments[0];
      const returned = callback && this.returned(callback);
      if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) || !returned) return { reference: result };
      const param = callback.parameters[0]?.name;
      if (ts.isPropertyAccessExpression(returned) && param && ts.isIdentifier(param) && ts.isIdentifier(returned.expression) && returned.expression.text === param.text) exportName = returned.name.text;
      else if (ts.isIdentifier(returned) && param && ts.isObjectBindingPattern(param)) {
        const binding = param.elements.find(e => ts.isIdentifier(e.name) && e.name.text === returned.text && !e.initializer && !e.dotDotDotToken);
        if (!binding) return { reference: result };
        exportName = (binding.propertyName ?? binding.name).getText();
      } else return { reference: result };
      body = body.expression.expression;
    }
    // Legacy Angular syntax: './feature#FeatureModule'.
    const legacy = this.valueExpression(expression);
    let specifier: string | undefined;
    if (ts.isStringLiteral(legacy) && legacy.text.includes('#')) { const parts = legacy.text.split('#'); specifier = parts[0]; exportName = parts[1] ?? 'default'; }
    else if (body && ts.isCallExpression(body) && body.expression.kind === ts.SyntaxKind.ImportKeyword && body.arguments.length === 1 && ts.isStringLiteral(body.arguments[0]!)) specifier = (body.arguments[0] as ts.StringLiteral).text;
    if (!specifier) return { reference: result };
    result.name = exportName;
    result.source = specifier;
    const resolved = this.resolveModule(specifier, expression.getSourceFile().fileName);
    const source = resolved ? this.program.getSourceFile(resolved) : undefined;
    if (!source) return { reference: result };
    const symbol = this.checker.getSymbolAtLocation(source);
    let exported = symbol && this.checker.getExportsOfModule(symbol).find(s => s.name === exportName);
    if (exported && exported.flags & ts.SymbolFlags.Alias) exported = this.checker.getAliasedSymbol(exported);
    const declaration = exported?.valueDeclaration ?? exported?.declarations?.[0];
    if (declaration) result.file = declaration.getSourceFile().fileName.replace('/project/', '');
    if (declaration && ts.isClassDeclaration(declaration)) result.name = declaration.name?.text ?? exportName;
    return { reference: result, declaration };
  }
  private reference(expression: ts.Expression): RouteReference {
    if (this.returned(expression) || ts.isStringLiteral(expression)) return this.lazy(expression).reference;
    const e = this.valueExpression(expression);
    const d = resolveDeclaration(e, this.checker);
    const declaration = d ?? resolveDeclaration(expression, this.checker);
    return { name: d && ts.isClassDeclaration(d) ? d.name?.text ?? 'default' : expression.getText(),
      ...(declaration && !ts.isImportSpecifier(declaration) ? { file: declaration.getSourceFile().fileName.replace('/project/', '') } : {}) };
  }
  private declarationRoutes(d: ts.Declaration | undefined, seen = new Set<ts.Node>()): ts.Expression[] {
    if (!d) return [];
    if (seen.has(d)) { this.warn(d, 'Circular route configuration detected (NgModule imports).'); return []; }
    seen.add(d);
    if (ts.isVariableDeclaration(d) && d.initializer) return [d.initializer];
    if (ts.isExportAssignment(d)) return [d.expression];
    if (!ts.isClassDeclaration(d)) return [];
    const call = angularDecorator(d, 'NgModule', this.checker);
    const imports = property(call && metadata(call), 'imports');
    if (!imports) return [];
    const array = this.valueExpression(imports);
    if (!ts.isArrayLiteralExpression(array)) return [];
    return array.elements.flatMap(e => {
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ['forChild', 'forRoot'].includes(e.expression.name.text) && this.router(e.expression.expression, 'RouterModule')) return e.arguments[0] ? [e.arguments[0]] : [];
      return this.declarationRoutes(resolveDeclaration(e, this.checker), new Set(seen));
    });
  }
  private routes(expression: ts.Expression, parent: RouteMapNode | undefined, active: Set<ts.Node>): RouteMapNode[] {
    const e = this.valueExpression(expression);
    this.used.add(e);
    if (active.has(e)) { this.warn(expression, 'Circular route configuration detected.'); return []; }
    if (active.size > 200) { this.warn(expression, 'Route nesting exceeds static analysis limit (200).'); return []; }
    const next = new Set(active).add(e);
    if (!ts.isArrayLiteralExpression(e)) { this.warn(expression, 'Route configuration detected but could not be resolved.'); return []; }
    return e.elements.flatMap(item => {
      if (ts.isSpreadElement(item)) return this.routes(item.expression, parent, next);
      const object = this.valueExpression(item);
      if (!ts.isObjectLiteralExpression(object)) { this.warn(item, 'Route configuration detected but could not be resolved.'); return []; }
      const before = this.warningCount;
      const fields = this.fields(object);
      const pathValue = fields.has('path') ? this.value(fields.get('path')!) : null;
      const path = typeof pathValue === 'string' ? pathValue : null;
      const source = object.getSourceFile();
      const file = source.fileName.replace('/project/', '');
      const loc = source.getLineAndCharacterOfPosition(object.getStart());
      const node: RouteMapNode = {
        id: `${file}:${loc.line + 1}:${loc.character + 1}#${++this.sequence}`, parentId: parent?.id,
        path, fullPath: path === null || parent?.fullPath === null ? null : `/${[parent?.fullPath ?? '', path].join('/').split('/').filter(Boolean).join('/')}`,
        type: fields.has('redirectTo') ? 'redirect' : fields.has('loadComponent') ? 'lazy-component' : fields.has('component') ? 'component' : fields.has('loadChildren') ? 'lazy-routes' : fields.has('children') ? 'children' : path === '**' ? 'wildcard' : 'unknown',
        wildcard: path === '**', lazy: fields.has('loadComponent') || fields.has('loadChildren'),
        guards: {}, routeFile: file, sourceLocation: { file, line: loc.line + 1, column: loc.character + 1 }, status: 'resolved', children: []
      };
      for (const key of ['pathMatch', 'redirectTo', 'outlet', 'matcher', 'resolve', 'providers', 'title', 'data'] as const) if (fields.has(key)) node[key] = this.value(fields.get(key)!);
      const known = new Set(['path', 'pathMatch', 'redirectTo', 'outlet', 'matcher', 'resolve', 'providers', 'title', 'data', 'component', 'loadComponent', 'loadChildren', 'children', 'canActivate', 'canActivateChild', 'canDeactivate', 'canMatch', 'canLoad']);
      node.metadata = Object.fromEntries([...fields].filter(([key]) => !known.has(key)).map(([key, value]) => [key, this.value(value)]));
      if (node.data && typeof node.data === 'object') {
        const data = node.data as Record<string, unknown>;
        node.title ??= data.title; node.description = data.description;
      }
      if (fields.has('matcher')) this.warn(object, 'Route matcher could not be statically analyzed.');
      if (path === null && !fields.has('matcher')) this.warn(object, 'Route path could not be statically resolved.');
      for (const key of ['canActivate', 'canActivateChild', 'canDeactivate', 'canMatch', 'canLoad']) {
        const guard = fields.get(key);
        if (!guard) continue;
        const array = this.valueExpression(guard);
        node.guards[key] = (ts.isArrayLiteralExpression(array) ? [...array.elements] : [array]).map(g => this.reference(g));
        if (!ts.isArrayLiteralExpression(array) || node.guards[key].some(g => !g.file)) this.warn(guard, 'Route guard reference could not be resolved.');
      }
      const component = fields.get('component');
      if (component && node.type !== 'redirect') {
        const ref = this.reference(component); node.componentName = ref.name; node.componentFile = ref.file;
        const declaration = resolveDeclaration(this.valueExpression(component), this.checker);
        if (!declaration || !ts.isClassDeclaration(declaration)) node.componentFile = undefined;
        if (!node.componentFile) this.warn(component, 'Route component could not be resolved.');
      }
      for (const key of ['loadComponent', 'loadChildren'] as const) {
        const expression = fields.get(key);
        if (!expression) continue;
        const { reference, declaration } = this.lazy(expression);
        node[key] = reference;
        if (key === 'loadComponent') {
          if (node.type !== 'redirect') { node.componentName = reference.name; node.componentFile = reference.file; }
          if (!declaration || !ts.isClassDeclaration(declaration)) { node.componentFile = undefined; this.warn(expression, 'loadComponent component could not be resolved.'); }
        } else {
          const targets = this.declarationRoutes(declaration);
          if (!targets.length) this.warn(expression, 'loadChildren target could not be resolved.');
          for (const target of targets) node.children.push(...this.routes(target, node, next));
        }
      }
      const children = fields.get('children');
      if (children) node.children.push(...this.routes(children, node, next));
      if (this.warningCount > before || node.children.some(c => c.status === 'partial')) node.status = 'partial';
      return [node];
    });
  }
  analyze(): RouteMapReport | null {
    let angular = detectProject(this.input.files, []).detected;
    for (const source of this.program.getSourceFiles()) {
      for (const d of this.program.getSyntacticDiagnostics(source)) this.warn(source, ts.flattenDiagnosticMessageText(d.messageText, ' '));
      const visit = (node: ts.Node): void => {
        if (ts.isClassDeclaration(node) && (angularDecorator(node, 'Component', this.checker) || angularDecorator(node, 'NgModule', this.checker))) angular = true;
        if (ts.isVariableDeclaration(node) && node.type && node.initializer && this.routeType(node.type)) this.candidates.add(this.valueExpression(node.initializer));
        if ((ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && this.routeType(node.type)) this.candidates.add(this.valueExpression(node.expression));
        if (ts.isCallExpression(node) && node.arguments[0]) {
          const callee = node.expression;
          if (this.router(callee, 'provideRouter') || this.router(callee, 'provideRoutes')) {
            this.candidates.add(this.valueExpression(node.arguments[0]));
            this.roots.add(this.valueExpression(node.arguments[0]));
          }
          if (ts.isPropertyAccessExpression(callee) && ['forRoot', 'forChild'].includes(callee.name.text) && this.router(callee.expression, 'RouterModule')) {
            this.candidates.add(this.valueExpression(node.arguments[0]));
            if (callee.name.text === 'forRoot') this.roots.add(this.valueExpression(node.arguments[0]));
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    if (!angular && !this.candidates.size) return null;
    // Discover referenced configurations first, so lazy/children arrays are not also shown as roots.
    const referenced = new Set<ts.Expression>();
    for (const candidate of this.candidates) {
      this.used.clear(); this.routes(candidate, undefined, new Set());
      for (const used of this.used) if (used !== candidate) referenced.add(used);
    }
    this.sequence = 0;
    const starts = [...this.candidates].filter(c => this.roots.has(c) || !referenced.has(c));
    // Cyclic graphs can have no root. Retain a representative to expose the cycle warning.
    if (!starts.length && this.candidates.size) starts.push(this.candidates.values().next().value!);
    this.used.clear();
    const tree = starts.flatMap(c => this.routes(c, undefined, new Set()));
    for (const candidate of this.candidates) if (!this.used.has(candidate)) tree.push(...this.routes(candidate, undefined, new Set()));
    const nodes = flattenRoutes(tree);
    const reverse = new Map<string, RouteMapReport['componentRoutes'][number]>();
    for (const node of nodes) if (node.componentFile && node.componentName) {
      const key = `${node.componentFile}#${node.componentName}`;
      const entry = reverse.get(key) ?? { componentName: node.componentName, componentFile: node.componentFile, routeIds: [], fullPaths: [] };
      entry.routeIds.push(node.id); entry.fullPaths.push(node.fullPath); reverse.set(key, entry);
    }
    return { totalRoutes: nodes.length, resolvedComponents: nodes.filter(n => n.componentFile).length,
      lazyRoutes: nodes.filter(n => n.lazy).length, redirectRoutes: nodes.filter(n => n.type === 'redirect').length,
      tree, warnings: [...this.warnings], componentRoutes: [...reverse.values()] };
  }
}
