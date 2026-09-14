import ExcelJS from 'exceljs';
import type { AnalysisReport } from './report-types';
import { flattenRoutes } from '../routes/route-types';

type Value = string | number;
const navy = 'FF17324D';
const teal = 'FF087E8B';
const pale = 'FFF0F5F9';

function table(book: ExcelJS.Workbook, name: string, headers: string[], rows: Value[][], note: string): ExcelJS.Worksheet {
  if (rows.length > 1048572) throw new Error(`Aba ${name} excede o limite de linhas do Excel. Exporte JSON.`);
  const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = `CODE INSIGHT | ${name}`;
  sheet.getRow(1).height = 32;
  sheet.getCell(1, 1).font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell(2, 1).value = note;
  sheet.getCell(2, 1).alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(2).height = 34;
  sheet.getRow(3).values = headers;
  sheet.getRow(3).height = 26;
  for (const values of rows) {
    if (values.some(v => typeof v === 'string' && v.length > 32767)) throw new Error(`Texto excede o limite de célula do Excel na aba ${name}. Exporte JSON.`);
    sheet.addRow(values); // Strings remain literal strings, never formula objects.
  }
  sheet.eachRow((row, index) => {
    if (index < 3) return;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: 'Calibri', size: 11, color: { argb: index === 3 ? 'FFFFFFFF' : navy }, bold: index === 3 };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9E2EA' } } };
      if (typeof cell.value === 'number') { cell.numFmt = '#,##0'; cell.alignment = { ...cell.alignment, horizontal: 'right' }; }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 3 ? teal : index % 2 === 0 ? pale : 'FFFFFFFF' } };
    });
  });
  headers.forEach((header, i) => {
    const width = rows.reduce((max, row) => Math.max(max, Math.min(65, String(row[i] ?? '').length)), header.length);
    sheet.getColumn(i + 1).width = Math.max(15, width + 2);
  });
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, sheet.rowCount), column: headers.length } };
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: '1:3' };
  return sheet;
}

export async function excelReport(report: AnalysisReport): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Code Insight'; book.created = new Date(report.analyzedAt);
  const a = report.structural?.angular;
  const rules = report.ui?.migrationRules ?? [];
  if (report.routes) {
    const nodes = flattenRoutes(report.routes.tree);
    const flows = new Map<string, string>();
    table(book, 'Rotas', ['Rota / URL', 'Fluxo de rotas', 'Tela / destino', 'Estrutura', 'Layout', 'Ocorrências de layout pendentes', 'O que falta / próxima ação', 'Onde alterar'],
      nodes.map(n => {
        const label = typeof n.title === 'string' ? n.title : n.path === '' ? '(entrada)' : n.path ?? '(não resolvido)';
        const flow = [n.parentId ? flows.get(n.parentId) : '', label].filter(Boolean).join(' → ');
        flows.set(n.id, flow);
        const migration = n.migration;
        const actions = [...(migration?.actions ?? ['Executar novamente a análise para obter as pendências.'])];
        if (n.status === 'partial') actions.push('Resolução parcial da rota: revisar a aba Avisos.');
        return [n.fullPath ?? 'Não resolvida', flow,
          n.componentName ?? (n.type === 'redirect' ? 'Redirecionamento: ' + (typeof n.redirectTo === 'string' ? n.redirectTo || '(rota vazia)' : 'não resolvido') : n.children.length ? 'Grupo de rotas' : 'Destino não resolvido'),
          migration?.structural ?? 'Não analisada', migration?.layout ?? 'Não analisado', migration?.remaining ?? 'Não determinado',
          actions.join('\n') || 'Sem pendências detectadas no componente e template diretos.',
          [...(migration?.files ?? []), n.routeFile + ':' + n.sourceLocation.line].join('\n')];
      }),
      'Escopo: componente e template diretos de cada rota; componentes internos e CSS não incluídos. Fluxo = hierarquia de rotas, não sequência de cliques. Layout depende das regras configuradas.');
  }
  const summary = table(book, 'Resumo', ['Indicador', 'Valor'], [
    ['Projeto', report.projectName], ['Data da análise (UTC)', report.analyzedAt],
    ['Fluxo', { routes: 'Angular Route Analysis', complete: 'Completo — Angular', structural: 'Estrutural — Angular', ui: 'UI — HTML / templates Angular' }[report.mode]],
    ['Progresso estrutural', a ? a.migrationPercentage / 100 : 'Não analisado'],
    ['Componentes encontrados', a?.totalComponents ?? 'Não analisado'],
    ['Standalone', a?.standaloneComponents ?? 'Não analisado'],
    ['Não Standalone', a?.moduleComponents ?? 'Não analisado'],
    ['Inconclusivos', a?.unknownComponents ?? 'Não analisado'],
    ['NgModules encontrados', a?.totalModules ?? 'Não analisado'],
    ['Templates UI analisados', report.ui?.analyzedTemplates ?? 'Não analisado'],
    ['Regras UI analisadas', report.ui ? rules.length : 'Não analisado'],
    ['Ocorrências UI', report.ui?.totalOccurrences ?? 'Não analisado'],
    ['Avisos', (report.structural?.warnings.length ?? 0) + (report.ui?.warnings.length ?? 0) + (report.routes?.warnings.length ?? 0)],
    ['ID da análise', report.analysisId], ['ID do projeto', report.projectId], ['Schema JSON', report.schemaVersion],
    ['Progresso UI', report.ui ? report.ui.progressPercentage / 100 : 'Não analisado'],
    ['Progresso geral', report.mode === 'routes' ? 'Não analisado' : report.overallPercentage / 100],
    ['UI migradas (destinos encontrados)', report.ui?.resolvedOccurrences ?? 'Não analisado'],
    ['UI restantes', report.ui?.remainingOccurrences ?? 'Não analisado'],
    ['Componentes declarados em NgModules', a?.declaredModuleComponents ?? 'Não analisado'],
    ...(report.routes ? [['Rotas encontradas', report.routes.totalRoutes], ['Componentes de rotas resolvidos', report.routes.resolvedComponents], ['Rotas lazy', report.routes.lazyRoutes], ['Redirects', report.routes.redirectRoutes]] as Value[][] : [])
  ], 'UI é proporção de destinos encontrados, não comprovação histórica. Geral pondera componentes e ocorrências dos fluxos executados.');
  if (a) {
    summary.getCell('B7').numFmt = '0.00%';
    summary.addConditionalFormatting({ ref: 'B7', rules: [{ type: 'dataBar', priority: 1,
      cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], ...{ color: { argb: teal } } }] });
  }
  summary.getCell('B20').numFmt = '0.00%';
  summary.getCell('B21').numFmt = '0.00%';
  summary.addConditionalFormatting({ ref: 'B20:B21', rules: [{ type: 'dataBar', priority: 2,
    cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], ...{ color: { argb: teal } } }] });
  for (const row of [7, 20, 21]) {
    summary.getRow(row).height = 36;
    summary.getCell(row, 2).font = { name: 'Calibri', size: 20, bold: true, color: { argb: teal } };
  }
  const structural = report.structural;
  table(book, 'Estrutural', ['Tipo', 'Nome', 'Arquivo', 'Linha', 'Classificação', 'Módulos / componentes associados', 'Declarações', 'Declarações não resolvidas'], [
    ...(structural?.components.map(c => ['Componente', c.name, c.file, c.line,
      c.standalone === null ? 'Inconclusivo' : c.standalone ? 'Standalone' : 'Não Standalone', c.declaredIn.join('\n'), '', ''] as Value[]) ?? []),
    ...(structural?.modules.map(m => ['NgModule', m.name, m.file, m.line, 'Encontrado', m.componentIds.join('\n'), m.declarations.join('\n'), m.unresolvedDeclarations.join('\n')] as Value[]) ?? [])
  ], structural ? 'Angular. Inconclusivo significa classificação não determinada. Módulo encontrado não significa remoção pendente.' : 'Análise estrutural não executada neste fluxo.');
  const uiSheet = table(book, 'UI Migration', ['Regra', 'Tipo', 'Atributo', 'Origem', 'Destino', 'Total', 'Migrados', 'Restantes', 'Progresso', 'Arquivos afetados', 'Status'],
    rules.map(r => [r.ruleId, r.type, r.attribute ?? '', r.source, r.target, r.totalOccurrences, r.resolvedOccurrences,
      r.remainingOccurrences, r.progressPercentage / 100, r.files.length,
      { completed: 'Concluída', pending: 'Pendente', ignored: 'Ignorada' }[r.status]]),
    report.ui ? 'Migrados = destinos encontrados. Cada elemento pertence à regra vencedora por prioridade. Zero total resulta em 0%.' : 'Análise UI não executada neste fluxo.');
  uiSheet.getColumn(9).numFmt = '0.00%';
  if (rules.length) uiSheet.addConditionalFormatting({ ref: `I4:I${rules.length + 3}`, rules: [{ type: 'dataBar', priority: 1,
    cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], ...{ color: { argb: teal } } }] });
  const fileSheet = table(book, 'Arquivos', ['Arquivo', 'Regra', 'Origem', 'Destino', 'Ocorrências', 'Migradas', 'Restantes', 'Progresso'],
    report.ui?.files.map(f => [f.file, f.ruleId, f.source, f.target, f.totalOccurrences, f.resolvedOccurrences, f.remainingOccurrences, f.progressPercentage / 100]) ?? [],
    report.ui ? 'Uma linha por arquivo e regra. Métricas calculadas pelo analisador; não representam alterações históricas.' : 'Análise UI não executada neste fluxo.');
  fileSheet.getColumn(8).numFmt = '0.00%';
  table(book, 'Ocorrências', ['Regra', 'Tipo', 'Atributo', 'Origem', 'Destino', 'Arquivo', 'Linha', 'Coluna', 'Status'],
    rules.flatMap(r => r.matches.map(m => [m.ruleId, m.type, m.attribute ?? '', m.source, m.target, m.file, m.line, m.column, m.status === 'migrated' ? 'Migrado' : 'Pendente'])),
    report.ui ? 'Posições começam em 1 e apontam ao início da tag. Templates inline apontam para o TypeScript original.' : 'Análise UI não executada neste fluxo.');
  table(book, 'Avisos', ['Área', 'Mensagem'], [
    ...(structural?.warnings.map(w => ['Estrutural', w]) ?? []), ...(report.ui?.warnings.map(w => ['UI', w]) ?? []), ...(report.routes?.warnings.map(w => ['Rotas', w]) ?? [])
  ], 'Avisos podem indicar resultados parciais. A ausência de avisos não elimina as limitações da análise estática.');
  const snapshots = [...(report.history ?? []).filter(s => s.projectId === report.projectId && s.analysisId !== report.analysisId), {
    analysisId: report.analysisId, projectId: report.projectId, analyzedAt: report.analyzedAt, mode: report.mode,
    structuralPercentage: a?.migrationPercentage ?? null, uiPercentage: report.ui?.progressPercentage ?? null
  }].sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt));
  const historySheet = table(book, 'Histórico', ['Data (UTC)', 'Fluxo', 'Estrutural', 'UI', 'ID da análise'],
    snapshots.map(s => [s.analyzedAt, s.mode, s.structuralPercentage === null ? 'Não analisado' : s.structuralPercentage / 100,
      s.uiPercentage === null ? 'Não analisado' : s.uiPercentage / 100, s.analysisId]),
    'Contém a execução atual e snapshots fornecidos ao exportador. Não há persistência automática; compare apenas escopos e regras equivalentes.');
  historySheet.getColumn(3).numFmt = '0.00%'; historySheet.getColumn(4).numFmt = '0.00%';
  return new Uint8Array(await book.xlsx.writeBuffer());
}
