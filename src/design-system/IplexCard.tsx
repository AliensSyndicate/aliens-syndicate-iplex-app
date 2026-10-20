import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { classNames } from './classNames'

export type IplexCardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article'
  /** Card focável (controle remoto, teclado e mouse). */
  interactive?: boolean
  /** Foco controlado pela navegação do controle remoto (TV). */
  focused?: boolean
  selected?: boolean
  /** 'small' para elementos pequenos, onde o raio de 48px quebraria o layout. */
  radius?: 'default' | 'small'
  children?: ReactNode
  ref?: Ref<HTMLElement>
}

/** Card do Design System: fundo translúcido oficial, raio 48px, sem sombra nem borda. */
export function IplexCard({
  as: Element = 'div',
  interactive = false,
  focused = false,
  selected = false,
  radius = 'default',
  className,
  tabIndex,
  children,
  ref,
  ...rest
}: IplexCardProps) {
  return (
    <Element
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      tabIndex={tabIndex ?? (interactive ? 0 : undefined)}
      className={classNames(
        'iplex-card',
        interactive && 'iplex-card--interactive',
        radius === 'small' && 'iplex-card--radius-small',
        focused && 'is-focused',
        selected && 'is-selected',
        className,
      )}
    >
      {children}
    </Element>
  )
}
