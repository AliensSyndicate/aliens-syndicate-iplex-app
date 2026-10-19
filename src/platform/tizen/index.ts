import { createHtml5Player } from '../../player/html5Player'
import type { PlatformAdapter } from '../types'
import { createAvplayPlayer } from './avplayPlayer'

function readPlatformVersion(tizen: TizenGlobal): string | null {
  try {
    const value = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export function createTizenAdapter(tizen: TizenGlobal, webapis: WebApisGlobal | undefined): PlatformAdapter {
  const avplay = webapis?.avplay
  return {
    id: 'tizen',
    label: 'Samsung Tizen',
    platformVersion: readPlatformVersion(tizen),
    canExit: true,
    nativePlayer: Boolean(avplay),
    exit() {
      try {
        tizen.application.getCurrentApplication().exit()
      } catch (error) {
        console.error('[iPlex] Falha ao encerrar o aplicativo Tizen', error)
      }
    },
    // AVPlay quando $WEBAPIS/webapis/webapis.js foi carregado; senão HTML5.
    createPlayer: () => (avplay ? createAvplayPlayer(avplay) : createHtml5Player()),
  }
}
