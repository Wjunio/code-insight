import ts from 'typescript';
import { posix } from 'node:path';
import type { SourceFile } from '../reports/report-types';

export function createProgram(files: SourceFile[]): ts.Program {
  const sources = new Map(files.filter(f => f.path.endsWith('.ts')).map(f => [
    `/project/${f.path}`, ts.createSourceFile(`/project/${f.path}`, f.content, ts.ScriptTarget.Latest, true)
  ]));
  const options: ts.CompilerOptions = { noLib: true, noResolve: false, experimentalDecorators: true };
  const host: ts.CompilerHost = {
    getSourceFile: name => sources.get(name), getDefaultLibFileName: () => '',
    writeFile: () => undefined, getCurrentDirectory: () => '/project',
    getDirectories: () => [], getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    fileExists: name => sources.has(name), readFile: name => sources.get(name)?.text,
    resolveModuleNames: (names, containingFile) => names.map(name => {
      if (!name.startsWith('.')) return undefined;
      const base = posix.resolve(posix.dirname(containingFile), name).replace(/\.js$/, '');
      const file = [base, `${base}.ts`, `${base}/index.ts`].find(p => sources.has(p));
      return file ? { resolvedFileName: file, extension: ts.Extension.Ts } : undefined;
    })
  };
  return ts.createProgram([...sources.keys()], options, host);
}

// Check the actual import binding, so unrelated decorators named Component are ignored.
export function angularDecorator(node: ts.ClassDeclaration, name: string, checker: ts.TypeChecker): ts.CallExpression | undefined {
  return (ts.getDecorators(node) ?? []).map(d => d.expression).find((expression): expression is ts.CallExpression => {
    if (!ts.isCallExpression(expression)) return false;
    const callee = expression.expression;
    const binding = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
    const declaration = checker.getSymbolAtLocation(binding)?.declarations?.[0];
    if (!declaration) return false;
    let importedName: string;
    if (ts.isImportSpecifier(declaration)) importedName = (declaration.propertyName ?? declaration.name).text;
    else if (ts.isNamespaceImport(declaration) && ts.isPropertyAccessExpression(callee)) importedName = callee.name.text;
    else return false;
    let parent: ts.Node = declaration;
    while (!ts.isImportDeclaration(parent) && parent.parent) parent = parent.parent;
    return importedName === name && ts.isImportDeclaration(parent)
      && ts.isStringLiteral(parent.moduleSpecifier) && parent.moduleSpecifier.text === '@angular/core';
  });
}

export function metadata(call: ts.CallExpression): ts.ObjectLiteralExpression | undefined {
  const value = call.arguments[0];
  return value && ts.isObjectLiteralExpression(value) ? value : undefined;
}
export function property(object: ts.ObjectLiteralExpression | undefined, name: string): ts.Expression | undefined {
  // Last assignment wins; a later spread makes the value uncertain.
  let result: ts.Expression | undefined;
  for (const item of object?.properties ?? []) {
    if (ts.isSpreadAssignment(item) || (item.name && ts.isComputedPropertyName(item.name))) result = undefined;
    else if (item.name && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name) {
      result = ts.isPropertyAssignment(item) ? item.initializer : undefined;
    }
  }
  return result;
}
export function location(node: ts.ClassDeclaration): { id: string; name: string; file: string; line: number } {
  const source = node.getSourceFile();
  const file = source.fileName.replace('/project/', '');
  const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const name = node.name?.text ?? 'default';
  return { id: `${file}#${name}:${line}`, name, file, line };
}
export function resolveDeclaration(expression: ts.Expression, checker: ts.TypeChecker): ts.Declaration | undefined {
  let symbol = checker.getSymbolAtLocation(expression);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.valueDeclaration;
}
