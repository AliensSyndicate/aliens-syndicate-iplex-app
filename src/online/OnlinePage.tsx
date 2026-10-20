import { useEffect, useState } from 'react'
import { BridgeCallError, createBridgeClient } from '../bridge/client'
import type { BridgeEventName, BridgeEvents, MediaTrack, PlatformInfo, PlayerStatus, RemoteKeyMap, RemoteKeyName } from '../bridge/protocol'
import { subscribeNetworkChanges } from '../connection/connectivity'
import { reportDevEvent } from '../devtools/devReport'
import { toRemoteAction } from '../navigation/remoteKeys'
import { IplexLogo } from '../design-system/IplexLogo'
import './online.css'

/**
 * Página de teste controlada "IPLEX TIZEN ONLINE" (fixture deste repositório,
 * NÃO é o iPlex Web). Faz o papel do frontend dentro do shell:
 *  1. sequência automática pela ponte: handshake, reprodução, pausa,
 *     retomada, busca, troca de canal, faixas de áudio e legendas;
 *  2. modo interativo do controle remoto: ↑/↓ canal, OK pausa/continua,
 *     ←/→ ±10 s, Return encerra o app (app.exit).
 * Cada passo é exibido na tela e reportado ao Mac em `npm run tv`.
 */

const bridge = createBridgeClient()
const CHANNELS = (import.meta.env.VITE_IPLEX_TEST_CHANNELS ?? '').split(/\s+/).filter(Boolean)
const loadedAt = new Date()
const PLAY_TIMEOUT_MS = 30000
const SEEK_STEP_MS = 10000

type StepStatus = 'running' | 'ok' | 'error' | 'warn' | 'skipped'
interface Step {
  id: string
  label: string
  status: StepStatus
  detail: string
}

let started = false
let interactive = false
let currentChannel = 0
/** Mapa de teclas informado pelo shell (app.ready). */
let keyMap: RemoteKeyMap = {}

const BASIC_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter', back: 'Back' } as const

/** Tecla normalizada: primeiro pelo mapa do shell (inclui mídia), depois pelas teclas básicas. */
function keyFromEvent(event: KeyboardEvent): RemoteKeyName | null {
  const match = (Object.entries(keyMap) as [RemoteKeyName, number][]).find(([, code]) => code === event.keyCode)
  if (match) return match[0]
  const action = toRemoteAction(event)
  return action ? BASIC_KEYS[action] : null
}

function errorText(error: unknown): string {
  if (error instanceof BridgeCallError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

function channelName(index: number): string {
  return `canal ${index + 1}`
}

/** Espera um evento da ponte que satisfaça `match`; falha em player.error ou tempo esgotado. */
function waitForEvent<E extends BridgeEventName>(
  name: E,
  match: (data: BridgeEvents[E]) => boolean,
  timeoutMs: number,
  description: string,
): Promise<BridgeEvents[E]> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer)
      stopEvent()
      stopError()
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`tempo esgotado: ${description}`))
    }, timeoutMs)
    const stopEvent = bridge.on(name, (data) => {
      if (!match(data)) return
      cleanup()
      resolve(data)
    })
    const stopError = bridge.on('player.error', (error) => {
      cleanup()
      reject(new Error(`player.error ${error.code}: ${error.message}`))
    })
  })
}

const waitForPosition = (minMs: number, description: string) =>
  waitForEvent('player.time', (time) => time.positionMs >= minMs, PLAY_TIMEOUT_MS, description)

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function describeTracks(tracks: MediaTrack[]): string {
  const list = (kind: MediaTrack['kind']) =>
    tracks
      .filter((track) => track.kind === kind)
      .map((track) => `${track.index}:${track.language ?? '?'}${track.selected ? '*' : ''}`)
      .join(' ')
  return `áudio [${list('audio') || '—'}] · legenda [${list('text') || '—'}]`
}

export function OnlinePage() {
  const [online, setOnline] = useState(navigator.onLine)
  const [info, setInfo] = useState<PlatformInfo | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [player, setPlayer] = useState<PlayerStatus | null>(null)
  const [lastKey, setLastKey] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => subscribeNetworkChanges(setOnline), [])

  useEffect(() => {
    const stopState = bridge.on('player.state', (status) => {
      setPlayer(status)
      document.documentElement.classList.toggle(
        'iplex-media-active',
        status.state === 'playing' || status.state === 'paused' || status.state === 'loading' || status.state === 'ready',
      )
    })
    const stopTime = bridge.on('player.time', (time) =>
      setPlayer((current) => (current ? { ...current, positionMs: time.positionMs, durationMs: time.durationMs } : current)),
    )
    const stopVisibility = bridge.on('app.visibility', ({ visible }) => reportDevEvent('test:visibility', visible ? 'visível' : 'oculto'))
    return () => {
      stopState()
      stopTime()
      stopVisibility()
    }
  }, [])

  // Sequência automática (uma vez por carregamento).
  useEffect(() => {
    if (started) return
    started = true

    const record = (id: string, label: string, status: StepStatus, detail = '') => {
      setSteps((current) => {
        const index = current.findIndex((step) => step.id === id)
        const next = { id, label, status, detail }
        return index === -1 ? [...current, next] : current.map((step, position) => (position === index ? next : step))
      })
      if (status === 'running') return
      const name = status === 'error' ? 'test:error' : status === 'warn' ? 'test:warn' : `test:${id}`
      reportDevEvent(name, `${status} ${label}: ${detail}`.trim())
    }

    /**
     * Executa um passo. `fatal` interrompe a sequência; `limitation` marca
     * recursos que dependem do aparelho/stream (falha vira aviso, não erro).
     */
    const step = async (id: string, label: string, action: () => Promise<string>, fatal = false, limitation = false) => {
      record(id, label, 'running')
      try {
        record(id, label, 'ok', await action())
        return true
      } catch (error) {
        record(id, label, limitation ? 'warn' : 'error', errorText(error))
        if (fatal) throw error
        return false
      }
    }

    const openChannel = async (index: number) => {
      currentChannel = index
      await bridge.call('player.open', { url: CHANNELS[index], autoplay: true })
      const time = await waitForPosition(3000, `${channelName(index)} tocar 3 s`)
      return `${channelName(index)} tocando · ${time.positionMs} ms de ${time.durationMs} ms`
    }

    const run = async () => {
      if (!bridge.available) {
        record('bridge', 'Ponte com o app de TV', 'skipped', 'página aberta fora do shell')
        reportDevEvent('test:done', 'sem ponte')
        return
      }

      await step(
        'ready',
        'Handshake app.ready',
        async () => {
          const platformInfo = await bridge.call('app.ready', { version: 'test-page' })
          setInfo(platformInfo)
          keyMap = platformInfo.keys
          const mediaKeys = Object.keys(platformInfo.keys).filter((name) => /^(Media|Channel)/.test(name))
          return [
            `${platformInfo.platform} ${platformInfo.platformVersion ?? ''}`,
            `ponte v${platformInfo.bridge.version} (${platformInfo.bridge.methods.length} métodos)`,
            `player ${platformInfo.capabilities.nativePlayer ? 'AVPlay' : 'HTML5'}`,
            `modelo ${platformInfo.device.model ?? '—'}`,
            `tela ${platformInfo.device.screen.width}x${platformInfo.device.screen.height}`,
            `teclas de mídia: ${mediaKeys.join(', ') || 'nenhuma'}`,
            `instalação ${platformInfo.installationId.slice(0, 8)}…`,
          ].join(' · ')
        },
        true,
      )

      if (CHANNELS.length === 0) {
        record('player', 'Player', 'skipped', 'VITE_IPLEX_TEST_CHANNELS não definida')
        reportDevEvent('test:done', 'sem canais de teste')
        return
      }

      await step('play', `Reprodução (${channelName(0)})`, () => openChannel(0), true)

      await step('pause', 'Pausa (player.pause)', async () => {
        const paused = await bridge.call('player.pause')
        if (paused.state !== 'paused') throw new Error(`estado ${paused.state}`)
        const before = (await bridge.call('player.getStatus')).positionMs
        await sleep(2000)
        const after = (await bridge.call('player.getStatus')).positionMs
        if (Math.abs(after - before) > 500) throw new Error(`posição andou pausada: ${before} → ${after} ms`)
        return `pausado em ${after} ms (parado por 2 s)`
      })

      await step('resume', 'Retomada (player.play)', async () => {
        const resumed = await bridge.call('player.play')
        const from = resumed.positionMs
        const time = await waitForPosition(from + 2000, 'retomar 2 s')
        return `estado ${resumed.state} · ${from} → ${time.positionMs} ms`
      })

      await step('seek', 'Busca (player.seek +30 s)', async () => {
        const target = (await bridge.call('player.getStatus')).positionMs + 30000
        await bridge.call('player.seek', { positionMs: target })
        const time = await waitForPosition(target + 1000, 'tocar após a busca')
        return `alvo ${target} ms · tocando em ${time.positionMs} ms`
      })

      if (CHANNELS.length > 1) {
        await step('switch', `Troca de canal (${channelName(0)} → ${channelName(1)})`, () => openChannel(1))
        // Regressão: ↑/↓ rápido no controle. O primeiro pedido deve terminar logo (SUPERSEDED), sem ficar pendurado.
        await step('rapid', 'Troca rápida de canal (dois pedidos seguidos)', async () => {
          const startedAt = Date.now()
          const first = bridge.call('player.open', { url: CHANNELS[0], autoplay: true }).then(
            () => 'concluído',
            (error: unknown) => errorText(error),
          )
          currentChannel = 1
          const second = bridge.call('player.open', { url: CHANNELS[1], autoplay: true })
          const firstOutcome = await first
          const firstMs = Date.now() - startedAt
          if (firstMs > 10000) throw new Error(`primeiro pedido levou ${firstMs} ms (${firstOutcome})`)
          await second
          const time = await waitForPosition(3000, 'segundo canal tocar 3 s')
          return `1º: ${firstOutcome} em ${firstMs} ms · 2º tocando em ${time.positionMs} ms`
        })
      }

      // Canais extras: troca de áudio e legendas onde o stream oferecer.
      let audioTested = false
      let subtitlesTested = false
      for (let index = 2; index < CHANNELS.length; index += 1) {
        const opened = await step(`channel${index + 1}`, `Reprodução (${channelName(index)})`, () => openChannel(index))
        if (!opened) continue
        const tracks = await bridge.call('player.getTracks')
        record(`tracks${index + 1}`, `Faixas do ${channelName(index)}`, 'ok', describeTracks(tracks))
        const audio = tracks.filter((track) => track.kind === 'audio')
        const text = tracks.filter((track) => track.kind === 'text')

        if (!audioTested && audio.length > 1) {
          audioTested = true
          await step('audio', `Troca de áudio (${channelName(index)})`, async () => {
            const target = audio.find((track) => !track.selected) ?? audio[1]
            const requestedAt = Date.now()
            await bridge.call('player.selectTrack', { kind: 'audio', index: target.index })
            // A documentação não diz se a troca é síncrona: consulta a faixa ativa por até 6 s.
            let selected: MediaTrack | undefined
            while (Date.now() - requestedAt < 6000) {
              selected = (await bridge.call('player.getTracks')).find((track) => track.kind === 'audio' && track.selected)
              if (selected?.index === target.index) break
              await sleep(500)
            }
            if (selected?.index !== target.index) {
              throw new Error(`pedido ${target.index}:${target.language ?? '?'}, ativo após 6 s ${selected ? `${selected.index}:${selected.language ?? '?'}` : 'desconhecido'}`)
            }
            const time = await waitForPosition((await bridge.call('player.getStatus')).positionMs + 2000, 'tocar após trocar o áudio')
            return `faixa ${target.index} ativa em ${Date.now() - requestedAt} ms · tocando em ${time.positionMs} ms`
          }, false, true)
        }

        if (!subtitlesTested && text.length > 0) {
          subtitlesTested = true
          await step('subtitles', `Legendas (${channelName(index)})`, async () => {
            // Prefere um idioma diferente do ativo, para testar a troca de fato.
            const active = text.find((track) => track.selected)
            const target =
              text.find((track) => !track.selected && track.language !== active?.language) ??
              text.find((track) => !track.selected) ??
              text[0]
            await bridge.call('player.selectTrack', { kind: 'text', index: target.index })
            await bridge.call('player.setSubtitlesVisible', { visible: true })
            const cue = await waitForEvent('player.subtitle', (data) => data.text.length > 0, 20000, 'receber texto de legenda')
            return `${target.language ?? target.index} · "${cue.text.replace(/\s+/g, ' ').slice(0, 40)}"`
          }, false, true)
        }
      }
      if (CHANNELS.length > 2) {
        if (!audioTested) record('audio', 'Troca de áudio', 'skipped', 'nenhum canal com 2+ faixas de áudio')
        if (!subtitlesTested) record('subtitles', 'Legendas', 'skipped', 'nenhum canal com legendas')
        // Volta ao canal 1 para o teste interativo.
        await step('back', `Retorno ao ${channelName(0)}`, () => openChannel(0))
      }

      interactive = true
      setReady(true)
      reportDevEvent('test:done', 'sequência automática concluída; modo interativo do controle remoto ativo')
    }

    run().catch((error: unknown) => {
      record('failure', 'Falha no teste', 'error', errorText(error))
      reportDevEvent('test:failed', errorText(error))
    })
  }, [])

  // Controle remoto: registra todas as teclas; no modo interativo, comanda o player.
  useEffect(() => {
    const seekBy = async (deltaMs: number) => {
      const status = await bridge.call('player.getStatus')
      const target = Math.max(0, status.positionMs + deltaMs)
      await bridge.call('player.seek', { positionMs: target })
      return `busca para ${target} ms`
    }
    const switchChannel = async (step: 1 | -1) => {
      const next = (currentChannel + (step === 1 ? 1 : CHANNELS.length - 1)) % CHANNELS.length
      currentChannel = next
      await bridge.call('player.open', { url: CHANNELS[next], autoplay: true })
      return `${channelName(next)} aberto`
    }
    const remote = async (key: RemoteKeyName): Promise<string | null> => {
      switch (key) {
        case 'ArrowUp':
        case 'ChannelUp':
          return switchChannel(1)
        case 'ArrowDown':
        case 'ChannelDown':
          return switchChannel(-1)
        case 'Enter':
        case 'MediaPlayPause': {
          const status = await bridge.call('player.getStatus')
          const after = status.state === 'playing' ? await bridge.call('player.pause') : await bridge.call('player.play')
          return `estado ${after.state}`
        }
        case 'MediaPlay':
          return `estado ${(await bridge.call('player.play')).state}`
        case 'MediaPause':
          return `estado ${(await bridge.call('player.pause')).state}`
        case 'MediaStop':
          return `estado ${(await bridge.call('player.stop')).state}`
        case 'ArrowRight':
        case 'MediaFastForward':
          return seekBy(SEEK_STEP_MS)
        case 'ArrowLeft':
        case 'MediaRewind':
          return seekBy(-SEEK_STEP_MS)
        default:
          return null
      }
    }

    const handleKey = (key: RemoteKeyName | null, keyCode: number, origin: 'iframe' | 'shell', event?: KeyboardEvent) => {
      setLastKey(`${key ?? 'desconhecida'} (keyCode ${keyCode}${origin === 'shell' ? ', via shell' : ''})`)
      if (key === 'Back') {
        event?.preventDefault()
        reportDevEvent('test:exit', 'Return → app.exit')
        // Dentro do shell, Return na tela principal encerra o app pela ponte.
        if (bridge.available) void bridge.call('app.exit').catch(() => undefined)
        else window.history.back()
        return
      }
      if (!key || !interactive || CHANNELS.length === 0) return
      event?.preventDefault()
      remote(key).then(
        (result) => result && reportDevEvent('remote', `${key}: ${result}`),
        (error: unknown) => reportDevEvent('remote', `${key}: erro ${errorText(error)}`),
      )
    }

    const handleKeyDown = (event: KeyboardEvent) => handleKey(keyFromEvent(event), event.keyCode, 'iframe', event)
    const stopForwarded = bridge.on('remote.key', ({ key, keyCode }) => handleKey(key, keyCode, 'shell'))
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      stopForwarded()
    }
  }, [])

  const rows: [string, string][] = [
    ['URL carregada', window.location.href],
    ['Carregada em', loadedAt.toLocaleString('pt-BR')],
    ['Rede', online ? 'online' : 'offline'],
    ['Plataforma (ponte)', info ? `${info.platform} ${info.platformVersion ?? ''} · app ${info.appVersion}` : '—'],
    ['Player', player ? `${player.state} · ${Math.round(player.positionMs / 1000)} s · ${channelName(currentChannel)}` : '—'],
  ]

  return (
    <main className="online">
      <IplexLogo className="online-logo" />
      <h1 className="online-title">IPLEX TIZEN ONLINE</h1>
      <p className="online-subtitle">Página de teste controlada — não é o iPlex Web</p>

      <dl className="online-facts">
        {rows.map(([label, value]) => (
          <div className="online-fact" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <ol className="online-steps">
        {steps.map((step) => (
          <li key={step.id} className={`online-step is-${step.status}`}>
            <span>{step.label}</span>
            <span>{step.detail}</span>
          </li>
        ))}
      </ol>

      <section className="online-keys">
        <h2>{ready ? 'Controle remoto ativo' : 'Teste automático em andamento…'}</h2>
        <p>↑/↓ ou CH+/CH− canal · OK ou ⏯ pausa/continua · ⏹ para · ←/→ ou ⏪/⏩ 10 s · Return encerra</p>
        {lastKey && <p>Última tecla: {lastKey}</p>}
      </section>
    </main>
  )
}
