import type { BridgeMethod, BridgeParams } from './protocol'

/**
 * Validação dos parâmetros recebidos do frontend. Tudo que chega por
 * postMessage é tratado como não confiável.
 */

export class InvalidParamsError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidParamsError('params deve ser um objeto')
  }
  return value as Record<string, unknown>
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1e10) {
    throw new InvalidParamsError(`${name} deve ser um inteiro >= 0`)
  }
  return value
}

/** Somente mídia http(s): nada de file:, data:, javascript: etc. */
function mediaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) throw new InvalidParamsError('url inválida')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new InvalidParamsError('url inválida')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new InvalidParamsError('url de mídia deve usar http(s)')
  }
  return parsed.href
}

type Validators = { [M in BridgeMethod]: (params: unknown) => BridgeParams<M> }

const none = () => undefined

export const validateParams: Validators = {
  'app.ready': (params) => {
    if (params === undefined || params === null) return {}
    const version = record(params).version
    if (version !== undefined && (typeof version !== 'string' || version.length > 64)) {
      throw new InvalidParamsError('version deve ser texto (até 64 caracteres)')
    }
    return { version: version as string | undefined }
  },
  'platform.getInfo': none,
  'app.exit': none,
  'player.open': (params) => {
    const input = record(params)
    return {
      url: mediaUrl(input.url),
      autoplay: input.autoplay === undefined ? undefined : input.autoplay === true,
      startPositionMs:
        input.startPositionMs === undefined ? undefined : nonNegativeInteger(input.startPositionMs, 'startPositionMs'),
    }
  },
  'player.play': none,
  'player.pause': none,
  'player.stop': none,
  'player.seek': (params) => ({ positionMs: nonNegativeInteger(record(params).positionMs, 'positionMs') }),
  'player.getStatus': none,
  'player.getTracks': none,
  'player.selectTrack': (params) => {
    const input = record(params)
    if (input.kind !== 'audio' && input.kind !== 'text') throw new InvalidParamsError('kind deve ser audio ou text')
    return { kind: input.kind, index: nonNegativeInteger(input.index, 'index') }
  },
  'player.setSubtitlesVisible': (params) => {
    const visible = record(params).visible
    if (typeof visible !== 'boolean') throw new InvalidParamsError('visible deve ser booleano')
    return { visible }
  },
}
