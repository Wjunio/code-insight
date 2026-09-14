import type { AnalysisReport, ProjectReport } from './report-types';
import { flattenRoutes } from '../routes/route-types';
import { statusLabels } from './audit-excel';

export function reportJson(report: ProjectReport | AnalysisReport): string { return JSON.stringify(report, null, 2) + '\n'; }
export function analysisReportText(report: AnalysisReport): string {
  const lines = ['CODE INSIGHT', `Projeto: ${report.projectName}`, `Analisado em: ${report.analyzedAt}`,
    `Fluxo: ${report.mode === 'routes' ? 'Auditoria de rotas — Angular' : report.mode === 'complete' ? 'Análise completa — exclusivo Angular' : report.mode === 'structural' ? 'Structural Migration — exclusivo Angular' : 'UI Migration — HTML e templates Angular'}`, ''];
  if (report.structural) {
    const structural = report.structural;
    const a = structural.angular;
    lines.push('MIGRAÇÃO ESTRUTURAL — ANGULAR',
      `Componentes encontrados: ${a.totalComponents}`, `Standalone: ${a.standaloneComponents}`,
      `Não Standalone: ${a.moduleComponents}`, `Inconclusivos: ${a.unknownComponents}`,
      `Progresso estrutural: ${a.migrationPercentage.toLocaleString('pt-BR')}%`,
      `Modules encontrados: ${a.totalModules}`, `Componentes declarados em NgModules: ${a.declaredModuleComponents}`,
      ...structural.modules.map(m => `  ${m.file}:${m.line} — ${m.name}`),
      'Componentes a analisar/migrar:',
      ...structural.components.filter(c => c.standalone !== true).map(c => `  ${c.file}:${c.line} — ${c.name} (${c.standalone === null ? 'inconclusivo' : 'não Standalone'})`),
      'Inconclusivos: classificação Standalone não determinada; revise os avisos.',
      ...report.structural.warnings.map(w => `Aviso estrutural: ${w}`), '');
  }
  if (report.ui) lines.push('MIGRAÇÃO DE INTERFACE — UI',
    `Formatos suportados: ${report.ui.supportedFormats.join(', ')}`,
    `Templates analisados: ${report.ui.analyzedTemplates}`,
    ...report.ui.migrationRules.map(r => `[${r.type}] ${r.attribute ? `${r.attribute}=` : ''}${r.source} → ${r.target}: total ${r.totalOccurrences}, migrados ${r.resolvedOccurrences}, restantes ${r.remainingOccurrences}, progresso ${r.progressPercentage}%\n`
      + r.matches.map(m => `  ${m.file}:${m.line}:${m.column} — ${m.status === 'migrated' ? 'Migrado' : 'Pendente'}`).join('\n')),
    ...(report.ui.migrationRules.length ? [] : ['Nenhuma regra habilitada. Configure .code-insight.json.']),
    `Total de ocorrências de regras: ${report.ui.totalOccurrences}`,
    `Progresso UI: ${report.ui.progressPercentage}% (destinos encontrados / total; não é comprovação histórica).`,
    ...report.ui.warnings.map(w => `Aviso de UI: ${w}`), '');
  if (report.routes) {
    lines.push('ANGULAR ROUTE MAP — MIGRAÇÃO', 'Rotas: ' + report.routes.totalRoutes);
    for (const [status, count] of Object.entries(report.audit?.routeCounts ?? {})) lines.push(status + ': ' + count);
    for (const node of flattenRoutes(report.routes.tree)) {
      const a = node.audit;
      lines.push((node.fullPath ?? 'Não resolvida') + ' | ' + (node.componentName ?? node.type)
        + ' | Standalone: ' + (a?.standalone === true ? 'Sim' : a?.standalone === false ? 'Não' : 'Não determinado')
        + ' | ' + statusLabels[a?.finalStatus ?? 'NOT_ANALYZED'] + ' | Pendências: ' + (a?.pendingItemIds.length ?? 'Não analisado'));
      lines.push(...(a?.nextActions ?? []).map(action => '  ' + action));
    }
    lines.push(...report.routes.warnings.map(w => 'Aviso de rotas: ' + w));
  }
  lines.push(`Progresso geral: ${report.overallPercentage}% (ponderado por componentes e ocorrências dos fluxos executados).`,
    'Exporte com Code Insight: Export Report (Excel recomendado ou JSON).');
  return lines.join('\n');
}
export function reportText(report: ProjectReport): string {
  const a = report.angular;
  return [
    'CODE INSIGHT', '════════════════════════════════════════',
    `Angular Migration — ${report.projectName}`, `Analisado em: ${report.analyzedAt}`, '',
    `Componentes encontrados: ${a.totalComponents}`, `Standalone: ${a.standaloneComponents}`,
    `Não Standalone: ${a.moduleComponents}`, `Inconclusivos: ${a.unknownComponents}`,
    `Progresso da migração: ${a.migrationPercentage.toLocaleString('pt-BR')}%`, '',
    `Modules encontrados: ${a.totalModules}`, `Componentes declarados em NgModules: ${a.declaredModuleComponents}`,
    ...report.modules.map(m => `  ${m.file}:${m.line} — ${m.name} (${m.componentIds.length} componentes)`), '',
    'Componentes a analisar/migrar:',
    ...report.components.filter(c => c.standalone !== true).map(c => `  ${c.file}:${c.line} — ${c.name} (${c.standalone === null ? 'inconclusivo' : 'não Standalone'})`), '',
    'Regras de migração:',
    ...(report.migrationRules.length ? report.migrationRules.map(r =>
      `  [${r.type}] ${r.attribute ? `${r.attribute}=` : ''}${r.source} → ${r.target}: ${r.occurrences} ocorrências — Pendente\n`
      + r.matches.map(m => `    ${m.file}:${m.line}:${m.column}`).join('\n'))
      : ['  Nenhuma regra configurada. Configure .code-insight.json.']),
    `Total de ocorrências de regras: ${report.migrationRules.reduce((total, r) => total + r.occurrences, 0)}`, '',
    ...(report.warnings.length ? ['Avisos (a análise pode ser parcial):', ...report.warnings.map(w => `  ${w}`)] : []),
    '', 'Exporte com Code Insight: Export JSON Report.'
  ].join('\n');
}
