# Code Insight

Para uma explicação sem detalhes técnicos, leia o [guia do Code Insight: o que faz e como usar](docs/GUIA-DO-CODE-INSIGHT.md).

Extensão para Visual Studio Code que acompanha migrações estruturais Angular e padrões de interface em HTML e templates Angular, com relatórios em Excel e JSON. **Em desenvolvimento — MVP 0.1.0, ainda não publicado no Marketplace.**

Identifica componentes Standalone, padrões antigos e destinos presentes no código, indicando os arquivos que precisam de revisão. Os percentuais descrevem o código encontrado; não comprovam substituições históricas. A análise é estática: não modifica código nem executa scripts do projeto.

## Escolha o fluxo de análise

| Comando na paleta do VS Code | Quando usar | Resultado |
| --- | --- | --- |
| **Code Insight: Angular Route Analysis** | Mapear rotas Angular, componentes e arquivos relacionados. | Árvore de rotas, lazy loading, guards e metadados; exportação JSON/Excel. |
| **Code Insight: Structural Migration (Angular only)** | Revisar NgModules e Standalone em Angular. | Somente métricas e avisos estruturais. Não lê regras de UI. |
| **Code Insight: UI Migration (HTML / Angular templates)** | Procurar padrões de interface, inclusive sem Angular. | Regras e ocorrências em HTML e templates Angular. |
| **Code Insight: Analyze Project — Complete (Angular only)** | Obter as duas análises para Angular. | Seções estrutural e UI separadas no mesmo relatório. |

O comando `codeInsight.analyzeProject` executa o fluxo completo. Os fluxos estrutural e completo exigem Angular; quando não o identificam, orientam a usar UI Migration. As exportações Excel e JSON funcionam para o último relatório de qualquer fluxo.

**Suporte atual de UI:** arquivos `.html` e templates Angular inline/externos. Todos os HTML dentro do escopo são analisados, mesmo sem referência de um componente. Templates externos compartilhados contam uma vez. O motor de regras é independente de framework, mas os adaptadores JSX/TSX (React), Vue e Svelte ainda não estão implementados. Esses arquivos são sinalizados como não analisados. Folhas CSS e DOM em execução também não são analisados.

**Os percentuais têm significados diferentes:** estrutural mede componentes Standalone; UI mede destinos encontrados sobre origens + destinos. O indicador geral pondera ambos pelas quantidades dos fluxos executados. Nenhum deles comprova a correção funcional da migração; módulos encontrados não são classificados como módulos pendentes de remoção.

## Funcionalidades

- Quatro fluxos de análise, com progresso e cancelamento.
- Mapa de rotas Angular por AST, incluindo `routing.ts` com extensões de menu, `loadChildren` para rotas ou módulos e relação componente → rotas. Veja o [guia de Angular Route Analysis](docs/ANGULAR-ROUTE-ANALYSIS.md).
- Detecção por `package.json`, `angular.json` ou decorators importados de `@angular/core`.
- Standalone explícito e defaults por versão: antes do Angular 19, `false`; a partir do 19, `true`.
- Inventário de NgModules e componentes associados por símbolos, incluindo imports relativos, aliases, barrels e arrays simples.
- Motor extensível de regras por elemento, classe, atributo e valor de atributo em templates inline e arquivos referenciados por `templateUrl`.
- Detecção de origens e destinos, prioridade de regras e métricas por arquivo.
- Relatório em **Output → Code Insight** e **Code Insight: Export Report**, com Excel recomendado e JSON para integrações.
- IDs, schema versionado e data UTC para análise histórica.
- Seleção de pasta em workspaces com múltiplas raízes; alterações não salvas em documentos abertos entram no snapshot.

## Instalação

Para usar a extensão, você precisa do VS Code 1.96+ para desktop ou com host remoto compatível. VS Code Web não é suportado neste MVP.

1. Abra no VS Code a pasta do projeto que deseja analisar.
2. Para analisar UI, crie `.code-insight.json` nessa pasta com suas [regras de migração](#configuração-de-regras).
3. Abra a paleta de comandos (`Ctrl+Shift+P`) e escolha um dos [quatro fluxos de análise](#escolha-o-fluxo-de-análise).
4. Confira o resultado em **Output / Saída → Code Insight**, incluindo os avisos.
5. Execute **Code Insight: Export Report**, escolha Excel ou JSON e selecione onde salvar.

Para obter estrutura e UI juntas em Angular, use **Code Insight: Analyze Project — Complete (Angular only)**. Para HTML sem Angular, use **Code Insight: UI Migration (HTML / Angular templates)**. Depois de alterar o código ou as regras, execute a análise novamente.

## Configuração de regras

### Projetos em Angular 15

A análise estrutural atende projetos Angular 15. Nessa versão, `standalone: true` identifica um componente Standalone; `standalone: false` ou a ausência do campo identificam um componente não Standalone. Valores dinâmicos que não podem ser determinados ficam inconclusivos. O percentual acompanha quantos componentes encontrados são Standalone, não a atualização da versão do Angular nem toda a migração da aplicação.

O padrão implícito só muda para `true` no Angular 19. Veja a [documentação oficial de componentes](https://angular.dev/guide/components).

### Arquivo de configuração UI

Crie `.code-insight.json` na raiz da pasta analisada para os fluxos UI e completo. Nenhuma regra ou destino corporativo é habilitado por padrão. Os destinos abaixo são exemplos: substitua `target` por qualquer destino desejado, sem alterar o código da extensão.

```json
{
  "migrationRules": [
    { "id": "input", "type": "element", "source": "input", "target": "meu-input", "enabled": true },
    { "id": "material-icon", "type": "class", "source": "material-icon", "target": "sisbr-icon", "enabled": true },
    { "id": "mat-input", "type": "attribute", "source": "matInput", "target": "outro-input", "targetType": "element", "enabled": true },
    { "id": "legacy-icon", "type": "attribute-value", "attribute": "data-component", "source": "legacy-icon", "target": "componente-x", "enabled": true }
  ]
}
```

### Entendendo uma regra, campo por campo

`migrationRules` é a lista de regras que você deseja executar. Os colchetes `[]` contêm essa lista, e cada objeto entre chaves `{}` representa uma regra. Você pode adicionar várias regras, separadas por vírgulas.

Considere este objeto da lista:

```json
{
  "id": "input",
  "type": "element",
  "source": "input",
  "target": "meu-input",
  "enabled": true
}
```

Essa regra significa: **“Procure elementos `<input>` como origens restantes e `<meu-input>` como destinos encontrados.”** A extensão apenas identifica e relata; ela não substitui o código.

| Campo | Obrigatório? | O que significa | Neste exemplo |
| --- | --- | --- | --- |
| `id` | Sim | Identificador escolhido por você para distinguir esta regra das demais. Deve ser um texto não vazio e único na lista, inclusive entre regras desabilitadas. Aparece como `ruleId` no JSON do relatório. | `input` é o nome desta regra. Poderia ser `migrar-campos-texto`, sem mudar o que é procurado. |
| `type` | Sim | Define **como procurar** no código. Os valores aceitos são `element`, `class`, `attribute` e `attribute-value`. | `element` procura pelo nome da tag HTML. |
| `source` | Sim | Define **o que procurar**, conforme o tipo da regra. Deve ser um texto não vazio. | `input` procura a tag `<input>`. Escreva apenas `input`, sem `<` e `>`. |
| `target` | Sim | Define **o padrão de destino a identificar**. A extensão procura esse padrão e conta suas ocorrências como migradas. O valor deve ser válido para `targetType` (ou `type`, se omitido). | `meu-input` poderia ser trocado por `app-input`, `componente-x` ou outro destino. |
| `enabled` | Não | Liga ou desliga a regra. `true` executa a regra; `false` a deixa fora da análise e do relatório, sem precisar removê-la do arquivo. Se omitido, vale `true`. | `true` mantém a regra ativa. |
| `attribute` | Somente para `attribute-value` | Informa **em qual atributo procurar o valor** definido em `source`. Use esse campo nas regras de valor de atributo. | Não é necessário para esta regra `element`. Há um exemplo abaixo. |

**`id` e `source` têm funções diferentes**, mesmo quando usam o mesmo texto. Por exemplo, `"id": "migrar-campos-texto"` com `"source": "input"` continua procurando `<input>`. O identificador da regra também não procura o atributo HTML `id`.

Para este template:

```html
<input type="text">
<input type="email">
<meu-input></meu-input>
```

A regra encontra **3 ocorrências: 2 restantes e 1 migrada**, resultando em 33,33% de progresso UI. Migrada significa presença do destino, não comprovação de uma substituição acompanhada historicamente.

### Como escolher `type` e `source`

| Quero encontrar | `type` | `source` | Campo adicional |
| --- | --- | --- | --- |
| `<input>` | `element` | `input` | Nenhum. |
| Qualquer tag com `class="material-icon"`, como `<a class="material-icon">` | `class` | `material-icon` | Nenhum. Escreva sem o ponto usado em seletores CSS. |
| Qualquer tag com o atributo `matInput`, como `<input matInput>` | `attribute` | `matInput` | Nenhum. |
| Qualquer tag com `data-component="legacy-icon"` | `attribute-value` | `legacy-icon` | `"attribute": "data-component"`. |

No último caso, a regra completa seria:

```json
{
  "id": "migrar-icone-antigo",
  "type": "attribute-value",
  "attribute": "data-component",
  "source": "legacy-icon",
  "target": "meu-icone",
  "enabled": true
}
```

Leia assim: **“Procure o atributo `data-component` com o valor `legacy-icon` como origem e `meu-icone` como destino.”** Ela encontra `<div data-component="legacy-icon">` como pendente e `<div data-component="meu-icone">` como migrado. Não corresponde a `<div data-component="outro-valor">` nem a `<div title="legacy-icon">`.

### Como escrever o arquivo corretamente

- Coloque os objetos dentro de `migrationRules`, como no exemplo completo no início desta seção. Um objeto de regra sozinho não é uma configuração completa.
- Use aspas duplas nos nomes dos campos e nos valores de texto: `"source": "input"`.
- Escreva `true` e `false` sem aspas: `"enabled": false`. O texto `"false"` não é aceito como booleano.
- Separe regras por vírgula, sem vírgula após a última regra. JSON não aceita comentários.
- Não repita o `id`. Para desativar todas as regras, use `{"migrationRules": []}`.
- Depois de editar, execute novamente **Code Insight: UI Migration (HTML / Angular templates)** ou, em Angular, **Code Insight: Analyze Project — Complete (Angular only)** para gerar um relatório com a configuração atualizada.

### Detalhes da correspondência e da contagem

| Tipo | Como identifica |
| --- | --- |
| `element` | Nome exato da tag, ignorando maiúsculas/minúsculas. |
| `class` | Token exato no atributo `class`, independentemente da tag. |
| `attribute` | Presença de atributo com nome exato, com ou sem valor; preserva `matInput`. |
| `attribute-value` | Nome em `attribute` e valor em `source`, ambos exatos. |

IDs devem ser únicos. `source` e `target` devem ser strings não vazias e representar padrões diferentes. `enabled` é opcional (padrão `true`); regras desabilitadas não entram no relatório. Classes, nomes de atributos e valores distinguem maiúsculas/minúsculas. Classes devem conter apenas um token; seletores CSS/regex não são interpretados.

Cada elemento é atribuído a uma única regra. Templates externos compartilhados contam uma vez; HTML não referenciado por componentes também entra nas regras de UI. Uma ocorrência de origem tem status `pending`; uma de destino tem status `migrated`. A regra fica `completed` somente quando há destinos encontrados e nenhuma origem atribuída; com zero total, permanece `pending`.

### Destino, prioridade e regras específicas

| Campo opcional | Significado |
| --- | --- |
| `targetType` | Forma de procurar o destino. Se omitido, usa o mesmo `type` da origem. Para atributo → componente, configure `"targetType": "element"`. |
| `targetAttribute` | Atributo a consultar quando o destino usa `attribute-value`. Por padrão, usa `attribute` de uma origem também `attribute-value`. Para outros tipos de origem, informe `targetAttribute`. |
| `element` | Restringe a origem a uma tag. Com `type: attribute`, `source: matInput` e `element: input`, identifica `input + matInput`. Não restringe a tag de destino. |
| `priority` | Número finito, padrão 0. Quanto maior, maior a prioridade entre regras sobrepostas. |

Primeiro, uma origem tem preferência sobre um destino no mesmo elemento (para não declarar migrado algo que ainda contém o padrão antigo). Entre candidatos do mesmo estado, vence a maior `priority`; depois a maior especificidade: restrição `element`, seguida por `attribute-value`, `attribute`, `class`, `element`. Empates finais são resolvidos pelo `id` em ordem alfabética, independentemente da ordem da configuração.

Destinos compartilhados por várias regras também pertencem a uma única regra conforme essa ordem. Isso evita inflar o total, mas não permite recuperar a origem histórica daquele destino. Mantenha regras, prioridades e escopo consistentes ao comparar execuções.

```json
{
  "migrationRules": [
    { "id": "input-generico", "type": "element", "source": "input", "target": "meu-input" },
    { "id": "input-material", "type": "attribute", "element": "input", "source": "matInput", "target": "meu-input-material", "targetType": "element", "priority": 10 }
  ]
}
```

O progresso UI é `resolvedOccurrences / totalOccurrences × 100`, arredondado a duas casas. Zero total retorna 0%. Com 3 origens e 2 destinos, total = 5 e progresso = 40%. O progresso geral é `(Standalone + destinos UI) / (componentes encontrados + ocorrências UI) × 100`, considerando somente fluxos executados. Trata-se de uma ponderação por itens heterogêneos, não de média simples nem estimativa de esforço restante.

O scanner ignora comentários, interpolação e markup dentro de valores de atributos ou conteúdo script/style/textarea/title. Não avalia `[ngClass]`, `[class]`, `[class.nome]` ou expressões Angular; nomes de bindings só correspondem se configurados literalmente (por exemplo `[matInput]`). Valores interpolados não são tratados como valores estáticos. Entidades HTML não são decodificadas nesta versão.

O arquivo é lido a cada análise, incluindo alterações não salvas em documento aberto. Em workspaces com várias raízes, usa-se somente a configuração da pasta selecionada. JSON inválido, IDs duplicados, tipos desconhecidos e campos inválidos interrompem a análise com mensagem de erro.

Compatibilidade: quando `.code-insight.json` não existe, `codeInsight.componentMappings` no `settings.json` continua funcionando como regras `element`. Quando o arquivo existe, ele substitui os mapeamentos por completo, inclusive com `{"migrationRules":[]}`. Veja [configuração de exemplo](examples/code-insight.example.json).

## Exemplo de relatório

Trecho ilustrativo do fluxo completo, com dados fictícios:

```text
CODE INSIGHT
Projeto: meu-projeto
Fluxo: Análise completa — exclusivo Angular

MIGRAÇÃO ESTRUTURAL — ANGULAR

Componentes encontrados: 120
Standalone: 75
Não Standalone: 45
Inconclusivos: 0
Progresso estrutural: 62,5%

Modules encontrados: 18
Componentes declarados em NgModules: 45

MIGRAÇÃO DE INTERFACE — UI
[element] input → meu-input: total 5, migrados 2, restantes 3, progresso 40%
  src/app/form.html:1:1 — Pendente
  src/app/form.html:2:1 — Pendente
  src/app/form.html:3:1 — Pendente
  src/app/form.html:4:1 — Migrado
  src/app/form.html:5:1 — Migrado
Total de ocorrências de regras: 5
Progresso UI: 40% (destinos encontrados / total; não é comprovação histórica).

Progresso geral: 61.6% (ponderado por componentes e ocorrências dos fluxos executados).
```

## Como interpretar o relatório

Os comandos de migração exportam **schemaVersion 3**, com `mode` (`structural`, `ui` ou `complete`) e duas seções independentes. **Angular Route Analysis** exporta schema 4, `mode: routes` e a seção `routes`; veja [modelo e compatibilidade](docs/ANGULAR-ROUTE-ANALYSIS.md#relatório-e-contagens).

- `structural`: análise Angular, ou `null` quando não executada. Métricas em `structural.angular`, detalhes em `structural.components` e `structural.modules`, avisos em `structural.warnings`.
- `ui`: análise de interface, ou `null` quando não executada. Contém `supportedFormats`, `analyzedTemplates`, `totalRules`, `migrationRules`, `totalOccurrences`, `resolvedOccurrences`, `remainingOccurrences`, `progressPercentage`, `files` (métricas por arquivo/regra) e `warnings`.

`null` significa **não executado**, não zero problemas. O objeto estrutural preserva o formato interno anterior (schema 1); sua lista `migrationRules` fica vazia, pois as regras executadas estão em `ui.migrationRules`. As tabelas abaixo descrevem os campos dentro dessas seções. Ao importar relatórios antigos, adapte os caminhos conforme a versão do documento. Compare apenas execuções com fluxo, regras e escopo equivalentes.

Comece pelos avisos, confira os componentes inconclusivos e depois interprete o percentual. Os números representam o que o analisador conseguiu identificar no escopo escolhido; não são uma validação de que a aplicação compila ou de que a migração está concluída.

### Métricas de componentes e módulos

Os campos abaixo ficam dentro de `structural.angular` no JSON atual:

| Campo no JSON | Nome no Output | Significado |
| --- | --- | --- |
| `totalComponents` | Componentes encontrados | Total de componentes Angular identificados, incluindo os inconclusivos. Não é quantidade de arquivos: um arquivo pode conter vários componentes. |
| `standaloneComponents` | Standalone | Componentes classificados como Standalone pelo valor explícito ou pelo padrão da versão identificada. |
| `moduleComponents` | Não Standalone | Componentes classificados como não Standalone. Não significa que o analisador encontrou todos eles dentro de um NgModule. |
| `unknownComponents` | Inconclusivos | Componentes encontrados cuja classificação Standalone/não Standalone não pôde ser determinada. |
| `declaredModuleComponents` | Componentes declarados em NgModules | Componentes associados a `declarations` de pelo menos um NgModule. Um componente em vários módulos conta uma vez nesta métrica. |
| `totalModules` | Modules encontrados | Quantidade de classes identificadas com `@NgModule`, inclusive módulos sem componentes declarados. Não é quantidade de módulos pendentes de migração. |
| `migrationPercentage` | Progresso estrutural | Percentual dos componentes encontrados que foram classificados como Standalone. Não considera o progresso das regras de substituição de templates. |

`totalComponents = standaloneComponents + moduleComponents + unknownComponents`. Já `declaredModuleComponents` é uma contagem separada: não deve ser somada às outras. Ela pode diferir de `moduleComponents` por declarações não resolvidas, componentes sem associação identificada ou inconsistências no projeto.

### O que significa `unknownComponents`?

Significa **classificação inconclusiva**, não necessariamente erro no componente. Exemplos:

```typescript
@Component({ standalone: algumaVariavel }) // O valor não é um booleano literal.
class ExemploA {}

@Component(configuracao) // Os metadados estão em outro objeto.
class ExemploB {}

@Component({ template: '<p>Olá</p>' }) // Sem standalone explícito:
class ExemploC {}                     // depende da versão Angular identificada.
```

No último exemplo, o componente só fica inconclusivo se a versão necessária para inferir o padrão não puder ser identificada. Spreads como `@Component({ ...configuracao })` também podem impedir a classificação.

Para investigar, procure `standalone: null` em `structural.components` e leia os avisos em `structural.warnings`. Confira a declaração de `@angular/core` no `package.json` e os metadados do componente indicado. Se o código estiver correto, o resultado pode refletir uma limitação da análise estática; não altere `standalone` apenas para eliminar o aviso.

### Como o percentual é calculado?

Fórmula: `standaloneComponents / totalComponents * 100`, arredondada a duas casas decimais. Com zero componentes, retorna 0%.

Exemplo: 10 componentes encontrados, sendo 6 Standalone, 3 não Standalone e 1 inconclusivo, resultam em **60%**. O inconclusivo permanece no total, mas não conta como migrado. Os outros 40% incluem tanto componentes não Standalone quanto componentes ainda sem classificação.

**100% significa que todos os componentes encontrados foram classificados como Standalone.** Ainda podem existir NgModules, regras com ocorrências e dependências de módulos: um componente Standalone pode importar NgModules. Arquivos ou padrões fora do alcance do analisador também não são cobertos por essa conclusão.

### Detalhes de componentes e módulos

| Campo | Como usar |
| --- | --- |
| `components[].id` / `modules[].id` | Identificador que relaciona registros dentro do relatório. Inclui localização, portanto pode mudar ao mover arquivos ou linhas. |
| `name`, `file`, `line` | Nome da classe, caminho relativo e linha da declaração, começando em 1. Use para localizar o código. |
| `components[].standalone` | `true`: Standalone; `false`: não Standalone; `null`: inconclusivo. |
| `components[].declaredIn` | IDs dos NgModules em que o componente foi encontrado. Lista vazia significa que nenhuma associação foi identificada; não comprova que o componente é Standalone. |
| `modules[].declarations` | Referências coletadas em `declarations`. Podem incluir directives e pipes, além de componentes. |
| `modules[].componentIds` | IDs dos componentes identificados entre as declarações desse módulo. |
| `modules[].unresolvedDeclarations` | Expressões ou metadados que não puderam ser resolvidos. A associação de componentes desse módulo pode estar incompleta. |

### Resultados das regras de migração

| Campo em `migrationRules[]` | Significado |
| --- | --- |
| `ruleId` | ID da regra configurada pelo usuário. |
| `type` | Forma de identificar a ocorrência: `element`, `class`, `attribute` ou `attribute-value`. |
| `source` / `target` | Padrões de origem e destino procurados. Nenhuma substituição é aplicada automaticamente. |
| `attribute` | Nome do atributo, presente quando a regra é `attribute-value`. |
| `occurrences` | Alias de compatibilidade para `remainingOccurrences`: quantidade de origens restantes. |
| `totalOccurrences` | Total atribuído à regra: origens + destinos. Igual ao tamanho de `matches`. |
| `resolvedOccurrences` | Quantidade de destinos encontrados (Migrados). |
| `remainingOccurrences` | Quantidade de origens encontradas (Pendentes). |
| `progressPercentage` | Destinos / total × 100; zero total retorna 0%. |
| `files` | Arquivos com pelo menos uma correspondência, sem repetir caminhos. |
| `matches` | Ocorrências individuais com regra, tipo, origem, destino, arquivo, linha, coluna e `status` (`pending` ou `migrated`). |
| `status` | `completed` quando há somente destinos atribuídos; `pending` quando há origens ou nenhum resultado. `ignored` permanece reservado. |

Zero total significa que a regra não recebeu correspondências no escopo e prioridades atuais. Não comprova conclusão: `status` permanece `pending`.

O total soma ocorrências atribuídas sem repetir elementos. Por exemplo, `<input matInput>` é atribuído à regra específica de atributo, a menos que uma prioridade explícita favoreça outra regra. Regras desabilitadas não aparecem no relatório.

### Avisos e próximos passos

`structural.warnings` e `ui.warnings` contêm situações que merecem revisão em cada fluxo executado. O campo `warnings` na raiz do JSON reúne os avisos dos dois fluxos, sem mensagens idênticas repetidas; as listas por área são preservadas. Um aviso não significa automaticamente que o código esteja errado, mas pode indicar que parte do relatório está incompleta.

| Aviso | O que conferir |
| --- | --- |
| Versão Angular ambígua ou standalone inconclusivo | A versão declarada no `package.json` e o valor/metadados de `standalone`. |
| `declarations` parcialmente inconclusivas | Imports e expressões de declarações do módulo. Consulte também `unresolvedDeclarations`. |
| Template não encontrado | O caminho de `templateUrl` e se o arquivo está dentro do escopo analisado. As regras não analisaram esse template. |
| Template dinâmico ou metadados indiretos | A origem do template/configuração. O analisador não executa expressões para descobrir seu conteúdo. |
| Standalone declarado em NgModule | A associação indicada: o código ou a versão inferida pode estar inconsistente. |
| JSON inválido ou erro sintático | O arquivo mencionado no aviso. Corrija ou investigue antes de confiar nas métricas afetadas. |

Uma lista `warnings` vazia não elimina as limitações descritas mais abaixo. Já uma configuração de regras inválida ou uma falha de leitura que interrompa a execução impede a geração de um novo relatório: corrija a mensagem apresentada e execute a análise novamente.

### Informações gerais da análise

| Campo no JSON | Significado |
| --- | --- |
| `schemaVersion` | `3` nos fluxos de migração; `4` no fluxo de rotas. A seção estrutural preserva internamente o formato `1`. |
| `analysisId` | Identificador único desta execução. |
| `projectId` | Identificador derivado da URI da pasta, útil para agrupar execuções na mesma localização. |
| `projectName` | Nome da pasta selecionada no workspace. |
| `structural.framework` | Framework identificado pela análise estrutural; atualmente `Angular`. A seção UI declara formatos suportados, sem inferir o framework do projeto. |
| `analyzedAt` | Data e hora da análise em UTC, no formato ISO. |
| `structural.angularVersions` | Mapa de diretórios para a versão principal declarada de Angular; `.` representa a raiz e `null` indica versão ambígua. Um mapa vazio indica ausência de versão identificada por esse mecanismo, mesmo que Angular tenha sido detectado de outra forma. |
| `analyzedFiles` | Quantidade de arquivos do snapshot fornecido ao analisador, incluindo TypeScript, HTML e metadados. Não equivale a componentes nem a templates efetivamente analisados pelas regras. |

## Exportação Excel e JSON

Execute **Code Insight: Export Report** após qualquer análise. Selecione **Excel (.xlsx)** para leitura humana ou **JSON (.json)** para integrações. O Excel aparece primeiro, como opção recomendada. Escolha o local no diálogo; se o arquivo existir, a extensão confirma a substituição. Cancelar a escolha ou a geração não grava um novo arquivo.

Os nomes sugeridos são **Code-Insight-Report.xlsx** e **Code-Insight-Report.json**. O comando **Code Insight: Export JSON Report** continua disponível como atalho direto.

O Excel é um `.xlsx` real, gerado com ExcelJS em uma worker. Possui títulos, linhas alternadas, bordas discretas, colunas ajustadas ao conteúdo com limite de largura, filtros, cabeçalhos congelados, números/percentuais formatados e barras de progresso. Textos provenientes do projeto são gravados como texto, sem fórmulas executáveis.

| Aba | Conteúdo |
| --- | --- |
| Resumo | Projeto, data, fluxo, contagens e indicadores estrutural/UI/geral. |
| Estrutural | Componentes e módulos Angular identificados, classificação, associações, declarações e declarações não resolvidas. |
| UI Migration | Regra, tipo, origem, destino, total, migrados, restantes, progresso, arquivos afetados e status (Concluída/Pendente). |
| Arquivos | Uma linha por arquivo e regra, com métricas de migração. |
| Ocorrências | Cada ocorrência e seu status Pendente/Migrado, com arquivo, linha e coluna. |
| Avisos | Situações que podem tornar o resultado parcial. |
| Histórico | Execução atual e snapshots anteriores recebidos pelo exportador. |
| Rotas | Presente no fluxo Angular Route Analysis: árvore expandida com caminhos, componentes, arquivos, guards, redirects e localização. |

Sem análise estrutural/UI, os indicadores correspondentes mostram “Não executado” ou “Não analisado”; abas detalhadas permanecem com cabeçalhos e explicação. Zero ocorrências é diferente de um fluxo não executado. Não há importação ou persistência automática de histórico nesta fase. O campo opcional `history` do modelo aceita snapshots com projeto, ID, data, fluxo e percentuais; o Excel inclui apenas snapshots do mesmo projeto e a execução atual. Para preservar análises manualmente, salve arquivos com nomes diferentes.

O exportador rejeita dados que excedam limites de linhas ou texto por célula do Excel em vez de truncar silenciosamente; nesses casos, use JSON.

## JSON e histórico

Execute **Code Insight: Export JSON Report** depois da análise. O diálogo sugere `Code-Insight-Report.json`. Para preservar histórico, escolha nomes diferentes, por exemplo `Code-Insight-Report-2026-09-10.json`. Não há gravação automática.

O JSON inclui `schemaVersion`, `analysisId`, `projectId`, `projectName`, `analyzedAt`, `angularVersions`, métricas, componentes, módulos, regras e avisos. Cada execução recebe um novo ID. `projectId` é um hash da URI da pasta, estável na mesma localização; ao mover/clonar o projeto, normalize esse identificador na ferramenta que consolida o histórico. Caminhos são relativos; conteúdo de código/templates não é exportado.

`overallPercentage` contém o indicador geral ponderado. `history`, quando fornecido, contém snapshots anteriores; o comando atual não os persiste nem importa automaticamente. Informações estruturais como `angularVersions` ficam dentro de `structural`.

Cada resultado de regra mantém `occurrences` (contagem) e `files`, e acrescenta `type`, `attribute` quando aplicável e `matches` com as ocorrências detalhadas:

```json
{
  "ruleId": "mat-input",
  "type": "attribute",
  "source": "matInput",
  "target": "outro-input",
  "file": "src/app/app.component.html",
  "line": 3,
  "column": 1,
  "status": "pending"
}
```

Linha e coluna começam em 1 e apontam para o início da tag. Em templates inline, apontam para o TypeScript original, inclusive quando há escapes na string. Os detalhes estão em `ui.migrationRules[].matches`. O schema 3 acrescenta status por ocorrência, detecção de destinos, prioridade e métricas por arquivo; consumidores dos schemas 1/2 devem revisar caminhos e semântica das contagens antes de comparar dados.

Snapshots podem alimentar dashboards/Power BI sem integração direta. Para comparar datas, mantenha escopo e regras consistentes e revise os avisos.

## Arquitetura

```text
src/
  analyzers/          Contrato ProjectAnalyzer e implementação Angular
    angular/         Detecção, componentes, módulos e standalone
    rules/           Tipos, configuração, scanner e registro de matchers
  ui-migration/      Analisador UI e adaptadores HTML/Angular independentes
  routes/            Descoberta AST, resolução e árvore de rotas Angular
  commands/          Quatro fluxos de análise, VS Code e exportação
  reports/           Tipos, métricas e renderização texto/JSON/Excel
  export/            Contrato ReportExporter e implementações JSON/Excel
  utils/             AST, leitura assíncrona e controle da worker
  workers/           Análise fora do extension host
  extension.ts       Registro e descarte de recursos
test/                Cenários isolados com node:test
```

A API do compilador TypeScript fornece AST e símbolos; ExcelJS gera XLSX reais com formatação, recurso ausente nas APIs nativas de Node/VS Code. Node fornece workers, testes e JSON; VS Code fornece busca, leitura, progresso e exportação. ESLint, tipos e `@vscode/vsce` são ferramentas de desenvolvimento. O override de `uuid` do ExcelJS usa a versão 11 com correção de segurança e API CommonJS `v4` compatível, validada pela geração e reabertura de planilhas com formatação condicional.

As métricas são calculadas no analisador e em `migration-metrics.ts`, não no Excel. `ReportExporter` recebe o relatório e retorna bytes; o comando cuida da escolha de destino e gravação pela API VS Code. O Excel apenas apresenta os campos do relatório, sem inspecionar código Angular ou aplicar regras.

`RuleEngine` coordena matchers por tipo sem depender de Angular ou HTML. Os quatro matchers atuais compartilham o scanner de templates, executado uma vez por template. Para um novo tipo, estenda os tipos/validação e registre um `RuleMatcher`; o analisador Angular e a agregação dos resultados permanecem os mesmos. Novos domínios, como imports TypeScript, podem ampliar `RuleContext` e fornecer seu próprio parser. Configurações são dados: não executam plugins ou código do usuário.

Leitura em lotes de 16 arquivos; análise em worker thread. Cancelar encerra a worker. Arquivo acima de 5 MB ou snapshot acima de 100 MB interrompe a análise com erro, sem publicar métricas truncadas. A configuração `.code-insight.json` tem limite de 1 MB. Os limites também se aplicam ao conteúdo não salvo dos documentos abertos.

## Limitações

- Exclui `node_modules`, `dist`, `out`, `build`, `coverage`, `.git`, `.vscode`, `.angular`, `.code-insight`, `.d.ts`, `.spec.ts` e `.test.ts`. Analisa a pasta, não o grafo de um tsconfig. A política de exclusão está isolada para configuração futura.
- Os fluxos estrutural/UI não resolvem `paths` de tsconfig; o fluxo de rotas suporta aliases simples conforme seu guia. Não resolve wrappers/reexports de decorators, chamadas arbitrárias ou templates calculados. Casos dinâmicos reconhecidos geram avisos; decorators ocultos por wrappers podem não ser detectados.
- Versão vem do `package.json` mais próximo que declara `@angular/core`. Versões simples, `^` e `~` com major conhecido são aceitas; intervalos amplos/tags são inconclusivos. Não consulta lockfile/instalação efetiva: verifique a correspondência com a versão usada pelo projeto.
- Scanner HTML é lexical, não o compilador Angular. Sintaxe malformada/construções dinâmicas complexas podem gerar contagens incompletas.
- Erros sintáticos, declarações não resolvidas e templates ausentes geram avisos. A análise não prova que o projeto compila ou que a migração está correta.

## Roadmap

- CSV e evolução histórica.
- Regras adicionais para componentes corporativos/Angular Material.
- Directives, pipes, serviços, imports e dependências.
- Dashboard e ações para abrir arquivos/ignorar ocorrências.
- Outros frameworks pelo contrato de analisadores.
- Correções assistidas apenas em etapa futura autorizada.

## Contribuição

Para relatar um problema, abra uma issue com um exemplo que permita reproduzi-lo. Para contribuir com o código, consulte o [guia de desenvolvimento](docs/DESENVOLVIMENTO.md).

## Referências e licença

- [Angular: Component](https://angular.dev/api/core/Component)
- [Angular: migração Standalone](https://angular.dev/reference/migrations/standalone)
- [VS Code: manifesto](https://code.visualstudio.com/api/references/extension-manifest)

Licença [MIT](LICENSE), preservada do repositório original.
