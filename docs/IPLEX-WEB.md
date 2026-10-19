# Requisitos do iPlex Web (Firebase Hosting `iplex-2c8fc`)

O **iPlex Web** é a interface principal, mantida em **outro repositório**
(React + TypeScript). Este repositório (`aliens-syndicate-iplex-app`) é o
aplicativo instalado nas Smart TVs: ele abre o iPlex Web, verifica se está
disponível e oferece a ponte para os recursos da TV.

| Ambiente | Destino carregado pela TV | Onde é configurado |
|---|---|---|
| Produção | `https://iplex-2c8fc.web.app/`: site `iplex-2c8fc`, raiz | `.env.production` |
| Preview/teste | Canal de preview do mesmo site (`npm run tv -- --target <url>`) | por execução |
| Desenvolvimento | Página de teste controlada deste repositório | `.env.development` (substituível em `.env.development.local`) |

O domínio `alienssyndicate.com` pertence ao Core e **não é usado** pelo
Player. A configuração completa do Hosting (`firebase.json`, CSP, cache,
probe e comandos de publicação) está em [HOSTING.md](HOSTING.md).

## Situação verificada (19/10/2026)

- O site `iplex-2c8fc` existe (`DEFAULT_SITE`), mas ainda **não tem
  publicação**: responde 404 "Site Not Found".
- Na TV, o shell de produção acessa `https://iplex-2c8fc.web.app/` por HTTPS,
  com certificado aceito pelo Tizen 5.5. Como não acha o manifesto, mostra
  **"iPlex indisponível no momento"**.
- `npm run tv -- --env production` faz a mesma verificação antes de instalar
  e **para** se o iPlex Web não estiver publicado.

## Requisitos obrigatórios

### 1. Raiz do site

- No Vite, use `base: '/'`. O Web ocupa a raiz de `iplex-2c8fc.web.app`.
- Reescrita SPA `**` → `/index.html`. Arquivos existentes têm prioridade.

### 2. Manifesto de disponibilidade: `/iplex-web.json`

```json
{ "app": "iplex-web", "version": "1.0.0", "bridgeVersion": 1 }
```

- Use **`Access-Control-Allow-Origin: *`** e `Cache-Control: no-cache`. O app
  empacotado tem origem opaca (`file://`) e só consegue ler o manifesto com
  CORS aberto.
- `bridgeVersion` deve ser igual a `BRIDGE_VERSION` em
  `src/bridge/protocol.ts` (hoje **1**). Se for diferente, o app mostra
  "Atualização necessária".
- Sem o arquivo, a reescrita SPA devolve HTML no lugar do JSON. O app trata
  isso como "não publicado".

### 3. Exibição dentro do app (modo `frame`, padrão)

O shell instalado exibe o iPlex Web num `<iframe>` em tela cheia. É assim que
ele mantém a ponte com as APIs da TV, que a Samsung não oferece a conteúdo
hospedado.

- **Nenhum `X-Frame-Options`** e **nenhuma CSP `frame-ancestors`, nem `*`**.
  O pai do iframe é `file://`. **Verificado na TV:** com `frame-ancestors *`
  o iframe foi bloqueado; sem ele, o handshake funcionou.
- A CSP não pode usar `unsafe-inline` nem `unsafe-eval`. É exigência da
  Samsung para aplicações hospedadas ([Hosted Applications Q&A][hosted]). Na
  prática:
  - nada de `<script>` inline;
  - nada de `<style>` injetado em tempo de execução;
  - estilos via arquivos CSS (as propriedades `style` do React continuam
    permitidas).
- `npm run tv -- --env production` e `npm run release:tizen` reprovam
  publicações com `X-Frame-Options` ou `frame-ancestors`.

Se a exibição em iframe não for possível, existe o modo
`VITE_IPLEX_LOAD_MODE=navigate` (navegação de nível superior). Nele **não há
ponte**: o frontend fica sem AVPlay e sem informações da plataforma.

### 4. Ponte com o app de TV

O contrato está em `src/bridge/protocol.ts` e o cliente de referência em
`src/bridge/client.ts`. Copie os dois arquivos, ou publique-os como pacote.

- **Handshake obrigatório.** Chame `app.ready` assim que a primeira tela
  estiver renderizada. O shell mantém a tela de carregamento até receber esse
  sinal. Sem ele em **20 s** (`VITE_IPLEX_LOAD_TIMEOUT_MS`), mostra "O iPlex
  não terminou de carregar".
- Métodos disponíveis:
  - `platform.getInfo`, `app.exit`
  - `player.open`, `player.play`, `player.pause`, `player.stop`,
    `player.seek`, `player.getStatus`
  - `player.getTracks`, `player.selectTrack`, `player.setSubtitlesVisible`

  O shell recusa métodos fora dessa lista, parâmetros inválidos e mídia que
  não seja `http(s)`.
- Eventos:
  - `player.state`, `player.buffering`, `player.time`, `player.error`
  - `player.ended`, `player.subtitle`
  - `app.visibility`, `network.status`
- Fora do app (navegador comum), `client.available` é `false`. O iPlex Web
  deve funcionar sem a ponte ou degradar com elegância.
- **Capacidades:** o `app.ready` devolve `PlatformInfo` com:
  - plataforma e versões;
  - `bridge.methods`, para detectar recursos;
  - `installationId`;
  - modelo e tela;
  - `keys`.
- **Teclas:** compare `event.keyCode` com `PlatformInfo.keys`. Os códigos
  mudam por modelo. Teclas de mídia e canal só chegam porque o shell as
  registra. Teclas que caem no shell chegam ao Web pelo evento `remote.key`.
- **Versões:** um pedido de outra versão da ponte recebe o erro
  `unsupported_version`.
- **Identidade:** o `installationId` é só uma dica. A identidade do
  dispositivo vem do pareamento no backend, cujo schema já existe no
  Gestor: `pairingSessionInputSchema`; ver [HOSTING.md](HOSTING.md#pendências-de-integração). Veja
  [ARQUITETURA.md](ARQUITETURA.md#5-contratos-web--backend-propostas-não-implementados-aqui).

```ts
const bridge = createBridgeClient()
const info = await bridge.call('app.ready', { version: '1.0.0' })
bridge.on('player.time', ({ positionMs }) => { /* ... */ })
await bridge.call('player.open', { url: streamUrl, autoplay: true })
```

### 5. Vídeo

- Na Samsung, o AVPlay desenha o vídeo **atrás** da camada web. Durante a
  reprodução, o `html`, o `body` e os contêineres da tela de vídeo precisam
  ter **fundo transparente**. Os controles e as legendas ficam por cima.
- Quando o app é ocultado (multitarefa), o shell **para** o player e emite
  `app.visibility { visible: false }`, como recomenda a Samsung. Ao voltar, o
  frontend decide se reabre a mídia.

### 6. Controle remoto

- Setas (37–40), OK/Enter (13) e Return (10009) chegam como `keydown` ao
  iframe, que recebe o foco após o `app.ready`.
- Return na tela inicial: chame `app.exit` (com confirmação, se desejar).
  Nas demais telas, volte uma tela.
- **Não trate o Exit (10182).** A Samsung exige o comportamento padrão.
- Teclas de mídia e canal (⏯, ▶, ⏸, ⏹, ⏩, ⏪, CH+, CH−) são registradas
  pelo shell. Os códigos reais estão em `PlatformInfo.keys`.

### 7. Compatibilidade com as TVs

- O app suporta Tizen 4.0+ (TVs 2018+, Chromium **M56**). A TV de testes
  (UN65TU7020, 2020) usa Tizen 5.5 / Chromium **M69**.
- `<script type="module">` não existe no M56 nem no M63. Gere um bundle
  legado: `build.target: 'chrome56'` com saída não-módulo, ou
  `@vitejs/plugin-legacy`. Também evite APIs posteriores ao M56 sem
  polyfill, como `AbortController`, `Promise.prototype.finally`,
  `Object.fromEntries` e `globalThis`.
- A tela é 1920×1080 (dimensione com `vw`/`vh`). Não use hover nem ponteiro
  como única forma de interação.

## Configuração do Hosting

O `firebase.json` completo e verificado (CSP, cache, CORS do manifesto, SPA)
e os comandos de publicação estão em [HOSTING.md](HOSTING.md).

## Como verificar a publicação

```bash
curl -sI https://iplex-2c8fc.web.app/iplex-web.json
```

```bash
npm run tv -- --env production
```

O segundo comando confere o manifesto, o CORS e o embutimento antes de instalar na TV.

[hosted]: https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html
