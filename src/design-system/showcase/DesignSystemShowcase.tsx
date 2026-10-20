import { useEffect, useRef, useState } from 'react'
import { Home01Icon, PlayIcon, Search01Icon, Settings01Icon, Tv01Icon, UserIcon, Wifi01Icon } from '@hugeicons/core-free-icons'
import { reportDevEvent } from '../../devtools/devReport'
import { toRemoteAction } from '../../navigation/remoteKeys'
import { IplexButton, IplexCard, IplexContainer, IplexIcon, IplexLogo, IplexText } from '../index'
import { bridge } from './bridge'
import { runDesignSystemChecks, type CheckResult } from './checks'
import { nextInDirection, type Direction } from './spatialNavigation'

/**
 * Vitrine do Design System V1 (somente desenvolvimento): componentes, tokens
 * e verificações no motor real. Na TV, abre dentro do shell (npm run tv --
 * --page design-system.html) e navega com setas + OK; Return encerra.
 */

const BUTTON_LABELS = ['Assistir agora', 'Continuar', 'Entrar', 'Conectar', 'Voltar', 'Confirmar']
const SECONDARY_LABELS = ['Saiba mais', 'Voltar', 'Sair']

const SWATCHES = [
  ['--iplex-bg', '#0F0F0F'],
  ['--iplex-text-primary', '#F1F1F1'],
  ['--iplex-text-secondary', '#B7B7B7'],
  ['--iplex-card-bg', 'rgba(241, 243, 244, 0.0509803922)'],
  ['--iplex-button-bg', '#FFFFFF'],
  ['--iplex-button-text', '#0F0F0F'],
]

const CARDS = [
  { icon: Tv01Icon, title: 'Ao vivo', caption: 'Canais' },
  { icon: PlayIcon, title: 'Filmes', caption: 'Catálogo' },
  { icon: UserIcon, title: 'Perfil', caption: 'Conta' },
]

const ICONS = [
  { icon: Home01Icon, name: 'Home01' },
  { icon: Search01Icon, name: 'Search01' },
  { icon: Tv01Icon, name: 'Tv01' },
  { icon: PlayIcon, name: 'Play' },
  { icon: UserIcon, name: 'User' },
  { icon: Settings01Icon, name: 'Settings01' },
  { icon: Wifi01Icon, name: 'Wifi01' },
]

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.prototype.slice.call(root.querySelectorAll('[data-nav]:not(:disabled)')) as HTMLElement[]
}

export function DesignSystemShowcase({ platform }: { platform: 'tv' | 'web' }) {
  const rootRef = useRef<HTMLElement>(null)
  const [selectedCard, setSelectedCard] = useState(0)
  const [lastAction, setLastAction] = useState('nenhuma')
  const [checks, setChecks] = useState<CheckResult[] | null>(null)

  // Verificações no motor real; resultado também vai para o Mac (npm run tv).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let cancelled = false
    void runDesignSystemChecks(root).then((results) => {
      if (cancelled) return
      setChecks(results)
      for (const result of results) {
        reportDevEvent(result.ok ? `test:${result.id}` : 'test:error', `${result.ok ? 'ok' : 'error'} ${result.label}: ${result.detail}`)
      }
      const failed = results.filter((result) => !result.ok).length
      reportDevEvent('test:done', `design system: ${results.length - failed}/${results.length} verificações ok; navegação pelo controle ativa`)
      focusables(root)[0]?.focus()
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Controle remoto (e setas do teclado na Web): navegação espacial + OK.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const move = (direction: Direction) => {
      const items = focusables(root)
      const current = document.activeElement as HTMLElement | null
      if (!current || items.indexOf(current) === -1) {
        items[0]?.focus()
        return
      }
      const boxes = items.map((item) => item.getBoundingClientRect())
      const next = nextInDirection(current.getBoundingClientRect(), boxes, direction)
      if (next !== -1) {
        items[next].focus()
        reportDevEvent('remote', `${direction} → ${items[next].getAttribute('data-nav')}`)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = toRemoteAction(event)
      if (!action) return
      if (action === 'back') {
        if (!bridge.available) return
        event.preventDefault()
        reportDevEvent('test:exit', 'Return → app.exit')
        void bridge.call('app.exit').catch(() => undefined)
        return
      }
      if (action === 'enter') {
        const current = document.activeElement as HTMLElement | null
        if (current && current.hasAttribute('data-nav') && current.tagName !== 'BUTTON') {
          event.preventDefault()
          current.click()
        }
        return
      }
      event.preventDefault()
      move(action)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const activate = (label: string) => {
    setLastAction(label)
    reportDevEvent('remote', `OK → ${label}`)
  }

  return (
    <IplexContainer as="main" safeArea fill className="ds-showcase" ref={rootRef}>
      <header className="ds-header">
        <IplexLogo />
        <div className="ds-header-text">
          <IplexText variant="title" as="h1">
            Design System V1
          </IplexText>
          <IplexText variant="caption" tone="secondary">
            {platform === 'tv' ? 'TV · setas + OK · Return encerra' : 'Web · mouse, Tab/Enter ou setas'}
          </IplexText>
        </div>
      </header>

      <section className="ds-section">
        <IplexText variant="caption" tone="secondary" as="h2" className="ds-section-title">
          Botões primário e secundário (somente texto)
        </IplexText>
        <div className="ds-row">
          {BUTTON_LABELS.map((label) => (
            <IplexButton key={label} data-nav={`botão ${label}`} className="ds-row-item" onClick={() => activate(label)}>
              {label}
            </IplexButton>
          ))}
          <IplexButton disabled className="ds-row-item">
            Indisponível
          </IplexButton>
        </div>
        <div className="ds-row ds-row-secondary">
          {SECONDARY_LABELS.map((label) => (
            <IplexButton
              key={label}
              variant="secondary"
              data-nav={`botão secundário ${label}`}
              className="ds-row-item"
              onClick={() => activate(label)}
            >
              {label}
            </IplexButton>
          ))}
          <IplexButton variant="secondary" disabled className="ds-row-item">
            Indisponível
          </IplexButton>
        </div>
        <IplexText tone="secondary" className="ds-status" aria-live="polite">
          Última ação: {lastAction}
        </IplexText>
      </section>

      <section className="ds-section">
        <IplexText variant="caption" tone="secondary" as="h2" className="ds-section-title">
          Cards
        </IplexText>
        <div className="ds-row">
          {CARDS.map((card, index) => (
            <IplexCard
              key={card.title}
              interactive
              selected={selectedCard === index}
              data-nav={`card ${card.title}`}
              role="button"
              aria-pressed={selectedCard === index}
              className="ds-card ds-row-item"
              onClick={() => {
                setSelectedCard(index)
                activate(`card ${card.title}`)
              }}
            >
              <IplexIcon icon={card.icon} />
              <IplexText variant="title" as="span" className="ds-card-title">
                {card.title}
              </IplexText>
              <IplexText variant="caption" tone="secondary">
                {card.caption}
              </IplexText>
            </IplexCard>
          ))}
          <IplexCard className="ds-card ds-row-item">
            <IplexText variant="body">Card estático</IplexText>
            <IplexText variant="caption" tone="secondary">
              Sem foco, sem sombra, sem borda
            </IplexText>
          </IplexCard>
        </div>
      </section>

      <section className="ds-section">
        <IplexText variant="caption" tone="secondary" as="h2" className="ds-section-title">
          Tipografia (Google Sans) e cores oficiais
        </IplexText>
        <IplexText variant="display">iPlex</IplexText>
        <IplexText variant="title">Título · peso 500</IplexText>
        <IplexText>Texto principal · peso 400</IplexText>
        <IplexText tone="secondary">Texto secundário</IplexText>
        <div className="ds-row ds-swatches">
          {SWATCHES.map(([name, value]) => (
            <div key={name} className="ds-swatch ds-row-item">
              <span className="ds-swatch-color" style={{ backgroundColor: `var(${name})` }} />
              <IplexText variant="caption" as="span">
                {name}
              </IplexText>
              <IplexText variant="caption" tone="secondary" as="span">
                {value}
              </IplexText>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <IplexText variant="caption" tone="secondary" as="h2" className="ds-section-title">
          Ícones (Hugeicons Stroke Rounded)
        </IplexText>
        <div className="ds-row">
          {ICONS.map(({ icon, name }) => (
            <div key={name} className="ds-icon ds-row-item">
              <IplexIcon icon={icon} label={name} />
              <IplexText variant="caption" tone="secondary" as="span">
                {name}
              </IplexText>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <IplexText variant="caption" tone="secondary" as="h2" className="ds-section-title">
          Verificações neste aparelho
        </IplexText>
        {checks === null ? (
          <IplexText tone="secondary">Verificando…</IplexText>
        ) : (
          <ul className="ds-checks">
            {checks.map((check) => (
              <li key={check.id} className="ds-check">
                <IplexText as="span">
                  {check.ok ? '✓' : '✗'} {check.label}
                </IplexText>
                <IplexText variant="caption" tone="secondary" as="span" className="ds-check-detail">
                  {check.detail}
                </IplexText>
              </li>
            ))}
          </ul>
        )}
      </section>
    </IplexContainer>
  )
}
