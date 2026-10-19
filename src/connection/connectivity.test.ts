import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLaunchTarget } from '../config/launchTarget'
import { checkTarget } from './connectivity'

const target = resolveLaunchTarget('https://iplex-2c8fc.web.app/')
const options = { timeoutMs: 1000, bridgeVersion: 1 }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn()
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response)
    else fetchMock.mockResolvedValueOnce(response)
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('checkTarget', () => {
  it('pronto quando o manifesto identifica o iPlex Web e a versão da ponte', async () => {
    const fetchMock = mockFetch(jsonResponse({ app: 'iplex-web', version: '1.2.0', bridgeVersion: 1 }))
    await expect(checkTarget(target, options)).resolves.toEqual({
      status: 'ready',
      manifest: { app: 'iplex-web', version: '1.2.0', bridgeVersion: 1 },
    })
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/iplex-2c8fc\.web\.app\/iplex-web\.json\?/)
  })

  it('sem rede quando o navegador informa offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(checkTarget(target, options)).resolves.toEqual({ status: 'offline' })
  })

  it('soft 404 (página HTML com status 200) = não publicado', async () => {
    mockFetch(new Response('<html><title>404 — Sinal perdido</title></html>', { status: 200 }))
    await expect(checkTarget(target, options)).resolves.toMatchObject({ status: 'not-deployed' })
  })

  it('HTTP 404 = não publicado', async () => {
    mockFetch(new Response('not found', { status: 404 }))
    await expect(checkTarget(target, options)).resolves.toMatchObject({ status: 'not-deployed' })
  })

  it('HTTP 5xx = falha no servidor', async () => {
    mockFetch(new Response('erro', { status: 503 }))
    await expect(checkTarget(target, options)).resolves.toEqual({ status: 'server-error', httpStatus: 503 })
  })

  it('outra versão da ponte = incompatível', async () => {
    mockFetch(jsonResponse({ app: 'iplex-web', version: '2.0.0', bridgeVersion: 2 }))
    await expect(checkTarget(target, options)).resolves.toMatchObject({ status: 'incompatible' })
  })

  it('manifesto de outro app = não publicado', async () => {
    mockFetch(jsonResponse({ app: 'outro', bridgeVersion: 1 }))
    await expect(checkTarget(target, options)).resolves.toMatchObject({ status: 'not-deployed' })
  })

  it('falha de CORS com servidor no ar = não publicado', async () => {
    mockFetch(new TypeError('Failed to fetch'), new Response(null, { status: 200 }))
    await expect(checkTarget(target, options)).resolves.toMatchObject({ status: 'not-deployed' })
  })

  it('servidor fora do ar = indisponível', async () => {
    mockFetch(new TypeError('Failed to fetch'), new TypeError('Failed to fetch'))
    await expect(checkTarget(target, options)).resolves.toMatchObject({ status: 'unreachable' })
  })

  it('tempo esgotado = indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    await expect(checkTarget(target, { ...options, timeoutMs: 20 })).resolves.toEqual({ status: 'unreachable', detail: 'tempo esgotado' })
  })

  it('conteúdo empacotado não consulta a rede', async () => {
    const fetchMock = mockFetch()
    await expect(checkTarget(resolveLaunchTarget('./index.html'), options)).resolves.toEqual({ status: 'ready', manifest: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
