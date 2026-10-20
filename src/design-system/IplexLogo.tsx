import { classNames } from './classNames'

export type IplexLogoProps = {
  className?: string
  /** Nome lido por leitores de tela. */
  label?: string
}

const BRAND = 'iPlex'

/**
 * Logo do iPlex em CSS: "iPlex" em Google Sans 700 com relevo neumórfico
 * (aro claro, contorno escuro e sombra), reproduzindo a arte oficial.
 * Tamanho pelo token --iplex-logo-font-size.
 */
export function IplexLogo({ className, label = BRAND }: IplexLogoProps) {
  return (
    <span className={classNames('iplex-logo', className)} role="img" aria-label={label}>
      <span className="iplex-logo-text" data-text={BRAND} aria-hidden="true">
        {BRAND}
      </span>
    </span>
  )
}
