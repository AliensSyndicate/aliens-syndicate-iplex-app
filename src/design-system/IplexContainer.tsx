import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { classNames } from './classNames'

export type IplexContainerProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'main' | 'section' | 'header' | 'footer'
  /** Margem de segurança (overscan da TV / respiro na Web). */
  safeArea?: boolean
  /** Ocupa toda a largura e altura disponíveis. */
  fill?: boolean
  children?: ReactNode
  ref?: Ref<HTMLElement>
}

/** Container do Design System: fundo #0F0F0F, texto primário e Google Sans. */
export function IplexContainer({
  as: Element = 'div',
  safeArea = false,
  fill = false,
  className,
  children,
  ref,
  ...rest
}: IplexContainerProps) {
  return (
    <Element
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      className={classNames(
        'iplex-container',
        safeArea && 'iplex-container--safe-area',
        fill && 'iplex-container--fill',
        className,
      )}
    >
      {children}
    </Element>
  )
}
