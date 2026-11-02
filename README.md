# Palco Multitracks

## Baixar para Windows

[**Baixar o instalador mais recente do Palco Multitracks**](./Palco-Multitracks-Windows-x64-Setup.exe?raw=1)

O arquivo acima fica sempre na página inicial com o mesmo nome. Cada novo build substitui esse arquivo pela versão mais recente. A versão atual é a **0.2.0**, para Windows 10 ou posterior em 64 bits.

O código-fonte e os instaladores identificados por versão estão na pasta [`palco`](./palco/).

---

## REA + Codex

Repositório de trabalho pessoal para projetos com REA e Codex. O REA é instalado separadamente no computador onde o Codex é executado; criar ou conectar este repositório no GitHub não instala um servidor MCP local no Codex da web.

## Começar no computador

Tenha Git, Node.js e npm instalados, além do Codex configurado e autenticado. Confira os requisitos atuais de Node.js na documentação oficial do REA.

```bash
git clone https://github.com/copyservice963-sketch/rea-codex.git
cd rea-codex
node --version
npm --version
```

Como este repositório é privado, o Git pode solicitar autenticação do GitHub.

## Conectar REA ao Codex

No terminal, execute:

```bash
npx -y rea-agents@6.5.0 setup --client codex
```

A versão 6.5.0 mantém a mesma versão do comando usado anteriormente com Antigravity. A opção `--client codex` seleciona o Codex. Revise e aprove as alterações mostradas pelo instalador. Reinicie o Codex após concluir.

Para visualizar o plano sem aplicar alterações:

```bash
npx -y rea-agents@6.5.0 setup --client codex --dry-run
```

Para verificar a integração:

```bash
npx -y rea-agents@6.5.0 doctor --client codex --json
```

O diagnóstico pode apontar mecanismos opcionais ausentes; avalie os requisitos da tarefa que pretende executar.

## Usar

Abra esta pasta no Codex local. Exemplo de pedido:

> Use o REA para analisar meu aplicativo em [caminho completo], explique o funcionamento com evidências e salve os resultados neste projeto.

Substitua o caminho pelo aplicativo que deseja analisar. Descreva o objetivo antes de iniciar a análise.

## Atualizar

Para migrar para a versão publicada mais recente, revise suas mudanças e execute:

```bash
npx -y rea-agents@latest setup --client codex
```

Reinicie o Codex e repita o diagnóstico usando a mesma versão escolhida.

## Referências oficiais

- [Código-fonte do REA](https://github.com/morluto/rea)
- [Instalação e configuração](https://github.com/morluto/rea/blob/main/docs/installation.md)

Não salve senhas, tokens ou arquivos de autenticação neste repositório.
