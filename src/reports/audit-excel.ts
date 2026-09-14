import type ExcelJS from 'exceljs';
import type { AnalysisReport } from './report-types';
import type { AuditStatus } from './audit-types';
import { flattenRoutes } from '../routes/route-types';

export const statusLabels: Record<AuditStatus, string> = {
  COMPLETED: 'Concluída', PARTIAL: 'Parcial', PENDING: 'Pendente', INCONCLUSIVE: 'Inconclusiva', NOT_ANALYZED: 'Não analisada'
};
type Table = (book: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number)[][], note: string) => ExcelJS.Worksheet;
const priority: Record<AuditStatus, number> = { PENDING: 0, PARTIAL: 1, INCONCLUSIVE: 2, NOT_ANALYZED: 3, COMPLETED: 4 };

export function auditExcel(book: ExcelJS.Workbook, report: AnalysisReport, table: Table): void {
  const nodes = flattenRoutes(report.routes?.tree ?? []);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const items = report.audit?.items ?? [];
  const itemsById = new Map(items.map(i => [i.id, i]));
  const componentNames = new Map(report.structural?.components.map(c => [c.id, c.name]));
  const label = (id: string) => {
    const node = byId.get(id);
    return node ? `${node.fullPath ?? 'Não resolvida'}${node.outlet ? ` [outlet: ${String(node.outlet)}]` : ''}` : 'Não determinada';
  };
  const routeSheet = table(book, 'Rotas', ['Rota', 'Componente / destino', 'Standalone', 'Estrutura', 'UI pendentes', 'Pendências conhecidas', 'Arquivos afetados', 'Próxima ação', 'Status final'],
    [...nodes].sort((a, b) => priority[a.audit?.finalStatus ?? 'NOT_ANALYZED'] - priority[b.audit?.finalStatus ?? 'NOT_ANALYZED']
      || (a.fullPath ?? '').localeCompare(b.fullPath ?? '')).map(n => {
      const a = n.audit;
      const files = a?.affectedFiles ?? [];
      return [label(n.id), n.componentName ?? (n.type === 'redirect' ? `Redirect → ${typeof n.redirectTo === 'string' ? n.redirectTo || '(entrada)' : 'não resolvido'}` : 'Grupo de rotas'),
        n.componentName ? a?.standalone === true ? 'Sim' : a?.standalone === false ? 'Não' : 'Inconclusivo' : 'Não se aplica',
        statusLabels[a?.structuralStatus ?? 'NOT_ANALYZED'], a?.uiStatus === 'INCONCLUSIVE' ? `${a.pendingOccurrences ?? 0} conhecidas; inconclusivo` : a?.pendingOccurrences ?? 'Não analisado',
        a ? a.pendingItemIds.length : 'Não analisado',
        files.slice(0, 3).join('\n') + (files.length > 3 ? `\n+ ${files.length - 3} arquivos em Pendências` : ''),
        a?.nextActions.length ? a.nextActions.slice(0, 2).join('\n') + (a.nextActions.length > 2 ? '\nMais ações em Pendências' : '')
          : a ? 'Nenhuma no escopo analisado' : 'Executar novamente a análise', statusLabels[a?.finalStatus ?? 'NOT_ANALYZED']];
    }), report.routes ? `${nodes.length} rotas analisadas. Grupos resumem filhos; contagens por rota não devem ser somadas. Concluída = sem pendências conhecidas no escopo. Detalhes nas abas seguintes.` : 'Rotas: Não analisado neste fluxo.');
  const colors: Record<string, string> = { 'Concluída': 'FFC6EFCE', 'Parcial': 'FFFFEB9C', 'Pendente': 'FFFFC7CE', 'Inconclusiva': 'FFE2E3E5', 'Não analisada': 'FFE2E3E5' };
  for (let row = 4; row <= routeSheet.rowCount; row++) {
    const cell = routeSheet.getCell(row, 9);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors[String(cell.value)] ?? 'FFFFFFFF' } };
  }
  [32, 28, 17, 18, 22, 21, 45, 58, 20].forEach((width, i) => { routeSheet.getColumn(i + 1).width = width; });
  const routeNames = (ids: string[]) => {
    const names = [...new Set(ids.map(label))];
    return names.slice(0, 4).join('\n') + (names.length > 4 ? `\n+ ${names.length - 4} rotas em Detalhes Rotas` : '');
  };
  table(book, 'Pendências', ['Rotas relacionadas', 'Componente', 'Tipo', 'Categoria', 'Regra', 'Origem', 'Destino', 'Arquivo', 'Linha', 'Coluna', 'Status', 'Próxima ação'],
    items.filter(i => i.status !== 'migrated').sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column).map(i => [
      i.routeIds.length ? routeNames(i.routeIds) : 'Não determinada / global',
      i.componentIds.map(id => componentNames.get(id) ?? id).join('\n'),
      i.type, i.category, i.ruleId ?? '', i.source, i.target, i.file, i.line, i.column,
      i.status === 'inconclusive' ? 'Inconclusiva' : 'Pendente', i.action
    ]), report.audit ? 'Uma linha por item único, mesmo quando compartilhado por várias rotas. Inclui pendências globais e revisões inconclusivas. Consulte Resumo para análises não executadas.' : 'Consolidação de pendências: Não analisado. Execute novamente a análise.');
  const details: (string | number)[][] = [];
  for (const node of nodes) {
    const base = [label(node.id), node.id];
    details.push([...base, 'Rota', node.type, node.routeFile, node.sourceLocation.line, node.sourceLocation.column,
      node.status === 'partial' ? 'Inconclusiva' : 'Resolvida', '']);
    if (node.componentName) details.push([...base, 'Componente', node.componentName, node.componentFile ?? 'Não resolvido',
      report.structural?.components.find(c => c.file === node.componentFile && c.name === node.componentName)?.line ?? '', '',
      node.audit?.standalone === true ? 'Standalone' : node.audit?.standalone === false ? 'Não Standalone' : 'Inconclusivo', '']);
    for (const [key, value] of Object.entries({ loadChildren: node.loadChildren, loadComponent: node.loadComponent, guards: node.guards,
      redirectTo: node.redirectTo, outlet: node.outlet, title: node.title, data: node.data, metadata: node.metadata,
      matcher: node.matcher, resolve: node.resolve, providers: node.providers, pathMatch: node.pathMatch })) {
      if (value === undefined || (typeof value === 'object' && value !== null && !Object.keys(value).length)) continue;
      const text = JSON.stringify(value);
      // Split large metadata across rows; never silently drop it or produce giant cells.
      for (let offset = 0; offset < text.length; offset += 1000) details.push([...base, key, text.slice(offset, offset + 1000), node.routeFile, node.sourceLocation.line, '', '', '']);
    }
    const ids = new Set([...(node.audit?.occurrenceIds ?? []), ...(node.audit?.pendingItemIds ?? [])]);
    for (const id of ids) {
      const item = itemsById.get(id);
      if (item) details.push([...base, item.type, `${item.source}${item.target ? ` → ${item.target}` : ''}`,
        item.file, item.line, item.column, item.status === 'migrated' ? 'Destino encontrado' : item.status === 'pending' ? 'Pendente' : 'Inconclusiva', item.ruleId ?? item.category]);
    }
  }
  table(book, 'Detalhes Rotas', ['Rota', 'ID da rota', 'Tipo', 'Item', 'Arquivo', 'Linha', 'Coluna', 'Status', 'Regra / categoria'], details,
    report.routes ? report.audit?.scope ?? 'Mapa técnico. Auditoria de migração não analisada neste relatório antigo.' : 'Rotas: Não analisado neste fluxo.');
}
