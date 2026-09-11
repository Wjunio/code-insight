import type { MigrationOccurrence, MigrationRule, MigrationRuleType } from '../analyzers/rules/rule-types';

export interface SourceFile { path: string; content: string }
export interface AnalysisInput {
  mode?: 'structural' | 'ui' | 'complete';
  projectName: string;
  projectId: string;
  files: SourceFile[];
  componentMappings?: Record<string, string>;
  migrationRules?: MigrationRule[];
}
export interface AnalysisReport {
  schemaVersion: 3;
  warnings: string[];
  history?: AnalysisSnapshot[];
  overallPercentage: number;
  analysisId: string;
  projectId: string;
  projectName: string;
  analyzedAt: string;
  analyzedFiles: number;
  mode: 'structural' | 'ui' | 'complete';
  structural: ProjectReport | null;
  ui: {
    supportedFormats: string[];
    analyzedTemplates: number;
    totalRules: number;
    migrationRules: MigrationRuleResult[];
    totalOccurrences: number;
    resolvedOccurrences: number;
    remainingOccurrences: number;
    progressPercentage: number;
    files: FileMigrationResult[];
    warnings: string[];
  } | null;
}
export interface AnalysisSnapshot {
  analysisId: string;
  projectId: string;
  analyzedAt: string;
  mode: AnalysisReport['mode'];
  structuralPercentage: number | null;
  uiPercentage: number | null;
}
export interface FileMigrationResult {
  file: string;
  ruleId: string;
  source: string;
  target: string;
  totalOccurrences: number;
  resolvedOccurrences: number;
  remainingOccurrences: number;
  progressPercentage: number;
}
export interface ComponentInfo {
  id: string;
  name: string;
  file: string;
  line: number;
  standalone: boolean | null;
  declaredIn: string[];
}
export interface ModuleInfo {
  id: string;
  name: string;
  file: string;
  line: number;
  declarations: string[];
  componentIds: string[];
  unresolvedDeclarations: string[];
}
export interface MigrationRuleResult {
  targetType?: MigrationRuleType;
  targetAttribute?: string;
  priority?: number;
  element?: string;
  ruleId: string;
  type: MigrationRuleType;
  attribute?: string;
  source: string;
  target: string;
  occurrences: number;
  totalOccurrences: number;
  resolvedOccurrences: number;
  remainingOccurrences: number;
  progressPercentage: number;
  matches: MigrationOccurrence[];
  files: string[];
  status: 'pending' | 'completed' | 'ignored';
}
export interface ProjectReport {
  schemaVersion: 1;
  analysisId: string;
  projectId: string;
  projectName: string;
  framework: 'Angular';
  analyzedAt: string;
  angularVersions: Record<string, number | null>;
  analyzedFiles: number;
  angular: {
    totalComponents: number;
    standaloneComponents: number;
    moduleComponents: number;
    declaredModuleComponents: number;
    unknownComponents: number;
    migrationPercentage: number;
    totalModules: number;
  };
  components: ComponentInfo[];
  modules: ModuleInfo[];
  migrationRules: MigrationRuleResult[];
  warnings: string[];
}
