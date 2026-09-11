# Entrega — UI Migration e exportação

Para entender o produto sem detalhes técnicos, use o [guia do Code Insight](GUIA-DO-CODE-INSIGHT.md).

## Resultado

A extensão mantém os fluxos estrutural Angular, UI independente e completo Angular. O motor UI identifica origens e destinos configuráveis, resolve sobreposições por prioridade e calcula totais, migrados, restantes e progresso. Os resultados podem ser exportados como Excel real ou JSON, pelo comando **Code Insight: Export Report**.

“Migrado” significa destino presente no snapshot atual, não substituição comprovada. Os adaptadores disponíveis são HTML e templates Angular; JSX/TSX, Vue e Svelte permanecem sinalizados como não suportados.

## Arquivos criados nesta entrega

- `src/reports/excel-report.ts`: planilhas e formatação a partir do relatório.
- `src/reports/migration-metrics.ts`: métricas compartilhadas e agregação por arquivo/regra.
- `src/export/report-exporter.ts`: contrato e exportadores Excel/JSON.
- `src/workers/excel-worker.ts`: geração de Excel fora do extension host.
- `src/utils/file-scope.ts`: política de exclusão isolada.
- `test/phase-two.test.ts`: destinos, prioridades, métricas, escopo e exportação.
- `docs/GUIA-DO-CODE-INSIGHT.md`: explicação para usuários.
- `docs/FASE-2-ENTREGA.md`: registro desta entrega.

## Principais arquivos modificados

- `src/analyzers/rules/rule-types.ts`, `rule-config.ts` e `rule-engine.ts`: destinos, prioridade, especificidade e estados das ocorrências.
- `src/ui-migration/ui-analyzer.ts`, `src/analyzers/analysis-service.ts`: métricas UI e indicador geral.
- `src/reports/report-types.ts`, `report-generator.ts`: schema 3 e apresentação dos novos indicadores.
- `src/commands/analyze-project.ts`: escolha Excel/JSON, confirmação de sobrescrita, progresso e cancelamento.
- `src/utils/run-analysis.ts`, `workspace-files.ts`: worker reutilizável e escopo de leitura.
- `test/analysis-flows.test.ts`, `commands.test.ts`, `migration-rules.test.ts`: adaptação de contratos e integração dos comandos.
- `package.json`, `package-lock.json`, `.gitignore`, `.vscodeignore`, schema de configuração, exemplo e README.

## Dependências

- **ExcelJS** em produção: gera XLSX com estilos, filtros e formatação condicional. Node/VS Code não oferecem essa funcionalidade nativamente.
- **@vscode/vsce** em desenvolvimento: empacota a extensão em VSIX.
- Override de **uuid 11.1.1+** dentro de ExcelJS para corrigir dependência vulnerável, preservando a API `v4` usada pela biblioteca. A geração/reabertura de planilhas com barras de progresso foi validada.

## Configuração de exemplo

```json
{
  "migrationRules": [
    { "id": "input", "type": "element", "source": "input", "target": "meu-input" },
    { "id": "material", "type": "attribute", "element": "input", "source": "matInput", "target": "meu-input-material", "targetType": "element", "priority": 10 },
    { "id": "icone", "type": "class", "source": "material-icon", "target": "sisbr-icon" }
  ]
}
```

O destino usa o mesmo tipo da origem por padrão; `targetType` permite mudar esse comportamento. `element` restringe a origem, não o destino. Prioridade maior vence; depois especificidade e ID em ordem alfabética. Quando origem e destino coexistem no elemento, prevalece pendente.

## Estrutura do Excel

1. **Resumo:** projeto, data, fluxo, indicadores e contagens.
2. **Estrutural:** componentes e módulos Angular.
3. **UI Migration:** regras, total, migrados, restantes e percentual.
4. **Arquivos:** métricas por arquivo e regra.
5. **Ocorrências:** posições e estado Pendente/Migrado.
6. **Avisos:** limitações identificadas na execução.
7. **Histórico:** execução atual e snapshots recebidos pelo modelo, sem persistência automática.

Filtros, cabeçalhos congelados, linhas alternadas, bordas discretas, larguras ajustadas e percentuais com barras de progresso foram adicionados. Textos do projeto não são convertidos em fórmulas.

## Validação

Comandos de entrega: `npm run check-types`, `npm run lint`, `npm test` e `npm run package`. A suíte contém 47 testes, incluindo integração dos comandos com workers reais, leitura do XLSX gerado, abas/cabeçalhos/valores, JSON, prioridade, divisão por zero, exclusões, cancelamento e confirmação de sobrescrita.

O empacotamento gera `code-insight-0.1.0.vsix` localmente; não publica no Marketplace. A inspeção visual no aplicativo Microsoft Excel e a instalação manual no Extension Host não fazem parte dos testes automatizados.

## Decisões e limites

- O JSON passou ao schema 3 porque a semântica de UI evoluiu. `occurrences` permanece como alias das origens restantes; `totalOccurrences` e `matches` incluem origens e destinos atribuídos.
- O indicador geral soma componentes Standalone e destinos UI, dividindo pela soma de componentes e ocorrências dos fluxos executados. Não representa esforço nem qualidade da migração.
- Histórico aceita snapshots anteriores, mas não possui armazenamento/importação automática nesta etapa.
- Não há correção automática, Power BI direto, parser CSS avançado ou suporte completo a React/Vue.
- Os arquivos existentes e o motor de regras foram reutilizados; não houve reorganização de pastas apenas por estética.
