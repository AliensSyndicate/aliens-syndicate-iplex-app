# Requisitos do iPlex Web em `/apps/iplex/`

O **iPlex Web** é a interface principal, mantida em **outro repositório**
(React + TypeScript). Este repositório (`aliens-syndicate-iplex-app`) é o
aplicativo instalado nas Smart TVs: ele abre o iPlex Web, verifica se está
disponível e oferece a ponte para os recursos da TV.

| Ambiente | Destino carregado pela TV | Onde é configurado |
|---|---|---|
| Produção | `https://alienssyndicate.com/apps/iplex/` | `.env.production` |
| Desenvolvimento | Página de teste controlada deste repositório | `.env.development` (substituível em `.env.development.local`) |

## Situação verificada (19/10/2026)

Verificação feita com `curl` usando o User-Agent de uma TV Tizen 5.5, e pelo
próprio shell no navegador, em modo produção:

- `alienssyndicate.com` resolve para `199.36.158.100`, um IP do Firebase Hosting.
- `/apps/iplex` e `/apps/iplex/` **ainda não estão publicados**. Respondem
  **HTTP 200** com a página `404 — Sinal perdido` do site principal (soft 404
  gerado por uma regra de reescrita coringa).
- `/apps/iplex/iplex-web.json` não existe. O shell mostra **"iPlex
  indisponível no momento"** e não carrega a página de erro do site.
- O domínio envia **`X-Frame-Options: SAMEORIGIN`** em todas as respostas.
  Com esse cabeçalho, o iPlex Web **não pode** ser exibido dentro do app.

O próprio app não presume nada disso. A cada abertura ele confere o
manifesto. `npm run tv -- --env production` faz a mesma verificação antes de
instalar e **para** se o iPlex Web não estiver publicado.

## Requisitos obrigatórios

### 1. Base `/apps/iplex/`

- No Vite, use `base: '/apps/iplex/'`. Todos os assets devem ficar sob essa
  base e nunca na raiz do domínio.
- No roteador (React Router ou outro), use `basename: '/apps/iplex'`.
- `/apps/iplex` sem barra deve redirecionar para `/apps/iplex/`. O app de TV
  já normaliza a URL, mas links externos podem chegar sem a barra.
- Crie uma reescrita SPA `/apps/iplex/**` → `/apps/iplex/index.html`. Ela
  **precisa ter precedência** sobre a regra coringa do site principal, que
  hoje devolve o soft 404.
- Rotas inexistentes **fora do app** devem continuar respondendo com o site
  principal, sem afetar o iPlex Web.

### 2. Manifesto de disponibilidade: `/apps/iplex/iplex-web.json`

```json
{ "app": "iplex-web", "version": "1.0.0", "bridgeVersion": 1 }
```

- Use `Content-Type: application/json`.
- Use **`Access-Control-Allow-Origin: *`**. O app empacotado tem origem
  opaca (`file://`) e só consegue ler o manifesto com CORS aberto.
- Use `Cache-Control: no-cache`.
- `bridgeVersion` deve ser igual a `BRIDGE_VERSION` em
  `src/bridge/protocol.ts` (hoje **1**). Se for diferente, o app mostra
  "Atualização necessária".
- Se o arquivo não existir, devolva **404 real**. Assim o app distingue
  "não publicado" de "servidor fora do ar".

### 3. Exibição dentro do app (modo `frame`, padrão)

O shell instalado exibe o iPlex Web num `<iframe>` em tela cheia. É assim que
ele mantém a ponte com as APIs da TV, que a Samsung não oferece a conteúdo
hospedado.

- **Nenhum `X-Frame-Options`** nas respostas de `/apps/iplex/**`. A regra
  global atual (`SAMEORIGIN`) precisa ser restrita para não cobrir esse caminho.
- A CSP `frame-ancestors` deve estar ausente ou ser `*`. A origem do app na
  TV é opaca e não pode ser listada.
- A CSP não pode usar `unsafe-inline` nem `unsafe-eval`. É exigência da
  Samsung para aplicações hospedadas ([Hosted Applications Q&A][hosted]).

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
- Teclas de mídia (play/pause etc.) exigem registro no shell. Ainda não estão
  no contrato.

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

## Exemplo de cabeçalhos (Firebase Hosting)

O domínio é servido pelo Firebase Hosting e o site principal tem
configuração própria. O trecho abaixo é **ilustrativo**: a decisão de como
publicar o iPlex Web sob o mesmo domínio fica com o repositório Web. Pode ser
um deploy coordenado no mesmo site ou uma reescrita para outro serviço.

```json
{
  "hosting": {
    "rewrites": [
      { "source": "/apps/iplex/**", "destination": "/apps/iplex/index.html" }
    ],
    "headers": [
      {
        "source": "/apps/iplex/iplex-web.json",
        "headers": [
          { "key": "Access-Control-Allow-Origin", "value": "*" },
          { "key": "Cache-Control", "value": "no-cache" }
        ]
      }
    ]
  }
}
```

O `X-Frame-Options` global precisa deixar de valer para `/apps/iplex/**`.

## Como verificar a publicação

```bash
curl -sI https://alienssyndicate.com/apps/iplex/iplex-web.json
```

```bash
npm run tv -- --env production
```

O segundo comando confere o manifesto, o CORS e o embutimento antes de instalar na TV.

[hosted]: https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html
