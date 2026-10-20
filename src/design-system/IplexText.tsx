import type { HTMLAttributes, ReactNode } from 'react'
import { classNames } from './classNames'

export type IplexTextVariant = 'display' | 'title' | 'body' | 'caption'

export type IplexTextProps = HTMLAttributes<HTMLElement> & {
  variant?: IplexTextVariant
  tone?: 'primary' | 'secondary'
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'label'
  children?: ReactNode
}

const defaultElement: Record<IplexTextVariant, NonNullable<IplexTextProps['as']>> = {
  display: 'h1',
  title: 'h2',
  body: 'p',
  caption: 'span',
}

/** Texto do Design System: Google Sans, escala por variante, só as duas cores oficiais. */
export function IplexText({ variant = 'body', tone = 'primary', as, className, children, ...rest }: IplexTextProps) {
  const Element = as ?? defaultElement[variant]
  return (
    <Element {...rest} className={classNames('iplex-text', `iplex-text--${variant}`, `iplex-text--${tone}`, className)}>
      {children}
    </Element>
  )
}
