# Desenvolvimento do Code Insight

Guia para colaboradores e responsáveis pela distribuição da extensão.

## Testes e qualidade

### Desenvolvimento da extensão

Esta seção é destinada a quem vai modificar ou testar o código-fonte do Code Insight. Requisitos: Node.js 22.13+ ou 24+, npm e VS Code 1.96+.

```sh
git clone https://github.com/Wjunio/code-insight.git
cd code-insight
npm ci
npm run compile
```

Abra a pasta do repositório no VS Code e pressione **F5**, usando **Run Code Insight**. Isso abre uma janela **Extension Development Host** para testar a extensão em desenvolvimento. Nessa janela, abra o projeto a analisar e execute um dos comandos Code Insight. F5 é usado apenas neste fluxo de desenvolvimento.

No PowerShell com restrição a scripts, use `npm.cmd` em vez de `npm`.

### Verificações

```sh
npm test          # compila e executa testes Node
npm run lint     # ESLint
npm run compile  # TypeScript strict
npm run check    # todas as verificações
npm run check-types # verificação de tipos sem gerar JavaScript
npm run package  # verifica e gera VSIX local; não publica
```

A suíte cobre detecção, versões, componentes, módulos, origens/destinos, prioridade, percentuais, templates, exclusões, JSON e geração/reabertura de Excel, além de workers, cancelamento e comandos. CI executa as verificações em Node 22.

Validação manual no Extension Development Host:

1. Execute o comando sem pasta e em uma pasta TypeScript sem Angular.
2. Abra um projeto Angular, configure regras e confira o Output.
3. Exporte Excel e JSON, abra a planilha e compare as métricas com o texto.
4. Cancele uma análise grande e execute novamente.
5. Confira a seleção em workspace com duas pastas.

## Publicação futura

Manifesto contém engines, comandos, configurações, licença e entrada; `.vscodeignore` exclui fontes/testes. Cadastre um publisher no Marketplace e adicione o identificador real ao `package.json` antes de publicar; nenhum publisher fictício foi configurado.

Quando estiver pronto, gere VSIX com a ferramenta oficial: `npx @vscode/vsce package`. O hook `vscode:prepublish` executa as verificações. Valide o pacote instalado, incluindo worker e TypeScript. Nenhuma publicação faz parte do MVP.

