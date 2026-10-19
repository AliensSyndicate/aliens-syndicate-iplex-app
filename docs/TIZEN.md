# iPlex TV — Samsung Tizen (prova de conceito)

Aplicativo Tizen Web do iPlex TV, dentro do projeto React existente
(`aliens-syndicate-iplex-react`). Nesta etapa ele valida **instalação,
inicialização, acesso à internet, carregamento de conteúdo remoto em tela
cheia e compatibilidade básica com o controle remoto**. IPTV, catálogo,
autenticação e Firebase ficam para depois.

## 1. Referência: Dream+TV (engenharia reversa com REA)

O APK `Dream+TV_1.1.1_APKPure.apk` (`com.dreamtv.app`) é uma casca nativa:

| Dream+TV (Android) | iPlex TV (Tizen) |
|---|---|
| `MainActivity` abre uma WebView em tela cheia | Widget Tizen, `viewmodes="maximized"` |
| `WebEngine.initApp("http://tv.dreamtv.life")` carrega a interface remota | Launcher React → `location.assign(VITE_IPLEX_TARGET_URL)` |
| `NetworkTimer` verifica a rede | `src/connection/connectivity.ts` |
| Ponte `window.Android` (`WebAppInterface`) | `src/platform/` (`PlatformAdapter`) |
| ExoPlayer/VLC nativos | **Não portado** (fora do escopo; no Tizen seria AVPlay/HTML5) |
| `onBackPressed` repassado ao site | Return tratado pelo launcher e pela página |

Diferença essencial: no Tizen **não existe ponte equivalente para páginas
remotas**. A Samsung afirma que as APIs Tizen não ficam disponíveis em
aplicações hospedadas, por segurança ([Hosted Applications Q&A][hosted]).
Por isso a integração com o sistema fica no launcher empacotado.

## 2. Arquitetura

```
launcher.html ──► src/launcher/          (interface React do launcher, máquina de estados)
                   ├─ useLauncher.ts      checking → opening → (remoto) | failed | returned
                   └─ launchLog.ts        registro da URL solicitada (console + localStorage)
src/config/launchTarget.ts               configuração do destino (VITE_IPLEX_TARGET_URL)
src/connection/connectivity.ts           gerenciamento da conexão (onLine + sonda no-cors + eventos)
src/platform/                            integração com o sistema (tizen | browser)
src/navigation/                          controle remoto (teclas, foco, ActionBar)
index.html ──► src/App.tsx → online/     frontend do iPlex (hoje: página "IPLEX TIZEN ONLINE")
tizen/config.template.xml, tizen/icon.png
scripts/build-tizen.mjs                  build Tizen + config.xml + empacotamento .wgt
```

Fluxo na TV:

1. O usuário abre o iPlex TV; o runtime carrega `launcher.html` (empacotado).
2. O launcher verifica a rede: `navigator.onLine` + `fetch` `no-cors` à origem do destino.
3. Com rede, registra a URL e faz **navegação de nível superior**
   (`location.assign`, não iframe) para o destino, que ocupa a tela inteira.
4. Sem rede / destino inalcançável / navegação que não conclui: tela de erro
   com **Tentar novamente** e **Sair**; reconexão dispara nova tentativa.
5. Se a página remota voltar no histórico (`history.back()`), o launcher
   mostra **Abrir novamente / Sair**.

### Um único app, dois modos (sem dois aplicativos)

`VITE_IPLEX_TARGET_URL` (em `.env`) decide o modo do **mesmo** widget:

| Valor | Modo | Uso |
|---|---|---|
| `https://www.google.com` (padrão atual) | hospedado | teste desta etapa |
| `https://<projeto>.web.app/` | hospedado | futuro iPlex no Firebase Hosting |
| `./index.html` | empacotado | frontend React dentro do `.wgt` (estratégia para a Samsung Store) |

O frontend é o mesmo bundle: `npm run build` gera `dist/` para hospedagem;
`npm run build:tizen` gera o mesmo `index.html` dentro do widget. Para
publicar empacotado, basta `VITE_IPLEX_TARGET_URL=./index.html`.

`config.xml` é gerado a partir do destino: `<access origin>` e
`<tizen:allow-navigation>` recebem o domínio do destino (com subdomínios) e
os hosts de `IPLEX_TIZEN_EXTRA_HOSTS` (hoje `gstatic.com`, recursos estáticos
do Google). No modo empacotado nenhum acesso externo é declarado.

## 3. Restrições da Samsung (documentação oficial)

- **Aplicativo hospedado** (o app carrega uma URL ou baixa código em tempo de
  execução): *geralmente não é permitido* na publicação, por política de
  segurança; é aceitável apenas em casos especiais, com contato prévio com o
  Content Manager; exige ser membro de um grupo de parceiros; APIs Tizen não
  são suportadas; CSP sem `unsafe-inline`/`unsafe-eval` ([Hosted Applications Q&A][hosted]).
  **Não há confirmação de que o modelo hospedado do iPlex será aceito.**
- **Aplicativo empacotado**: modelo padrão da loja; scripts/CSS externos
  exigem permissão do Content Manager e declaração em `<access>`.
- **Return**: na tela inicial pode encerrar ou ocultar o app
  (`tizen.application.getCurrentApplication().exit()`/`hide()`).
- **Exit**: deve voltar à Home imediatamente; não registrar nem tratar a
  tecla, nem mostrar pop-up — caso contrário a certificação falha
  ([User Interaction Q&A][ui-faq]).
- **Teclas obrigatórias** (setas, Enter, Return) chegam sem `registerKey` e
  sem o privilégio `tv.inputdevice` ([Remote Control][remote]).

### Privilégios e configurações

- Único privilégio: `http://tizen.org/privilege/internet`.
- `tv.inputdevice` **não** é usado (nenhuma tecla extra registrada).
- `tizen:setting`: paisagem, sem menu de contexto, sem execução em segundo plano.

## 4. Compatibilidade do motor web

Motores por ano ([Web Engine Specifications][engine]): 2017 M47, 2018 M56,
2019 M63, 2020 M69, 2021 M76, 2022 M85, 2023 M94, 2024 M108, 2025 M120, 2026 M130.

- O Vite 8 gera por padrão `baseline-widely-available` + `<script type="module">`.
  Módulos ES não existem em 2018/2019 (tabela da Samsung) e o conteúdo é
  servido de arquivo local. O build Tizen gera **IIFE com `<script defer>`**
  e `target: chrome56`.
- Verificado no bundle gerado: análise sintática **ES2017 sem erros**; APIs
  mais novas encontradas (`queueMicrotask`, `AbortController`,
  `MessageChannel`, `Promise.allSettled`) só aparecem no React atrás de
  verificação `typeof` ou no caminho de View Transitions (inexistente nesses motores).
- O código próprio evita `AbortController` (M66) e CSS `gap`/`inset`.
- Mínimo declarado: `required_version="4.0"` (TVs 2018). 2017 (M47) e
  anteriores **não** são suportados.

[hosted]: https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html
[ui-faq]: https://developer.samsung.com/smarttv/develop/faq/user-interaction.html
[remote]: https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
[engine]: https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html
