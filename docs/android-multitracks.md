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

## Saída de áudio definida

O usuário definiu VS mono, com L para fone e R para PA.

| Canal | Destino | Conteúdo planejado |
| --- | --- | --- |
| L (esquerdo) | Fone/retorno | Clique e guia |
| R (direito) | PA/mesa | VS/bases em mono |

Manter os dois canais separados na mixagem final. Clique e guia não devem ser enviados ao R, inclusive durante solo, retomada e troca de música. A necessidade de incluir bases também no fone ainda não foi definida.

O dispositivo físico e os cabos usados para separar L/R ainda precisam ser identificados para os testes. A configuração foi registrada; a saída real só estará validada após teste no aparelho.

## Validação para liberar uma versão de teste

- Medir alinhamento entre faixas usando arquivos de referência.
- Conferir que o clique não aparece na saída destinada às bases.
- Testar pause, retomada e parada sem deriva entre faixas.
- Testar repertório offline e recuperação de projetos.
- Testar conexão e desconexão do dispositivo de áudio sem retomada inesperada.
- Testar sessões longas no celular e na interface que serão usados.

## Etapas posteriores

Forma de onda, marcadores, loops e controles externos, conforme prioridade do usuário. Gravação, edição avançada, plugins e mudança de tom/tempo ficam para uma definição posterior.
