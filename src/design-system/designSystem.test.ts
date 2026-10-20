import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayIcon } from '@hugeicons/core-free-icons'
import { describe, expect, it } from 'vitest'
import tokens from './tokens.css?raw'
import components from './components.css?raw'
import { IplexButton, IplexCard, IplexContainer, IplexIcon, IplexLogo, IplexText } from './index'

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')

/** Seção do logo (relevo neumórfico autorizado só para ele), delimitada por comentários. */
const LOGO_SECTION = /\/\* ---- Logo[\s\S]*?\/\* ---- fim do logo[^*]*\*\//g
const logoSections = (source: string) => source.match(LOGO_SECTION) ?? []
const withoutLogo = (source: string) => source.replace(LOGO_SECTION, '')

describe('tokens oficiais', () => {
  it('mantém os valores oficiais exatos', () => {
    const official: Record<string, string> = {
      '--iplex-bg': '#0F0F0F',
      '--iplex-text-primary': '#F1F1F1',
      '--iplex-text-secondary': '#B7B7B7',
      '--iplex-card-bg': 'rgba(241, 243, 244, 0.0509803922)',
      '--iplex-button-bg': '#FFFFFF',
      '--iplex-button-text': '#0F0F0F',
      '--iplex-font-family': '"Google Sans", sans-serif',
      '--iplex-radius': '48px',
      '--iplex-radius-full': '9999px',
    }
    for (const [name, value] of Object.entries(official)) {
      expect(tokens).toContain(`${name}: ${value};`)
    }
  })

  it('não define cores além das oficiais (sem destaque nem gradiente), fora do logo', () => {
    const allowed = ['#0F0F0F', '#F1F1F1', '#B7B7B7', '#FFFFFF', 'rgba(241, 243, 244, 0.0509803922)']
    for (const source of [tokens, components].map(withoutLogo).map(withoutComments)) {
      const colors = source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) ?? []
      for (const color of colors) expect(allowed).toContain(color)
      expect(source).not.toMatch(/gradient\(/)
    }
  })

  it('a TV muda só a escala, nunca as cores, a fonte ou os raios', () => {
    const tv = tokens.slice(tokens.indexOf("[data-iplex-platform='tv']"))
    expect(tv).not.toMatch(/--iplex-(bg|text-primary|text-secondary|card-bg|button-bg|button-text|font-family|radius|radius-full):/)
  })
})

describe('logo em CSS (neumorfismo)', () => {
  it('as cores do relevo são tokens --iplex-logo-* usados só na seção do logo', () => {
    expect(logoSections(tokens)).toHaveLength(1)
    expect(logoSections(components)).toHaveLength(1)
    for (const source of [tokens, components].map(withoutLogo)) expect(source).not.toMatch(/--iplex-logo-(?!font-size)/)
  })

  it('relevo com anéis de text-shadow, sem -webkit-text-stroke (desenha os contornos internos da Google Sans)', () => {
    const [logo = ''] = logoSections(components)
    expect(logo).toMatch(/text-shadow:/)
    // 3 anéis de 16 sombras (face, aro, contorno) + a cor da face.
    expect((withoutComments(logo).match(/var\(--iplex-logo-(face|rim|outline)\)/g) ?? []).length).toBe(49)
    expect(logo).not.toMatch(/text-stroke\s*:/)
    expect(logo).toMatch(/@supports \(-webkit-background-clip: text\)/)
  })
})

describe('compatibilidade com o Chromium M56 (Tizen 4.0)', () => {
  const source = withoutComments(components + tokens)

  it('não usa propriedades indisponíveis no M56', () => {
    expect(source).not.toMatch(/(^|[;{\s])gap\s*:/)
    expect(source).not.toMatch(/(^|[;{\s])inset\s*:/)
    expect(source).not.toMatch(/aspect-ratio/)
  })

  it('isola :focus-visible em regras próprias (seletor desconhecido descarta a regra inteira)', () => {
    const rules = source.match(/[^{}]+\{/g) ?? []
    for (const rule of rules.filter((selector) => selector.includes(':focus-visible'))) {
      for (const selector of rule.replace('{', '').split(',')) expect(selector).toContain(':focus-visible')
    }
  })

  it('botão usa fit-content com prefixo -webkit- e raio total', () => {
    const button = source.slice(source.indexOf('.iplex-button {'), source.indexOf('}', source.indexOf('.iplex-button {')))
    expect(button).toMatch(/width: -webkit-fit-content;\s*width: fit-content;/)
    expect(button).toContain('border-radius: var(--iplex-radius-full)')
    expect(button).toContain('cursor: pointer')
    expect(button).toContain('border: none')
  })

  it('secundário: sem preenchimento, contorno e texto claros, padding descontando a borda', () => {
    const start = source.indexOf('.iplex-button-secondary {')
    const secondary = source.slice(start, source.indexOf('}', start))
    expect(secondary).toContain('background-color: transparent')
    expect(secondary).toContain('border: var(--iplex-button-border-width) solid var(--iplex-text-primary)')
    expect(secondary).toContain('color: var(--iplex-text-primary)')
    expect(secondary).toMatch(/calc\(var\(--iplex-button-padding-block\) - var\(--iplex-button-border-width\)\)/)
  })

  it('card usa o fundo e o raio oficiais, sem sombra nem borda por padrão', () => {
    const card = source.slice(source.indexOf('.iplex-card {'), source.indexOf('}', source.indexOf('.iplex-card {')))
    expect(card).toContain('background-color: var(--iplex-card-bg)')
    expect(card).toContain('border-radius: var(--iplex-radius)')
    expect(card).toContain('box-shadow: none')
    expect(card).toContain('border: none')
  })
})

describe('IplexButton', () => {
  it('renderiza somente o texto, sem ícones', () => {
    const html = renderToStaticMarkup(createElement(IplexButton, { children: 'Assistir agora' }))
    expect(html).toBe('<button type="button" class="iplex-button iplex-button-primary">Assistir agora</button>')
    expect(html).not.toMatch(/<svg|<img|<i\b/)
  })

  it('aceita apenas texto como conteúdo (verificado pelo TypeScript)', () => {
    // @ts-expect-error -- botões não aceitam elementos (ícones, setas)
    const html = renderToStaticMarkup(createElement(IplexButton, { children: createElement('svg') }))
    expect(html).toContain('<svg')
  })

  it('marca o foco do controle remoto e aplica padding por instância', () => {
    const html = renderToStaticMarkup(
      createElement(IplexButton, { children: 'Continuar', focused: true, paddingBlock: 20, paddingInline: '3vw' }),
    )
    expect(html).toContain('class="iplex-button iplex-button-primary is-focused"')
    expect(html).toContain('--iplex-button-padding-block:20px')
    expect(html).toContain('--iplex-button-padding-inline:3vw')
  })

  it('secundário: mesma base, só texto', () => {
    const html = renderToStaticMarkup(createElement(IplexButton, { children: 'Sair', variant: 'secondary' }))
    expect(html).toBe('<button type="button" class="iplex-button iplex-button-secondary">Sair</button>')
  })

  it('desabilitado usa o atributo nativo', () => {
    const html = renderToStaticMarkup(createElement(IplexButton, { children: 'Entrar', disabled: true }))
    expect(html).toContain('disabled=""')
  })
})

describe('IplexCard', () => {
  it('estático: sem tabindex', () => {
    expect(renderToStaticMarkup(createElement(IplexCard, null, 'x'))).toBe('<div class="iplex-card">x</div>')
  })

  it('interativo: focável, com estados de foco e seleção', () => {
    const html = renderToStaticMarkup(createElement(IplexCard, { interactive: true, focused: true, selected: true }))
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('class="iplex-card iplex-card--interactive is-focused is-selected"')
  })

  it('raio pequeno para elementos pequenos', () => {
    expect(renderToStaticMarkup(createElement(IplexCard, { radius: 'small' }))).toContain('iplex-card--radius-small')
  })
})

describe('IplexText, IplexContainer, IplexIcon e IplexLogo', () => {
  it('texto escolhe o elemento pela variante e usa só os tons oficiais', () => {
    expect(renderToStaticMarkup(createElement(IplexText, { variant: 'display' }, 'iPlex'))).toBe(
      '<h1 class="iplex-text iplex-text--display iplex-text--primary">iPlex</h1>',
    )
    expect(renderToStaticMarkup(createElement(IplexText, { tone: 'secondary', as: 'span' }, 'x'))).toBe(
      '<span class="iplex-text iplex-text--body iplex-text--secondary">x</span>',
    )
  })

  it('container com área segura', () => {
    expect(renderToStaticMarkup(createElement(IplexContainer, { as: 'main', safeArea: true, fill: true }))).toBe(
      '<main class="iplex-container iplex-container--safe-area iplex-container--fill"></main>',
    )
  })

  it('ícone decorativo fica oculto para leitores de tela; com rótulo vira imagem', () => {
    const decorative = renderToStaticMarkup(createElement(IplexIcon, { icon: PlayIcon }))
    expect(decorative).toContain('class="iplex-icon"')
    expect(decorative).toContain('aria-hidden="true"')
    expect(decorative).toContain('stroke-width="1.5"')
    expect(decorative).toContain('stroke-linejoin="round"')

    const labelled = renderToStaticMarkup(createElement(IplexIcon, { icon: PlayIcon, label: 'Reproduzir' }))
    expect(labelled).toContain('role="img"')
    expect(labelled).toContain('aria-label="Reproduzir"')
    expect(labelled).not.toContain('aria-hidden')
  })

  it('logo em texto com rótulo acessível', () => {
    expect(renderToStaticMarkup(createElement(IplexLogo))).toBe(
      '<span class="iplex-logo" role="img" aria-label="iPlex"><span class="iplex-logo-text" data-text="iPlex" aria-hidden="true">iPlex</span></span>',
    )
  })
})
