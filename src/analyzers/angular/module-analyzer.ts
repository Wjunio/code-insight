import ts from 'typescript';
import type { ComponentInfo, ModuleInfo } from '../../reports/report-types';
import { location, metadata, property, resolveDeclaration } from '../../utils/typescript';

export function analyzeModule(node: ts.ClassDeclaration, call: ts.CallExpression, checker: ts.TypeChecker,
  components: Map<ts.Declaration, ComponentInfo>, warnings: string[]): ModuleInfo {
  const result: ModuleInfo = { ...location(node), declarations: [], componentIds: [], unresolvedDeclarations: [] };
  const object = metadata(call);
  const value = property(object, 'declarations');
  const visit = (expression: ts.Expression, seen: Set<ts.Node>): void => {
    if (seen.has(expression)) { result.unresolvedDeclarations.push(expression.getText()); return; }
    const next = new Set(seen).add(expression);
    if (ts.isArrayLiteralExpression(expression)) { expression.elements.forEach(e => visit(e, next)); return; }
    if (ts.isSpreadElement(expression)) { visit(expression.expression, next); return; }
    const declaration = resolveDeclaration(expression, checker);
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) { visit(declaration.initializer, next); return; }
    result.declarations.push(expression.getText());
    const component = declaration ? components.get(declaration) : undefined;
    if (component) {
      if (!result.componentIds.includes(component.id)) result.componentIds.push(component.id);
      if (!component.declaredIn.includes(result.id)) component.declaredIn.push(result.id);
      if (component.standalone === true) warnings.push(`${component.id}: Standalone declarado em ${result.id}; verificar inconsistência.`);
    } else if (!declaration || !ts.isClassDeclaration(declaration)) result.unresolvedDeclarations.push(expression.getText());
  };
  if (value) visit(value, new Set());
  else if (!object || object.properties.some(p => ts.isSpreadAssignment(p) || (p.name && ts.isComputedPropertyName(p.name)) || p.name?.getText() === 'declarations')) result.unresolvedDeclarations.push('Metadados indiretos');
  if (result.unresolvedDeclarations.length) warnings.push(`${result.id}: declarations parcialmente inconclusivas: ${result.unresolvedDeclarations.join(', ')}.`);
  return result;
}
