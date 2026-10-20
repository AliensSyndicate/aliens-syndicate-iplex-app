/**
 * Verificações do Design System no motor real (navegador ou TV): tokens
 * computados, fit-content, raios, fonte carregada, foco visível e ícones.
 */

export interface CheckResult {
  id: string
  label: string
  ok: boolean
  detail: string
}

const OFFICIAL_TOKENS: Record<string, string> = {
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

const FONT_WEIGHTS = [400, 500, 700]

/** O elemento casa com :focus-visible? Motores sem o seletor (M56–M85) lançam erro: aí o anel deve aparecer. */
function focusVisibleSays(element: Element, expected: boolean): boolean {
  try {
    return element.matches(':focus-visible') === expected
  } catch {
    return false
  }
}

const compact = (value: string) => value.replace(/\s+/g, '').toLowerCase()

/**
 * Compara um token lido do motor com o oficial. Motores antigos (Chromium 69)
 * reescrevem números ao ler custom properties (0.0509803922 → 0.0509804):
 * mesma estrutura e números iguais até 1e-6 contam como o mesmo valor.
 */
export function sameToken(actual: string, official: string): boolean {
  if (compact(actual) === compact(official)) return true
  const numbers = /-?\d*\.?\d+/g
  const skeleton = (value: string) => compact(value).replace(numbers, '#')
  if (skeleton(actual) !== skeleton(official)) return false
  const a = compact(actual).match(numbers) ?? []
  const b = compact(official).match(numbers) ?? []
  return a.length === b.length && a.every((value, index) => Math.abs(Number(value) - Number(b[index])) <= 1e-6)
}

function supports(property: string, value: string): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(property, value)
}

async function fontLoaded(weight: number): Promise<boolean> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!fonts) return false
  const descriptor = `${weight} 16px "Google Sans"`
  const faces = await fonts.load(descriptor)
  return faces.length > 0 && fonts.check(descriptor)
}

export async function runDesignSystemChecks(root: HTMLElement): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const add = (id: string, label: string, ok: boolean, detail: string) => results.push({ id, label, ok, detail })

  const rootStyle = getComputedStyle(document.documentElement)
  const names = Object.keys(OFFICIAL_TOKENS)
  const read = (name: string) => rootStyle.getPropertyValue(name).trim()
  const wrongTokens = names.filter((name) => !sameToken(read(name), OFFICIAL_TOKENS[name]))
  const reserialized = names.filter((name) => !wrongTokens.includes(name) && compact(read(name)) !== compact(OFFICIAL_TOKENS[name]))
  add(
    'tokens',
    'Tokens oficiais',
    wrongTokens.length === 0,
    wrongTokens.length === 0
      ? `${names.length} tokens com os valores oficiais` +
          (reserialized.length ? ` (o motor reescreve ao ler: ${reserialized.map((name) => `${name}=${read(name)}`).join(', ')})` : '')
      : `divergentes: ${wrongTokens.map((name) => `${name}=${read(name)}`).join(', ')}`,
  )

  const background = getComputedStyle(root).backgroundColor
  add('background', 'Fundo #0F0F0F', background === 'rgb(15, 15, 15)', background)

  const buttons = Array.prototype.slice.call(root.querySelectorAll('.iplex-button')) as HTMLElement[]
  const fitContent = supports('width', 'fit-content') || supports('width', '-webkit-fit-content')
  const widths = buttons.map((button) => Math.round(button.getBoundingClientRect().width))
  // Largura do conteúdo: texto + padding + borda (independe do tamanho da tela).
  const contentWidth = (button: HTMLElement) => {
    const range = document.createRange()
    range.selectNodeContents(button)
    const style = getComputedStyle(button)
    const box = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'] as const
    return range.getBoundingClientRect().width + box.reduce((sum, side) => sum + parseFloat(style[side]), 0)
  }
  const contentSized = buttons.length > 1 && buttons.every((button) => Math.abs(button.getBoundingClientRect().width - contentWidth(button)) <= 2)
  add(
    'fit-content',
    'Botão com largura do conteúdo',
    fitContent && contentSized,
    `fit-content ${supports('width', 'fit-content') ? 'nativo' : supports('width', '-webkit-fit-content') ? 'com prefixo -webkit-' : 'sem suporte'} · larguras ${widths.join('/')} px`,
  )

  const buttonStyle = buttons[0] ? getComputedStyle(buttons[0]) : null
  add(
    'button-style',
    'Botão: cores, raio total e sem borda',
    !!buttonStyle &&
      buttonStyle.backgroundColor === 'rgb(255, 255, 255)' &&
      buttonStyle.color === 'rgb(15, 15, 15)' &&
      buttonStyle.borderTopLeftRadius === '9999px' &&
      buttonStyle.borderTopWidth === '0px',
    buttonStyle
      ? `${buttonStyle.backgroundColor} · ${buttonStyle.color} · raio ${buttonStyle.borderTopLeftRadius} · borda ${buttonStyle.borderTopWidth}`
      : 'sem botões',
  )

  const secondary = root.querySelector('.iplex-button-secondary') as HTMLElement | null
  const secondaryStyle = secondary ? getComputedStyle(secondary) : null
  const heightOf = (element: HTMLElement | null | undefined) => (element ? Math.round(element.getBoundingClientRect().height) : 0)
  add(
    'button-secondary',
    'Botão secundário: contorno claro, sem preenchimento, mesma altura',
    !!secondaryStyle &&
      secondaryStyle.backgroundColor === 'rgba(0, 0, 0, 0)' &&
      secondaryStyle.color === 'rgb(241, 241, 241)' &&
      secondaryStyle.borderTopColor === 'rgb(241, 241, 241)' &&
      secondaryStyle.borderTopStyle === 'solid' &&
      secondaryStyle.borderTopLeftRadius === '9999px' &&
      Math.abs(heightOf(secondary) - heightOf(buttons[0])) <= 1,
    secondaryStyle
      ? `fundo ${secondaryStyle.backgroundColor} · texto ${secondaryStyle.color} · borda ${secondaryStyle.borderTopWidth} ${secondaryStyle.borderTopColor} · altura ${heightOf(secondary)}/${heightOf(buttons[0])} px`
      : 'sem botão secundário',
  )

  const iconsInButtons = root.querySelectorAll('.iplex-button svg, .iplex-button img, .iplex-button .iplex-icon').length
  const nonText = buttons.filter((button) => button.children.length > 0).length
  add('button-text-only', 'Botões somente com texto', iconsInButtons === 0 && nonText === 0, `${buttons.length} botões, ${iconsInButtons} ícones, ${nonText} com elementos filhos`)

  // Card em repouso (sem seleção nem foco): o anel só aparece nesses estados.
  const card = root.querySelector('.iplex-card:not(.is-selected):not(.is-focused):not(:focus)') as HTMLElement | null
  const cardStyle = card ? getComputedStyle(card) : null
  add(
    'card',
    'Card: fundo translúcido e raio 48px, sem sombra',
    !!cardStyle &&
      /^rgba\(241, 243, 244, 0\.05\d*\)$/.test(cardStyle.backgroundColor) &&
      cardStyle.borderTopLeftRadius === '48px' &&
      cardStyle.boxShadow === 'none',
    cardStyle ? `${cardStyle.backgroundColor} · raio ${cardStyle.borderTopLeftRadius} · sombra ${cardStyle.boxShadow}` : 'sem cards',
  )

  const loaded = await Promise.all(FONT_WEIGHTS.map((weight) => fontLoaded(weight).catch(() => false)))
  const family = buttonStyle?.fontFamily ?? ''
  add(
    'font',
    'Google Sans carregada',
    loaded.every(Boolean) && /Google Sans/.test(family),
    `${FONT_WEIGHTS.map((weight, index) => `${weight} ${loaded[index] ? 'ok' : 'falhou'}`).join(' · ')} · font-family ${family}`,
  )

  const target = buttons[0]
  if (target) {
    const previous = document.activeElement as HTMLElement | null
    // Mede o estilo final, sem depender da transição do anel (em aba de fundo ela não avança).
    target.style.transition = 'none'
    const hasRing = (shadow: string) => shadow.indexOf('rgb(241, 241, 241)') !== -1 && shadow.indexOf('rgb(15, 15, 15)') !== -1

    // Foco controlado por estado (prop focused → .is-focused), usado pela navegação da TV.
    target.classList.add('is-focused')
    const stateRing = getComputedStyle(target).boxShadow
    target.classList.remove('is-focused')

    // Foco real do DOM. Na Web, o anel some quando o navegador decide que o
    // foco não veio do teclado (:focus-visible); na TV, ele sempre aparece.
    target.focus()
    const domRing = getComputedStyle(target).boxShadow
    const isTv = document.documentElement.getAttribute('data-iplex-platform') === 'tv'
    const hiddenByFocusVisible = !isTv && focusVisibleSays(target, false)
    add(
      'focus',
      'Foco visível (anel claro com vão escuro)',
      hasRing(stateRing) && document.activeElement === target && (hasRing(domRing) || hiddenByFocusVisible),
      `estado: ${stateRing} · foco ${isTv ? '(TV)' : '(Web)'}: ${hasRing(domRing) ? 'anel visível' : hiddenByFocusVisible ? 'sem anel (foco sem teclado, :focus-visible)' : domRing}`,
    )
    target.style.transition = ''
    previous?.focus()
  }

  const icons = Array.prototype.slice.call(root.querySelectorAll('svg.iplex-icon')) as SVGElement[]
  const strokes = icons.map((icon) => icon.querySelector('[stroke-width]')?.getAttribute('stroke-width'))
  add(
    'icons',
    'Ícones Hugeicons Stroke Rounded',
    icons.length > 0 && strokes.every((stroke) => stroke === '1.5'),
    `${icons.length} ícones · traço ${Array.from(new Set(strokes)).join('/')} · ${icons[0] ? Math.round(icons[0].getBoundingClientRect().width) : 0} px`,
  )

  const logo = root.querySelector('.iplex-logo-text') as HTMLElement | null
  const logoStyle = logo ? getComputedStyle(logo) : null
  const sheen = supports('-webkit-background-clip', 'text')
  const logoFont = loaded[FONT_WEIGHTS.indexOf(700)]
  add(
    'logo',
    'Logo em CSS (branco, sem relevo)',
    !!logoStyle &&
      logoStyle.color === 'rgb(255, 255, 255)' &&
      logoStyle.textShadow === 'none' &&
      sheen &&
      logoFont &&
      /Google Sans/.test(logoStyle.fontFamily) &&
      logoStyle.fontWeight === '700',
    logoStyle
      ? `cor ${logoStyle.color} · sombra ${logoStyle.textShadow} · brilho ${sheen ? 'ok' : 'sem -webkit-background-clip: text'} · Google Sans ${logoStyle.fontWeight} ${logoFont ? 'carregada' : 'não carregada'} · ${logoStyle.fontSize} · ${Math.round(logo!.getBoundingClientRect().width)}x${Math.round(logo!.getBoundingClientRect().height)} px`
      : 'ausente',
  )

  return results
}
