# iPlex App — Samsung Tizen

Aplicativo instalado nas Smart TVs Samsung (Tizen) do ecossistema iPlex.
Este repositório (`aliens-syndicate-iplex-app`) gera apenas o app das lojas.
A interface principal é o **iPlex Web**, hospedado em
`https://iplex-2c8fc.web.app/` (Firebase Hosting `iplex-2c8fc`) e mantido em outro repositório (veja
[IPLEX-WEB.md](IPLEX-WEB.md)). O **iPlex Gestor** também é independente.

## 1. Referência: Dream+TV (engenharia reversa com REA)

O APK `Dream+TV_1.1.1_APKPure.apk` (`com.dreamtv.app`) é uma casca nativa.
Abaixo, cada peça dele e a equivalente no iPlex:

| Dream+TV (Android) | iPlex App (Tizen) |
|---|---|
| `MainActivity` com WebView em tela cheia | Widget Tizen `viewmodes="maximized"` (shell React) |
| `WebEngine.initApp("http://tv.dreamtv.life")` carrega a interface remota | Shell carrega o iPlex Web (URL por ambiente) num `<iframe>` |
| `NetworkTimer` verifica a rede | `src/connection/connectivity.ts` (rede + manifesto do iPlex Web) |
| Ponte `window.Android` (`WebAppInterface`) | Ponte `postMessage` com contrato TypeScript (`src/bridge/`) |
| ExoPlayer/VLC (bibliotecas Android) | **AVPlay** (API oficial Samsung). Nenhuma biblioteca Android foi copiada |
| `onBackPressed` repassado ao site | Teclas vão ao iframe; Return na raiz → `app.exit` |

A Samsung não oferece as APIs Tizen a conteúdo hospedado
([Hosted Applications Q&A][hosted]). Por isso o acesso à plataforma fica no
**shell empacotado**, e o iPlex Web o usa pela ponte. A interface do
Dream+TV não foi reconstruída, e `tv.dreamtv.life` não é usado.

## 2. Arquitetura

```
launcher.html ─► src/launcher/          shell: máquina de estados, telas de carregamento/erro
                  └─ src/shell/          ShellFrame (iframe) + bridgeServices (métodos da ponte)
src/bridge/      protocol.ts            CONTRATO compartilhado (sem APIs de plataforma)
                 host.ts / validation.ts lado do shell: origem, fonte, lista de métodos, parâmetros
                 client.ts              lado do frontend (referência para o iPlex Web)
src/platform/    types.ts               PlatformAdapter (compartilhado)
                 tizen/                 Tizen: exit, versão, AVPlay (avplayPlayer.ts)
                 browser/               desenvolvimento no navegador
src/player/      types.ts, html5Player.ts  player compartilhado (HTML5), reutilizável no webOS
src/config/launchTarget.ts              única leitura da configuração por ambiente
src/connection/connectivity.ts          rede, manifesto, disponibilidade
src/navigation/                         controle remoto (teclas obrigatórias, foco)
index.html ─► src/online/               página de teste controlada (fixture, NÃO é o iPlex Web)
tizen/config.template.xml, tizen/icon.png
scripts/build-tizen.mjs, scripts/tv.mjs, iPlex-TV.command
```

### Fluxo na TV (modo `frame`, padrão)

1. O runtime abre `launcher.html` (empacotado).
2. O shell mostra "Conectando ao iPlex…". Em seguida verifica a rede e lê
   `<destino>/iplex-web.json`. Para cada resultado, mostra uma tela:

   | Resultado da verificação | Tela |
   |---|---|
   | Sem rede | "Sem conexão com a internet" (nova tentativa automática quando a rede voltar) |
   | Servidor fora do ar | "Servidor do iPlex indisponível" |
   | HTTP 5xx | "Servidor do iPlex com falha" |
   | Manifesto ausente, inválido ou sem CORS (inclui soft 404) | "iPlex indisponível no momento" |
   | Versão de ponte diferente | "Atualização necessária" |

3. Com o destino pronto, o shell carrega o iPlex Web num iframe oculto, por
   trás da tela de carregamento.
4. O frontend chama `app.ready`. O shell então mostra o iframe e passa o
   foco do controle remoto para ele. Sem resposta em 20 s, aparece "O iPlex
   não terminou de carregar".
5. Durante a execução:
   - Rede perdida: aviso no topo, e evento `network.status` ao frontend.
   - App oculto: o player é parado, e o evento `app.visibility` vai ao frontend.

Em todas as telas de erro há os botões **Tentar novamente** e **Sair**.
Return encerra o app. Exit mantém o comportamento padrão.

O modo `navigate` (`VITE_IPLEX_LOAD_MODE=navigate`) faz navegação de nível
superior, **sem ponte**. Serve para destinos que não podem ser exibidos em
iframe.

### Configuração por ambiente

| Arquivo | Conteúdo |
|---|---|
| `.env` | comum: modo de carregamento, tempos limite, Tizen, TV de desenvolvimento |
| `.env.production` | `VITE_IPLEX_TARGET_URL=https://iplex-2c8fc.web.app/` (**único** lugar com a URL) |
| `.env.development` | página de teste controlada (`./index.html`) e mídia de teste |
| `.env.local`, `.env.<amb>.local` | substituições locais, não versionadas |

- `npm run build:tizen` e `npm run package:tizen` usam **produção** por
  padrão. Para desenvolvimento, acrescente `-- --env development`.
- Em produção, o widget leva só o shell. A página de teste e o `public/` não
  entram.
- O `config.xml` é gerado a partir do destino: `<access>` e
  `<tizen:allow-navigation>` liberam `iplex-2c8fc.web.app` e seus
  subdomínios. O Google não é mais dependência.

### Ponte e segurança

Contrato em `src/bridge/protocol.ts`. O shell só atende uma mensagem quando
todas as condições abaixo valem:

1. `event.source` é o iframe do frontend.
2. `event.origin` é exatamente a origem configurada (produção:
   `https://iplex-2c8fc.web.app`).
3. O método está em `BRIDGE_METHODS`.
4. Os parâmetros passam na validação. Mídia só `http(s)`, sem `file:`,
   `data:` nem `javascript:`. Números são inteiros ≥ 0.

As respostas vão somente à origem exata. Nenhuma API Tizen é exposta
diretamente.

Verificado no navegador (19/10/2026):

| Teste | Resultado |
|---|---|
| Método válido vindo do iframe | atendido |
| `tizen.application.launch` | `unknown_method` |
| `player.open` com `file://` ou `javascript:` | `invalid_params` |
| `player.seek` negativo | `invalid_params` |
| Protocolo diferente ou mensagem vinda de fora do iframe | ignorada |

### Player (AVPlay)

`src/platform/tizen/avplayPlayer.ts` segue o ciclo documentado: `open`,
`setListener`, `setDisplayRect(0,0,1920,1080)`, `prepareAsync`, `play`,
`pause`, `stop`, `close`. Também implementa faixas (`getTotalTrackInfo`,
`setSelectTrack`) e legendas (`setSilentSubtitle`).

- O AVPlay não exige privilégio. Só DRM usaria `drmplay`, que não está em uso.
- A biblioteca `$WEBAPIS/webapis/webapis.js` entra apenas no `launcher.html`
  do build Tizen. Sem ela, o adaptador usa o player HTML5.
- O vídeo é desenhado atrás da camada web. Com mídia ativa, o shell fica
  transparente.

### Preparação para LG webOS

Os contratos compartilhados (`src/bridge/`, `src/platform/types.ts`,
`src/player/types.ts`) não usam APIs do Tizen. Um adaptador webOS entraria
em `src/platform/webos/`, implementando `PlatformAdapter`. Ele poderia
reutilizar `html5Player.ts` e precisaria de seu próprio empacotamento
(`appinfo.json`). **Nada de webOS foi criado ou instalado.**

## 3. Restrições da Samsung e distribuição

- **Aplicativo hospedado.** É o caso de um app que carrega uma URL ou baixa
  código em tempo de execução. A Samsung:
  - *geralmente não permite* a publicação, por política de segurança;
  - só aceita em casos especiais, com contato prévio com o Content Manager;
  - exige que o desenvolvedor seja membro de um grupo de parceiros;
  - não oferece APIs Tizen a esse conteúdo;
  - exige CSP sem `unsafe-inline`/`unsafe-eval`
    ([Hosted Applications Q&A][hosted]).

  **Não há confirmação de que o modelo do iPlex será aceito.** Funcionar em
  Modo Desenvolvedor não garante a publicação.
- **Alternativa compatível com a Samsung Apps: modo empacotado.** Com
  `VITE_IPLEX_TARGET_URL=./index.html`, o shell abre um frontend que está
  dentro do `.wgt`. A ponte e a validação continuam as mesmas (origem local).
  Para usar isso com o iPlex Web, o pipeline copiaria o build do iPlex Web
  para dentro do widget. Hoje o destino local é a página de teste. Mesmo
  empacotado, scripts e CSS externos exigem permissão do Content Manager.
- **Return** na tela inicial encerra ou oculta o app. **Exit** precisa
  voltar à Home imediatamente: não é tratado nem registrado
  ([User Interaction Q&A][ui-faq]).
- **Teclas obrigatórias** (setas, Enter, Return) dispensam `registerKey` e
  o privilégio `tv.inputdevice` ([Remote Control][remote]).
- **Multitarefa:** com o app oculto durante a reprodução, aplica-se o mesmo
  efeito do Return (o player é parado) ([Multitasking][multitasking]).

### Privilégios e `config.xml`

- Único privilégio: `http://tizen.org/privilege/internet`.
- `tizen:setting`: paisagem, sem menu de contexto, sem execução em segundo
  plano.
- Diferenças em relação ao exemplo oficial instalado pela TV Extension
  (`OfflineClockImage`):
  - Ele declara `screen.size.normal.1080.1920` e
    `app_ui_type/base_screen_resolution`; o iPlex não usa. Avaliar antes de
    publicar.
  - O iPlex declara `required_version="4.0"`; o exemplo, `2.1`.
- Identificador `iPlexTVApp.IplexTV`: **mantido**, porque já está instalado
  na TV de testes. Alterá-lo criaria outro app, sem atualização.

## 4. Compatibilidade do motor web

Motores por ano ([Web Engine Specifications][engine]): 2017 M47, 2018 M56,
2019 M63, 2020 M69, 2021 M76, 2022 M85, 2023 M94, 2024 M108, 2025 M120, 2026 M130.

- O build Tizen gera **IIFE com `<script defer>`** e `target: chrome56`. O
  M56 e o M63 não executam `<script type="module">`, e o conteúdo vem de
  arquivo local.
- Verificado no bundle: análise sintática **ES2017 sem erros**. As APIs
  novas do React (`queueMicrotask`, `AbortController`, `MessageChannel`)
  ficam atrás de `typeof`.
- O código próprio evita `AbortController` (M66) e CSS `gap`/`inset`.
- Mínimo: `required_version="4.0"` (2018). Anteriores não são suportados.

## 5. Desenvolvimento na TV: `npm run tv` / `iPlex-TV.command`

Com um comando (ou duplo clique em `iPlex-TV.command` no Finder), o script:

1. Verifica as ferramentas (`sdb` sob Rosetta 2, Tizen CLI).
2. Confere se a TV está na rede e se a porta SDB responde.
3. Inicia o servidor SDB e conecta a TV via Wi-Fi.
4. Confirma autorização e perfil `tv-samsung`.
5. Verifica o certificado (perfil `iplex-dev`).
6. **Verifica o destino.**
7. Roda o TypeScript.
8. Faz o build e gera o WGT assinado.
9. Confere o identificador.
10. Instala ou atualiza, só se o conteúdo mudou.
11. Abre o app.
12. **Valida a execução real.**

Opções:

```bash
npm run tv                         # desenvolvimento: shell + página de teste servida pelo Mac
npm run tv -- --env production     # produção: só prossegue se o iPlex Web estiver publicado
npm run tv -- --watch 60           # mantém o receptor por 60s (mostra as teclas do controle)
npm run tv -- --host 192.168.0.50  # outra TV (ou IPLEX_TV_HOST no .env/.env.local)
npm run tv -- --force-install      # reinstala mesmo sem mudanças
```

- **Desenvolvimento.** O Mac serve a página de teste em
  `http://<ip-do-mac>:8765/index.html`. HTTP é permitido apenas nesse
  ambiente. Na TV, a página faz o handshake `app.ready` e testa o player pela
  ponte (abrir/tocar, faixas, pausa, parada). Cada passo é reportado ao
  terminal.
- **Produção.** Antes de instalar, o script confere três coisas e para se
  alguma falhar:
  - o manifesto `iplex-web.json` (identidade e versão da ponte);
  - o CORS;
  - a ausência de `X-Frame-Options`.
- **Validação real.** Esta TV não tem Web Inspector nem logs: `0 debug` não
  retorna, e `log_enable`/`intershell` estão desativados. Por isso, nos
  builds de `npm run tv`, o app envia seus eventos ao Mac
  (`src/devtools/devReport.ts`). Builds de `package:tizen` não enviam nada.
- **Logs.** Ficam em `build/logs/tv-*.log`. Cada etapa tem tempo limite e as
  tentativas são limitadas.
- **Certificado.** É o perfil `iplex-dev`, com autor `iplex-dev-author.p12`
  e distribuidor Tizen padrão. Não é recriado. A senha está no Chaves do
  macOS (item "iPlex TV - Tizen author certificate"), e o Tizen a guarda
  cifrada em `profiles.xml`. A TV de testes aceitou esse certificado em Modo
  Desenvolvedor. Um **certificado Samsung** (Certificate Manager, conta
  Samsung) será necessário para outras TVs e para a publicação.

### Validação no aparelho físico (Samsung UN65TU7020, Tizen 5.5, Chromium M69)

Feita em 19/10/2026 com `npm run tv`. O ambiente foi development: a página de
teste era servida pelo Mac e carregada no shell via iframe.

| Recurso | Resultado na TV |
|---|---|
| Instalação/atualização do `.wgt` (perfil `iplex-dev`) | ok |
| Shell: verificação do manifesto, iframe, handshake `app.ready` | ok |
| Ponte `postMessage` (origem, fonte, lista de métodos) | ok: todas as chamadas da sequência atendidas |
| AVPlay como player nativo (`webapis.avplay`) | ok |
| Reprodução HLS (TS) | ok: canal 1 (Mux) e canal 2 (Apple bipbop 4x3) |
| Pausa | ok: a posição ficou parada por 2 s |
| Retomada | ok |
| Busca (+30 s) | ok |
| Troca de canal (`player.open` durante a reprodução) | ok |
| Troca rápida de canal (dois `player.open` seguidos) | ok: o 1º termina em ~0,7 s (`SUPERSEDED`), o 2º toca |
| HLS fMP4 com legendas WebVTT (Apple advanced) | ok: legenda inglesa recebida em `player.subtitle` ("Subtitles: Bip!") |
| Listagem de faixas (`getTotalTrackInfo`) | ok: 2 áudios e 8 legendas no bipbop 16x9 |
| Troca de faixa de áudio | ⚠ não confirmada. O AVPlay aceita, mas `getCurrentStreamInfo` continua indicando a faixa 0 após 6 s |
| Troca de legenda para outro idioma | ⚠ `setSelectTrack('TEXT', 2)` → `PLAYER_ERROR_INVALID_PARAMETER`. A legenda padrão funciona |
| Stream multi-idioma da Unified Streaming (fMP4) | ⚠ o AVPlay não prepara em 40 s, sem sucesso nem erro. O app mostra o erro e segue para o próximo canal |
| Teclas do controle físico chegando ao iPlex Web (iframe) | ok: 26 teclas recebidas (↑ 38, ↓ 40, ← 37, → 39, OK 13, Return 10009) |
| ↑/↓ troca de canal pelo controle | ok |
| ←/→ busca de ±10 s pelo controle | ok |
| OK pausa/continua pelo controle | ok |
| Return encerra o app (`app.exit` pela ponte) | ok: frontend e shell descarregados (`pagehide`) |
| Capacidades reais via ponte (auditoria) | ok: Tizen 5.5, modelo UN65TU7020GXZD, tela 1920×1080, ponte v1 com 12 métodos, `installationId` |
| Registro das teclas de mídia/canal (`tv.inputdevice`) | ok: 8 teclas registradas com os códigos do aparelho. **Pressioná-las não foi validado**: nenhuma tecla na janela interativa |
| Suspensão (app para segundo plano) | ok: `visibilitychange hidden` no shell e `app.visibility { visible: false }` entregue ao Web |
| Retomada | **não validada**: ao abrir o navegador da TV por cima, a TV **encerrou** o iPlex (gerenciamento de memória) e ele reiniciou do zero, refazendo as verificações. A retomada sem reinício (Home → reabrir) ainda precisa de teste com o controle |

Correções feitas a partir desses testes:

- `selectTrack` de uma faixa já ativa virou no-op, porque o AVPlay respondia
  `INVALID_PARAMETER`.
- O `open` ganhou tempo limite (40 s) e sequência: a resposta de um canal
  substituído é descartada.
- `player.open` passou a esperar até 45 s pela ponte.
- No player HTML5, `play`/`pause` devolvem o estado já atualizado.
- Um `open` substituído agora é encerrado na hora (`SUPERSEDED`). Antes, a
  troca rápida de canal pelo controle deixava um pedido 45 s sem resposta.
- `play`/`pause`/`seek` durante o carregamento devolvem `NOT_READY`, em vez
  dos erros crus do AVPlay (`INVALID_STATE`, `SEEK_FAILED`).

A troca de áudio e a de legenda aparecem como **limitações** (⚠), sem
bloquear o fluxo. Para esclarecê-las seria preciso:
- ouvir a troca de áudio na TV;
- testar streams com legendas *in-band*;
- testar em um Tizen mais novo.

### Problemas conhecidos

- **SDB travado.** Às vezes a TV continua na rede, mas para de responder ao
  SDB: o `capability` não retorna e o `connect` é recusado. O script detecta
  isso e pede para **reiniciar a TV**.
- **Emulador.** O emulador de TV exige Intel VT-x e não roda em Apple
  Silicon.

[hosted]: https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html
[ui-faq]: https://developer.samsung.com/smarttv/develop/faq/user-interaction.html
[remote]: https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
[engine]: https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html
[multitasking]: https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html
