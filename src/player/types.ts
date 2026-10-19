import type { MediaTrack, PlayerErrorInfo, PlayerStatus, TrackKind } from '../bridge/protocol'

/**
 * Player de mídia independente de plataforma. Implementações:
 *  - Tizen: AVPlay (src/platform/tizen/avplayPlayer.ts)
 *  - HTML5 <video> (src/player/html5Player.ts) — navegador e futuro webOS
 */
export type PlayerEvent =
  | { type: 'state'; status: PlayerStatus }
  | { type: 'buffering'; phase: 'start' | 'progress' | 'complete'; percent: number }
  | { type: 'time'; positionMs: number; durationMs: number }
  | { type: 'error'; error: PlayerErrorInfo }
  | { type: 'ended'; status: PlayerStatus }
  | { type: 'subtitle'; text: string; durationMs: number }

export interface OpenOptions {
  autoplay?: boolean
  startPositionMs?: number
}

export interface MediaPlayer {
  readonly native: boolean
  open(url: string, options?: OpenOptions): Promise<PlayerStatus>
  play(): PlayerStatus
  pause(): PlayerStatus
  stop(): PlayerStatus
  seek(positionMs: number): Promise<PlayerStatus>
  getStatus(): PlayerStatus
  getTracks(): MediaTrack[]
  selectTrack(kind: TrackKind, index: number): MediaTrack[]
  setSubtitlesVisible(visible: boolean): void
  onEvent(listener: (event: PlayerEvent) => void): () => void
  destroy(): void
}

export class PlayerError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
