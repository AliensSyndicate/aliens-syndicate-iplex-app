import { createBrowserAdapter } from './browser'
import { createTizenAdapter } from './tizen'
import type { PlatformAdapter } from './types'

export type { PlatformAdapter } from './types'

let adapter: PlatformAdapter | null = null

/**
 * Detecta a plataforma em tempo de execução. O objeto global `tizen` só existe
 * no conteúdo empacotado do Tizen (o shell); páginas hospedadas não o recebem
 * (política da Samsung para Hosted Applications) — por isso o frontend remoto
 * acessa a plataforma pela ponte (src/bridge).
 */
export function getPlatform(): PlatformAdapter {
  if (!adapter) {
    adapter = window.tizen ? createTizenAdapter(window.tizen, window.webapis) : createBrowserAdapter()
  }
  return adapter
}
