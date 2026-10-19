import {
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  isBridgeRequest,
  type BridgeErrorCode,
  type BridgeEventMessage,
  type BridgeEventName,
  type BridgeEvents,
  type BridgeMethod,
  type BridgeParams,
  type BridgeResponseMessage,
  type BridgeResult,
} from './protocol'
import { InvalidParamsError, validateParams } from './validation'

export type BridgeHandlers = {
  [M in BridgeMethod]: (params: BridgeParams<M>) => BridgeResult<M> | Promise<BridgeResult<M>>
}

export class BridgeHandlerError extends Error {
  readonly code: BridgeErrorCode

  constructor(code: BridgeErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface BridgeHostOptions {
  frame: HTMLIFrameElement
  /** Origens aceitas, exatas (ex.: ["https://alienssyndicate.com"]). */
  allowedOrigins: readonly string[]
  /**
   * Destino das respostas/eventos: a origem exata do frontend remoto. Para o
   * conteúdo empacotado (file://, origem opaca) usa-se "*"; o destinatário é
   * sempre o contentWindow do próprio iframe.
   */
  targetOrigin: string
  handlers: BridgeHandlers
  onRequest?: (method: string, outcome: 'ok' | BridgeErrorCode) => void
}

/**
 * Lado do shell. Regras de segurança:
 *  1. aceita apenas mensagens cujo `source` é o iframe do frontend;
 *  2. a origem deve estar em `allowedOrigins` (comparação exata);
 *  3. o método deve estar em BRIDGE_METHODS e ter handler;
 *  4. os parâmetros passam por validateParams antes do handler.
 */
export function createBridgeHost({ frame, allowedOrigins, targetOrigin, handlers, onRequest }: BridgeHostOptions) {
  const allowed = new Set<string>(BRIDGE_METHODS)
  const origins = new Set(allowedOrigins)

  const post = (message: BridgeResponseMessage | BridgeEventMessage) => {
    frame.contentWindow?.postMessage(message, targetOrigin)
  }

  const reply = (id: string, outcome: { ok: true; result: unknown } | { ok: false; code: BridgeErrorCode; message: string }) => {
    const envelope = { protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, kind: 'response', id } as const
    post(
      outcome.ok
        ? { ...envelope, ok: true, result: outcome.result }
        : { ...envelope, ok: false, error: { code: outcome.code, message: outcome.message } },
    )
  }

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return
    if (!origins.has(event.origin)) return
    const message: unknown = event.data
    if (!isBridgeRequest(message)) return

    const { id, method } = message
    if (!allowed.has(method)) {
      onRequest?.(method, 'unknown_method')
      reply(id, { ok: false, code: 'unknown_method', message: `Método não permitido: ${method}` })
      return
    }
    const typedMethod = method as BridgeMethod
    let params: unknown
    try {
      params = validateParams[typedMethod](message.params)
    } catch (error) {
      const text = error instanceof InvalidParamsError ? error.message : 'parâmetros inválidos'
      onRequest?.(method, 'invalid_params')
      reply(id, { ok: false, code: 'invalid_params', message: text })
      return
    }

    const handler = handlers[typedMethod] as (input: unknown) => unknown
    Promise.resolve()
      .then(() => handler(params))
      .then(
        (result) => {
          onRequest?.(method, 'ok')
          reply(id, { ok: true, result: result ?? null })
        },
        (error: unknown) => {
          const code = error instanceof BridgeHandlerError ? error.code : 'internal'
          const text = error instanceof Error ? error.message : String(error)
          onRequest?.(method, code)
          reply(id, { ok: false, code, message: text })
        },
      )
  }

  window.addEventListener('message', handleMessage)

  return {
    emit<E extends BridgeEventName>(name: E, data: BridgeEvents[E]) {
      post({ protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION, kind: 'event', event: name, data })
    },
    dispose() {
      window.removeEventListener('message', handleMessage)
    },
  }
}

export type BridgeHost = ReturnType<typeof createBridgeHost>
