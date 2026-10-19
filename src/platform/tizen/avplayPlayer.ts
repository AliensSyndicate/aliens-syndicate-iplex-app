import type { MediaTrack, PlayerState, PlayerStatus, TrackKind } from '../../bridge/protocol'
import { PlayerError, type MediaPlayer, type OpenOptions, type PlayerEvent } from '../../player/types'

/**
 * Player nativo da Samsung (AVPlay). Ciclo documentado:
 * open → setListener → setDisplayRect → prepareAsync → play/pause → stop → close.
 * O vídeo é desenhado num plano de hardware atrás da camada web; as áreas
 * transparentes do shell e do iframe deixam o vídeo visível.
 */

const TIME_EVENT_INTERVAL_MS = 1000
// setDisplayRect usa sempre a grade 1920x1080, independentemente do viewport.
const SCREEN = { width: 1920, height: 1080 }

function mapState(state: AVPlayPlayerState): PlayerState {
  switch (state) {
    case 'READY':
      return 'ready'
    case 'PLAYING':
      return 'playing'
    case 'PAUSED':
      return 'paused'
    default:
      return 'idle'
  }
}

function avplayError(error: unknown): PlayerError {
  const name = (error as { name?: string })?.name ?? 'AVPLAY_ERROR'
  const message = (error as { message?: string })?.message ?? String(error)
  return new PlayerError(name, message)
}

function trackLanguage(extraInfo: string): string | null {
  try {
    const info = JSON.parse(extraInfo) as Record<string, unknown>
    const language = info.language ?? info.track_lang
    return typeof language === 'string' && language ? language : null
  } catch {
    return null
  }
}

export function createAvplayPlayer(avplay: AVPlayManager): MediaPlayer {
  const surface = document.createElement('object')
  surface.type = 'application/avplayer'
  surface.className = 'iplex-media-surface'
  document.body.appendChild(surface)

  const listeners = new Set<(event: PlayerEvent) => void>()
  let state: PlayerState = 'idle'
  let url: string | null = null
  let positionMs = 0
  let durationMs = 0
  let lastTimeEvent = 0

  const status = (): PlayerStatus => ({ state, positionMs, durationMs, url })
  const emit = (event: PlayerEvent) => listeners.forEach((listener) => listener(event))
  const setState = (next: PlayerState) => {
    if (next === state) return
    state = next
    emit({ type: 'state', status: status() })
  }
  const call = <T>(action: () => T): T => {
    try {
      return action()
    } catch (error) {
      throw avplayError(error)
    }
  }
  const syncState = () => {
    try {
      setState(mapState(avplay.getState()))
    } catch {
      // getState é válido em todos os estados; falha aqui não altera o estado.
    }
  }
  const reset = () => {
    try {
      avplay.stop()
      avplay.close()
    } catch {
      // Sem instância aberta.
    }
  }

  const listener: AVPlayPlaybackCallback = {
    onbufferingstart: () => emit({ type: 'buffering', phase: 'start', percent: 0 }),
    onbufferingprogress: (percent) => emit({ type: 'buffering', phase: 'progress', percent }),
    onbufferingcomplete: () => emit({ type: 'buffering', phase: 'complete', percent: 100 }),
    oncurrentplaytime: (currentTime) => {
      positionMs = currentTime
      if (state !== 'playing') syncState()
      const now = Date.now()
      if (now - lastTimeEvent < TIME_EVENT_INTERVAL_MS) return
      lastTimeEvent = now
      emit({ type: 'time', positionMs, durationMs })
    },
    onstreamcompleted: () => {
      setState('ended')
      emit({ type: 'ended', status: status() })
      try {
        avplay.stop()
      } catch {
        // já parado
      }
    },
    onerror: (eventType) => {
      setState('error')
      emit({ type: 'error', error: { code: eventType, message: `AVPlay: ${eventType}` } })
    },
    onsubtitlechange: (duration, subtitles) =>
      emit({ type: 'subtitle', text: subtitles, durationMs: Number(duration) || 0 }),
  }

  return {
    native: true,

    open(mediaUrl: string, options: OpenOptions = {}) {
      reset()
      url = mediaUrl
      positionMs = 0
      durationMs = 0
      setState('loading')
      return new Promise<PlayerStatus>((resolve, reject) => {
        try {
          avplay.open(mediaUrl)
          avplay.setListener(listener)
          avplay.setDisplayRect(0, 0, SCREEN.width, SCREEN.height)
          avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')
        } catch (error) {
          setState('error')
          reject(avplayError(error))
          return
        }
        avplay.prepareAsync(
          () => {
            try {
              durationMs = avplay.getDuration()
            } catch {
              durationMs = 0
            }
            setState('ready')
            const start = () => {
              if (options.autoplay) {
                try {
                  avplay.play()
                  setState('playing')
                } catch (error) {
                  const failure = avplayError(error)
                  emit({ type: 'error', error: { code: failure.code, message: failure.message } })
                }
              }
              resolve(status())
            }
            if (options.startPositionMs) {
              avplay.seekTo(options.startPositionMs, start, start)
            } else {
              start()
            }
          },
          (error) => {
            setState('error')
            reject(avplayError(error))
          },
        )
      })
    },

    play() {
      call(() => avplay.play())
      setState('playing')
      return status()
    },

    pause() {
      call(() => avplay.pause())
      setState('paused')
      return status()
    },

    stop() {
      reset()
      url = null
      positionMs = 0
      setState('idle')
      return status()
    },

    seek(target: number) {
      return new Promise<PlayerStatus>((resolve, reject) => {
        try {
          avplay.seekTo(
            target,
            () => {
              positionMs = target
              resolve(status())
            },
            (error) => reject(avplayError(error)),
          )
        } catch (error) {
          reject(avplayError(error))
        }
      })
    },

    getStatus: status,

    getTracks() {
      const all = call(() => avplay.getTotalTrackInfo())
      let current: AVPlayStreamInfo[]
      try {
        current = avplay.getCurrentStreamInfo()
      } catch {
        current = []
      }
      const selected = new Set(current.map((info) => `${info.type}:${info.index}`))
      const tracks: MediaTrack[] = []
      for (const info of all) {
        if (info.type !== 'AUDIO' && info.type !== 'TEXT') continue
        tracks.push({
          kind: info.type === 'AUDIO' ? 'audio' : 'text',
          index: info.index,
          language: trackLanguage(info.extra_info),
          selected: selected.has(`${info.type}:${info.index}`),
        })
      }
      return tracks
    },

    selectTrack(kind: TrackKind, index: number) {
      call(() => avplay.setSelectTrack(kind === 'audio' ? 'AUDIO' : 'TEXT', index))
      return this.getTracks()
    },

    setSubtitlesVisible(visible: boolean) {
      call(() => avplay.setSilentSubtitle(!visible))
    },

    onEvent(eventListener) {
      listeners.add(eventListener)
      return () => listeners.delete(eventListener)
    },

    destroy() {
      reset()
      surface.remove()
      listeners.clear()
    },
  }
}
