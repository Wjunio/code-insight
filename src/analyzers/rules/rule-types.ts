export type MigrationRuleType = 'element' | 'class' | 'attribute' | 'attribute-value';
interface RuleBase {
  id: string;
  source: string;
  target: string;
  enabled: boolean;
  priority?: number;
  element?: string;
  targetType?: MigrationRuleType;
  targetAttribute?: string;
}
export type MigrationRule = RuleBase & (
  { type: 'element' | 'class' | 'attribute' } |
  { type: 'attribute-value'; attribute: string }
);
export interface MigrationOccurrence {
  status: 'pending' | 'migrated';
  ruleId: string;
  type: MigrationRuleType;
  source: string;
  target: string;
  attribute?: string;
  file: string;
  line: number;
  column: number;
}
export interface Template {
  file: string;
  content: string;
  /** Original TypeScript text and decoded-character offsets for inline templates. */
  sourceText?: string;
  sourceOffsets?: number[];
}
