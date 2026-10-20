import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { classNames } from './classNames'

export type IplexIconProps = {
  /** Ícone de @hugeicons/core-free-icons (conjunto Stroke Rounded, o único permitido). */
  icon: IconSvgElement
  /** Rótulo acessível; sem ele o ícone é decorativo (aria-hidden). */
  label?: string
  className?: string
}

/**
 * Ícone do Design System (Hugeicons Stroke Rounded). Tamanho pelo token
 * --iplex-icon-size e cor do texto ao redor. Não usar dentro de botões.
 */
export function IplexIcon({ icon, label, className }: IplexIconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      className={classNames('iplex-icon', className)}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  )
}
