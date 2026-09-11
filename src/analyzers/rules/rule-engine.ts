import type { MigrationRuleResult } from '../../reports/report-types';
import type { MigrationOccurrence, MigrationRule, MigrationRuleType, Template } from './rule-types';
import { metrics } from '../../reports/migration-metrics';
import { scanElements, type HtmlElement } from './template-scanner';

export interface RuleContext { templates: readonly Template[] }
export interface RuleMatch { file: string; line: number; column: number }
export interface RuleMatcher {
  type: MigrationRuleType;
  find(rule: MigrationRule, context: RuleContext): Iterable<RuleMatch>;
}

/** Orchestration is independent of Angular and HTML; matchers own their source parsing. */
export class RuleEngine {
  private readonly matchers = new Map<MigrationRuleType, RuleMatcher>();
  constructor(matchers: readonly RuleMatcher[]) {
    for (const matcher of matchers) {
      if (this.matchers.has(matcher.type)) throw new Error(`Matcher duplicado: ${matcher.type}`);
      this.matchers.set(matcher.type, matcher);
    }
  }
  analyze(rules: readonly MigrationRule[], context: RuleContext): MigrationRuleResult[] {
    const enabled = rules.filter(r => r.enabled);
    const candidates: { rule: MigrationRule; match: MigrationOccurrence }[] = [];
    for (const rule of enabled) {
      for (const status of ['pending', 'migrated'] as const) {
        const type = status === 'pending' ? rule.type : rule.targetType ?? rule.type;
        const matcher = this.matchers.get(type);
        if (!matcher) throw new Error(`Matcher não registrado: ${type}`);
        const query = status === 'pending' ? rule : { ...rule, type, source: rule.target,
          element: undefined, attribute: rule.targetAttribute ?? (rule.type === 'attribute-value' ? rule.attribute : '') } as MigrationRule;
        for (const match of matcher.find(query, context)) candidates.push({ rule, match: {
          ruleId: rule.id, type: rule.type, source: rule.source, target: rule.target, status,
          ...(rule.type === 'attribute-value' ? { attribute: rule.attribute } : {}), ...match
        } });
      }
    }
    const specificity = (r: MigrationRule) => (r.element ? 10 : 0) + ({ element: 0, class: 1, attribute: 2, 'attribute-value': 3 }[r.type]);
    candidates.sort((a, b) => Number(a.match.status === 'migrated') - Number(b.match.status === 'migrated')
      || (b.rule.priority ?? 0) - (a.rule.priority ?? 0) || specificity(b.rule) - specificity(a.rule) || a.rule.id.localeCompare(b.rule.id));
    const owned = new Set<string>();
    const groups = new Map<string, MigrationOccurrence[]>();
    for (const { rule, match } of candidates) {
      const key = JSON.stringify([match.file, match.line, match.column]);
      if (owned.has(key)) continue;
      owned.add(key);
      const list = groups.get(rule.id) ?? []; list.push(match); groups.set(rule.id, list);
    }
    return enabled.map(rule => {
      const matches = (groups.get(rule.id) ?? []).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
      const counts = metrics(matches);
      return {
        ruleId: rule.id, type: rule.type, source: rule.source, target: rule.target,
        targetType: rule.targetType ?? rule.type, priority: rule.priority ?? 0,
        ...(rule.targetAttribute ? { targetAttribute: rule.targetAttribute } : {}),
        ...(rule.element ? { element: rule.element } : {}),
        ...(rule.type === 'attribute-value' ? { attribute: rule.attribute } : {}),
        occurrences: counts.remainingOccurrences, ...counts, matches, files: [...new Set(matches.map(m => m.file))].sort(),
        status: counts.totalOccurrences > 0 && counts.remainingOccurrences === 0 ? 'completed' : 'pending'
      };
    });
  }
}

type ElementPredicate = (rule: MigrationRule, element: HtmlElement) => boolean;
const predicates: Record<MigrationRuleType, ElementPredicate> = {
  element: (rule, element) => element.name === rule.source.toLowerCase(),
  class: (rule, element) => element.attributes.some(a => a.name === 'class' && a.value !== null
    && !a.value.includes('{{') && a.value.split(/\s+/).includes(rule.source)),
  attribute: (rule, element) => element.attributes.some(a => a.name === rule.source),
  'attribute-value': (rule, element) => rule.type === 'attribute-value'
    && element.attributes.some(a => a.name === rule.attribute && a.value === rule.source && !a.value.includes('{{'))
};

function position(template: Template, offset: number, starts: number[]): RuleMatch {
  const original = template.sourceOffsets?.[offset] ?? offset;
  let low = 0; let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= original) low = middle; else high = middle;
  }
  return { file: template.file, line: low + 1, column: original - (starts[low] ?? 0) + 1 };
}

export function createTemplateMatchers(): RuleMatcher[] {
  // Shared per-run cache: tokenize each template once, regardless of rule count.
  const cache = new WeakMap<Template, { element: HtmlElement; location: RuleMatch }[]>();
  return (Object.entries(predicates) as [MigrationRuleType, ElementPredicate][]).map(([type, predicate]) => ({
    type,
    *find(rule, context) {
      for (const template of context.templates) {
        let entries = cache.get(template);
        if (!entries) {
          const starts = [0];
          for (const match of (template.sourceText ?? template.content).matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
          entries = [...scanElements(template.content)].map(element => ({ element, location: position(template, element.offset, starts) }));
          cache.set(template, entries);
        }
        for (const entry of entries) if ((!rule.element || entry.element.name === rule.element.toLowerCase()) && predicate(rule, entry.element)) yield entry.location;
      }
    }
  }));
}
