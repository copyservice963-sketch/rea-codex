# REAPER enviado: investigação inicial e aplicativo próprio

## Objetivo confirmado

O usuário forneceu `reaper784_x64-install.exe` e o projeto `morluto/rea`. Em seguida confirmou que deseja **criar um aplicativo próprio com funções semelhantes**, para **Windows**, com foco inicial em **multitracks ao vivo: importar faixas, tocar sincronizado, volume, mute e solo**.

O aplicativo resultante fica em `palco/`. Seu comportamento foi implementado a partir desse escopo. A investigação abaixo não recuperou o motor de áudio do REAPER nem fundamenta alegações de equivalência com ele.

## Ferramentas e alvo

- REA 6.5.0 instalado pelo pacote oficial `rea-agents`, com registro Codex verificado anteriormente. A sessão atual não expõe ferramentas REA MCP diretamente; a análise foi feita pela CLI oficial.
- Código-fonte oficial clonado em `/workspace/rea`, commit `144843ccc26bd372d61b8c6a27b37a01a5b0fb61`. Esse checkout declara versão 6.8.0 e requisitos de runtime mais recentes. Não foi compilado; não se deve confundi-lo com a CLI 6.5.0 efetivamente executada.
- Nenhum Ghidra, IDA ou Hopper configurado; não houve descompilação nativa.
- Arquivo recebido em `/workspace/attachments/e8bf6eee-9916-4feb-886b-56faccda5455/reaper784_x64-install.exe`.
- Tamanho: 17.192.416 bytes.
- SHA-256: `a343286bd67d8515b561e5c6b7cc284a8d258d87a73f5518ec2e233d46ff9755`.

## Observações com evidência

1. **O invólucro do instalador é PE32 x86, sem diretório CLI/.NET.** REA `inspect-managed-artifact` produziu a evidência `ev_f259db6604e61c8d24d57b1ba5bf48038939429db00adf47ce634c2bc3a48e73`. Isso classifica o invólucro; não define a arquitetura do programa instalado.
2. **O pacote contém um arquivo NSIS sólido LZMA e `reaper.exe`.** A ferramenta externa 7-Zip 24.09 listou o inventário. Entre os membros estão `reaper_wave.dll`, `reaper_midi.dll`, `reaper_mp3dec.dll`, `reaper_ogg.dll` e `reaper_flac.dll`. Nomes de arquivos são observações de empacotamento, sem provar como são chamados ou como processam áudio.
3. **O `reaper.exe` extraído é PE32+ x86_64, com nove seções e sem metadados CLI/.NET.** REA `inspect-managed-artifact`, evidência `ev_7d607ee31ac2303774af7525862b5bae90ce5b7cb042a6ae106789cbea0b0c68`.
4. **O executável extraído tem recursos Windows inventariáveis.** REA `inspect-pe-resources`, evidência `ev_39e5e73369feca015bc1e19cf459064cf4c0107898958d838393c18da9a82aa8`, retornou 899 recursos e 137 grupos de ícones. São relações estáticas e intervalos de bytes; não houve decodificação ou reutilização dos ícones.

Identidade do `reaper.exe` extraído: 18.704.384 bytes, SHA-256 `43293d1e6b51b7e27d53a09cee6cfcfd746438cf7f3866969b99cd1afa0916fc`.

Os registros completos estão em `/workspace/reaper-investigation/`: `installer-managed.json`, `installer-inventory.txt`, `reaper-managed.json`, `reaper-resources.json` e `rea-doctor.json`. O arquivo original e os binários extraídos permanecem fora do código-fonte do novo aplicativo.

## Falha diagnosticada e desconhecidos

REA 6.5.0 recusou o inventário de recursos do **instalador**, com `RT_GROUP_ICON length does not match its image count`. O erro foi preservado em `installer-resources.json`; não houve retry idêntico nem alteração dos bytes para contorná-lo. O inventário de recursos do `reaper.exe` extraído passou.

Não foram verificados: validade da assinatura Authenticode, autenticidade frente ao fornecedor, funcionamento do instalador original, execução do REAPER, agendamento interno de áudio, mecanismos de licença, fontes originais ou equivalência de recursos. Um hash identifica o arquivo recebido, não autentica sua origem.

## Escolhas do novo aplicativo

O Palco usa Electron/Web Audio, `AudioBufferSourceNode` por faixa, relógio compartilhado e ganhos individuais e master. Essas são **decisões de implementação própria**, não resultados de descompilação do REAPER. Não há código, plugins ou recursos gráficos extraídos incluídos no produto.

O teste de renderização usa impulsos sintéticos em duas faixas: ambas iniciam no mesmo instante e seus impulsos aparecem no mesmo índice de amostra. Também verifica os valores da soma, volumes, mute e solo. Testes adicionais cobrem transporte e importação. Essa evidência valida o motor próprio no Chromium Linux, sem medir comportamento físico no Windows.

## Ampliação da investigação para a versão 0.3.0

O instalador reenviado tem o mesmo tamanho e SHA-256 do alvo anterior. A CLI oficial REA 6.5.0 executou novas operações somente leitura:

- `inspect-artifact`, evidência `ev_afde710606cdc55d8be4445a4f56d89652d6c4b566c2bbdfb824a9e7f0724509`, confirmou a identidade do invólucro PE e informou que o inventário genérico não reconhece seus membros NSIS;
- `inspect-with-objdump file_headers`, evidência `ev_3a07ee26b433edd8a205ad80f5e8b56cb9b70ba4ba0f78d0401a7937c6dfeabd`, observou `pei-x86-64`, ponto de entrada `0x140bfc0d0` e preservou o mesmo digest antes e depois da leitura;
- `inspect-with-objdump section_headers`, evidência `ev_c7f0cc243e2f525050033336b3ecea5d760ff565c3f719c1d8d646a7e9697838`, observou nove seções, incluindo código `.text`, dados, TLS, `.trace` e aproximadamente 2,5 MiB em `.rsrc`.

O guia rápido e o histórico de versões que acompanham o instalador foram extraídos apenas para leitura em `/workspace/reaper-investigation/reference-docs/`, fora deste repositório. Eles não são redistribuídos nem incorporados ao Palco. Como documentação fornecida pelo produto, sustentam o seguinte inventário de áreas funcionais:

| Área | Comportamentos documentados | Situação no Palco 0.3.0 |
| --- | --- | --- |
| Projeto e transporte | novo/salvar, cursor, seleção de tempo, loop, play, pause, stop | salvar/abrir projeto, posição, play, pause e stop; seleção/loop pendentes |
| Faixas e mixer | volume, pan, mute, solo, pastas, sends, templates | volume, pan, mute, solo e master; pastas/sends/templates pendentes |
| Itens de áudio | importar, mover, copiar, dividir, fades, crossfade, stretch, slip, glue | importar e definir início; demais edições pendentes |
| Gravação | arm, entrada, monitoramento, modos e takes | pendente |
| FX | cadeias, bypass, wet/dry, envelopes, VST e instrumentos | pendente |
| Automação | envelopes, pontos, curvas e modos | pendente |
| MIDI | dispositivos, editor, inline, controle e panic | pendente |
| Tempo | BPM, compasso, mapa de tempo e marcadores | BPM, metrônomo e marcadores simples; compasso/mapa pendentes |
| Ações | lista pesquisável, atalhos e menus personalizáveis | atalhos principais fixos e desfazer/refazer; personalização pendente |
| Renderização | mix, stems, consolidação e conversão | pendente |

Essa matriz é uma especificação de comportamento, não uma alegação de equivalência. Uma implementação completa exige várias versões, testes no Windows e decisões próprias de arquitetura. O Palco não usa código, ícones, temas, nomes de marca, plugins ou mecanismos de licença extraídos do alvo.
