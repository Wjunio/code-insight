# Auditoria do Code Insight — 10/09/2026

## Revisão complementar — projeto em Angular 15

Status geral: ajustes aplicados e verificação automatizada aprovada; validação visual permanece pendente.

| Prioridade | Constatação | Tratamento |
| --- | --- | --- |
| Alta | O novo pedido indicava default Standalone a partir de 15, contrariando o README e o framework. | Mantido o default correto: false até 18, true a partir de 19. Teste explícito para 14, 15, 18 e 19. |
| Média | Excel não apresentava status das regras, já existente no modelo. | Coluna Status adicionada, sem recalcular regras no exportador. |
| Média | Resumo não mostrava separadamente componentes declarados em NgModules. | Indicador adicionado a partir de `declaredModuleComponents`. |
| Média | Teste multi-root escolhia somente a primeira pasta; limites totais e de célula tinham pouca cobertura. | Teste passa a selecionar a segunda raiz com arquivos/regras distintos. Acrescentadas verificações de snapshot acima de 100 MB e texto Excel acima de 32.767 caracteres. |
| Baixa | Instrução de reanálise direcionava sempre ao fluxo completo. | README orienta UI independente ou completo Angular e explica Angular 15. |

Nenhum defeito crítico identificado na revisão. Structural, UI, Complete, configuração, Rule Engine, schema 3, JSON, exportação, workers e fórmulas foram preservados. Os avisos estruturais continuam centralizados na aba Avisos.

O Angular 15 é compatível com a análise. A presença de suporte a Standalone nessa versão não torna o valor implícito true: o componente precisa declarar `standalone: true`. Referência consultada: [Angular — componentes](https://angular.dev/guide/components).

`imports`, `exports` e `providers` dos metadados Angular não possuem inventário próprio neste MVP. A resolução de imports TypeScript para relacionar componentes a declarations existe, mas não equivale a analisar essas três listas. Essa expansão permanece fora do escopo implementado/documentado; não foi criada durante a auditoria.

Arquivos alterados nesta revisão complementar: `src/reports/excel-report.ts`, `test/analyzer.test.ts`, `test/phase-two.test.ts`, `test/commands.test.ts`, `README.md` e este documento. Nenhuma dependência, versão suportada, script ou schema foi alterado.

Validação executada: primeiro 32 testes nos arquivos afetados; depois a suíte completa com **52 testes aprovados**, além de `check-types` e `lint`. O pacote é regenerado pelo script `package`, que também executa lint, compilação e testes. Os testes multi-root e de documentos não salvos usam a API VS Code simulada e os analisadores reais; não são testes manuais do Extension Host.

As seções seguintes registram a auditoria anterior e seu resultado de 50 testes.

O MVP foi revisado contra o README e o pedido de auditoria. A implementação existente foi preservada; os ajustes se concentram em validação, avisos, limites de leitura e informações exportadas.

## Comparação e correções

| Área | Situação encontrada | Resultado |
| --- | --- | --- |
| Structural Migration | Detecção Angular, versões, Standalone, inconclusivos, módulos e associações já implementados. | Preservados. Metadados computados que podem ocultar declarações agora geram aviso. |
| UI Migration | Motor genérico, quatro tipos, destinos configuráveis, prioridades e contagem sem duplicidade já implementados. | Preservados. Validação de `targetType`, `targetAttribute` e mapeamentos legados corrigida. |
| Completo | Restrito a Angular, com seções independentes. | Preservado. UI isolada continua funcionando em HTML sem Angular. |
| Métricas | Destinos / (origens + destinos), zero sem conclusão, inconclusivos no denominador estrutural. | Preservadas, com testes. Percentuais não comprovam substituições históricas. |
| Excel | XLSX real com ExcelJS, sete abas, filtros, congelamento, estilos, percentuais e barras. | Acrescentadas declarações e declarações não resolvidas de módulos. Fluxos ausentes aparecem como “Não analisado” no resumo; aba Arquivos também explica quando UI não foi executada. |
| JSON | Schema 3 e avisos por seção já existiam. Faltava `warnings` na raiz solicitado na auditoria. | Acrescentada lista consolidada sem mensagens idênticas repetidas, mantendo as listas por área. |
| Avisos de UI | Erros sintáticos TypeScript não eram reportados no fluxo UI isolado; propriedades computadas podiam ocultar templates sem aviso específico. | Ambos sinalizados. |
| Documentos abertos | Snapshot incluía conteúdo não salvo, mas limites individuais eram conferidos apenas no arquivo em disco. | Aplicados limites de 5 MB ao conteúdo e 1 MB à configuração aberta. Limite total continua 100 MB. |
| Comandos | Escolha de fluxo/pasta, Output, exportação Excel primeiro, JSON direto, confirmação de substituição e cancelamento. | Preservados; testes de documentos não salvos e cancelamento ampliados. |

## Arquivos desta revisão

Modificados, em relação ao estado inicial desta auditoria:

- `src/analyzers/analysis-service.ts` e `src/reports/report-types.ts`: avisos consolidados no modelo.
- `src/analyzers/rules/rule-config.ts` e `schemas/code-insight.schema.json`: validação dos destinos.
- `src/analyzers/angular/component-analyzer.ts` e `module-analyzer.ts`: avisos sobre propriedades computadas.
- `src/ui-migration/template-adapters.ts`: diagnósticos sintáticos.
- `src/reports/excel-report.ts`: declarações e indicação de análise ausente.
- `src/utils/workspace-files.ts` e `rule-configuration.ts`: limites sobre conteúdo não salvo.
- `test/migration-rules.test.ts`, `test/phase-two.test.ts` e `test/commands.test.ts`: regressões das correções.
- `README.md`: documentação dos comportamentos ajustados.

Criado: `docs/AUDITORIA-MVP.md`. O VSIX local foi regenerado. Nenhuma dependência foi adicionada ou atualizada nesta auditoria.

## Validação automatizada

A referência inicial passou em 47 testes. A suíte final contém 50 testes, incluindo novos cenários e ampliação do teste de comandos. Foram executados os scripts existentes `check-types`, `lint`, `test`, `compile` e `package`.

Os testes exercitam analisadores reais, workers e exportadores. O XLSX é gravado e reaberto com ExcelJS para conferir abas, valores e formatação. Os comandos usam uma simulação da API do VS Code; isso não equivale a validar sua interface visual.

O empacotador aponta muitos arquivos de dependências no VSIX. O pacote é gerado, mas uma futura otimização de distribuição pode avaliar bundling sem comprometer os workers. Não houve mudança de arquitetura ou dependências apenas para silenciar esse aviso.

## Validação manual pendente

Esta sessão não dispõe de ferramenta para operar a interface do VS Code ou do Excel. Portanto, não se declara concluída a validação manual solicitada. Antes de publicar, instalar o VSIX e executar este roteiro:

| Cenário | Resultado a conferir |
| --- | --- |
| Pasta sem Angular | Estrutural/completo orientam usar UI; HTML é analisado por UI. |
| Projeto Angular | Detecção e versão coerentes com o projeto. |
| UI Migration | Somente interface, sem números estruturais inventados. |
| Structural Migration | Somente estrutura; configuração UI inválida não bloqueia. |
| Complete | Estrutural e UI separados no mesmo relatório. |
| Excel | Abrir as sete abas, usar filtros, conferir leitura, declarações e percentuais. |
| JSON | Abrir o arquivo e comparar métricas e avisos com o relatório. |
| Regras sobrepostas | `input` e `matInput` no mesmo elemento contam uma vez, respeitando prioridade. |
| Documentos não salvos | Alterar HTML/configuração sem salvar e conferir novo snapshot. |
| Multi-root | Escolher cada pasta e conferir que arquivos, regras e nome pertencem à seleção. |
| Cancelamento | Cancelar análise/exportação, verificar ausência de arquivo novo e executar novamente. |

## Decisões e limites preservados

`Analyzer → AnalysisReport → ReportExporter` permanece a separação central. O analisador calcula métricas; Excel apenas apresenta os dados; JSON serializa o modelo. `extension.ts` registra recursos, sem concentrar análise.

Não foram adicionados adaptadores React/Vue/Svelte nem persistência automática de histórico. O scanner continua estático e lexical. Não existe limite numérico de quantidade de arquivos: os limites existentes são de escopo, tamanho individual e tamanho total. A publicação no Marketplace ainda exige configurar um publisher real e validar o pacote instalado.
