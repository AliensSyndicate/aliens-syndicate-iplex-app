# iPlex — Design System V1

Base visual única do iPlex para **Web** e **TV (Tizen)**: tokens, fonte,
ícones e cinco componentes fundamentais. Não define telas de produto (Home,
Player, perfis): elas são do iPlex Web.

- **Código:** [`src/design-system/`](../src/design-system/).
- **Vitrine (só desenvolvimento):** `design-system.html`.
- **Referência visual oficial:** a tela "Não foi possível conectar". Logo,
  título, mensagem e botão branco em pílula, centralizados sobre fundo
  escuro.

> O iPlex Web é outro repositório e ainda não existe neste workspace. Até
> lá, esta pasta é a fonte do Design System. Para o Web usar o mesmo
> visual, copie `src/design-system/` (sem `showcase/`) ou publique a pasta
> como pacote. A decisão está em aberto (seção 9). As regras específicas de
> cada plataforma (TV × Web) ficam no CSS de escala e de foco, nunca em uma
> segunda paleta.

## 1. Tokens oficiais

Os valores são **exatos**. Não aproxime nem troque por equivalentes (por
exemplo, `#fff` no lugar de `#FFFFFF`).

| Token | Valor |
|---|---|
| `--iplex-bg` | `#0F0F0F` |
| `--iplex-text-primary` | `#F1F1F1` |
| `--iplex-text-secondary` | `#B7B7B7` |
| `--iplex-card-bg` | `rgba(241, 243, 244, 0.0509803922)` |
| `--iplex-button-bg` | `#FFFFFF` |
| `--iplex-button-text` | `#0F0F0F` |
| `--iplex-font-family` | `"Google Sans", sans-serif` |
| `--iplex-radius` | `48px` |
| `--iplex-radius-full` | `9999px` |

**Garantias:**

- `npm test` confere os valores em [`tokens.css`](../src/design-system/tokens.css).
  Também falha se aparecer qualquer outra cor (hex, rgb ou hsl) ou um
  gradiente.
- O build Tizen falha se o CSS empacotado alterar algum token.
- A minificação de CSS está **desligada** (`cssMinify: false` em
  `vite.config.ts`). O minificador reescrevia
  `0.0509803922` → `0.05` e `#FFFFFF` → `#fff`.

**Tokens derivados (sem cores novas, exceto o relevo do logo — seção 2):**

- Tipografia: tamanhos `display/title/body/caption`, pesos 400/500/700 e
  altura de linha.
- Espaçamento: `--iplex-space-1…7`.
- Botão: padding, tamanho do texto e borda do secundário
  (`--iplex-button-border-width: 2px`).
- Raio pequeno: `--iplex-radius-small: 16px`, para elementos pequenos onde
  48px quebraria o layout.
- Foco: anel e vão.
- Ícone, tamanho do logo e área segura.

### Escala por plataforma

A plataforma é escolhida por `<html data-iplex-platform="tv">`. O shell
Tizen sempre define o atributo; a Web não define. As cores, a fonte e os
raios são os mesmos nas duas. Só a escala muda.

| | Web | TV (1920×1080) |
|---|---|---|
| Título (`display`) | 40px, peso 500 | **64px**, peso 500 |
| Subtítulo (`title`) | 28px | 44px |
| Texto (`body`) | 18px | **34px** |
| Legenda (`caption`) | 14px | 26px |
| Texto do botão | 16px, peso 500 | 24px, peso 500 |
| Padding do botão | 12px × 32px (≈43px de altura) | 18px × 48px (≈64px de altura) |
| Logo (`--iplex-logo-font-size`) | 44px | **78px** (letras com ~58px, como a arte com 72px) |
| Ícone | 24px | 40px |
| Anel de foco (vão + traço) | 4px + 3px | 6px + 4px |
| Área segura | 48px | 96px (5% de 1920, *overscan*) |

Os valores de TV em negrito foram medidos na referência visual em
1920×1080. O botão da referência (~425×96px) ficou grande demais nas telas
reais. Por decisão de design, ele foi reduzido para ~64px de altura na TV e
~43px na Web, com o mesmo formato de pílula.

## 2. Componentes

```tsx
import './design-system/index.css' // uma vez, no ponto de entrada da página
import { IplexButton, IplexCard, IplexContainer, IplexIcon, IplexLogo, IplexText } from './design-system'
import { Tv01Icon } from '@hugeicons/core-free-icons'

<IplexContainer as="main" safeArea fill>
  <IplexLogo />
  <IplexText variant="display">Não foi possível conectar</IplexText>
  <IplexText tone="secondary">Verifique sua conexão com a internet e tente novamente.</IplexText>
  <IplexButton onClick={retry}>Tentar novamente</IplexButton>
  <IplexCard interactive selected>
    <IplexIcon icon={Tv01Icon} />
    <IplexText variant="title" as="span">Ao vivo</IplexText>
  </IplexCard>
</IplexContainer>
```

| Componente | Classe base | Propriedades |
|---|---|---|
| `IplexButton` | `.iplex-button` + `.iplex-button-primary` ou `.iplex-button-secondary` | `variant` (`primary` padrão / `secondary`), `children: string` (**só texto**), `focused`, `disabled`, `paddingBlock`, `paddingInline` e os atributos de `<button>`. `type="button"` por padrão |
| `IplexCard` | `.iplex-card` | `interactive` (focável: `tabIndex=0`), `focused`, `selected`, `radius="small"`, `as` (`div`/`section`/`article`) |
| `IplexText` | `.iplex-text` | `variant` (`display`→`h1`, `title`→`h2`, `body`→`p`, `caption`→`span`), `tone` (`primary`/`secondary`), `as` |
| `IplexIcon` | `.iplex-icon` (no `<svg>`) | `icon` (de `@hugeicons/core-free-icons`), `label` (sem ele, `aria-hidden`) |
| `IplexContainer` | `.iplex-container` | `safeArea`, `fill`, `as` |
| `IplexLogo` | `.iplex-logo` + `.iplex-logo-text` | `label` (nome acessível, padrão "iPlex"). Tamanho pelo token `--iplex-logo-font-size` |

**Variantes do botão**, ambas pílulas só de texto, com a mesma altura e a
mesma largura do conteúdo:

| Variante | Visual | Uso |
|---|---|---|
| `primary` | Fundo `#FFFFFF`, texto `#0F0F0F`, sem borda | Ação principal ("Tentar novamente", "Assistir agora") |
| `secondary` | Sem preenchimento, contorno de 2px `#F1F1F1` e texto `#F1F1F1`. O padding desconta a borda, então a altura é igual à do primário. *Hover* (Web): fundo `--iplex-card-bg` | Ações alternativas ou de saída ("Sair", "Voltar", "Saiba mais") |

**Botões sem ícones.** `IplexButton` aceita somente `string` como
conteúdo. O TypeScript recusa elementos (há um teste com
`@ts-expect-error` que garante isso). A vitrine também confere no aparelho
que nenhum botão tem `<svg>`, `<img>` ou elementos filhos.

**Card:** fundo translúcido oficial, raio 48px, **sem sombra e sem borda**
por padrão. Os estados aparecem como anéis:

- seleção: anel `#B7B7B7`;
- foco: anel `#F1F1F1`.

**Logo em CSS (neumorfismo):** o logo é texto ("iPlex" em Google Sans 700)
com relevo feito em CSS. Ele reproduz a arte oficial (a mesma do ícone
`tizen/icon.png`): face escura, aro claro, contorno escuro e sombra. A versão em imagem foi
descartada porque ficava apagada e sem nitidez na TV. O texto em CSS é
vetorial (nítido em qualquer tamanho) e não pesa no pacote; o PNG tinha
405 KB.

- **Como é feito:**
  - Anéis de `text-shadow`, em 16 direções cada:
    - um anel na cor da face, que engrossa a letra, porque a Google Sans
      700 é mais fina que a arte;
    - um brilho no topo;
    - o aro claro;
    - o contorno escuro;
    - a sombra projetada.
  - Uma camada `::after` com gradiente recortado no texto
    (`-webkit-background-clip: text`) dá o brilho da face. Ela fica dentro
    de `@supports` e, se o motor não suportar o recorte, simplesmente não
    aparece.
- **Por que não `-webkit-text-stroke`:** os glifos da Google Sans têm
  contornos sobrepostos, e o traço desenha linhas internas (um retângulo
  dentro do "P", a barra do "e"). A sombra usa a silhueta preenchida e não
  tem esse problema. Um teste impede o uso do traço no logo.
- **Cores do relevo:** tokens `--iplex-logo-*`, derivados das oficiais.
  - Face: `#1D1D1D` (`#0F0F0F` + 6% de `#F1F1F1`).
  - Brilhos: `#F1F1F1` translúcido.
  - Contorno e sombra: preto, a única cor mais escura que o fundo, base de
    qualquer relevo.

  Esses tokens são uma exceção pedida para o logo: um teste garante que
  eles só aparecem na seção do logo. No resto do Design System continua
  valendo "só cores oficiais, sem gradiente".
- **Diferença em relação à arte:** as letras são da Google Sans, então o
  "e" e o "x" diferem um pouco do desenho original. A arte original
  continua sendo usada no ícone da loja (`tizen/icon.png`), que precisa ser
  imagem.

## 3. Foco e navegação

O foco nunca é invisível. O anel é um `box-shadow` duplo:

- um vão na cor do fundo (`#0F0F0F`);
- um traço claro (`#F1F1F1`).

Ele aparece tanto sobre o fundo escuro quanto sobre o botão branco.
Usamos `box-shadow` porque ele acompanha o raio 9999px em qualquer motor.
O `outline` só passou a acompanhar o raio no Chromium 94.

### TV (controle remoto)

- O foco vem de `:focus` (foco real do DOM) ou da classe `.is-focused`
  (prop `focused`), para quem controla a navegação por estado.
- Sem dependência de *hover*: o *hover* fica desligado quando
  `data-iplex-platform="tv"`.
- **Shell:** setas e OK pelo `ActionBar` (`src/navigation/`).
- **Vitrine:** navegação espacial (setas para o vizinho mais próximo na
  direção). OK aciona e Return encerra pela ponte.

### Web

- Tab e Enter são nativos. As setas também funcionam na vitrine.
- O *hover* só existe com ponteiro real (`@media (hover: hover)`). Ele usa
  apenas cores oficiais: o botão passa de `#FFFFFF` a `#F1F1F1`.
- Com o mouse, o anel some (`:focus:not(:focus-visible)`). Pelo teclado, o
  anel aparece.
  - Essa regra fica **isolada**: em motores sem `:focus-visible` ela é
    descartada inteira e o anel continua aparecendo.
  - O teste garante que nenhum seletor válido é misturado com
    `:focus-visible`.
- No alto contraste do sistema (`forced-colors`), o foco vira `outline`.
- Os estados ativo (escala 0,97) e desabilitado (opacidade 0,4,
  `cursor: not-allowed`) são iguais nas duas plataformas.

## 4. Compatibilidade (Tizen 4.0 / Chromium M56 em diante)

- Usa apenas recursos do M56:
  - custom properties (M49);
  - `width: fit-content` (sem prefixo desde o M46; o CSS-fonte também
    declara `-webkit-fit-content`);
  - flex sem prefixo;
  - `box-shadow`, `calc()`;
  - `@font-face` com woff2 e woff.
- Não usa:
  - `gap` em flexbox (M84): o espaçamento é por margens;
  - `inset` (M87);
  - `aspect-ratio` (M88);
  - `:focus-visible` (M86), exceto isolado, como refinamento.

  O teste `designSystem.test.ts` verifica os três primeiros e o isolamento
  de `:focus-visible`.
- O bundle de TV é ES2017 válido. A análise foi feita com `acorn`, em modo
  ES2017, sobre `dist-tizen/widget/assets/*.js`.
- **Desempenho em 1920×1080:**
  - sem bibliotecas de UI;
  - o CSS do Design System tem ~13 KB sem minificar;
  - fontes: 3 pesos de ~22 KB cada (woff2), só o subconjunto latin;
  - os ícones entram no bundle só quando usados (o shell de produção não
    usa ícones).

## 5. Fonte: Google Sans

| Item | Situação |
|---|---|
| Licença | **SIL Open Font License 1.1** (`google/fonts`, pasta `ofl/googlesans`). Pode ser embutida e redistribuída no app, inclusive comercial |
| Origem | Pacote npm `@fontsource/google-sans` 5.3.2 (OFL-1.1), que reempacota os arquivos do Google Fonts. Nada foi baixado de fonte não autorizada |
| Arquivos | Subconjunto **latin** (cobre o português), pesos estáticos **400, 500 e 700**. Fontes variáveis exigem Chromium 62+, e as TVs de 2018 têm o M56 |
| Licença no pacote | O build copia o texto da OFL para `licenses/google-sans-OFL.txt` no widget. Os arquivos de fonte trazem só o copyright e o link da licença |
| Marca | "Google Sans" é marca do Google. Não use o nome no nome do produto nem sugira afiliação ao Google. O uso da fonte é livre |
| Verificado na TV | Os pesos 400, 500 e 700 carregam (`document.fonts`) no Tizen 5.5 |

Não foi preciso propor substituta. Se um dia for, as alternativas
geométricas mais próximas e também OFL são **Outfit** e **Figtree**.
Product Sans não serve: não é livre. A troca exige aprovação antes.

## 6. Ícones: Hugeicons Stroke Rounded

- Pacotes:
  - `@hugeicons/react` 1.1.10 (componente `HugeiconsIcon`);
  - `@hugeicons/core-free-icons` 4.3.5 (dados dos ícones).

  Ambos com **licença MIT**.
- O conjunto gratuito é o **Stroke Rounded**, o único permitido. Os outros
  estilos (Solid, Duotone…) são pagos e não estão instalados.
- Traço 1.5 (no viewBox 24) com cantos arredondados. O traço escala com o
  ícone.
- Use ícones em cards, listas e indicadores. **Nunca dentro de botões.**
- O runtime do `HugeiconsIcon` não usa APIs posteriores ao M56. O build
  converte a sintaxe para ES2017.

## 7. Telas do shell (T1–T9)

As telas técnicas do shell usam o Design System e o layout da referência.
As imagens estão em [MAPA-DE-TELAS.md](MAPA-DE-TELAS.md).

- **O que mudou (só apresentação):**
  - fundo;
  - logo em CSS com relevo neumórfico, centralizado, no lugar da marca
    tipográfica;
  - tipografia Google Sans;
  - botões `IplexButton`: "Tentar novamente" e "Abrir novamente" como
    primários, "Sair" como secundário;
  - cores oficiais. O título de erro em vermelho, o foco azul e os
    gradientes foram removidos.
- **O que não mudou:**
  - estados e textos;
  - códigos de erro;
  - ações (Tentar novamente / Sair / Abrir novamente);
  - teclas;
  - ponte, player, Hosting e assinatura.

A página de teste (`index.html`, só desenvolvimento) usa a mesma base, mas
mantém as cores de diagnóstico próprias (ok/erro), definidas só nela.

## 8. Vitrine e validação

```bash
npm run dev
```

Abra `http://localhost:5173/design-system.html`. Para ver a escala de TV
no navegador, acrescente `?platform=tv`.

```bash
npm run tv -- --page design-system.html
```

Instala na TV e roda as verificações no aparelho.

A vitrine mostra:

- os 6 botões primários de exemplo, 3 secundários e um desabilitado de
  cada variante;
- cards (interativos, selecionado e estático);
- tipografia e cores;
- ícones.

Ela também roda **11 verificações no motor real** e envia o resultado ao
Mac (`npm run tv`). A vitrine só entra no pacote de desenvolvimento.
`release:tizen` recusa um pacote que contenha `design-system.html`.

**Resultado na TV** (Samsung UN65TU7020, Tizen 5.5, Chromium 69): **12/12
ok** (11 verificações e o handshake).

| Verificação | Resultado no aparelho |
|---|---|
| Tokens oficiais | 9/9. O motor relê o alfa como `0.0509804` (serialização com 6 dígitos); o arquivo tem o valor exato |
| Fundo | `rgb(15, 15, 15)` |
| `fit-content` | Nativo. Cada botão tem a largura do texto + padding (11 botões, de 137px a 241px) |
| Botão primário | `#FFFFFF` / `#0F0F0F`, raio 9999px, borda 0 |
| Botão secundário | Fundo transparente, texto e borda de 2px `#F1F1F1`, altura 64/64px (igual ao primário) |
| Só texto | 11 botões, 0 ícones, 0 elementos filhos |
| Card | `rgba(241, 243, 244, 0.05…)`, raio 48px, sem sombra |
| Google Sans | 400, 500 e 700 carregados |
| Foco | Por estado e foco real: `rgb(15,15,15) 0 0 0 6px, rgb(241,241,241) 0 0 0 10px` |
| Ícones | 10 ícones, traço 1.5, 40px |
| Logo em CSS | 50 sombras de texto, brilho da face ativo (`-webkit-background-clip: text`), Google Sans 700 carregada, 78px (161×78px) |

**No navegador (Web, Chrome):**

- 11/11 verificações;
- teclado e mouse reais: o clique aciona sem anel; o Tab mostra o anel; a
  seta move o foco para o vizinho; o Enter aciona.

**Shell de produção:** com as telas novas, foi instalado na TV e exibiu a
T5 ("iPlex indisponível", porque o Web ainda não está publicado). Ao fim
da validação, a TV ficou com esse shell de produção.

## 9. Limitações e pendências

- **Navegação pelo controle na vitrine:** o código foi testado
  (navegação espacial com testes unitários) e o foco foi verificado no
  aparelho. Falta a validação com o controle físico na mão (`--watch`).
- **Telas T1–T9 na TV:** a T5 apareceu no aparelho. As demais foram
  conferidas no navegador em 1920×1080 (mesmo CSS).
- **Distribuição ao iPlex Web:** decidir entre copiar a pasta ou publicar
  um pacote privado.
- **Logo em CSS:** depende da Google Sans 700. Até a fonte carregar
  (`font-display: swap`; no app, as fontes são locais), o relevo aparece na
  fonte de reserva. Para um logo idêntico à arte, com o "e" e o "x"
  originais, seria preciso o vetor (SVG) da arte; aí o relevo pode ser
  aplicado a ele.
- **Avisos de terceiros:** React e Hugeicons são MIT. O Hugeicons não entra
  no pacote de produção. Para a loja, convém um arquivo de avisos de
  terceiros cobrindo o React, como já é feito para a Google Sans.
