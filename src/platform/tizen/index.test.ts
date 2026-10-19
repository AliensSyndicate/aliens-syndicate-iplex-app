import { describe, expect, it, vi } from 'vitest'
import { createTizenAdapter } from './index'

function fakeTizen(supported: { name: string; code: number }[]) {
  const registerKey = vi.fn()
  const tizen = {
    application: { getCurrentApplication: () => ({ exit: vi.fn(), hide: vi.fn() }) },
    systeminfo: {
      getCapability: (key: string) =>
        ({ 'http://tizen.org/feature/platform.version': '5.5', 'http://tizen.org/system/model_name': 'TESTE' })[key],
    },
    tvinputdevice: {
      getSupportedKeys: () => supported,
      getKey: (name: string) => supported.find((key) => key.name === name) ?? null,
      registerKey,
    },
  } as unknown as TizenGlobal
  return { tizen, registerKey }
}

describe('createTizenAdapter', () => {
  it('registra só as teclas de mídia suportadas e informa o código real', () => {
    const { tizen, registerKey } = fakeTizen([
      { name: 'MediaPlayPause', code: 10252 },
      { name: 'MediaStop', code: 413 },
      { name: 'ChannelUp', code: 427 },
      { name: 'Exit', code: 10182 },
      { name: 'ColorF0Red', code: 403 },
    ])
    const adapter = createTizenAdapter(tizen, undefined)
    expect(registerKey.mock.calls.map(([name]) => name)).toEqual(['MediaPlayPause', 'MediaStop', 'ChannelUp'])
    expect(adapter.keys).toMatchObject({ Back: 10009, Enter: 13, MediaPlayPause: 10252, MediaStop: 413, ChannelUp: 427 })
    expect(adapter.mediaKeys).toBe(true)
    expect(adapter.platformVersion).toBe('5.5')
    expect(adapter.model).toBe('TESTE')
  })

  it('nunca registra o Exit (precisa voltar à Home)', () => {
    const { tizen, registerKey } = fakeTizen([{ name: 'Exit', code: 10182 }])
    createTizenAdapter(tizen, undefined)
    expect(registerKey).not.toHaveBeenCalledWith('Exit')
  })

  it('sem AVPlay usa o player HTML5', () => {
    const adapter = createTizenAdapter(fakeTizen([]).tizen, undefined)
    expect(adapter.nativePlayer).toBe(false)
    expect(adapter.mediaKeys).toBe(false)
  })
})
