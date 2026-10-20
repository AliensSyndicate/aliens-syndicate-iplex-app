# iPlex Player TV — regras do repositório

App instalável nas Smart TVs (hoje Samsung Tizen). É um **shell**: carrega o
iPlex Web (outro repositório) por URL e oferece a ele, por uma ponte, os
recursos da TV. A arquitetura oficial está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Fronteira (não violar)

- **Aqui:**
  - inicialização, plataforma e capacidades;
  - verificação de rede e Hosting;
  - telas técnicas T1–T9;
  - ponte `iplex-bridge`;
  - player nativo (AVPlay);
  - teclas, ciclo de vida;
  - empacotamento e publicação.
- **Nunca aqui:**
  - layout de produto (Home, catálogo, busca, perfis, favoritos, histórico,
    pareamento visual);
  - regras de assinatura, família ou IPTV;
  - credenciais;
  - acesso ao Firestore;
  - lógica de negócio.

  Isso é do **iPlex Web** ou do **backend**.
- Não alterar o iPlex Gestor nem reutilizar o ID dele
  (`com.alienssyndicate.iplex_control`). O ID do Player é
  `iPlexTVApp.IplexTV` e não pode mudar, porque já está instalado e publicado
  com esse ID.
- Dados do shell (por exemplo `installationId`) são **dicas**, nunca prova
  de identidade.

## Ponte (src/bridge)

- O contrato fica só em `src/bridge/protocol.ts`. Não criar protocolos
  paralelos.
- Mudança **aditiva** (método, evento ou campo novo) mantém
  `BRIDGE_VERSION`. Atualize `BRIDGE_METHODS`, `validation.ts`, os testes e
  `docs/ARQUITETURA.md`.
- Mudança **incompatível** exige `BRIDGE_VERSION + 1` e combinar com o
  `bridgeVersion` do `iplex-web.json` do Web.
- Toda mensagem é validada: fonte (iframe), origem exata, lista de métodos e
  parâmetros.

## Design System (src/design-system)

- Detalhes em [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md).
- Os 9 tokens oficiais (cores, fonte, raios) são **exatos**. Não aproxime
  (`#fff`, `0.05`) e não crie cor de destaque, gradiente nem sombra
  decorativa.
- A minificação de CSS fica desligada (`cssMinify: false`) porque ela
  reescreve os tokens. O build Tizen confere os tokens no CSS empacotado.
- Botões (`IplexButton`, `primary`/`secondary`) têm **só texto**, nunca
  ícone.
- Ícones: somente Hugeicons Stroke Rounded (`@hugeicons/core-free-icons`).
- Logo: `IplexLogo` (texto com relevo neumórfico em CSS). As cores
  `--iplex-logo-*` só podem ser usadas no logo. Nunca use
  `-webkit-text-stroke` com a Google Sans, porque ele desenha os contornos
  internos dos glifos.
- Foco sempre visível: anel em `box-shadow` (via `:focus` ou
  `.is-focused`). Na TV não há dependência de *hover*.

## Compatibilidade

- Mínimo: Tizen 4.0 / Chromium **M56**.
- O build Tizen é IIFE com target `chrome56`.
- Não use APIs posteriores ao M56 sem alternativa: `padStart`,
  `crypto.randomUUID`, `AbortController`, `Promise.prototype.finally`,
  `Object.fromEntries`, `globalThis`, CSS `gap`/`inset`.
- Exit (10182) nunca é registrado nem tratado.

## Comandos

```bash
npm test
```

Testes unitários (Vitest).

```bash
npm run typecheck && npm run lint
```

TypeScript e ESLint.

```bash
npm run tv
```

Build, instala e valida na Samsung de desenvolvimento.

```bash
npm run tv -- --env production --allow-unpublished
```

Valida o shell de produção na TV.

```bash
npm run release:tizen
```

Requisitos da loja e geração do pacote.

- Recursos de desenvolvimento ficam **fora** do pacote de produção e o
  release confere isso:
  - página de teste `index.html`;
  - canais de teste;
  - relatório para o Mac (`devReport`);
  - `?screen=`.
- Validação "na TV" só conta com evidência do aparelho (`npm run tv`). Build
  verde não é validação.
- Hosting do iPlex Web: site `iplex-2c8fc` → `https://iplex-2c8fc.web.app/`
  ([docs/HOSTING.md](docs/HOSTING.md)).
  - Nunca `X-Frame-Options` nem CSP `frame-ancestors` (bloqueia o app na TV,
    verificado).
  - Nunca usar o domínio do Core (`alienssyndicate.com`).
  - Publicar só com `--only hosting`: o projeto tem as Functions e as regras
    do Gestor.
- Nada de deploy no Hosting nem push sem autorização explícita.
