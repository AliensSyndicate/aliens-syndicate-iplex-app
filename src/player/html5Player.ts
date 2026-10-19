import type { MediaTrack, PlayerState, PlayerStatus, TrackKind } from '../bridge/protocol'
import { PlayerError, type MediaPlayer, type OpenOptions, type PlayerEvent } from './types'

/**
 * Player HTML5 <video>, independente de plataforma. Usado no navegador
 * (desenvolvimento) e reutilizável por um futuro adaptador webOS.
 * O vídeo fica atrás do iframe do frontend (que deve ter fundo transparente).
 */

// audioTracks não está nos tipos do DOM do TypeScript.
interface AudioTrackLike {
  enabled: boolean
  language: string
}
type VideoWithAudioTracks = HTMLVideoElement & { audioTracks?: ArrayLike<AudioTrackLike> }

const TIME_EVENT_INTERVAL_MS = 1000
const OPEN_TIMEOUT_MS = 30000

export function createHtml5Player(): MediaPlayer {
  const video = document.createElement('video') as VideoWithAudioTracks
  video.className = 'iplex-media-surface'
  video.setAttribute('playsinline', '')
  document.body.appendChild(video)

  const listeners = new Set<(event: PlayerEvent) => void>()
  let state: PlayerState = 'idle'
  let url: string | null = null
  let lastTimeEvent = 0

  const status = (): PlayerStatus => ({
    state,
    positionMs: Math.round(video.currentTime * 1000) || 0,
    durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0,
    url,
  })
  const emit = (event: PlayerEvent) => listeners.forEach((listener) => listener(event))
  const setState = (next: PlayerState) => {
    if (next === state) return
    state = next
    emit({ type: 'state', status: status() })
  }

  const handlers: [string, () => void][] = [
    ['loadstart', () => url && setState('loading')],
    ['canplay', () => state === 'loading' && setState('ready')],
    ['playing', () => setState('playing')],
    ['pause', () => state !== 'ended' && state !== 'idle' && setState('paused')],
    ['waiting', () => emit({ type: 'buffering', phase: 'start', percent: 0 })],
    ['canplaythrough', () => emit({ type: 'buffering', phase: 'complete', percent: 100 })],
    [
      'timeupdate',
      () => {
        const now = Date.now()
        if (now - lastTimeEvent < TIME_EVENT_INTERVAL_MS) return
        lastTimeEvent = now
        const current = status()
        emit({ type: 'time', positionMs: current.positionMs, durationMs: current.durationMs })
      },
    ],
    [
      'ended',
      () => {
        setState('ended')
        emit({ type: 'ended', status: status() })
      },
    ],
    [
      'error',
      () => {
        if (!url) return
        setState('error')
        const code = video.error ? `MEDIA_ERR_${video.error.code}` : 'MEDIA_ERR'
        emit({ type: 'error', error: { code, message: video.error?.message || 'Falha na reprodução' } })
      },
    ],
  ]
  handlers.forEach(([name, handler]) => video.addEventListener(name, handler))

  const textTracks = () => Array.from(video.textTracks).filter((track) => track.kind === 'subtitles' || track.kind === 'captions')
  let subtitlesVisible = true

  return {
    native: false,

    open(mediaUrl: string, options: OpenOptions = {}) {
      url = mediaUrl
      video.src = mediaUrl
      video.load()
      return new Promise<PlayerStatus>((resolve, reject) => {
        const cleanup = () => {
          window.clearTimeout(timer)
          video.removeEventListener('loadedmetadata', onReady)
          video.removeEventListener('error', onError)
        }
        const onReady = () => {
          cleanup()
          if (options.startPositionMs) video.currentTime = options.startPositionMs / 1000
          setState('ready')
          if (options.autoplay) {
            video.play().catch((error: unknown) =>
              emit({ type: 'error', error: { code: 'PLAY_REJECTED', message: String(error) } }),
            )
          }
          resolve(status())
        }
        const onError = () => {
          cleanup()
          reject(new PlayerError(video.error ? `MEDIA_ERR_${video.error.code}` : 'MEDIA_ERR', 'Não foi possível abrir a mídia'))
        }
        const timer = window.setTimeout(() => {
          cleanup()
          reject(new PlayerError('TIMEOUT', 'Tempo esgotado ao abrir a mídia'))
        }, OPEN_TIMEOUT_MS)
        video.addEventListener('loadedmetadata', onReady)
        video.addEventListener('error', onError)
      })
    },

    play() {
      if (!url) throw new PlayerError('NO_MEDIA', 'Nenhuma mídia aberta')
      video.play().catch((error: unknown) => emit({ type: 'error', error: { code: 'PLAY_REJECTED', message: String(error) } }))
      return status()
    },

    pause() {
      video.pause()
      // O evento 'pause' é assíncrono; o estado é atualizado já na resposta.
      if (url && state !== 'idle' && state !== 'ended' && state !== 'error') setState('paused')
      return status()
    },

    stop() {
      video.pause()
      video.removeAttribute('src')
      video.load()
      url = null
      setState('idle')
      return status()
    },

    seek(positionMs: number) {
      return new Promise<PlayerStatus>((resolve) => {
        const done = () => {
          video.removeEventListener('seeked', done)
          resolve(status())
        }
        video.addEventListener('seeked', done)
        video.currentTime = positionMs / 1000
      })
    },

    getStatus: status,

    getTracks() {
      const tracks: MediaTrack[] = []
      Array.from(video.audioTracks ?? []).forEach((track, index) =>
        tracks.push({ kind: 'audio', index, language: track.language || null, selected: track.enabled }),
      )
      textTracks().forEach((track, index) =>
        tracks.push({ kind: 'text', index, language: track.language || null, selected: track.mode === 'showing' }),
      )
      return tracks
    },

    selectTrack(kind: TrackKind, index: number) {
      if (kind === 'audio') {
        const audio = Array.from(video.audioTracks ?? [])
        if (!audio[index]) throw new PlayerError('NO_TRACK', `Faixa de áudio ${index} inexistente`)
        audio.forEach((track, position) => (track.enabled = position === index))
      } else {
        const text = textTracks()
        if (!text[index]) throw new PlayerError('NO_TRACK', `Legenda ${index} inexistente`)
        text.forEach((track, position) => (track.mode = position === index && subtitlesVisible ? 'showing' : 'disabled'))
      }
      return this.getTracks()
    },

    setSubtitlesVisible(visible: boolean) {
      subtitlesVisible = visible
      textTracks().forEach((track) => {
        if (track.mode !== 'disabled') track.mode = visible ? 'showing' : 'hidden'
      })
    },

    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    destroy() {
      handlers.forEach(([name, handler]) => video.removeEventListener(name, handler))
      video.pause()
      video.removeAttribute('src')
      video.remove()
      listeners.clear()
    },
  }
}
