# Publicação na Samsung (Seller Office)

`npm run release:tizen` verifica cada requisito abaixo e **só gera o pacote da
loja quando nenhum bloqueia**. Os pacotes saem em `build/release/`.

`npm run release:tizen -- --candidate` gera ainda um **candidato** de produção,
assinado com o perfil de desenvolvimento, para testes. Ele não pode ser
publicado.

## O que já está pronto no código

- Shell de produção:
  - verificação de rede e do iPlex Web;
  - 9 telas de sistema ([MAPA-DE-TELAS.md](MAPA-DE-TELAS.md));
  - ponte segura;
  - AVPlay;
  - controle remoto;
  - multitarefa;
  - encerramento.
- URL de produção num único lugar (`.env.production`).
- Pacote de produção só com o shell: sem página de teste e sem canal de
  desenvolvimento. O release confere o conteúdo do `.wgt`.
- `config.xml`:
  - perfil `tv-samsung`;
  - tamanho de tela declarado (`screen.size.normal.1080.1920`, exigido pelo
    *Launch Checklist*);
  - `required_version` no formato x.y;
  - um único privilégio (`internet`);
  - nome configurável;
  - ID fixo `iPlexTVApp.IplexTV`.
- Compatível com TVs Samsung a partir de 2018 (Tizen 4.0, Chromium M56).
- Validado no aparelho físico (UN65TU7020, Tizen 5.5), em desenvolvimento e
  produção ([TIZEN.md](TIZEN.md#validação-no-aparelho-físico-samsung-un65tu7020-tizen-55-chromium-m69)).

## O que depende de você (bloqueios do release)

### 1. Publicar o iPlex Web

Siga [HOSTING.md](HOSTING.md):
- publicar no site `iplex-2c8fc` com `firebase deploy --only hosting`;
- incluir o manifesto `iplex-web.json` com CORS;
- **não** enviar `X-Frame-Options` nem CSP `frame-ancestors`.

### 2. Certificado Samsung (perfil `iplex-tv`, criado em 19/10/2026)

1. Abra o Certificate Manager:
   `~/tizen-studio/tools/certificate-manager/certificate-manager.app`.
2. Crie um certificado **Samsung**, tipo TV, com a sua **conta Samsung**. O
   login é seu: eu não posso fazer essa etapa.
3. No certificado de distribuidor, inclua o **DUID** das TVs de teste. Para
   obter o DUID:
   ```bash
   ~/tizen-studio/tools/sdb -s 192.168.15.8:26101 shell 0 getduid
   ```
4. O perfil se chama `iplex-tv` (já configurado em
   `IPLEX_TIZEN_RELEASE_PROFILE` no `.env`).
5. **Faça backup do certificado de autor** (arquivo `.p12` e senha) fora do
   Git. Toda atualização na loja precisa ser assinada com **o mesmo autor**, e
   ele não pode ser recuperado.

### 3. Materiais da loja em `store/samsung/`

Veja [store/samsung/README.md](../store/samsung/README.md). Resumo das
especificações oficiais da Samsung:

| Arquivo | Especificação |
|---|---|
| `icon-512x423.png` | 512×423, PNG 24 bits (RGB), < 300 KB |
| `logo-1920x1080.png` | 1920×1080, PNG 32 bits com transparência, < 300 KB. Respeite a área segura (máscara *squircle*) |
| `background-1920x1080.png`/`.jpg` | 1920×1080, < 300 KB |
| `screenshots/*.jpg` | No mínimo 4, JPG 1920×1080 (ou 1280×720), < 500 KB |

### 4. Itens do cadastro no Seller Office

- **App UI Description**, no modelo da Samsung. Use
  [MAPA-DE-TELAS.md](MAPA-DE-TELAS.md) e as telas do iPlex Web como base.
- Título e descrição **em cada idioma** suportado. O título do idioma padrão
  precisa ser igual a `IPLEX_TIZEN_APP_NAME`.
- URL da política de privacidade, se o iPlex coleta dados pessoais.
- E-mail de contato.
- **Conta de teste** para os avaliadores, se o iPlex Web exige login.
- **Aplicativo hospedado:** pela política da Samsung, isso só é aceito em
  casos especiais, com contato prévio com o **Content Manager**, e exige ser
  parceiro ([Hosted Applications Q&A][hosted]). Combine com a Samsung antes de
  enviar. Se não for aceito, a alternativa é o modo empacotado
  ([TIZEN.md](TIZEN.md#3-restrições-da-samsung-e-distribuição)).

### 5. A cada nova versão

- Aumente `IPLEX_TIZEN_VERSION` (`x.y.z`). Cada upload precisa ser maior que o
  anterior.
- Mantenha o mesmo ID e o mesmo certificado de autor.
- Rode `npm run release:tizen` e envie `build/release/IplexTV-<versão>.wgt`.

## Referências oficiais

- [App Icons and Screenshots](https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html)
- [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html)
- [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- [Creating Certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Application Update Q&A](https://developer.samsung.com/tv-seller-office/faq/application-update.html)
- [Hosted Applications Q&A][hosted]

[hosted]: https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html
