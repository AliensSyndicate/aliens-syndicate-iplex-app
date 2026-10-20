import type { ButtonHTMLAttributes, CSSProperties, Ref } from 'react'
import { classNames } from './classNames'

export type IplexButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'dangerouslySetInnerHTML'> & {
  /** Somente texto: botões do iPlex não têm ícones, setas nem elementos decorativos. */
  children: string
  /** primary: fundo branco e texto escuro. secondary: contorno e texto claros, sem preenchimento. */
  variant?: 'primary' | 'secondary'
  /** Foco controlado pela navegação do controle remoto (TV). */
  focused?: boolean
  /** Padding opcional por instância (padrão: tokens --iplex-button-padding-*). */
  paddingBlock?: number | string
  paddingInline?: number | string
  ref?: Ref<HTMLButtonElement>
}

function cssLength(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value
}

/** Botão do Design System: só texto, raio total, largura do conteúdo. */
export function IplexButton({
  children,
  variant = 'primary',
  focused = false,
  paddingBlock,
  paddingInline,
  className,
  style,
  type = 'button',
  ...rest
}: IplexButtonProps) {
  const padding: Record<string, string> = {}
  if (paddingBlock !== undefined) padding['--iplex-button-padding-block'] = cssLength(paddingBlock)
  if (paddingInline !== undefined) padding['--iplex-button-padding-inline'] = cssLength(paddingInline)

  return (
    <button
      {...rest}
      type={type}
      className={classNames('iplex-button', `iplex-button-${variant}`, focused && 'is-focused', className)}
      style={{ ...(padding as CSSProperties), ...style }}
    >
      {children}
    </button>
  )
}
