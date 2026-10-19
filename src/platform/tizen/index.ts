import type { RemoteKeyMap, RemoteKeyName } from '../../bridge/protocol'
import { createHtml5Player } from '../../player/html5Player'
import type { PlatformAdapter } from '../types'
import { createAvplayPlayer } from './avplayPlayer'

/** Teclas obrigatórias: chegam sem registro (setas, Enter, Return). */
const MANDATORY_KEYS: Record<'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Back', number> = {
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Enter: 13,
  Back: 10009,
}

/**
 * Teclas de mídia e canal registradas para o player. A Samsung recomenda
 * registrar só as teclas usadas: registrar bloqueia a função padrão delas.
 * Exit NÃO é registrado (precisa voltar à Home).
 */
const MEDIA_KEYS: RemoteKeyName[] = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'ChannelUp',
  'ChannelDown',
]

function readCapability(tizen: TizenGlobal, key: string): string | null {
  try {
    const value = tizen.systeminfo.getCapability(key)
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}

/** Registra as teclas de mídia suportadas e devolve o código real de cada uma. */
function registerKeys(tizen: TizenGlobal): { keys: RemoteKeyMap; mediaKeys: boolean } {
  const keys: RemoteKeyMap = { ...MANDATORY_KEYS }
  const input = tizen.tvinputdevice
  if (!input) return { keys, mediaKeys: false }
  let supported: TizenInputDeviceKey[] = []
  try {
    supported = input.getSupportedKeys()
  } catch {
    return { keys, mediaKeys: false }
  }
  const available = MEDIA_KEYS.filter((name) => supported.some((key) => key.name === name))
  for (const name of available) {
    const key = supported.find((entry) => entry.name === name)
    if (key) keys[name] = key.code
  }
  let registered = 0
  for (const name of available) {
    try {
      input.registerKey(name)
      registered += 1
    } catch {
      delete keys[name]
    }
  }
  return { keys, mediaKeys: registered > 0 }
}

export function createTizenAdapter(tizen: TizenGlobal, webapis: WebApisGlobal | undefined): PlatformAdapter {
  const avplay = webapis?.avplay
  const { keys, mediaKeys } = registerKeys(tizen)
  return {
    id: 'tizen',
    label: 'Samsung Tizen',
    platformVersion: readCapability(tizen, 'http://tizen.org/feature/platform.version'),
    canExit: true,
    nativePlayer: Boolean(avplay),
    model: readCapability(tizen, 'http://tizen.org/system/model_name'),
    keys,
    mediaKeys,
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
