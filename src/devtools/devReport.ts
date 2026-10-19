/**
 * Canal de relatório de desenvolvimento (somente builds de `npm run tv`).
 *
 * Esta TV não oferece Web Inspector nem logs (`log_enable`/`intershell`
 * desativados), então o app envia seus eventos para o receptor temporário que
 * scripts/tv.mjs abre no Mac. Sem VITE_IPLEX_DEV_REPORT_URL (builds normais),
 * nada é enviado.
 */

import { describeKey, toRemoteAction } from '../navigation/remoteKeys'

const REPORT_URL = import.meta.env.VITE_IPLEX_DEV_REPORT_URL

export function reportDevEvent(event: string, detail?: string) {
  if (!REPORT_URL) return
  const payload = JSON.stringify({
    event,
    detail,
    at: new Date().toISOString(),
    href: window.location.href,
    userAgent: navigator.userAgent,
  })
  try {
    // sendBeacon sobrevive ao descarregamento da página (pagehide).
    if (navigator.sendBeacon && navigator.sendBeacon(REPORT_URL, payload)) return
  } catch {
    // segue para fetch
  }
  void fetch(REPORT_URL, { method: 'POST', mode: 'no-cors', body: payload }).catch(() => undefined)
}

/**
 * Ciclo de vida da página e teclas do controle remoto: confirma na TV quando
 * a navegação de fato ocorreu e quais teclas chegaram ao app.
 */
export function reportPageLifecycle(page: string) {
  if (!REPORT_URL) return
  window.addEventListener('pagehide', () => reportDevEvent(`${page}-pagehide`))
  document.addEventListener('visibilitychange', () =>
    reportDevEvent(`${page}-visibility`, document.visibilityState),
  )
  document.addEventListener('keydown', (event) =>
    reportDevEvent('key', `${describeKey(event)} ${event.keyCode} ${toRemoteAction(event) ?? '-'}`),
  )
}
