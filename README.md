# aliens-syndicate-iplex-app

Aplicativo **iPlex** para as lojas de Smart TVs. Hoje cobre a **Samsung
Tizen**; o **LG webOS** fica para o futuro. É feito em React, TypeScript e
Vite.

O app é um *shell* instalado na TV. Ele carrega o **iPlex Web** hospedado e
dá a ele acesso aos recursos da TV por uma ponte segura: player AVPlay,
controle remoto e informações da plataforma.

| Repositório | Papel |
|---|---|
| **aliens-syndicate-iplex-app** (este) | app instalável nas Smart TVs |
| iPlex Web (outro repositório) | interface principal, no Firebase Hosting `iplex-2c8fc`: `https://iplex-2c8fc.web.app/` |
| iPlex Gestor (outro repositório) | gestão |

## Testar na Samsung com um clique

```bash
npm run tv
```

Também dá para dar **duplo clique em `iPlex-TV.command`** no Finder. O fluxo
é o mesmo:

1. Conecta à TV via Wi-Fi (SDB).
2. Faz o build e gera o `.wgt` assinado.
3. Instala ou atualiza o app, só quando o conteúdo mudou.
4. Abre o iPlex.
5. Valida a execução real na TV.

| Comando | O que faz |
|---|---|
| `npm run tv` | ambiente de desenvolvimento (página de teste servida pelo Mac) |
| `npm run tv -- --env production` | destino de produção; só prossegue se o iPlex Web estiver publicado |
| `npm run tv -- --watch 60` | mostra no terminal as teclas do controle remoto por 60 s |
| `npm run tv -- --host <IP>` | usa outra TV (ou defina `IPLEX_TV_HOST` no `.env.local`) |
| `npm run tv -- --force-install` | reinstala mesmo sem mudanças |

O IP da TV fica em `.env` (`IPLEX_TV_HOST=192.168.15.8`). Os logs de cada
execução ficam em `build/logs/`.

Pré-requisitos no Mac:
- Tizen Studio CLI em `~/tizen-studio`;
- Rosetta 2 (o `sdb` é x86_64);
- perfil de assinatura Samsung `iplex-tv` (Certificate Manager), com o DUID da TV;
- TV em Modo Desenvolvedor com o IP deste Mac.

## Outros comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | shell + página de teste no navegador (`/launcher.html`) |
| `npm test` | testes unitários (ponte, validação, destino, disponibilidade, AVPlay, teclas) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run build` | build web (sanidade) |
| `npm run build:tizen` | widget Tizen de produção em `dist-tizen/widget` |
| `npm run package:tizen` | widget + `.wgt` assinado em `build/tizen/` |
| `npm run probe:hosting` | gera o probe de Hosting (handshake mínimo) para o emulador ou um preview (docs/HOSTING.md) |
| `npm run release:tizen` | verifica todos os requisitos da loja e gera o pacote de publicação em `build/release/` (`-- --candidate` gera um candidato de teste) |

Para os dois últimos, acrescente `-- --env development` para usar o
ambiente de desenvolvimento.

## Configuração por ambiente

| Arquivo | Conteúdo |
|---|---|
| `.env.production` | URL de produção do iPlex Web: `https://iplex-2c8fc.web.app/` |
| `.env.development` | página de teste controlada (independente da produção) |
| `.env` | valores comuns (tempos limite, Tizen, TV de desenvolvimento) |

## Telas para o layout

`npm run dev` → `http://localhost:5173/launcher.html?screen=<id>` mostra cada
tela do app sem depender da rede. Os ids são `checking`, `loading`,
`offline`, `unreachable`, `not-deployed`, `server-error`, `incompatible`,
`load-timeout` e `offline-banner`. Veja [docs/MAPA-DE-TELAS.md](docs/MAPA-DE-TELAS.md).

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): **fonte de verdade**. Fronteira
  TV × Web × Backend, fluxo de inicialização, erros e contratos.
- [docs/AUDITORIA.md](docs/AUDITORIA.md): auditoria do projeto e estado de
  cada item.

- [docs/TIZEN.md](docs/TIZEN.md): arquitetura, ponte, AVPlay, restrições
  da Samsung e automação da TV.
- [docs/IPLEX-WEB.md](docs/IPLEX-WEB.md): requisitos para o iPlex Web
  funcionar dentro do app.
- [docs/HOSTING.md](docs/HOSTING.md): Firebase Hosting `iplex-2c8fc`
  (`firebase.json`, CSP, probe, comandos de publicação).
- [docs/MAPA-DE-TELAS.md](docs/MAPA-DE-TELAS.md): todas as telas e funções
  do app (App × Web), para o layout.
- [docs/PUBLICACAO.md](docs/PUBLICACAO.md): o que está pronto e o que falta
  para publicar na Samsung.
