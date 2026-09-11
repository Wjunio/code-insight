import ts from 'typescript';
import type { SourceFile } from '../reports/report-types';
import type { Template } from '../analyzers/rules/rule-types';
import { angularDecorator, createProgram } from '../utils/typescript';
import { collectComponentTemplates } from '../analyzers/angular/component-analyzer';

export interface TemplateAdapter {
  format: string;
  collect(files: SourceFile[], warnings: string[]): Template[];
}
export const htmlAdapter: TemplateAdapter = {
  format: 'HTML',
  collect: files => files.filter(f => f.path.endsWith('.html')).map(f => ({ file: f.path, content: f.content }))
};
export const angularTemplateAdapter: TemplateAdapter = {
  format: 'Angular templates',
  collect(files, warnings) {
    const templates = new Map<string, Template>();
    const contents = new Map(files.map(f => [f.path, f.content]));
    const program = createProgram(files);
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles()) {
      for (const diagnostic of program.getSyntacticDiagnostics(source)) {
        warnings.push(`${source.fileName.replace('/project/', '')}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
      }
      const visit = (node: ts.Node): void => {
        if (ts.isClassDeclaration(node)) {
          const decorator = angularDecorator(node, 'Component', checker);
          if (decorator) collectComponentTemplates(node, decorator, contents, templates, warnings);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return [...templates.values()];
  }
};
