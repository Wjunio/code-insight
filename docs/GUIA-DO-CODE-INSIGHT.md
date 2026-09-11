# Code Insight — o que faz e como usar

O Code Insight ajuda sua equipe a entender o que ainda precisa ser revisado durante uma migração de software. Ele lê os arquivos do projeto aberto no VS Code, identifica os padrões configurados e organiza os resultados em um relatório.

Você pode usar esse relatório para planejar tarefas, localizar os arquivos que exigem atenção e compartilhar a situação do projeto com a equipe. A extensão **não altera o código automaticamente**.

## Duas perguntas que a extensão ajuda a responder

### 1. Como está a estrutura do meu projeto Angular?

A análise **Structural Migration** identifica componentes Standalone e componentes que ainda não são Standalone. Também encontra NgModules e os componentes declarados neles.

Por exemplo, se encontrar 100 componentes e 60 forem Standalone, mostrará **60% de progresso estrutural**.

Alguns componentes podem aparecer como **inconclusivos**: a extensão encontrou o componente, mas não conseguiu confirmar sua classificação. Isso pode acontecer quando a configuração depende de uma variável ou quando a versão do Angular não pôde ser determinada. O relatório mostra avisos para ajudar na investigação.

Esse percentual não garante que toda a migração esteja concluída. Ainda podem existir módulos, dependências e outros pontos que precisam de revisão.

### 2. Quais padrões de interface ainda precisam mudar?

A análise **UI Migration** procura padrões antigos e padrões de destino definidos por você. Pode procurar:

| Forma de procurar | Exemplo |
| --- | --- |
| Nome de um elemento | `<input>` |
| Classe, independentemente da tag | `<a class="material-icon">` ou `<span class="material-icon">` |
| Presença de um atributo | `<input matInput>` |
| Valor de um atributo | `<div data-component="legacy-icon">` |

Você escolhe o que procurar e qual será o destino. Não existe uma associação obrigatória entre `input` e um componente de uma empresa específica.

## Como informar o que deve ser migrado

Crie um arquivo chamado `.code-insight.json` na pasta do projeto que será analisada. Exemplo completo:

```json
{
  "migrationRules": [
    {
      "id": "migrar-campos",
      "type": "element",
      "source": "input",
      "target": "meu-input",
      "enabled": true
    }
  ]
}
```

Essa regra diz: **“Procure os elementos `input` e os elementos `meu-input`. Os primeiros são os padrões que restam; os segundos representam o destino encontrado.”**

| Campo | Explicação |
| --- | --- |
| `id` | Nome único da regra, para reconhecê-la no relatório. Não procura o atributo HTML `id`. |
| `type` | Como identificar o padrão: elemento, classe, atributo ou valor de atributo. |
| `source` | Padrão antigo a procurar. |
| `target` | Padrão de destino a procurar. Você escolhe o nome. |
| `enabled` | `true` ativa a regra; `false` a desativa. Se omitido, ela fica ativa. |

Normalmente, o destino é procurado da mesma forma que a origem: uma regra de classe procura outra classe. Se você quiser procurar um atributo antigo e uma **tag** nova, use `"targetType": "element"`. Para regras por valor de atributo, use também `attribute` para informar o nome do atributo. O [README](../README.md#configuração-de-regras) explica todas as opções.

## O que significa “migrado” no relatório de UI?

Considere esta situação:

```text
3 elementos input
2 elementos meu-input
```

O relatório mostrará:

| Indicador | Resultado |
| --- | ---: |
| Total identificado | 5 |
| Migrados — destinos encontrados | 2 |
| Restantes — origens encontradas | 3 |
| Progresso UI | 40% |

**“Migrado” significa que o padrão de destino foi encontrado no código atual.** Não significa que a extensão acompanhou a troca daquele elemento antigo. O componente de destino pode já existir no projeto antes da migração.

Por isso, use o percentual como indicador da situação atual, junto com a revisão da equipe. Se não encontrar origem nem destino, o resultado será 0%, e não uma confirmação de conclusão.

O **progresso geral** combina componentes Standalone e destinos UI encontrados, dividindo pela soma dos componentes e ocorrências dos fluxos executados. Ele é ponderado pelas quantidades: uma área com mais itens pesa mais. Não é uma média simples dos dois percentuais e não comprova qualidade funcional.

## Como evita contar o mesmo elemento duas vezes

Um `<input matInput>` pode combinar com uma regra de `input` e outra de `matInput`. A extensão atribui o elemento a uma única regra:

1. Se houver padrão antigo e novo no mesmo elemento, considera-o pendente.
2. Entre as regras candidatas, vence a maior prioridade configurada.
3. Se a prioridade empatar, a regra mais específica tem preferência.
4. Se ainda houver empate, o identificador da regra decide em ordem alfabética.

Quando várias regras compartilham o mesmo destino, ele também é atribuído uma única vez. A distribuição por regra segue essa prioridade; não revela de qual origem o destino veio no passado.

## Qual comando escolher

| O que você quer saber | Comando |
| --- | --- |
| Somente a estrutura Angular | **Code Insight: Structural Migration (Angular only)** |
| Somente padrões de interface | **Code Insight: UI Migration (HTML / Angular templates)** |
| Estrutura e interface do projeto Angular | **Code Insight: Analyze Project — Complete (Angular only)** |

O fluxo completo exige Angular. A análise de UI pode ser executada sem Angular, mas nesta versão interpreta apenas HTML e templates Angular. React/JSX, Vue e Svelte ainda não têm adaptadores disponíveis.

## Passo a passo de uso

1. Abra a pasta do projeto no VS Code com a extensão em execução.
2. Configure `.code-insight.json` se quiser analisar a interface.
3. Abra a paleta de comandos (`Ctrl+Shift+P`) e escolha o fluxo.
4. Aguarde o resultado em **Output → Code Insight**. Você pode cancelar a análise.
5. Confira os avisos antes de interpretar os percentuais.
6. Execute **Code Insight: Export Report** e escolha Excel ou JSON.
7. Escolha onde salvar. Se o arquivo existir, a extensão pede confirmação para substituí-lo.

## Como usar o Excel

O Excel é a opção recomendada para leitura e compartilhamento com a equipe. O arquivo contém:

| Aba | Para que serve |
| --- | --- |
| **Resumo** | Ver projeto, data, fluxo, principais contagens e percentuais. |
| **Estrutural** | Revisar componentes Angular e módulos encontrados. |
| **UI Migration** | Ver cada regra, seus totais, migrados, restantes e progresso. |
| **Arquivos** | Descobrir quais arquivos têm ocorrências de cada regra. |
| **Ocorrências** | Localizar cada resultado pelo arquivo, linha e coluna; filtrar pendentes ou migrados. |
| **Avisos** | Entender situações que podem tornar a análise parcial. |
| **Histórico** | Consultar a execução atual e snapshots fornecidos ao exportador. Ainda não há armazenamento automático de execuções anteriores. |

Os filtros ajudam a encontrar pendências. Os cabeçalhos permanecem visíveis ao rolar a planilha. Fluxos não executados aparecem como **não analisados/não executados**, em vez de apresentar números inventados.

O JSON contém os dados estruturados para integrações futuras, dashboards ou processamento automatizado. Ele não exige que a equipe use Excel e não faz integração direta com Power BI.

## O que observar antes de tomar decisões

- **Avisos importam:** templates ausentes, configurações dinâmicas e componentes inconclusivos podem deixar o resultado parcial.
- **100% não substitui testes:** a presença do destino não garante que a aplicação funcione corretamente.
- **As regras definem o alcance:** um padrão que não foi configurado não será acompanhado como migração de UI.
- **Compare condições equivalentes:** mantenha regras, fluxo e pasta analisada consistentes entre execuções.
- **Nem todo arquivo entra na análise:** dependências, builds, caches e pastas de configuração excluídas não são examinados. Formatos ainda não suportados são sinalizados.
- **O resultado é uma fotografia:** depois de alterar o código ou as regras, execute novamente para atualizar os números.

O Code Insight organiza evidências para orientar a migração. A equipe continua responsável por decidir as mudanças, revisar o código e validar o funcionamento da aplicação.
