import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reportDevEvent, reportPageLifecycle } from '../../devtools/devReport'
import { bridge } from './bridge'
import '../index.css'
import './showcase.css'
import { DesignSystemShowcase } from './DesignSystemShowcase'

reportDevEvent('frontend-start', window.location.href)
reportPageLifecycle('design-system')

/**
 * Plataforma: dentro do shell, o handshake app.ready informa (tizen → TV);
 * no navegador, ?platform=tv simula a escala de TV.
 */
async function detectPlatform(): Promise<'tv' | 'web'> {
  if (new URLSearchParams(window.location.search).get('platform') === 'tv') return 'tv'
  if (!bridge.available) return 'web'
  try {
    const info = await bridge.call('app.ready', { version: 'design-system' })
    reportDevEvent('test:ready', `ok Handshake app.ready: ${info.platform} ${info.platformVersion ?? ''} · tela ${info.device.screen.width}x${info.device.screen.height}`)
    return info.platform === 'tizen' ? 'tv' : 'web'
  } catch (error) {
    reportDevEvent('test:failed', `app.ready: ${error instanceof Error ? error.message : String(error)}`)
    return 'web'
  }
}

void detectPlatform().then((platform) => {
  if (platform === 'tv') document.documentElement.setAttribute('data-iplex-platform', 'tv')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DesignSystemShowcase platform={platform} />
    </StrictMode>,
  )
})
