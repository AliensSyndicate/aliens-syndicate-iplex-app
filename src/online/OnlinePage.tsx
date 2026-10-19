import { useEffect, useState } from 'react'
import { BridgeCallError, createBridgeClient } from '../bridge/client'
import type { PlatformInfo } from '../bridge/protocol'
import { subscribeNetworkChanges } from '../connection/connectivity'
import { reportDevEvent } from '../devtools/devReport'
import { describeKey, toRemoteAction } from '../navigation/remoteKeys'
import { IplexWordmark } from '../ui/IplexWordmark'
import './online.css'

/**
 * Página de teste controlada "IPLEX TIZEN ONLINE" (fixture deste repositório,
 * NÃO é o iPlex Web). Faz o papel do frontend dentro do shell: handshake
 * app.ready, informações da plataforma e teste do player pela ponte.
 */

const bridge = createBridgeClient()
const TEST_MEDIA_URL = import.meta.env.VITE_IPLEX_TEST_MEDIA_URL
const loadedAt = new Date()
const PLAYBACK_TARGET_MS = 3000
const PLAYBACK_TIMEOUT_MS = 40000

type StepStatus = 'running' | 'ok' | 'error' | 'skipped'
interface Step {
  id: string
  label: string
  status: StepStatus
  detail: string
}

interface KeyRecord {
  name: string
  code: number
  action: string
}

let started = false

function errorText(error: unknown): string {
  if (error instanceof BridgeCallError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

export function OnlinePage() {
  const [online, setOnline] = useState(navigator.onLine)
  const [info, setInfo] = useState<PlatformInfo | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [lastKey, setLastKey] = useState<KeyRecord | null>(null)
  const [keyCount, setKeyCount] = useState(0)

  useEffect(() => subscribeNetworkChanges(setOnline), [])

  // Sequência de testes da ponte (uma vez por carregamento).
  useEffect(() => {
    if (started) return
    started = true

    const record = (id: string, label: string, status: StepStatus, detail = '') => {
      setSteps((current) => [...current.filter((step) => step.id !== id), { id, label, status, detail }])
      if (status !== 'running') reportDevEvent(status === 'error' ? 'test:error' : `test:${id}`, `${status} ${detail}`.trim())
    }

    const run = async () => {
      if (!bridge.available) {
        record('bridge', 'Ponte com o app de TV', 'skipped', 'página aberta fora do shell')
        reportDevEvent('test:done', 'sem ponte')
        return
      }

      record('ready', 'Handshake app.ready', 'running')
      const platformInfo = await bridge.call('app.ready', { version: 'test-page' })
      setInfo(platformInfo)
      record(
        'ready',
        'Handshake app.ready',
        'ok',
        `${platformInfo.platform} ${platformInfo.platformVersion ?? ''} · player nativo: ${platformInfo.capabilities.nativePlayer ? 'sim' : 'não'}`,
      )

      if (!TEST_MEDIA_URL) {
        record('player', 'Player', 'skipped', 'VITE_IPLEX_TEST_MEDIA_URL não definida')
        reportDevEvent('test:done', 'sem mídia de teste')
        return
      }

      record('player', 'Reprodução (player.open/play)', 'running', TEST_MEDIA_URL)
      const reached = new Promise<{ positionMs: number; durationMs: number }>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('reprodução não avançou a tempo')), PLAYBACK_TIMEOUT_MS)
        const stopTime = bridge.on('player.time', (time) => {
          if (time.positionMs < PLAYBACK_TARGET_MS) return
          window.clearTimeout(timer)
          stopTime()
          resolve(time)
        })
        bridge.on('player.error', (error) => {
          window.clearTimeout(timer)
          reject(new Error(`${error.code}: ${error.message}`))
        })
      })
      bridge.on('player.state', (status) => document.documentElement.classList.toggle('iplex-media-active', status.state === 'playing' || status.state === 'paused'))

      await bridge.call('player.open', { url: TEST_MEDIA_URL, autoplay: true })
      const time = await reached
      record('player', 'Reprodução (player.open/play)', 'ok', `posição ${time.positionMs} ms de ${time.durationMs} ms`)

      const tracks = await bridge.call('player.getTracks')
      const audio = tracks.filter((track) => track.kind === 'audio').length
      const text = tracks.filter((track) => track.kind === 'text').length
      record('tracks', 'Faixas (player.getTracks)', 'ok', `${audio} áudio, ${text} legenda`)

      const paused = await bridge.call('player.pause')
      record('pause', 'Pausa (player.pause)', paused.state === 'paused' ? 'ok' : 'error', `estado ${paused.state}`)

      const stopped = await bridge.call('player.stop')
      document.documentElement.classList.remove('iplex-media-active')
      record('stop', 'Parada (player.stop)', stopped.state === 'idle' ? 'ok' : 'error', `estado ${stopped.state}`)

      reportDevEvent('test:done', 'ponte e player verificados')
    }

    run().catch((error: unknown) => {
      document.documentElement.classList.remove('iplex-media-active')
      record('failure', 'Falha no teste', 'error', errorText(error))
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = toRemoteAction(event)
      setLastKey({ name: describeKey(event), code: event.keyCode, action: action ?? '—' })
      setKeyCount((count) => count + 1)
      if (action === 'back') {
        event.preventDefault()
        // Dentro do shell, Return na tela principal encerra o app pela ponte.
        if (bridge.available) void bridge.call('app.exit').catch(() => undefined)
        else window.history.back()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const rows: [string, string][] = [
    ['URL carregada', window.location.href],
    ['Carregada em', loadedAt.toLocaleString('pt-BR')],
    ['Rede', online ? 'online' : 'offline'],
    ['Plataforma (ponte)', info ? `${info.platform} ${info.platformVersion ?? ''} · app ${info.appVersion}` : '—'],
    ['User-Agent', navigator.userAgent],
  ]

  return (
    <main className="online">
      <IplexWordmark className="online-wordmark" />
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
        <h2>Teste do controle remoto</h2>
        <p>
          {lastKey
            ? `Última tecla: ${lastKey.name} (keyCode ${lastKey.code}) → ação ${lastKey.action} · total ${keyCount}`
            : 'Pressione as setas ou OK. Return encerra o app.'}
        </p>
      </section>
    </main>
  )
}
