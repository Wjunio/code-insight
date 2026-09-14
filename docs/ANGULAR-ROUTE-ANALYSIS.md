# Angular Route Analysis

Execute **Code Insight: Angular Route Analysis** na paleta do VS Code. O comando `codeInsight.analyzeRoutes` usa a pasta selecionada, inclui edições não salvas, mostra progresso e permite cancelamento. Ele executa estrutura e UI junto das rotas. `.code-insight.json` é opcional para descobrir rotas, mas suas regras são necessárias para avaliar pendências de layout; configuração inválida interrompe a análise. Consulte **Output → Code Insight** e use **Code Insight: Export Report** para salvar JSON ou Excel.

O analisador lê somente o snapshot: não inicializa Angular, não executa imports, funções, guards, factories ou scripts e não altera o projeto analisado.

## Como encontra as rotas

O nome do arquivo e o nome da constante não importam. A evidência vem dos imports de `Routes`/`Route` de `@angular/router`, incluindo aliases e namespace, ou de chamadas `provideRouter`, `provideRoutes`, `RouterModule.forRoot` e `RouterModule.forChild`. Aceita arrays tipados, `satisfies`, assertions, constantes, referências importadas e spreads estáticos. Também reconhece arrays de interfaces que estendem diretamente `Route`, úteis para extensões de menu.

Um `routing.ts` pode conter rotas e outras estruturas. Campos adicionais dos objetos de rota ficam em `metadata`; `data` é preservado separadamente. Um array de menu sem evidência Angular não vira automaticamente uma configuração de rotas. Nenhuma rota, mesmo com título, é automaticamente classificada como item de menu.

## Lazy loading: routing ou módulo

```typescript
loadChildren: () => import('funcionalidade/destino/component.routing')
  .then(m => m.DESTINO_ROUTES)
```

Segue a exportação indicada e incorpora suas rotas filhas. O caminho sem `./` precisa ser resolvível por `baseUrl` ou um alias simples de `paths` em um `tsconfig*.json` do snapshot.

```typescript
loadChildren: () => import('./destino/component.module')
  .then(m => m.DestinoModule)
```

Segue os `imports` do `@NgModule`, inclusive outros módulos de routing, até encontrar `RouterModule.forChild(...)` ou `forRoot(...)`. A relação é obtida pelos símbolos importados; não procura um arquivo vizinho apenas porque se chama `routing.ts`.

Por exemplo, se o módulo é montado em `/destino` e seu routing contém `path: ''` e `path: 'detalhes/:id'`, o resultado mantém três nós: o pai `/destino`, a rota vazia `/destino` e `/destino/detalhes/:id`.

`import(...)` direto resolve a exportação `default`. Para exportações nomeadas, use `.then(m => m.Nome)`. Também são reconhecidos callbacks com outros nomes de parâmetro, desestruturação e um corpo com apenas `return`. O mesmo vale para `loadComponent`. A sintaxe antiga `'./feature#FeatureModule'` também é reconhecida.

## Relatório e contagens

O fluxo emite **schemaVersion 5**, `mode: "routes"`, `structural`, `ui`, `routes` e `audit`. Complete também inclui todas essas seções, mesmo com zero rotas. Cada nó mantém os campos técnicos anteriores e acrescenta `audit` com dependências, métricas UI locais, referências a pendências e status final. O campo anterior `migration` é uma projeção da auditoria para compatibilidade. Veja [contrato e migração do schema](AUDITORIA-DE-MIGRACAO.md#json-e-compatibilidade).

| Campo | Significado |
| --- | --- |
| `routes.tree` | Árvore de configurações encontradas, com `children`, IDs e `parentId`. Configurações sem pai identificado aparecem na raiz; isso não comprova que estão registradas na aplicação em execução. |
| `totalRoutes` | Quantidade de nós na árvore expandida, incluindo pais, rotas vazias e redirects. Uma configuração montada em dois caminhos aparece sob ambos. |
| `resolvedComponents` | Nós com arquivo do componente resolvido; não é quantidade de componentes únicos. |
| `lazyRoutes` | Nós com `loadChildren` ou `loadComponent`. |
| `redirectRoutes` | Nós com `redirectTo`. Um redirect wildcard mantém `type: redirect` e `wildcard: true`. |
| `componentRoutes` | Relação inversa por nome/arquivo: IDs e caminhos das rotas de cada componente resolvido. |
| `warnings` | Limitações e referências não resolvidas, também presentes nos avisos da raiz do relatório. |

Cada nó contém `path`, `fullPath`, tipo, localização de origem (linha/coluna a partir de 1), arquivo de rotas, componente/arquivo quando resolvidos, informação de lazy loading, guards, metadados e filhos. IDs incluem localização e posição na travessia; servem para relacionar registros da execução, não para comprovar identidade histórica.

Valores dinâmicos ficam como `{ "kind": "unknown", "expression": "..." }`. Um caminho desconhecido usa `null`, inclusive nos caminhos completos dos descendentes; não inventamos URLs. `status: partial` indica limitações identificadas no nó ou em seus filhos. Guards guardam nome, arquivo e, quando lazy, origem do import. `matcher`, `resolve` e `providers` são preservados como dados/expressões sem avaliação.

O Output mostra **ANGULAR ROUTE MAP**, contagens, estado Standalone, status final e ações. O Excel começa por Resumo. Rotas apresenta uma linha por nó: rota, componente/destino, Standalone, estrutura, UI pendente, pendências conhecidas, arquivos afetados, próxima ação e status final. Pendências contém trabalho único; Detalhes Rotas preserva IDs, ocorrências, guards, lazy loading e metadados. JSON mantém a árvore completa.

A análise cruza componentes, dependências locais transitivas e templates declarados com as ocorrências globais de UI. Inclui componentes ancestrais e escopos dos NgModules relacionados. Templates compartilhados possuem um item único com múltiplos vínculos explícitos. Grupos resumem filhos, sem duplicar itens no grupo. CSS e código de pacotes externos não são auditados. Consulte [escopo e correlação](AUDITORIA-DE-MIGRACAO.md#escopo-e-correlação).

O status de cada rota distingue Concluída, Parcial, Pendente, Inconclusiva e Não analisada. Standalone = Sim não implica Concluída. `overallPercentage` usa componentes Standalone e destinos UI encontrados no projeto; não representa a proporção de rotas concluídas, que possui contagens próprias em `audit.routeCounts`.

## Limites atuais

- Resolve arquivos relativos, extensão `.ts` omitida, imports com `.js`, `index.ts`, aliases de símbolos, barrels e aliases simples `paths`/`baseUrl`. Não consulta node_modules, rede ou arquivos fora do snapshot. Configurações ambíguas não geram caminhos presumidos.
- A resolução de aliases lê opções locais dos `tsconfig*.json` mais próximos; não interpreta `extends`, referências de projetos ou resolução de pacotes. Estrutural e auditoria usam a mesma resolução local para correlacionar dependências.
- Não executa factories, wrappers ou chamadas arbitrárias para produzir rotas. Imports lazy condicionais e callbacks com lógica adicional ficam inconclusivos. Constantes mutadas posteriormente e alterações de rotas em runtime não são reconstruídas.
- Ciclos interrompem apenas o ramo afetado e geram avisos. A profundidade de expansão é limitada a 200 referências; metadados profundos também ficam inconclusivos.
- `fullPath` concatena segmentos preservando parâmetros e wildcard; não simula navegação, redirects, matchers ou a sintaxe de URL de outlets auxiliares. O campo `outlet` é preservado separadamente.
- Continuam valendo exclusões e limites de tamanho do snapshot. O mapa descreve o código encontrado, não prova que as rotas funcionam ou estão acessíveis.

Os testes cobrem rotas diretas e lazy, módulos que importam routing, exportações default/nomeadas, aliases, barrels, múltiplas montagens, hierarquia, parâmetros, rotas vazias, menu, guards, dados, redirects, ciclos, erros de resolução, worker, comandos, JSON e reabertura do Excel.
