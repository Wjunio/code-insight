import type { AnalysisReport } from '../reports/report-types';
import { flattenRoutes } from './route-types';

/** Preserve schema-4 presentation fields as a view of the authoritative audit. */
export function enrichRouteMigration(report: AnalysisReport): void {
  const items = new Map(report.audit?.items.map(item => [item.id, item]));
  for (const node of flattenRoutes(report.routes?.tree ?? [])) {
    const audit = node.audit;
    if (!audit) continue;
    const pending = audit.pendingItemIds.map(id => items.get(id)!);
    const ui = pending.filter(i => i.type === 'UI');
    const ruleCounts = new Map<string, { source: string; target: string; count: number }>();
    for (const item of ui) {
      const entry = ruleCounts.get(item.ruleId!) ?? { source: item.source, target: item.target, count: 0 };
      entry.count++; ruleCounts.set(item.ruleId!, entry);
    }
    node.migration = {
      structural: audit.structuralStatus === 'COMPLETED' ? node.componentName ? 'Standalone' : 'Não se aplica'
        : audit.structuralStatus === 'PENDING' ? 'Pendente' : 'Inconclusivo',
      layout: audit.uiStatus === 'NOT_ANALYZED' ? report.ui ? 'Sem regras' : 'Não analisado'
        : audit.uiStatus === 'INCONCLUSIVE' ? 'Inconclusivo' : audit.uiStatus === 'PENDING' ? 'Pendente' : 'Sem pendências nas regras',
      remaining: audit.uiStatus === 'INCONCLUSIVE' ? null : audit.pendingOccurrences,
      actions: [...audit.nextActions, ...[...ruleCounts.values()].map(r => `${r.source} → ${r.target} (${r.count})`)],
      files: audit.affectedFiles
    };
  }
}
