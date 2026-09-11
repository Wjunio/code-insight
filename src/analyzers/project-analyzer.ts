import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import type { AnalysisInput, ComponentInfo, ProjectReport } from '../reports/report-types';
import { angularDecorator, createProgram } from '../utils/typescript';
import { analyzeComponent, type Template } from './angular/component-analyzer';
import { analyzeModule } from './angular/module-analyzer';
import { detectProject, versionFor } from './angular/project-detector';
import { analyzeRules } from './rules/migration-rules';

export interface ProjectAnalyzer { analyze(input: AnalysisInput): ProjectReport | null }
export class AngularProjectAnalyzer implements ProjectAnalyzer {
  analyze(input: AnalysisInput): ProjectReport | null {
    const warnings: string[] = [];
    const detection = detectProject(input.files, warnings);
    const program = createProgram(input.files);
    const checker = program.getTypeChecker();
    const components = new Map<ts.Declaration, ComponentInfo>();
    const templates = new Map<string, Template>();
    const files = new Map(input.files.map(f => [f.path, f.content]));
    const modulesToAnalyze: { node: ts.ClassDeclaration; call: ts.CallExpression }[] = [];
    for (const source of program.getSourceFiles()) {
      for (const diagnostic of program.getSyntacticDiagnostics(source)) {
        warnings.push(`${source.fileName.replace('/project/', '')}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
      }
      const visit = (node: ts.Node): void => {
        if (ts.isClassDeclaration(node)) {
          const component = angularDecorator(node, 'Component', checker);
          const module = angularDecorator(node, 'NgModule', checker);
          if (component) components.set(node, analyzeComponent(node, component,
            versionFor(source.fileName.replace('/project/', ''), detection.versions), files, templates, warnings, input.mode !== 'structural'));
          if (module) modulesToAnalyze.push({ node, call: module });
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    if (!detection.detected && !components.size && !modulesToAnalyze.length) return null;
    const modules = modulesToAnalyze.map(({ node, call }) => analyzeModule(node, call, checker, components, warnings));
    const list = [...components.values()].sort((a, b) => a.id.localeCompare(b.id));
    const standaloneComponents = list.filter(c => c.standalone === true).length;
    return {
      schemaVersion: 1, analysisId: randomUUID(), projectId: input.projectId,
      projectName: input.projectName, framework: 'Angular', analyzedAt: new Date().toISOString(),
      angularVersions: detection.versions, analyzedFiles: input.files.length,
      angular: {
        totalComponents: list.length, standaloneComponents,
        moduleComponents: list.filter(c => c.standalone === false).length,
        declaredModuleComponents: list.filter(c => c.declaredIn.length > 0).length,
        unknownComponents: list.filter(c => c.standalone === null).length,
        migrationPercentage: list.length ? Math.round(standaloneComponents / list.length * 10000) / 100 : 0,
        totalModules: modules.length
      },
      components: list, modules, migrationRules: analyzeRules([...templates.values()], input.migrationRules ?? input.componentMappings ?? {}), warnings
    };
  }
}
