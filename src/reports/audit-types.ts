export type AuditStatus = 'COMPLETED' | 'PARTIAL' | 'PENDING' | 'INCONCLUSIVE' | 'NOT_ANALYZED';

export interface AuditItem {
  id: string;
  type: 'STRUCTURAL' | 'UI' | 'RESOLUTION';
  category: string;
  ruleId?: string;
  source: string;
  target: string;
  file: string;
  line: number;
  column: number;
  status: 'pending' | 'migrated' | 'inconclusive';
  action: string;
  componentIds: string[];
  routeIds: string[];
  /** Reference into ui.migrationRules; the occurrence itself is not copied. */
  occurrence?: { rule: number; match: number };
}

export interface RouteAudit {
  standalone: boolean | null;
  componentIds: string[];
  moduleIds: string[];
  structuralStatus: AuditStatus;
  uiStatus: AuditStatus;
  totalOccurrences: number | null;
  migratedOccurrences: number | null;
  pendingOccurrences: number | null;
  occurrenceIds: string[];
  pendingItemIds: string[];
  affectedFiles: string[];
  nextActions: string[];
  warnings: string[];
  finalStatus: AuditStatus;
}

export interface MigrationAudit {
  items: AuditItem[];
  warnings: string[];
  routeCounts: Record<AuditStatus, number> | null;
  status: AuditStatus;
  scope: string;
}
