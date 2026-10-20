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

**Tokens derivados (sem cores novas):**

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

**Logo em CSS:** o logo é texto ("iPlex" em Google Sans 700), **branco
(`#FFFFFF`) e sem relevo**. Esta é a versão definitiva. A arte em imagem
ficava apagada e sem nitidez na TV, e um relevo neumórfico em CSS foi
testado e descartado. O texto em CSS é vetorial, nítido em qualquer
tamanho, e não pesa no pacote.

- **Sem efeitos (20/10/2026):** o brilho vertical (`::after` com gradiente
  recortado) foi removido. Pelo Design System do iPlex, o logo é branco
  sólido, sem brilho, reflexo, relevo, contorno ou sombra — idêntico ao do
  iPlex Web. Um teste impede a volta de gradiente, recorte ou `::after`.
- **Cor:** token `--iplex-logo-color: #FFFFFF` (o branco oficial).
- **Distribuição ao iPlex Web:** decidir entre copiar a pasta ou publicar
  um pacote privado.
- **Fonte sem troca visual:** `src/design-system/fonts.css` declara a Google
  Sans com `font-display: block` (antes: `swap` do CSS do @fontsource, que
  mostrava a fonte de reserva por um instante). Os arquivos são locais no
  widget, então o bloqueio dura só a leitura do disco.
- **Avisos de terceiros:** React e Hugeicons são MIT. O Hugeicons não entra
  no pacote de produção. Para a loja, convém um arquivo de avisos de
  terceiros cobrindo o React, como já é feito para a Google Sans.
