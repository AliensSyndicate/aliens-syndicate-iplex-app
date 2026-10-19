import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayPlayer } from './avplayPlayer'

/** AVPlay simulado SOMENTE para teste de lógica; a validação real é feita na TV (npm run tv). */
function fakeAvplay({ prepare = 'success' as 'success' | 'never' | 'error' } = {}) {
  let state: AVPlayPlayerState = 'NONE'
  const avplay = {
    open: vi.fn(() => {
      state = 'IDLE'
    }),
    close: vi.fn(() => {
      state = 'NONE'
    }),
    prepareAsync: vi.fn((success?: () => void, error?: (e: unknown) => void) => {
      if (prepare === 'success') {
        state = 'READY'
        success?.()
      } else if (prepare === 'error') {
        error?.({ name: 'PLAYER_ERROR_CONNECTION_FAILED', message: 'falhou' })
      }
    }),
    play: vi.fn(() => {
      state = 'PLAYING'
    }),
    pause: vi.fn(() => {
      state = 'PAUSED'
    }),
    stop: vi.fn(() => {
      state = 'IDLE'
    }),
    seekTo: vi.fn((_ms: number, success?: () => void) => success?.()),
    getState: vi.fn(() => state),
    getDuration: vi.fn(() => 600000),
    getCurrentTime: vi.fn(() => 0),
    getTotalTrackInfo: vi.fn(() => [
      { index: 0, type: 'AUDIO', extra_info: '{"language":"eng"}' },
      { index: 1, type: 'AUDIO', extra_info: '{"language":"ita"}' },
      { index: 0, type: 'TEXT', extra_info: '{"track_lang":"en"}' },
    ]),
    getCurrentStreamInfo: vi.fn(() => [
      { index: 0, type: 'AUDIO', extra_info: '' },
      { index: 0, type: 'TEXT', extra_info: '' },
    ]),
    setSelectTrack: vi.fn(),
    setSilentSubtitle: vi.fn(),
    setDisplayRect: vi.fn(),
    setDisplayMethod: vi.fn(),
    setListener: vi.fn(),
  }
  return avplay as typeof avplay & AVPlayManager
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('createAvplayPlayer', () => {
  it('segue o ciclo documentado e toca com autoplay', async () => {
    const avplay = fakeAvplay()
    const player = createAvplayPlayer(avplay)
    expect(document.querySelector('object[type="application/avplayer"]')).not.toBeNull()
    const status = await player.open('https://example.test/a.m3u8', { autoplay: true })
    expect(avplay.open).toHaveBeenCalledWith('https://example.test/a.m3u8')
    expect(avplay.setDisplayRect).toHaveBeenCalledWith(0, 0, 1920, 1080)
    expect(status).toMatchObject({ state: 'playing', durationMs: 600000 })
    player.destroy()
    expect(document.querySelector('object[type="application/avplayer"]')).toBeNull()
  })

  it('um open substituído termina na hora com SUPERSEDED (troca rápida de canal)', async () => {
    const avplay = fakeAvplay({ prepare: 'never' })
    const player = createAvplayPlayer(avplay)
    const first = player.open('https://example.test/canal1.m3u8')
    void player.open('https://example.test/canal2.m3u8')
    await expect(first).rejects.toMatchObject({ code: 'SUPERSEDED' })
  })

  it('erro de prepare vira estado error', async () => {
    const player = createAvplayPlayer(fakeAvplay({ prepare: 'error' }))
    await expect(player.open('https://example.test/x.m3u8')).rejects.toMatchObject({ code: 'PLAYER_ERROR_CONNECTION_FAILED' })
    expect(player.getStatus().state).toBe('error')
  })

  it('tempo limite de open (40 s) reinicia o player', async () => {
    vi.useFakeTimers()
    const avplay = fakeAvplay({ prepare: 'never' })
    const player = createAvplayPlayer(avplay)
    const opening = player.open('https://example.test/lento.m3u8')
    vi.advanceTimersByTime(40000)
    await expect(opening).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(avplay.close).toHaveBeenCalled()
  })

  it('comandos durante o carregamento devolvem NOT_READY', () => {
    const player = createAvplayPlayer(fakeAvplay({ prepare: 'never' }))
    void player.open('https://example.test/x.m3u8').catch(() => undefined)
    expect(() => player.play()).toThrow(expect.objectContaining({ code: 'NOT_READY' }))
    expect(() => player.pause()).toThrow(expect.objectContaining({ code: 'NOT_READY' }))
  })

  it('sem mídia aberta devolve NO_MEDIA', () => {
    const player = createAvplayPlayer(fakeAvplay())
    expect(() => player.play()).toThrow(expect.objectContaining({ code: 'NO_MEDIA' }))
  })

  it('lista faixas com idioma e seleção atual', async () => {
    const player = createAvplayPlayer(fakeAvplay())
    await player.open('https://example.test/x.m3u8', { autoplay: true })
    expect(player.getTracks()).toEqual([
      { kind: 'audio', index: 0, language: 'eng', selected: true },
      { kind: 'audio', index: 1, language: 'ita', selected: false },
      { kind: 'text', index: 0, language: 'en', selected: true },
    ])
  })

  it('selecionar a faixa já ativa não chama o AVPlay (evita INVALID_PARAMETER)', async () => {
    const avplay = fakeAvplay()
    const player = createAvplayPlayer(avplay)
    await player.open('https://example.test/x.m3u8', { autoplay: true })
    player.selectTrack('text', 0)
    expect(avplay.setSelectTrack).not.toHaveBeenCalled()
    player.selectTrack('audio', 1)
    expect(avplay.setSelectTrack).toHaveBeenCalledWith('AUDIO', 1)
  })

  it('faixa inexistente devolve NO_TRACK', async () => {
    const player = createAvplayPlayer(fakeAvplay())
    await player.open('https://example.test/x.m3u8', { autoplay: true })
    expect(() => player.selectTrack('audio', 9)).toThrow(expect.objectContaining({ code: 'NO_TRACK' }))
  })
})
