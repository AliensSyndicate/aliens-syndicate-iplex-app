import { BridgeHandlerError, type BridgeHandlers } from '../bridge/host'
import type { BridgeEventName, BridgeEvents, PlatformInfo, PlayerStatus } from '../bridge/protocol'
import type { PlatformAdapter } from '../platform/types'
import { PlayerError, type MediaPlayer, type PlayerEvent } from '../player/types'

type EventSink = <E extends BridgeEventName>(name: E, data: BridgeEvents[E]) => void

interface ServicesOptions {
  platform: PlatformAdapter
  appVersion: string
  /** Chamado no handshake app.ready do frontend. */
  onReady: (frontendVersion: string | undefined) => void
  /** Encaminha eventos ao frontend (BridgeHost.emit). */
  emit: EventSink
}

/**
 * Implementação, no shell, dos métodos da ponte. Só expõe o que está no
 * contrato (src/bridge/protocol.ts); nada das APIs Tizen sai daqui diretamente.
 */
export function createBridgeServices({ platform, appVersion, onReady, emit }: ServicesOptions) {
  let player: MediaPlayer | null = null
  let unsubscribePlayer: (() => void) | null = null

  const forward = (event: PlayerEvent) => {
    switch (event.type) {
      case 'state':
        return emit('player.state', event.status)
      case 'buffering':
        return emit('player.buffering', { phase: event.phase, percent: event.percent })
      case 'time':
        return emit('player.time', { positionMs: event.positionMs, durationMs: event.durationMs })
      case 'error':
        return emit('player.error', event.error)
      case 'ended':
        return emit('player.ended', event.status)
      case 'subtitle':
        return emit('player.subtitle', { text: event.text, durationMs: event.durationMs })
    }
  }

  const getPlayer = (): MediaPlayer => {
    if (!player) {
      player = platform.createPlayer()
      unsubscribePlayer = player.onEvent((event) => {
        document.documentElement.classList.toggle('iplex-media-active', isMediaActive(player?.getStatus()))
        forward(event)
      })
    }
    return player
  }

  const withPlayer = async <T>(action: (instance: MediaPlayer) => T | Promise<T>): Promise<T> => {
    try {
      return await action(getPlayer())
    } catch (error) {
      if (error instanceof PlayerError) throw new BridgeHandlerError('player_error', `${error.code}: ${error.message}`)
      throw error
    }
  }

  const info = (): PlatformInfo => ({
    platform: platform.id,
    platformVersion: platform.platformVersion,
    appVersion,
    userAgent: navigator.userAgent,
    capabilities: { nativePlayer: platform.nativePlayer, exit: platform.canExit },
  })

  const handlers: BridgeHandlers = {
    'app.ready': ({ version }) => {
      onReady(version)
      return info()
    },
    'platform.getInfo': info,
    'app.exit': () => platform.exit(),
    'player.open': ({ url, autoplay, startPositionMs }) =>
      withPlayer((instance) => instance.open(url, { autoplay, startPositionMs })),
    'player.play': () => withPlayer((instance) => instance.play()),
    'player.pause': () => withPlayer((instance) => instance.pause()),
    'player.stop': () => withPlayer((instance) => instance.stop()),
    'player.seek': ({ positionMs }) => withPlayer((instance) => instance.seek(positionMs)),
    'player.getStatus': () => withPlayer((instance) => instance.getStatus()),
    'player.getTracks': () => withPlayer((instance) => instance.getTracks()),
    'player.selectTrack': ({ kind, index }) => withPlayer((instance) => instance.selectTrack(kind, index)),
    'player.setSubtitlesVisible': ({ visible }) => withPlayer((instance) => instance.setSubtitlesVisible(visible)),
  }

  return {
    handlers,

    /**
     * Multitarefa (Samsung): app oculto durante reprodução = mesmo efeito do
     * Return durante a reprodução; o player é parado e o frontend é avisado.
     */
    setVisible(visible: boolean) {
      if (!visible && player && isMediaActive(player.getStatus())) player.stop()
      emit('app.visibility', { visible })
    },

    setOnline(online: boolean) {
      emit('network.status', { online })
    },

    dispose() {
      unsubscribePlayer?.()
      player?.destroy()
      player = null
      document.documentElement.classList.remove('iplex-media-active')
    },
  }
}

function isMediaActive(status: PlayerStatus | undefined): boolean {
  return status?.state === 'loading' || status?.state === 'ready' || status?.state === 'playing' || status?.state === 'paused'
}

export type BridgeServices = ReturnType<typeof createBridgeServices>
