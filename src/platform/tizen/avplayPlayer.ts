import type { MediaTrack, PlayerState, PlayerStatus, TrackKind } from '../../bridge/protocol'
import { PlayerError, type MediaPlayer, type OpenOptions, type PlayerEvent } from '../../player/types'

/**
 * Player nativo da Samsung (AVPlay). Ciclo documentado:
 * open → setListener → setDisplayRect → prepareAsync → play/pause → stop → close.
 * O vídeo é desenhado num plano de hardware atrás da camada web; as áreas
 * transparentes do shell e do iframe deixam o vídeo visível.
 */

const TIME_EVENT_INTERVAL_MS = 1000
const OPEN_TIMEOUT_MS = 40000
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
  /** Cada open() recebe um número; callbacks de um open substituído são ignorados. */
  let openSequence = 0
  /** Encerra o open anterior quando outro começa (o AVPlay não chama mais os callbacks dele). */
  let cancelPendingOpen: (() => void) | null = null

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

  /** Comandos de reprodução só valem com mídia preparada (READY/PLAYING/PAUSED/fim). */
  const ensureLoaded = (command: string) => {
    if (state === 'loading') throw new PlayerError('NOT_READY', `${command}: a mídia ainda está carregando`)
    if (state === 'idle' || !url) throw new PlayerError('NO_MEDIA', `${command}: nenhuma mídia aberta`)
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
      cancelPendingOpen?.()
      reset()
      const sequence = ++openSequence
      url = mediaUrl
      positionMs = 0
      durationMs = 0
      setState('loading')
      return new Promise<PlayerStatus>((promiseResolve, promiseReject) => {
        const current = () => sequence === openSequence
        const timer = window.setTimeout(() => {
          if (!current()) return
          reset()
          setState('error')
          promiseReject(new PlayerError('TIMEOUT', `AVPlay não preparou a mídia em ${OPEN_TIMEOUT_MS / 1000} s`))
        }, OPEN_TIMEOUT_MS)
        // Um open substituído por outro termina sem alterar o estado atual.
        const resolve = (value: PlayerStatus) => {
          window.clearTimeout(timer)
          if (current()) cancelPendingOpen = null
          if (current()) promiseResolve(value)
          else promiseReject(new PlayerError('SUPERSEDED', 'Substituído por outra mídia'))
        }
        const reject = (error: PlayerError) => {
          window.clearTimeout(timer)
          if (current()) cancelPendingOpen = null
          promiseReject(error)
        }
        cancelPendingOpen = () => reject(new PlayerError('SUPERSEDED', 'Substituído por outra mídia'))
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
            if (!current()) return resolve(status())
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
            if (!current()) return reject(new PlayerError('SUPERSEDED', 'Substituído por outra mídia'))
            setState('error')
            reject(avplayError(error))
          },
        )
      })
    },

    play() {
      ensureLoaded('play')
      call(() => avplay.play())
      setState('playing')
      return status()
    },

    pause() {
      ensureLoaded('pause')
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
          ensureLoaded('seek')
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
      const current = this.getTracks()
      if (!current.some((track) => track.kind === kind && track.index === index)) {
        throw new PlayerError('NO_TRACK', `Faixa ${kind} ${index} inexistente`)
      }
      // Faixa já ativa: o AVPlay responde INVALID_PARAMETER; trata como no-op.
      if (current.some((track) => track.kind === kind && track.index === index && track.selected)) return current
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
