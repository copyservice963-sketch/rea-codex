# Palco Multitracks 0.1.1

Aplicativo próprio para Windows 10/11 x64, destinado a reproduzir multitracks ao vivo. Implementação em Electron e Web Audio, com interface em português. O código, os gráficos de forma de onda e o instalador são próprios; nenhum binário, ícone ou plugin do REAPER integra este aplicativo.

## Instalar e usar

O instalador é gerado em `release/Palco-Multitracks-0.1.1-Windows-x64-Setup.exe`. Execute no Windows, escolha a pasta e abra **Palco Multitracks** pelo atalho. A instalação é por usuário, sem exigir privilégios de administrador. Há desinstalador e registro na lista de aplicativos do Windows. O pacote de teste não possui assinatura digital.

1. Clique em **Importar faixas** e selecione os áudios de uma mesma música.
2. Use arquivos exportados desde a mesma origem: o aplicativo preserva esse alinhamento e não detecta automaticamente o início musical.
3. Ajuste o volume de cada faixa e o master. Os sinais somam; reduza o master para evitar saturação.
4. Clique em reproduzir ou pressione Espaço. Espaço também pausa; Esc para e retorna ao início.
5. **M** silencia uma faixa. **S** isola uma ou mais faixas em solo. Mute prevalece sobre solo.
6. Use a barra de posição ou clique na forma de onda para buscar um instante.

As faixas terminam individualmente conforme sua duração; o transporte para e retorna ao início ao terminar a mais longa. Importar ou remover faixas pausa a sessão. Arquivos originais não são modificados. Não é necessária conexão à Internet após instalar.

## Capacidades e limites

- WAV, MP3, FLAC e OGG por meio dos decodificadores do Chromium. WAV foi exercitado nos testes; a compatibilidade dos demais formatos deve ser conferida com os arquivos reais no Windows.
- Um `AudioContext`, um instante de início e um deslocamento compartilhados por todas as fontes. Não há um player independente por faixa.
- Formas de onda da primeira via de áudio; reprodução preserva os canais do arquivo com saída estéreo padrão do sistema.
- Limite de 256 MB por arquivo e 768 MB de áudio decodificado por sessão. A importação também requer memória temporária para decodificação; prefira stems WAV com durações adequadas ao computador.
- A sessão fica em memória e **não é salva ao fechar**. Os áudios precisam ser importados novamente.
- Esta primeira versão não inclui gravação, edição, exportação, VST, MIDI, ASIO, escolha de dispositivo ou roteamento separado de clique/PA. Não é uma DAW completa.
- O sincronismo interno foi validado por amostra em renderização offline. Isso não mede latência, estabilidade prolongada, drivers ou saídas físicas de um computador Windows.

## Desenvolvimento

Pré-requisitos: Node.js 24 compatível, npm e checkout existente. Este ambiente usa Node 24.19.0 e npm 11.9.0. Não é necessário criar outro worktree.

```bash
cd /workspace/rea-codex/palco
npm ci
npm start
```

`npm start` abre o aplicativo em um ambiente gráfico. Para gerar o instalador Windows x64, inclusive a partir de Linux:

```bash
npm run dist:win
```

O Electron e os componentes de build são obtidos pelas dependências fixadas e seus mecanismos de verificação. O script NSIS próprio compila instalador e desinstalador sem executar código Windows durante o build. A desinstalação remove apenas arquivos distribuídos, preservando arquivos adicionais que tenham sido colocados na pasta. Não apaga os dados do perfil do usuário.

## Validação

```bash
npm test
```

Os testes usam Chromium disponível em `/usr/bin/chromium`. Para outro local, configure `CHROMIUM_PATH` com o caminho do executável. Eles criam arquivos WAV sintéticos e exercitam o motor real de Web Audio e a interface, sem usar arquivos do REAPER. Resultados e capturas aparecem em `test-results/`.

Nove verificações passaram nesta máquina Linux: estado vazio, mistura por amostra, cancelamento de início pendente, importação, transporte, controles de mixagem, fim natural, arquivo inválido e remoção de faixas. O instalador e a reprodução no Windows real ainda precisam ser exercitados antes de uso ao vivo.

O build Windows x64 concluiu com sucesso. O instalador NSIS passou no teste de arquivo do 7-Zip; o executável e o ASAR extraídos dele correspondem byte a byte aos arquivos empacotados, e os fontes no ASAR correspondem aos fontes testados. O pacote contém desinstalador. Isso verifica a composição do pacote, sem substituir um teste de instalação no Windows.

O arquivo de checksums entregue junto ao instalador registra o tamanho e o SHA-256 desta versão.

Consulte [a investigação inicial](../docs/reaper-investigation.md) para a identidade do arquivo de referência, evidências REA e limites da análise.
