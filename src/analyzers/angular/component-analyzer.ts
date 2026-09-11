import ts from 'typescript';
import { posix } from 'node:path';
import type { ComponentInfo } from '../../reports/report-types';
import { location, metadata, property } from '../../utils/typescript';
import { standaloneState } from './standalone-analyzer';
import { inlineTemplate } from '../../utils/inline-template';
import type { Template } from '../rules/rule-types';

export type { Template } from '../rules/rule-types';
export function analyzeComponent(node: ts.ClassDeclaration, call: ts.CallExpression, major: number | null,
  files: Map<string, string>, templates: Map<string, Template>, warnings: string[], includeTemplates = true): ComponentInfo {
  const info: ComponentInfo = { ...location(node), standalone: standaloneState(metadata(call), major), declaredIn: [] };
  if (info.standalone === null) warnings.push(`${info.id}: standalone inconclusivo (versão ou metadados dinâmicos).`);
  if (includeTemplates) collectComponentTemplates(node, call, files, templates, warnings);
  return info;
}

export function collectComponentTemplates(node: ts.ClassDeclaration, call: ts.CallExpression,
  files: Map<string, string>, templates: Map<string, Template>, warnings: string[]): void {
  const info = location(node);
  const object = metadata(call);
  const inline = property(object, 'template');
  const url = property(object, 'templateUrl');
  if (inline && ts.isStringLiteralLike(inline)) templates.set(info.id, inlineTemplate(inline, info.file));
  else if (inline) warnings.push(`${info.id}: template dinâmico não analisado.`);
  if (url && ts.isStringLiteralLike(url)) {
    const file = posix.normalize(posix.join(posix.dirname(info.file), url.text));
    const content = files.get(file);
    if (content !== undefined) templates.set(file, { file, content });
    else warnings.push(`${info.id}: template não encontrado: ${file}.`);
  } else if (url) warnings.push(`${info.id}: templateUrl dinâmico não analisado.`);
  if (!object || object.properties.some(p => ts.isSpreadAssignment(p) || (p.name && ts.isComputedPropertyName(p.name)))) warnings.push(`${info.id}: metadados indiretos/spreads/propriedades computadas podem ocultar templates.`);
}
