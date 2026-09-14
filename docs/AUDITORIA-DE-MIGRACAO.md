# Auditoria de migração Angular

Execute **Analyze Project — Complete** ou **Angular Route Analysis** e exporte Excel. Ambos analisam estrutura, UI e rotas no mesmo snapshot. As regras de `.code-insight.json` são lidas novamente, incluindo edições não salvas. Não é necessário executar os dois comandos em sequência.

## Leitura do relatório

As dez abas aparecem nesta ordem, preservando os nomes existentes: Resumo, Rotas, Pendências, Detalhes Rotas, Estrutural, UI Migration, Arquivos, Ocorrências, Avisos, Histórico.

- **Resumo:** status da migração, total de rotas por situação, itens únicos pendentes, revisões inconclusivas e contagens estruturais/UI. Percentuais são indicadores complementares.
- **Rotas:** uma linha por nó de rota, ordenada por prioridade. Standalone informa o componente direto; Status final considera o escopo relacionado. A URL aparece uma vez. Arquivos e ações extensos têm prévias limitadas, com indicação de onde consultar o restante.
- **Pendências:** uma linha por item único. Uma ocorrência compartilhada pode listar várias rotas. Arquivo, linha e coluna apontam ao código original. Itens sem vínculo seguro ficam em “Não determinada / global”.
- **Detalhes Rotas:** múltiplas linhas por rota, com seu ID, componente, ocorrências, status, regras, posições e metadados de routing. Metadados grandes são divididos em linhas, sem descarte silencioso.

Exemplo ilustrativo:

| Rota | Standalone | UI pendentes | Status final | Próxima ação |
| --- | --- | ---: | --- | --- |
| /clientes | Sim | 3 | Parcial | Migrar 3 ocorrências de UI |
| /pedidos | Não | 0 | Pendente | Migrar componente para Standalone |
| /painel | Sim | 0 | Concluída | Nenhuma no escopo analisado |
| /dinamica | Inconclusivo | — | Inconclusiva | Resolver rota ou template |

## Critérios dos status

| JSON | Excel | Significado |
| --- | --- | --- |
| `COMPLETED` | Concluída | Sem pendências conhecidas e sem limitações identificadas no escopo auditado. Não prova correção funcional ou substituição histórica. |
| `PARTIAL` | Parcial | Componente direto Standalone, ainda com pendências conhecidas de UI ou dependências. |
| `PENDING` | Pendente | Pendência estrutural conhecida, inclusive componente não Standalone ou grupo dependente de NgModule. |
| `INCONCLUSIVE` | Inconclusiva | Rota, componente, import, sintaxe ou template não resolvido. Pendências conhecidas continuam visíveis. |
| `NOT_ANALYZED` | Não analisada | Falta uma análise necessária ou não existem regras habilitadas para avaliar UI. Contagens não determinadas usam `null`. |

Incerteza tem precedência sobre conclusão. Pendência estrutural comprovada pode continuar Pendente mesmo sem regras UI, enquanto a coluna UI informa Não analisado. A lista de pendências conhecidas pode estar vazia em uma rota Não analisada; isso não significa conclusão.

## Escopo e correlação

A auditoria parte do componente direto, dos componentes de rotas ancestrais e de `loadChildren` apontando para NgModule. Percorre imports locais por símbolos, constantes e arrays estáticos. Componentes auxiliares importados entram no escopo, com seus templates. NgModules locais relacionados incluem imports, declarações e exports. Ciclos de classes são deduplicados; expressões circulares ou não resolvidas pedem revisão.

Um NgModule encontrado no inventário não é automaticamente tarefa de remoção. Uma dependência comprovada de NgModule gera **revisão**: avaliar substituição por imports/rotas standalone quando aplicável. Não há recomendação de excluir o módulo sem verificar seus consumidores.

O escopo é conservador: incluir um componente importado significa dependência estática disponível, não prova de que ele é renderizado. Não são inferidos vínculos por nome parecido de arquivo ou por seletor. Não há análise funcional de CSS, DOM, serviços, directives, pipes ou código de pacotes externos. Uma dependência importada não resolvida fica inconclusiva.

Templates externos são associados por `templateUrl`. Templates inline usam intervalos exatos no TypeScript original, distinguindo várias classes no mesmo arquivo e preservando posições de escapes. As ocorrências vêm do resultado global de UI, mantendo a mesma prioridade de regras e deduplicação.

Quando duas rotas apontam explicitamente ao mesmo template, a ocorrência tem um único item com dois vínculos. HTML sem vínculo conhecido permanece global. Grupos sem componente resumem seus filhos, deduplicando itens. **Não some totais por rota para obter o total do projeto**: use Resumo/Pendências. Rotas vazias e pais podem compartilhar a URL, mas são nós diferentes; seus IDs aparecem em Detalhes Rotas.

## JSON e compatibilidade

O schema **5** mantém os campos dos schemas 3/4 e acrescenta:

| Campo | Conteúdo |
| --- | --- |
| `audit.items[]` | Registro único de itens UI, estruturais e de resolução, com IDs, arquivo/linha/coluna, ação, componentes e rotas relacionados. |
| `audit.items[].occurrence` | Índices `rule` e `match` que apontam a `ui.migrationRules[rule].matches[match]`; quando o item é UI. |
| `audit.routeCounts` | Contagens dos cinco estados; `null` quando rotas não foram analisadas. |
| `audit.status`, `audit.warnings`, `audit.scope` | Estado global, limitações e escopo da auditoria. |
| `routes.tree[].audit` | Standalone direto, IDs de componentes/NgModules, estados estrutural/UI/final, métricas UI locais, IDs de ocorrências/pendências, arquivos afetados, ações e avisos. |

IDs identificam registros desta execução, não identidade histórica entre análises. A árvore, guards, lazy loading, metadados, IDs e relação inversa `componentRoutes` continuam disponíveis. `migration` é uma visão de compatibilidade derivada de `audit`; novos consumidores devem usar `audit` como fonte de status.

Mudanças de comportamento versionadas: Route Analysis agora retorna `structural` e `ui` preenchidos; Complete sempre inclui `routes`, inclusive árvore vazia com total 0. O percentual geral volta a representar os componentes e ocorrências efetivamente analisados em Rotas. Não é percentual de rotas concluídas.

Exportadores ainda aceitam objetos dos schemas 3/4. Onde falta auditoria, exibem Não analisado e orientam executar novamente, sem inferir status a partir de dados incompletos. Não existe importação de relatórios antigos na interface. Para consumidores JSON, aceitar schema 5 e ler os novos campos é suficiente; não é necessário renomear os campos existentes.

Fluxos individuais estrutural/UI mantêm as seções não executadas como `null` e as abas com uma explicação. O histórico continua opcional e sem persistência automática; nenhuma execução é misturada com dados anteriores.
