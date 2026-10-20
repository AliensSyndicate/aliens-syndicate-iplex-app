# Firebase Hosting do iPlex Web — `iplex-2c8fc`

## Fatos confirmados em 19/10/2026

| Item | Valor | Como foi confirmado |
|---|---|---|
| Projeto Firebase | `iplex-2c8fc` | `.firebaserc` do Gestor; `gcloud config get-value project` |
| **ID do site de Hosting** | **`iplex-2c8fc`** (tipo `DEFAULT_SITE`) | `firebase hosting:sites:list --project iplex-2c8fc` |
| **URL HTTPS real** | **`https://iplex-2c8fc.web.app`** (também `https://iplex-2c8fc.firebaseapp.com`) | Mesma listagem |
| Publicações no site | **iPlex Web publicado em 20/10/2026** (antes: 404 "Site Not Found") | `curl` |
| Outros usos do projeto | O **Gestor** publica Functions (codebase `iplex-gestor`), Firestore e Storage, e **não usa Hosting** | `firebase.json` do Gestor (só leitura) |
| Código do iPlex Web | **Não existe neste Mac** | `~/Workspace` |
| Domínio `alienssyndicate.com` | É do Core (`aliens-syndicate-docs`). **Não é usado** pelo Player | — |

O site padrão já existe, então não é preciso criar outro. O app da TV aponta
para ele em `.env.production`: `VITE_IPLEX_TARGET_URL=https://iplex-2c8fc.web.app/`.

## Configuração do repositório do iPlex Web

Fonte única: [`scripts/lib/hosting-config.mjs`](../scripts/lib/hosting-config.mjs),
com testes em `hosting-config.test.mjs`. O `firebase.json` abaixo foi gerado
dela e **verificado no emulador oficial do Firebase Hosting e na TV**.

### `.firebaserc`

```json
{ "projects": { "default": "iplex-2c8fc" } }
```

### `firebase.json`

**Só `hosting`.** Functions, regras do Firestore e Storage pertencem ao Gestor
e **não** podem entrar aqui.

```json
{
  "hosting": {
    "site": "iplex-2c8fc",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
          { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' https://www.google.com https://www.gstatic.com; style-src 'self'; img-src 'self' data: https:; font-src 'self'; media-src 'self' https: blob:; connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net https://*.firebaseio.com wss://*.firebaseio.com https://www.google.com; frame-src https://www.google.com https://recaptcha.google.com; object-src 'none'; base-uri 'self'; form-action 'self'" }
        ]
      },
      { "source": "/", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "**/!(*.*)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "**/*.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      {
        "source": "/iplex-web.json",
        "headers": [
          { "key": "Access-Control-Allow-Origin", "value": "*" },
          { "key": "Cache-Control", "value": "no-cache" }
        ]
      }
    ]
  }
}
```

| Regra | Motivo | Evidência |
|---|---|---|
| **Sem `X-Frame-Options` e sem CSP `frame-ancestors`** | O app Tizen exibe o Web num iframe cujo pai é `file://` (origem opaca). Nenhuma lista o autoriza, **nem `*`** | Na TV (Tizen 5.5), com `frame-ancestors *` o iframe foi **bloqueado** (`load-timeout`); sem ele, o handshake funcionou |
| Segurança em `**` + cache por caminho | O padrão `**/!(*.*)` **não cobre `/`**. Regras diferentes são **combinadas** pelo Hosting | Emulador do Hosting, caminho a caminho |
| `no-cache` em `/`, rotas e `*.html` | Cada publicação do Web chega às TVs na próxima abertura do app | Emulador |
| Assets imutáveis | O Vite gera nomes com hash | Emulador |
| Manifesto com CORS `*` e `no-cache` | O app (origem `file://`) lê `iplex-web.json` antes de abrir o Web | TV: `target-ready` |
| CSP sem `'unsafe-inline'`/`'unsafe-eval'` | Exigência da Samsung para hosted apps. O `connect-src` cobre Firebase Auth, Functions, Firestore e App Check; `script-src`/`frame-src` cobrem o reCAPTCHA (App Check) | Testes; CSP ativa confirmada na TV |
| Reescrita SPA `**` → `/index.html` | Arquivos existentes têm prioridade; o resto é rota do React | Emulador: `/alguma/rota` → `index.html` |

### `vite.config.ts` do Web

- `base: '/'`: o Web fica na **raiz** do site, não mais em `/apps/iplex/`.
- Bundle compatível com **Chromium M56** (TVs 2018+): `build.target: 'chrome56'`
  e saída não-módulo, ou `@vitejs/plugin-legacy`. Use
  `scripts/build-tizen.mjs` deste repositório como referência.
- `public/iplex-web.json`:

  ```json
  { "app": "iplex-web", "version": "<versão do Web>", "bridgeVersion": 1 }
  ```

O restante do contrato (handshake `app.ready`, ponte, teclas, vídeo
transparente) está em [IPLEX-WEB.md](IPLEX-WEB.md).

## Teste mínimo de carregamento e handshake (probe)

`npm run probe:hosting` gera `build/hosting-probe/`, um site **mínimo de teste**.
Não é o iPlex Web e não tem layout. Ele contém:
- a página que só faz o handshake;
- o manifesto, com `version: "hosting-probe"`;
- o `firebase.json` recomendado.

O probe é a forma de validar o Hosting **antes** de o iPlex Web existir.

| Etapa | Comando | Publica algo? |
|---|---|---|
| 1. Emulador local | `cd build/hosting-probe && firebase emulators:start --only hosting --project iplex-2c8fc` | Não |
| 2. TV contra o emulador | `npm run tv -- --target http://<ip-do-mac>:5050/` | Não |
| 3. Canal de *preview* (URL temporária `iplex-2c8fc--probe-….web.app`, expira em 1 dia) | `cd build/hosting-probe && firebase hosting:channel:deploy probe --expires 1d --project iplex-2c8fc` | **Sim (temporário). Só com autorização** |
| 4. TV contra o preview (HTTPS real) | `npm run tv -- --env production --target https://iplex-2c8fc--probe-<sufixo>.web.app/` | Não |

**Executados em 19/10/2026, todos com sucesso na Samsung UN65TU7020 (Tizen 5.5):**

| Etapa | Resultado |
|---|---|
| 1. Emulador local | Ok |
| 2. TV contra o emulador | Ok |
| 3. Canal de preview (publicação autorizada; **produção não foi tocada**) | `https://iplex-2c8fc--probe-93lf2e8e.web.app`, expira em 20/10/2026 22:37 UTC. Por HTTPS/2: `no-cache` nas páginas, assets imutáveis, CSP sem `frame-ancestors`, sem `X-Frame-Options`, manifesto com CORS `*`, HSTS do Firebase, certificado da Google Trust Services (WR4). `https://iplex-2c8fc.web.app/` continuou 404 |
| 4. Shell de **produção** contra o preview | Ok: `target-ready` → `frame-load` → `frame-ready` (`app.ready`), com o certificado aceito pelo Tizen 5.5. Depois a TV voltou ao shell de produção com a URL definitiva (tela "indisponível" até a publicação) |

Para remover o canal antes de expirar:

```bash
firebase hosting:channel:delete probe --project iplex-2c8fc
```

## Publicar o iPlex Web (quando você autorizar)

No repositório do iPlex Web, com `firebase.json` e `.firebaserc` acima:

```bash
npm run build
```

```bash
firebase hosting:channel:deploy preview --expires 7d --project iplex-2c8fc
```

Isso cria um canal de preview, sem tocar a produção. Valide com:

```bash
npm run tv -- --env production --target https://iplex-2c8fc--preview-<sufixo>.web.app/
```

Esse último comando é deste repositório. Para publicar em produção
(`https://iplex-2c8fc.web.app`):

```bash
firebase deploy --only hosting --project iplex-2c8fc
```

- Use **sempre `--only hosting`**: o projeto contém as Functions, as regras e
  o Storage do Gestor.
- Depois da publicação, `npm run tv -- --env production` deve passar sem
  `--allow-unpublished`, e `npm run release:tizen` deixa de bloquear no item 3.

## Pendências de integração

| # | Pendência | Responsável |
|---|---|---|
| 1 | Criar o repositório e o código do iPlex Web (React) com a configuração acima | Web |
| 2 | **App Check:** a callable `manager` do backend exige App Check (`enforceAppCheck` fora do emulador). O Web na TV vai precisar de um provedor de App Check para web (reCAPTCHA Enterprise/v3) funcionando **dentro do iframe da Samsung**. Ainda **não testado**: é o maior risco de integração | Web + backend |
| 3 | Pareamento: o backend já tem `pairingSessionInputSchema` (`platform: 'tizen'`, `model`, `nativeDeviceId`, `identitySource`…) e código numérico de 6 dígitos. O shell fornece `installationId` + `model` via ponte, o que corresponde a `identitySource: tizen_app_install_fallback`. DUID (`tizen_duid_api`) exige o privilégio `productinfo` e uma decisão de privacidade: **não implementado** | Web + backend (+ decisão) |
| 4 | Assinatura e IPTV: existem módulos no backend (`play_billing`, `iptv_*`); os contratos de consulta pelo Web estão em [ARQUITETURA.md](ARQUITETURA.md) §5 | Web + backend |
| 5 | Primeira publicação (preview e depois produção) | Sua autorização |
