import { beforeEach, describe, expect, it, vi } from 'vitest'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => vi.resetModules())

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
  }
}

describe('installationId', () => {
  it('gera UUID v4 válido', async () => {
    const { createUuid } = await import('./installationId')
    for (let i = 0; i < 20; i += 1) expect(createUuid()).toMatch(UUID_V4)
  })

  it('persiste e reutiliza o mesmo ID', async () => {
    const storage = memoryStorage()
    const { getInstallationId } = await import('./installationId')
    const first = getInstallationId(storage)
    expect(first).toMatch(UUID_V4)
    expect(storage.data['iplex.installationId']).toBe(first)
    vi.resetModules()
    const again = await import('./installationId')
    expect(again.getInstallationId(storage)).toBe(first)
  })

  it('substitui valor armazenado inválido', async () => {
    const storage = memoryStorage({ 'iplex.installationId': 'qualquer-coisa' })
    const { getInstallationId } = await import('./installationId')
    expect(getInstallationId(storage)).toMatch(UUID_V4)
  })
})
