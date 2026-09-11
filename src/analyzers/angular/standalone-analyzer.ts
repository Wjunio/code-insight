import ts from 'typescript';
import { property } from '../../utils/typescript';

export function standaloneState(object: ts.ObjectLiteralExpression | undefined, major: number | null): boolean | null {
  if (!object) return null;
  const value = property(object, 'standalone');
  if (value?.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value?.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value || object.properties.some(p => ts.isSpreadAssignment(p) || (p.name && ts.isComputedPropertyName(p.name)))) return null;
  if (object.properties.some(p => p.name?.getText().replace(/['"]/g, '') === 'standalone')) return null;
  return major === null ? null : major >= 19;
}
