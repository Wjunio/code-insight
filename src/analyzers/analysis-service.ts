import { randomUUID } from 'node:crypto';
import type { AnalysisInput, AnalysisReport } from '../reports/report-types';
import { AngularProjectAnalyzer } from './project-analyzer';
import { UiMigrationAnalyzer } from '../ui-migration/ui-analyzer';
import { AngularRouteAnalyzer } from '../routes/route-analyzer';

export function analyzeProject(input: AnalysisInput): AnalysisReport | null {
  const mode = input.mode ?? 'complete';
  if (mode === 'routes') {
    const routes = new AngularRouteAnalyzer().analyze(input);
    if (!routes) return null;
    return { schemaVersion: 4, analysisId: randomUUID(), projectId: input.projectId,
      projectName: input.projectName, analyzedAt: new Date().toISOString(), analyzedFiles: input.files.length,
      mode, structural: null, ui: null, routes, warnings: routes.warnings, overallPercentage: 0 };
  }
  const structural = mode === 'ui' ? null : new AngularProjectAnalyzer().analyze({
    ...input, mode: 'structural', migrationRules: [], componentMappings: {}
  });
  if (mode !== 'ui' && !structural) return null;
  const ui = mode === 'structural' ? null : new UiMigrationAnalyzer().analyze(input);
  const total = (structural?.angular.totalComponents ?? 0) + (ui?.totalOccurrences ?? 0);
  const resolved = (structural?.angular.standaloneComponents ?? 0) + (ui?.resolvedOccurrences ?? 0);
  return {
    schemaVersion: 3, analysisId: randomUUID(), projectId: input.projectId,
    projectName: input.projectName, analyzedAt: new Date().toISOString(), analyzedFiles: input.files.length,
    mode, structural, ui, warnings: [...new Set([...(structural?.warnings ?? []), ...(ui?.warnings ?? [])])],
    overallPercentage: total ? Math.round(resolved / total * 10000) / 100 : 0
  };
}
