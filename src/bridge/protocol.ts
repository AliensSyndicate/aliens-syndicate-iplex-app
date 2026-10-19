/**
 * Contrato da ponte entre o aplicativo instalado na TV (shell) e o frontend
 * iPlex Web carregado dentro dele.
 *
 * Compartilhado e independente de plataforma: não referencia APIs do Tizen
 * nem do webOS. O iPlex Web (outro repositório) usa o mesmo contrato com o
 * cliente de src/bridge/client.ts.
 *
 * Transporte: window.postMessage entre o shell e o <iframe> do frontend.
 * O shell só aceita mensagens do próprio iframe, da origem configurada e
 * com métodos desta lista (BRIDGE_METHODS).
 */

export const BRIDGE_PROTOCOL = 'iplex-bridge'
export const BRIDGE_VERSION = 1

export type PlatformId = 'tizen' | 'webos' | 'browser'

export interface PlatformInfo {
  platform: PlatformId
  platformVersion: string | null
  appVersion: string
  userAgent: string
  capabilities: {
    /** Player nativo da TV (Tizen: AVPlay). Falso = HTML5 <video>. */
    nativePlayer: boolean
    /** app.exit encerra o aplicativo de fato. */
    exit: boolean
  }
}

export type PlayerState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'
export type TrackKind = 'audio' | 'text'

export interface MediaTrack {
  kind: TrackKind
  index: number
  language: string | null
  selected: boolean
}

export interface PlayerStatus {
  state: PlayerState
  positionMs: number
  durationMs: number
  url: string | null
}

export interface PlayerErrorInfo {
  code: string
  message: string
}

/** Métodos que o frontend pode chamar no shell. */
export interface BridgeMethods {
  /** Handshake obrigatório: o frontend avisa que está pronto; o shell remove a tela de carregamento. */
  'app.ready': { params: { version?: string }; result: PlatformInfo }
  'platform.getInfo': { params: void; result: PlatformInfo }
  'app.exit': { params: void; result: void }
  'player.open': { params: { url: string; autoplay?: boolean; startPositionMs?: number }; result: PlayerStatus }
  'player.play': { params: void; result: PlayerStatus }
  'player.pause': { params: void; result: PlayerStatus }
  'player.stop': { params: void; result: PlayerStatus }
  'player.seek': { params: { positionMs: number }; result: PlayerStatus }
  'player.getStatus': { params: void; result: PlayerStatus }
  'player.getTracks': { params: void; result: MediaTrack[] }
  'player.selectTrack': { params: { kind: TrackKind; index: number }; result: MediaTrack[] }
  'player.setSubtitlesVisible': { params: { visible: boolean }; result: void }
}

export type BridgeMethod = keyof BridgeMethods
export type BridgeParams<M extends BridgeMethod> = BridgeMethods[M]['params']
export type BridgeResult<M extends BridgeMethod> = BridgeMethods[M]['result']

/** Lista de comandos permitidos (tudo fora dela é recusado). */
export const BRIDGE_METHODS: readonly BridgeMethod[] = [
  'app.ready',
  'platform.getInfo',
  'app.exit',
  'player.open',
  'player.play',
  'player.pause',
  'player.stop',
  'player.seek',
  'player.getStatus',
  'player.getTracks',
  'player.selectTrack',
  'player.setSubtitlesVisible',
]

/** Eventos que o shell envia ao frontend. */
export interface BridgeEvents {
  'player.state': PlayerStatus
  'player.buffering': { phase: 'start' | 'progress' | 'complete'; percent: number }
  'player.time': { positionMs: number; durationMs: number }
  'player.error': PlayerErrorInfo
  'player.ended': PlayerStatus
  'player.subtitle': { text: string; durationMs: number }
  /** O app foi ocultado/reexibido (multitarefa). Oculto durante reprodução => player parado. */
  'app.visibility': { visible: boolean }
  'network.status': { online: boolean }
}

export type BridgeEventName = keyof BridgeEvents

export type BridgeErrorCode =
  | 'not_allowed'
  | 'unknown_method'
  | 'invalid_params'
  | 'not_supported'
  | 'player_error'
  | 'internal'

interface Envelope {
  protocol: typeof BRIDGE_PROTOCOL
  version: typeof BRIDGE_VERSION
}

export interface BridgeRequestMessage<M extends BridgeMethod = BridgeMethod> extends Envelope {
  kind: 'request'
  id: string
  method: M
  params: BridgeParams<M>
}

export type BridgeResponseMessage =
  | (Envelope & { kind: 'response'; id: string; ok: true; result: unknown })
  | (Envelope & { kind: 'response'; id: string; ok: false; error: { code: BridgeErrorCode; message: string } })

export interface BridgeEventMessage<E extends BridgeEventName = BridgeEventName> extends Envelope {
  kind: 'event'
  event: E
  data: BridgeEvents[E]
}

function isEnvelope(value: unknown): value is Envelope & Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Envelope).protocol === BRIDGE_PROTOCOL &&
    (value as Envelope).version === BRIDGE_VERSION
  )
}

export function isBridgeRequest(value: unknown): value is BridgeRequestMessage {
  return (
    isEnvelope(value) &&
    value.kind === 'request' &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 64 &&
    typeof value.method === 'string'
  )
}

export function isBridgeResponse(value: unknown): value is BridgeResponseMessage {
  return isEnvelope(value) && value.kind === 'response' && typeof value.id === 'string'
}

export function isBridgeEvent(value: unknown): value is BridgeEventMessage {
  return isEnvelope(value) && value.kind === 'event' && typeof value.event === 'string'
}
