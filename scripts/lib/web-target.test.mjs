import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyWebTarget } from './web-target.mjs'

afterEach(() => vi.unstubAllGlobals())

function respond(routes) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const route = routes[String(url)]
      if (!route) throw new TypeError('fetch failed')
      return new Response(route.body, { status: route.status ?? 200, headers: route.headers ?? {} })
    }),
  )
}

const BASE = 'https://iplex.example/apps/iplex/'

describe('verifyWebTarget', () => {
  it('aprova manifesto com CORS, ponte compatível e sem X-Frame-Options', async () => {
    respond({
      [`${BASE}iplex-web.json`]: {
        body: JSON.stringify({ app: 'iplex-web', version: '1.0.0', bridgeVersion: 1 }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      },
      [BASE]: { body: '<html></html>' },
    })
    const result = await verifyWebTarget('https://iplex.example/apps/iplex', { bridgeVersion: 1 })
    expect(result.ok).toBe(true)
    expect(result.base.href).toBe(BASE)
  })

  it('reprova soft 404 e X-Frame-Options (situação atual do iplex-2c8fc.web.app)', async () => {
    respond({
      [`${BASE}iplex-web.json`]: { body: '<title>404 — Sinal perdido</title>', headers: { 'X-Frame-Options': 'SAMEORIGIN' } },
      [BASE]: { body: '<title>404 — Sinal perdido</title>', headers: { 'X-Frame-Options': 'SAMEORIGIN' } },
    })
    const result = await verifyWebTarget(BASE, { bridgeVersion: 1 })
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/não publicado/)
    expect(result.problems.join('\n')).toMatch(/X-Frame-Options/)
  })

  it('reprova qualquer frame-ancestors, inclusive "*" (bloqueia o pai file:// na TV)', async () => {
    respond({
      [`${BASE}iplex-web.json`]: {
        body: JSON.stringify({ app: 'iplex-web', version: '1.0.0', bridgeVersion: 1 }),
        headers: { 'Access-Control-Allow-Origin': '*' },
      },
      [BASE]: { body: '', headers: { 'Content-Security-Policy': "default-src 'self'; frame-ancestors *" } },
    })
    const result = await verifyWebTarget(BASE, { bridgeVersion: 1 })
    expect(result.ok).toBe(false)
    expect(result.problems[0]).toMatch(/frame-ancestors \*/)
  })

  it('reprova manifesto sem CORS e versão de ponte diferente', async () => {
    respond({
      [`${BASE}iplex-web.json`]: { body: JSON.stringify({ app: 'iplex-web', version: '2.0.0', bridgeVersion: 2 }) },
      [BASE]: { body: '' },
    })
    const result = await verifyWebTarget(BASE, { bridgeVersion: 1 })
    expect(result.problems).toHaveLength(2)
  })

  it('reprova servidor inacessível', async () => {
    respond({})
    const result = await verifyWebTarget(BASE, { bridgeVersion: 1, loadMode: 'navigate' })
    expect(result.ok).toBe(false)
    expect(result.problems[0]).toMatch(/inacessível/)
  })
})
