import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  isBridgeEvent,
  isBridgeResponse,
  type BridgeErrorCode,
  type BridgeEventName,
  type BridgeEvents,
  type BridgeMethod,
  type BridgeParams,
  type BridgeRequestMessage,
  type BridgeResult,
} from './protocol'

/**
 * Cliente da ponte para o frontend (iPlex Web). Fica neste repositório como
 * referência do contrato e é usado pela página de teste controlada.
 *
 * Aceita somente mensagens vindas de window.parent (o shell instalado).
 */

export class BridgeCallError extends Error {
  readonly code: BridgeErrorCode | 'timeout' | 'unavailable'

  constructor(code: BridgeErrorCode | 'timeout' | 'unavailable', message: string) {
    super(message)
    this.code = code
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: BridgeCallError) => void
  timer: number
}

/** Tempos limite por método: abrir mídia inclui o prepare do player e a rede. */
const METHOD_TIMEOUTS: Partial<Record<BridgeMethod, number>> = {
  'player.open': 45000,
  'player.seek': 20000,
}

export function isInsideShell(): boolean {
  return window.parent !== window
}

export function createBridgeClient({ timeoutMs = 10000 }: { timeoutMs?: number } = {}) {
  const pending = new Map<string, Pending>()
  const listeners = new Map<BridgeEventName, Set<(data: never) => void>>()
  let sequence = 0

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const message: unknown = event.data
    if (isBridgeResponse(message)) {
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      window.clearTimeout(entry.timer)
      if (message.ok) entry.resolve(message.result)
      else entry.reject(new BridgeCallError(message.error.code, message.error.message))
    } else if (isBridgeEvent(message)) {
      listeners.get(message.event)?.forEach((listener) => listener(message.data as never))
    }
  }
  window.addEventListener('message', handleMessage)

  return {
    available: isInsideShell(),

    call<M extends BridgeMethod>(method: M, ...args: BridgeParams<M> extends void ? [] : [BridgeParams<M>]) {
      return new Promise<BridgeResult<M>>((resolve, reject) => {
        if (!isInsideShell()) {
          reject(new BridgeCallError('unavailable', 'Fora do aplicativo de TV: ponte indisponível'))
          return
        }
        sequence += 1
        const id = `${Date.now().toString(36)}-${sequence}`
        const limit = METHOD_TIMEOUTS[method] ?? timeoutMs
        const timer = window.setTimeout(() => {
          pending.delete(id)
          reject(new BridgeCallError('timeout', `Sem resposta para ${method} em ${limit / 1000} s`))
        }, limit)
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
        const request: BridgeRequestMessage<M> = {
          protocol: BRIDGE_PROTOCOL,
          version: BRIDGE_VERSION,
          kind: 'request',
          id,
          method,
          params: args[0] as BridgeParams<M>,
        }
        // A origem do shell empacotado é opaca (file://), por isso "*". As
        // requisições não carregam segredos; as respostas do shell são
        // enviadas somente à origem exata deste frontend.
        window.parent.postMessage(request, '*')
      })
    },

    on<E extends BridgeEventName>(name: E, listener: (data: BridgeEvents[E]) => void) {
      const set = listeners.get(name) ?? new Set()
      set.add(listener as (data: never) => void)
      listeners.set(name, set)
      return () => set.delete(listener as (data: never) => void)
    },

    dispose() {
      window.removeEventListener('message', handleMessage)
      pending.forEach((entry) => window.clearTimeout(entry.timer))
      pending.clear()
      listeners.clear()
    },
  }
}

export type BridgeClient = ReturnType<typeof createBridgeClient>
