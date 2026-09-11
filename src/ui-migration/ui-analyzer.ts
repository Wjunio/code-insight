import type { AnalysisInput, AnalysisReport } from '../reports/report-types';
import { analyzeRules } from '../analyzers/rules/migration-rules';
import { htmlAdapter, angularTemplateAdapter, type TemplateAdapter } from './template-adapters';
import { fileMetrics, metrics } from '../reports/migration-metrics';

export class UiMigrationAnalyzer {
  constructor(private readonly adapters: TemplateAdapter[] = [htmlAdapter, angularTemplateAdapter]) {}

  analyze(input: AnalysisInput): NonNullable<AnalysisReport['ui']> {
    const warnings: string[] = [];
    const templates = this.adapters.flatMap(adapter => adapter.collect(input.files, warnings));
    // External templates may be found both as HTML and by templateUrl.
    const unique = [...new Map(templates.map(t => [
      `${t.file}:${t.sourceOffsets?.[0] ?? 'external'}`, t
    ])).values()];
    const unsupported = input.files.filter(f => /\.(?:jsx|tsx|vue|svelte)$/.test(f.path));
    if (unsupported.length) warnings.push(`${unsupported.length} arquivos JSX/TSX/Vue/Svelte não analisados: adaptadores ainda não disponíveis.`);
    if (!unique.length) warnings.push('Nenhum template suportado encontrado. Esta versão analisa HTML e templates Angular; não interpreta JSX/TSX, Vue, Svelte ou folhas CSS.');
    const migrationRules = analyzeRules(unique, input.migrationRules ?? input.componentMappings ?? {});
    return { supportedFormats: this.adapters.map(a => a.format), analyzedTemplates: unique.length,
      migrationRules, totalRules: migrationRules.length, ...metrics(migrationRules.flatMap(r => r.matches)), files: fileMetrics(migrationRules), warnings };
  }
}
