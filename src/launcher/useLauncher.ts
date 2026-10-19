import { useEffect, useState } from 'react'
import {
  LaunchConfigError,
  loadLauncherConfig,
  type LauncherConfig,
} from '../config/launchTarget'
import { checkTarget, subscribeNetworkChanges } from '../connection/connectivity'
import { logLaunchEvent } from './launchLog'

export type LaunchFailure =
  | { kind: 'config'; message: string }
  | { kind: 'offline' }
  | { kind: 'unreachable'; detail: string }
  | { kind: 'not-deployed'; detail: string }
  | { kind: 'server-error'; httpStatus: number }
  | { kind: 'incompatible'; detail: string }
  | { kind: 'load-timeout' }

export type LauncherState =
  | { phase: 'checking' }
  /** Modo frame: iframe carregando por trás da tela de carregamento. */
  | { phase: 'loading'; url: string }
  /** Modo frame: frontend confirmou app.ready. */
  | { phase: 'running'; url: string; frontendVersion: string | null }
  /** Modo navigate: navegação de nível superior em andamento. */
  | { phase: 'opening'; url: string }
  | { phase: 'failed'; failure: LaunchFailure }
  /** Modo navigate: voltou ao shell pelo histórico. */
  | { phase: 'returned'; url: string }

/** Marca, na sessão, que o shell já navegou para o destino (modo navigate). */
const OPENED_KEY = 'iplex.openedTarget'

function readOpened(): string | null {
  try {
    return window.sessionStorage.getItem(OPENED_KEY)
  } catch {
    return null
  }
}

function writeOpened(url: string | null) {
  try {
    if (url) window.sessionStorage.setItem(OPENED_KEY, url)
    else window.sessionStorage.removeItem(OPENED_KEY)
  } catch {
    // sessionStorage indisponível: o retorno será tratado como nova abertura.
  }
}

function loadConfig(): LauncherConfig | LaunchConfigError {
  try {
    return loadLauncherConfig()
  } catch (error) {
    return error instanceof LaunchConfigError ? error : new LaunchConfigError(String(error))
  }
}

const config = loadConfig()

/**
 * Somente desenvolvimento: `launcher.html?screen=<id>` exibe uma tela do shell
 * sem verificar a rede (para criação de layout). Removido do build de produção.
 */
export const PREVIEW_SCREENS = [
  'checking',
  'loading',
  'offline',
  'unreachable',
  'not-deployed',
  'server-error',
  'incompatible',
  'load-timeout',
  'config',
  'returned',
  'offline-banner',
] as const

function previewState(): { state: LauncherState; online: boolean } | null {
  if (!import.meta.env.DEV) return null
  const screen = new URLSearchParams(window.location.search).get('screen')
  const url = config instanceof LaunchConfigError ? 'https://alienssyndicate.com/apps/iplex/' : config.target.url
  const failed = (failure: LaunchFailure): LauncherState => ({ phase: 'failed', failure })
  switch (screen) {
    case 'checking':
      return { state: { phase: 'checking' }, online: true }
    case 'loading':
      return { state: { phase: 'opening', url }, online: true }
    case 'offline':
      return { state: failed({ kind: 'offline' }), online: false }
    case 'unreachable':
      return { state: failed({ kind: 'unreachable', detail: 'tempo esgotado' }), online: true }
    case 'not-deployed':
      return { state: failed({ kind: 'not-deployed', detail: `${url}iplex-web.json respondeu HTTP 404` }), online: true }
    case 'server-error':
      return { state: failed({ kind: 'server-error', httpStatus: 503 }), online: true }
    case 'incompatible':
      return { state: failed({ kind: 'incompatible', detail: 'iPlex Web 2.0.0 usa a ponte v2; este app usa v1' }), online: true }
    case 'load-timeout':
      return { state: failed({ kind: 'load-timeout' }), online: true }
    case 'config':
      return { state: failed({ kind: 'config', message: 'VITE_IPLEX_TARGET_URL não está definida para este ambiente.' }), online: true }
    case 'returned':
      return { state: { phase: 'returned', url }, online: true }
    case 'offline-banner':
      return { state: { phase: 'running', url: 'about:blank', frontendVersion: null }, online: false }
    default:
      return null
  }
}

const preview = previewState()

function initialState(): LauncherState {
  if (preview) return preview.state
  if (config instanceof LaunchConfigError) {
    return { phase: 'failed', failure: { kind: 'config', message: config.message } }
  }
  const opened = config.loadMode === 'navigate' ? readOpened() : null
  return opened ? { phase: 'returned', url: opened } : { phase: 'checking' }
}

const RETRY_ON_RECONNECT: LaunchFailure['kind'][] = ['offline', 'unreachable', 'server-error']

export function useLauncher() {
  const [state, setState] = useState<LauncherState>(initialState)
  const [request, setRequest] = useState<number | null>(() => (!preview && state.phase === 'checking' ? 0 : null))
  const [online, setOnline] = useState(() => (preview ? preview.online : navigator.onLine !== false))

  useEffect(() => {
    if (!preview && config instanceof LaunchConfigError) logLaunchEvent('config-error', config.message)
  }, [])

  // Verificação de rede e disponibilidade, seguida da abertura do destino.
  useEffect(() => {
    if (request === null || config instanceof LaunchConfigError) return
    let cancelled = false
    const { target, probeTimeoutMs, bridgeVersion, loadMode } = config
    logLaunchEvent('check', `${config.environment} ${target.kind} ${target.url}`)

    void checkTarget(target, { timeoutMs: probeTimeoutMs, bridgeVersion }).then((result) => {
      if (cancelled) return
      switch (result.status) {
        case 'ready':
          logLaunchEvent('target-ready', result.manifest ? `iplex-web ${result.manifest.version}` : target.url)
          if (loadMode === 'navigate') {
            logLaunchEvent('navigate', target.url)
            writeOpened(target.url)
            setState({ phase: 'opening', url: target.url })
            // Navegação de nível superior: sem ponte (o shell deixa de existir).
            window.location.assign(target.url)
          } else {
            logLaunchEvent('frame-load', target.url)
            setState({ phase: 'loading', url: target.url })
          }
          return
        case 'offline':
          logLaunchEvent('offline')
          return setState({ phase: 'failed', failure: { kind: 'offline' } })
        case 'unreachable':
          logLaunchEvent('unreachable', result.detail)
          return setState({ phase: 'failed', failure: { kind: 'unreachable', detail: result.detail } })
        case 'not-deployed':
          logLaunchEvent('not-deployed', result.detail)
          return setState({ phase: 'failed', failure: { kind: 'not-deployed', detail: result.detail } })
        case 'server-error':
          logLaunchEvent('server-error', `HTTP ${result.httpStatus}`)
          return setState({ phase: 'failed', failure: { kind: 'server-error', httpStatus: result.httpStatus } })
        case 'incompatible':
          logLaunchEvent('incompatible', result.detail)
          return setState({ phase: 'failed', failure: { kind: 'incompatible', detail: result.detail } })
      }
    })

    return () => {
      cancelled = true
    }
  }, [request])

  // Tempo limite de carregamento: app.ready (frame) ou descarregamento do shell (navigate).
  useEffect(() => {
    if (preview || (state.phase !== 'loading' && state.phase !== 'opening') || config instanceof LaunchConfigError) return
    const timer = window.setTimeout(() => {
      logLaunchEvent('load-timeout', state.url)
      writeOpened(null)
      setState({ phase: 'failed', failure: { kind: 'load-timeout' } })
    }, config.loadTimeoutMs)
    const cancel = () => window.clearTimeout(timer)
    window.addEventListener('pagehide', cancel)
    return () => {
      cancel()
      window.removeEventListener('pagehide', cancel)
    }
  }, [state])

  // Modo navigate: retorno ao shell restaurado do bfcache (history.back()).
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      const opened = readOpened()
      if (event.persisted && opened) {
        logLaunchEvent('returned', opened)
        setState({ phase: 'returned', url: opened })
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  const retry = () => {
    if (config instanceof LaunchConfigError) return
    writeOpened(null)
    setState({ phase: 'checking' })
    setRequest((value) => (value ?? 0) + 1)
  }

  const markReady = (frontendVersion: string | undefined) => {
    if (state.phase !== 'loading') return
    logLaunchEvent('frame-ready', frontendVersion ?? 'sem versão')
    setState({ phase: 'running', url: state.url, frontendVersion: frontendVersion ?? null })
  }

  // Estado da rede para o aviso exibido durante a execução.
  useEffect(() => (preview ? undefined : subscribeNetworkChanges(setOnline)), [])

  // Falha de rede/servidor: tenta novamente quando a conexão voltar.
  const waitingForNetwork = !preview && state.phase === 'failed' && RETRY_ON_RECONNECT.includes(state.failure.kind)
  useEffect(() => {
    if (!waitingForNetwork) return
    return subscribeNetworkChanges((isOnline) => {
      if (!isOnline) return
      logLaunchEvent('network-restored')
      writeOpened(null)
      setState({ phase: 'checking' })
      setRequest((value) => (value ?? 0) + 1)
    })
  }, [waitingForNetwork])

  return {
    state,
    online,
    retry,
    markReady,
    config: config instanceof LaunchConfigError ? null : config,
  }
}
