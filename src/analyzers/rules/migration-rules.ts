import type { MigrationRuleResult } from '../../reports/report-types';
import type { MigrationRule, Template } from './rule-types';
import { mappingsToRules, validateRules } from './rule-config';
import { RuleEngine, createTemplateMatchers } from './rule-engine';
import { scanElements } from './template-scanner';

export { validateMappings } from './rule-config';
export function countElements(template: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of scanElements(template)) counts.set(element.name, (counts.get(element.name) ?? 0) + 1);
  return counts;
}
export function analyzeRules(templates: Template[], rules: MigrationRule[] | Record<string, string>): MigrationRuleResult[] {
  const normalized = Array.isArray(rules) ? validateRules(rules) : mappingsToRules(rules);
  return new RuleEngine(createTemplateMatchers()).analyze(normalized, { templates });
}
