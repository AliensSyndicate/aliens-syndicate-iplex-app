# Auditoria — iPlex Player TV (19/10/2026)

O que está escrito aqui foi observado no código, por testes ou no aparelho
físico (Samsung UN65TU7020GXZD, Tizen 5.5). A arquitetura de referência está
em [ARQUITETURA.md](ARQUITETURA.md).

## 1. Inventário

| Área | Encontrado | Arquivos |
|---|---|---|
| Arquitetura | Shell React+TS+Vite: verifica rede e Hosting, carrega o Web em iframe e expõe a ponte | `src/launcher/`, `src/shell/` |
| Ponte Web/TV | Protocolo `iplex-bridge` v1. Host com validação de fonte, origem, métodos e parâmetros. Cliente de referência | `src/bridge/*` |
| Player nativo | AVPlay (Tizen) e HTML5 `<video>` (navegador e futuro webOS) | `src/platform/tizen/avplayPlayer.ts`, `src/player/*` |
| Plataformas | Tizen e navegador. **LG webOS: não existe** (só o contrato `PlatformAdapter` está pronto para receber um adaptador) | `src/platform/*` |
| Erros | 7 estados técnicos (T3–T8 + config) com código de suporte; faixa de rede (T9) | `src/launcher/*` |
| Configuração | `.env` (comum), `.env.production` (`https://iplex-2c8fc.web.app/`), `.env.development` (página de teste) | `.env*`, `src/config/launchTarget.ts` |
| Build e publicação | Build Tizen IIFE `chrome56`, `npm run tv` (validação na TV), `npm run release:tizen` (requisitos da loja) | `scripts/*`, `tizen/config.template.xml` |
| Dependências | Execução: `react`, `react-dom`. Desenvolvimento: Vite 8, TS 6, ESLint, Vitest 5, happy-dom | `package.json` |
| Identificadores | Player: `iPlexTVApp.IplexTV` (pacote `iPlexTVApp`, widget `http://alienssyndicate/IplexTV`). **O ID do Gestor não é usado** em nenhum arquivo | `tizen/config.template.xml` |
| Dependência de outros repositórios | Nenhuma em código. A leitura do `aliens-syndicate-core-angular` foi só para diagnóstico, sem alteração | — |
| TODO/FIXME | Nenhum | — |
| Testes antes da auditoria | **Nenhum teste automatizado** | — |
| Código morto (sobras do template Vite, não importadas) | `src/App.css`, `src/index.css`, `src/assets/{hero.png,react.svg,vite.svg}`, `public/icons.svg`. **Não foram removidos**: decidir se apaga | — |

### Recursos só de desenvolvimento

Nenhum deles entra no pacote de produção. O `release:tizen` confere o `.wgt`
e uma busca no bundle de produção não encontra nenhum deles.

| Recurso | Para que serve |
|---|---|
| Página de teste "IPLEX TIZEN ONLINE" (`index.html`, `src/online/`) | faz o papel do Web para testar a ponte e o player |
| Canais de teste (streams públicos da Mux, Apple e Unified Streaming) | usados por essa página |
| `devReport` | eventos do app enviados ao Mac durante `npm run tv` |
| `?screen=` | pré-visualização das telas |
| AVPlay simulado | **só** nos testes unitários |

## 2. Correções feitas nesta auditoria

| Problema | Correção | Evidência |
|---|---|---|
| Pedido de outra versão da ponte era ignorado em silêncio (o Web só via tempo esgotado) | Resposta `unsupported_version` | `host.test.ts` |
| Web sem como detectar recursos nem capacidades reais | `PlatformInfo`: `bridge.version/methods`, `installationId`, modelo, tela, `keys`, `mediaKeys` | TV: modelo UN65TU7020GXZD, 1920×1080, 12 métodos |
| Teclas de mídia/canal não chegavam ao app (sem registro) | Registro oficial via `tvinputdevice` (privilégio `tv.inputdevice`), com o código real de cada tecla | TV: 8 teclas registradas; `index.test.ts` (Exit nunca registrado) |
| Tecla recebida pelo shell com o Web aberto era perdida | Evento `remote.key` + devolução do foco ao Web | código; não exercitado na TV |
| Foco não voltava ao Web após retomar | Ao ficar visível, o shell devolve o foco ao iframe | código; não exercitado na TV |
| Servidor fora do ar dependia do botão | Retry controlado: 5 / 15 / 45 s, no máximo 3. O contador só zera após `app.ready` (sem laço) | código |
| Sem identificador de instalação | UUID v4 persistente, compatível com M56 (sem `randomUUID`/`padStart`) | `installationId.test.ts` |
| Nenhum teste | **49 testes** em 7 arquivos: segurança da ponte, validação, destino, disponibilidade (soft 404, CORS, 5xx, versão), AVPlay (ciclo, SUPERSEDED, timeout, NOT_READY, faixas), teclas e verificação do Hosting | `npm test` |
| Regras da fronteira só implícitas | `docs/ARQUITETURA.md` e `CLAUDE.md` | — |

## 3. Critério final de entrega

| # | Pergunta | Classificação | Evidência e arquivos |
|---|---|---|---|
| 1 | O app TV inicializa corretamente? | **IMPLEMENTADO E TESTADO** | Instalação e abertura em desenvolvimento e produção na UN65TU7020 (`build/logs/tv-*.log`); `src/launcher/*` |
| 2 | Carrega a URL real do iPlex Web? | **BLOQUEADO** (aguarda a publicação do Web) | URL real confirmada: site `iplex-2c8fc` → `https://iplex-2c8fc.web.app/`, configurada em `.env.production`. Na TV, o shell de produção a acessa por HTTPS e mostra T5, porque ainda não há publicação. Carregamento e handshake validados na TV com o **probe** servido pelo **emulador do Firebase Hosting**, com o `firebase.json` de produção (HOSTING.md) Validado também por **HTTPS real**: canal de preview do `iplex-2c8fc` (probe) carregado e com handshake na TV. |
| 3 | A comunicação Web/TV funciona? | **IMPLEMENTADO E TESTADO** (lado TV) | Handshake, 12 métodos e eventos validados na TV com a página de teste; 11 testes de segurança. O iPlex Web real ainda não existe para consumir a ponte |
| 4 | O controle remoto funciona? | **PARCIAL** | Setas, OK e Return (sair) validados na TV com o controle físico (26 teclas). Teclas de mídia e canal: **registradas na TV, mas não pressionadas** nos testes. Retomada com foco: **não validada** |
| 5 | A reprodução nativa está integrada? | **IMPLEMENTADO E TESTADO**, com limitações | AVPlay na TV: tocar HLS, pausar, retomar, buscar, trocar canal (inclusive rápido), parar, legenda padrão. ⚠ Troca de áudio não confirmada pelo AVPlay; ⚠ troca de idioma da legenda → `INVALID_PARAMETER`; ⚠ stream fMP4 da Unified Streaming não prepara no Tizen 5.5 |
| 6 | A validação de dispositivo funciona? | **NÃO IMPLEMENTADO** | É responsabilidade do Web e do backend, que **não estão neste Mac**. O shell fornece só o `installationId` (dica). Contrato proposto em ARQUITETURA §5 |
| 7 | A validação de assinatura funciona? | **NÃO IMPLEMENTADO** | Web e backend ausentes. Regra registrada: `paymentsEnabled=false` não libera reprodução, e backend fora do ar ⇒ sem acesso |
| 8 | A verificação de IPTV funciona? | **NÃO IMPLEMENTADO** | Web e backend ausentes. Estados distintos definidos em ARQUITETURA §3 |
| 9 | O pareamento funciona? | **NÃO IMPLEMENTADO** | Web, backend e Gestor ausentes. Nenhum código fictício foi criado |
| 10 | Existem funcionalidades simuladas? | Sim, **só de desenvolvimento** | Página de teste, canais de teste, `devReport`, `?screen=`, AVPlay simulado nos testes. Nenhuma no pacote de produção (conferido pelo `release:tizen`) |
| 11 | Existem bloqueios críticos? | **Sim** | (a) iPlex Web inexistente e Hosting sem publicação (o conflito de URL foi resolvido: site `iplex-2c8fc`); (b) **App Check** obrigatório no backend, sem teste na TV; (c) consultas do Web ao backend (pareamento, assinatura, IPTV) não implementadas; (d) certificado Samsung e materiais da loja; (e) aceite da Samsung para app hospedado |
| 12 | Dá para começar o layout definitivo do iPlex Web sem refazer a arquitetura? | **Sim** | A fronteira TV/Web e a ponte estão estáveis e testadas. O Web precisa: implementar handshake, manifesto e bundle compatível com M56, conforme [IPLEX-WEB.md](IPLEX-WEB.md); a **decisão de Hosting** vem antes do primeiro deploy; os contratos com o backend (§5) devem ser confirmados em paralelo, sem impacto no shell |

## 4. O que ainda precisa do aparelho, com o controle na mão

- Pressionar ⏯/▶/⏸/⏹/⏩/⏪/CH+/CH− e ver o comando executado (`npm run tv -- --watch 300`).
- Home → reabrir o iPlex: retomada sem reinício, foco de volta ao Web e
  `app.visibility { visible: true }`.
- Queda de rede durante o uso (faixa T9 e `network.status`): exige
  desconectar a rede da TV.
- Repetição de tecla (segurar a seta).
