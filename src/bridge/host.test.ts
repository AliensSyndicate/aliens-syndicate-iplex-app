import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeHandlerError, createBridgeHost, type BridgeHandlers } from './host'
import { BRIDGE_PROTOCOL, BRIDGE_VERSION } from './protocol'

const ORIGIN = 'https://iplex-2c8fc.web.app'

function setup() {
  const contentWindow = { postMessage: vi.fn() }
  const frame = { contentWindow } as unknown as HTMLIFrameElement
  const handlers = {
    'platform.getInfo': vi.fn(() => ({ platform: 'tizen' })),
    'player.seek': vi.fn(({ positionMs }: { positionMs: number }) => ({ state: 'playing', positionMs, durationMs: 0, url: null })),
    'player.play': vi.fn(() => {
      throw new BridgeHandlerError('player_error', 'NOT_READY: carregando')
    }),
  } as unknown as BridgeHandlers
  const onRequest = vi.fn()
  const host = createBridgeHost({ frame, allowedOrigins: [ORIGIN], targetOrigin: ORIGIN, handlers, onRequest })
  const send = (data: unknown, { origin = ORIGIN, source = contentWindow as unknown }: { origin?: string; source?: unknown } = {}) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as MessageEventSource }))
  const replies = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return contentWindow.postMessage.mock.calls.map(([message, target]) => ({ message, target }))
  }
  return { host, handlers, onRequest, send, replies, contentWindow }
}

const request = (id: string, method: string, params?: unknown, version: number = BRIDGE_VERSION) => ({
  protocol: BRIDGE_PROTOCOL,
  version,
  kind: 'request',
  id,
  method,
  params,
})

let dispose: (() => void) | null = null
afterEach(() => dispose?.())

describe('createBridgeHost', () => {
  it('atende um método da lista vindo do iframe e da origem exata', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('1', 'platform.getInfo'))
    const [reply] = await context.replies()
    expect(reply.target).toBe(ORIGIN)
    expect(reply.message).toMatchObject({ kind: 'response', id: '1', ok: true, result: { platform: 'tizen' } })
  })

  it('ignora outra origem', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('2', 'platform.getInfo'), { origin: 'https://evil.example' })
    expect(await context.replies()).toHaveLength(0)
    expect(context.handlers['platform.getInfo']).not.toHaveBeenCalled()
  })

  it('ignora mensagens que não vêm do iframe do frontend', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('3', 'platform.getInfo'), { source: window })
    expect(await context.replies()).toHaveLength(0)
  })

  it('recusa método fora da lista', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('4', 'tizen.application.launch', {}))
    const [reply] = await context.replies()
    expect(reply.message).toMatchObject({ ok: false, error: { code: 'unknown_method' } })
  })

  it.each([
    ['file:', { url: 'file:///etc/passwd' }],
    ['javascript:', { url: 'javascript:alert(1)' }],
    ['data:', { url: 'data:text/html,x' }],
  ])('recusa mídia %s', async (_scheme, params) => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('5', 'player.open', params))
    const [reply] = await context.replies()
    expect(reply.message).toMatchObject({ ok: false, error: { code: 'invalid_params' } })
  })

  it('valida parâmetros antes do handler', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('6', 'player.seek', { positionMs: -5 }))
    const [reply] = await context.replies()
    expect(reply.message).toMatchObject({ ok: false, error: { code: 'invalid_params' } })
    expect(context.handlers['player.seek']).not.toHaveBeenCalled()
  })

  it('repassa o código de erro do handler', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('7', 'player.play'))
    const [reply] = await context.replies()
    expect(reply.message).toMatchObject({ ok: false, error: { code: 'player_error', message: 'NOT_READY: carregando' } })
  })

  it('responde unsupported_version a outra versão da ponte', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send(request('8', 'platform.getInfo', undefined, BRIDGE_VERSION + 1))
    const [reply] = await context.replies()
    expect(reply.message).toMatchObject({ version: BRIDGE_VERSION, ok: false, error: { code: 'unsupported_version' } })
    expect(context.handlers['platform.getInfo']).not.toHaveBeenCalled()
  })

  it('ignora outros protocolos', async () => {
    const context = setup()
    dispose = context.host.dispose
    context.send({ ...request('9', 'platform.getInfo'), protocol: 'outro' })
    expect(await context.replies()).toHaveLength(0)
  })

  it('envia eventos somente à origem exata', () => {
    const context = setup()
    dispose = context.host.dispose
    context.host.emit('remote.key', { key: 'MediaPlayPause', keyCode: 10252 })
    expect(context.contentWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'event', event: 'remote.key', data: { key: 'MediaPlayPause', keyCode: 10252 } }),
      ORIGIN,
    )
  })

  it('para de responder após dispose', async () => {
    const context = setup()
    context.host.dispose()
    context.send(request('10', 'platform.getInfo'))
    expect(await context.replies()).toHaveLength(0)
  })
})
