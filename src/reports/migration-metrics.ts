import type { MigrationOccurrence } from '../analyzers/rules/rule-types';
import type { FileMigrationResult, MigrationRuleResult } from './report-types';

export function metrics(matches: readonly MigrationOccurrence[]) {
  const totalOccurrences = matches.length;
  const resolvedOccurrences = matches.filter(m => m.status === 'migrated').length;
  const remainingOccurrences = totalOccurrences - resolvedOccurrences;
  return { totalOccurrences, resolvedOccurrences, remainingOccurrences,
    progressPercentage: totalOccurrences ? Math.round(resolvedOccurrences / totalOccurrences * 10000) / 100 : 0 };
}
export function fileMetrics(rules: MigrationRuleResult[]): FileMigrationResult[] {
  return rules.flatMap(rule => {
    const groups = new Map<string, MigrationOccurrence[]>();
    for (const match of rule.matches) { const list = groups.get(match.file) ?? []; list.push(match); groups.set(match.file, list); }
    return [...groups].map(([file, matches]) => ({ file, ruleId: rule.ruleId, source: rule.source, target: rule.target, ...metrics(matches) }));
  }).sort((a, b) => a.file.localeCompare(b.file) || a.ruleId.localeCompare(b.ruleId));
}
