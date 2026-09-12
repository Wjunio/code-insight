# Angular Route Analysis

Execute **Code Insight: Angular Route Analysis** na paleta do VS Code. O comando `codeInsight.analyzeRoutes` usa a pasta selecionada, inclui edições não salvas, mostra progresso e permite cancelamento. Não precisa de `.code-insight.json`. Consulte **Output → Code Insight** e use **Code Insight: Export Report** para salvar JSON ou Excel.

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

O fluxo emite **schemaVersion 4**, `mode: "routes"`, `structural: null`, `ui: null` e a seção `routes`. Os três fluxos anteriores continuam emitindo schema 3, com os mesmos campos e significados. O fluxo Complete continua sendo estrutural + UI; execute Route Analysis separadamente para rotas.

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

O Output mostra **ANGULAR ROUTE MAP**, contagens, árvore e localizações. O Excel acrescenta a aba **Rotas** com caminhos, componentes, arquivos, lazy loading, títulos, guards, redirects, pai, localização, status e IDs. O resumo inclui contagens de rotas. JSON mantém a árvore e todos os metadados.

Rotas não medem progresso de migração. Por compatibilidade do envelope, `overallPercentage` vale 0 neste fluxo, mas não deve ser interpretado como percentual; Output não o apresenta e Excel mostra “Não analisado”.

## Limites atuais

- Resolve arquivos relativos, extensão `.ts` omitida, imports com `.js`, `index.ts`, aliases de símbolos, barrels e aliases simples `paths`/`baseUrl`. Não consulta node_modules, rede ou arquivos fora do snapshot. Configurações ambíguas não geram caminhos presumidos.
- A resolução de aliases lê opções locais dos `tsconfig*.json` mais próximos; não interpreta `extends`, referências de projetos ou resolução de pacotes. Os fluxos estrutural/UI mantêm sua resolução anterior.
- Não executa factories, wrappers ou chamadas arbitrárias para produzir rotas. Imports lazy condicionais e callbacks com lógica adicional ficam inconclusivos. Constantes mutadas posteriormente e alterações de rotas em runtime não são reconstruídas.
- Ciclos interrompem apenas o ramo afetado e geram avisos. A profundidade de expansão é limitada a 200 referências; metadados profundos também ficam inconclusivos.
- `fullPath` concatena segmentos preservando parâmetros e wildcard; não simula navegação, redirects, matchers ou a sintaxe de URL de outlets auxiliares. O campo `outlet` é preservado separadamente.
- Continuam valendo exclusões e limites de tamanho do snapshot. O mapa descreve o código encontrado, não prova que as rotas funcionam ou estão acessíveis.

Os testes cobrem rotas diretas e lazy, módulos que importam routing, exportações default/nomeadas, aliases, barrels, múltiplas montagens, hierarquia, parâmetros, rotas vazias, menu, guards, dados, redirects, ciclos, erros de resolução, worker, comandos, JSON e reabertura do Excel.
