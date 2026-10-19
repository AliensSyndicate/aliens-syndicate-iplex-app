import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY, firebaserc, hostingConfig } from './hosting-config.mjs'

const { hosting } = hostingConfig()
const rule = (source) => hosting.headers.find((entry) => entry.source === source)
const keys = (source) => rule(source).headers.map((header) => header.key)

describe('hostingConfig (iPlex Web no site iplex-2c8fc)', () => {
  it('aponta para o site e o projeto confirmados', () => {
    expect(hosting.site).toBe('iplex-2c8fc')
    expect(firebaserc()).toEqual({ projects: { default: 'iplex-2c8fc' } })
  })

  it('fallback SPA para index.html', () => {
    expect(hosting.rewrites).toEqual([{ source: '**', destination: '/index.html' }])
  })

  it('nunca envia X-Frame-Options nem CSP frame-ancestors (o app Tizen embute o Web)', () => {
    const all = hosting.headers.flatMap((entry) => entry.headers)
    expect(all.some((header) => header.key.toLowerCase() === 'x-frame-options')).toBe(false)
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/frame-ancestors/)
  })

  it("CSP sem 'unsafe-inline'/'unsafe-eval' (exigência Samsung para hosted apps)", () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-(inline|eval)/)
  })

  it('segurança em tudo; páginas sem cache; assets imutáveis', () => {
    expect(keys('**')).toEqual(expect.arrayContaining(['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']))
    for (const source of ['/', '**/!(*.*)', '**/*.html']) expect(rule(source).headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' })
    expect(rule('/assets/**').headers).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' })
  })

  it('manifesto com CORS aberto e sem cache', () => {
    expect(rule('/iplex-web.json').headers).toEqual(
      expect.arrayContaining([
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Cache-Control', value: 'no-cache' },
      ]),
    )
  })
})
