# Player de multitracks para Android

## Objetivo confirmado

Aplicativo Android para tocar multitracks. Interface própria, inspirada em uma estação multipista, adaptada ao toque. O foco inicial é reprodução ao vivo.

Status: definição de escopo; ainda não existe aplicativo executável ou APK neste repositório.

## Primeira versão proposta

- Importar arquivos de áudio separados para uma música, preservando seu alinhamento original.
- Reproduzir todas as faixas em uma linha do tempo compartilhada.
- Controles grandes de iniciar, pausar e parar; parada volta ao início.
- Volume, mute e solo por faixa.
- Nome, duração e posição atual da música.
- Salvar músicas e organizar um repertório disponível offline.
- Separar faixas de bases e de clique/guia conforme as saídas disponíveis.
- Sinalizar arquivos ausentes ou incompatíveis antes de iniciar a reprodução.
- Evitar iniciar a próxima música automaticamente na primeira versão.

## Decisão necessária antes do motor de áudio

Qual será a ligação do celular com a mesa: saída de fone/adaptador ou interface de áudio USB? Também é necessário conhecer o modelo da interface e o número de saídas desejado.

Projetar modos de roteamento após essa resposta. Uma proposta de modo com dois canais é bases em um canal e clique/guia no outro, abrindo mão do estéreo das bases. Saídas independentes adicionais dependem do dispositivo e da compatibilidade real, a validar no Android alvo.

## Validação para liberar uma versão de teste

- Medir alinhamento entre faixas usando arquivos de referência.
- Conferir que o clique não aparece na saída destinada às bases.
- Testar pause, retomada e parada sem deriva entre faixas.
- Testar repertório offline e recuperação de projetos.
- Testar conexão e desconexão do dispositivo de áudio sem retomada inesperada.
- Testar sessões longas no celular e na interface que serão usados.

## Etapas posteriores

Forma de onda, marcadores, loops e controles externos, conforme prioridade do usuário. Gravação, edição avançada, plugins e mudança de tom/tempo ficam para uma definição posterior.
