import { useEffect, useEffectEvent, useRef } from 'react'
import { createBridgeHost, type BridgeHost } from '../bridge/host'
import type { RemoteKeyName } from '../bridge/protocol'
import { subscribeNetworkChanges } from '../connection/connectivity'
import { reportDevEvent } from '../devtools/devReport'
import { getPlatform } from '../platform'
import { createBridgeServices } from './bridgeServices'

interface ShellFrameProps {
  url: string
  /** Origens aceitas pela ponte, separadas por espaço (valor estável para o efeito). */
  allowedOrigins: string
  targetOrigin: string
  /** Visível somente após o handshake app.ready. */
  visible: boolean
  onReady: (frontendVersion: string | undefined) => void
}

/**
 * Hospeda o iPlex Web em tela cheia e liga a ponte. O iframe carrega por trás
 * da tela de carregamento e só aparece (e recebe o foco do controle remoto)
 * depois do app.ready.
 */
export function ShellFrame({ url, allowedOrigins, targetOrigin, visible, onReady }: ShellFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const notifyReady = useEffectEvent((version: string | undefined) => onReady(version))

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let host: BridgeHost | null = null
    const services = createBridgeServices({
      platform: getPlatform(),
      appVersion: __IPLEX_APP_VERSION__,
      onReady: (version) => notifyReady(version),
      emit: (name, data) => host?.emit(name, data),
    })
    host = createBridgeHost({
      frame,
      allowedOrigins: allowedOrigins.split(' '),
      targetOrigin,
      handlers: services.handlers,
      onRequest: (method, outcome) => reportDevEvent('bridge', `${method} ${outcome}`),
    })

    const handleVisibility = () => {
      services.setVisible(!document.hidden)
      // Retomada (multitarefa): o foco do controle remoto volta ao Web.
      if (!document.hidden && frame.classList.contains('is-visible')) {
        frame.focus()
        frame.contentWindow?.focus()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    const unsubscribeNetwork = subscribeNetworkChanges((online) => services.setOnline(online))

    // Tecla recebida pelo shell com o Web visível (foco fora do iframe):
    // reencaminha normalizada (remote.key) e devolve o foco ao Web.
    const keyNames = Object.entries(getPlatform().keys) as [RemoteKeyName, number][]
    const handleShellKey = (event: KeyboardEvent) => {
      if (!frame.classList.contains('is-visible')) return
      const match = keyNames.find(([, code]) => code === event.keyCode)
      if (!match) return
      event.preventDefault()
      host?.emit('remote.key', { key: match[0], keyCode: event.keyCode })
      frame.focus()
      frame.contentWindow?.focus()
    }
    document.addEventListener('keydown', handleShellKey)

    return () => {
      document.removeEventListener('keydown', handleShellKey)
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribeNetwork()
      services.dispose()
      host?.dispose()
    }
  }, [allowedOrigins, targetOrigin])

  // Teclas do controle remoto vão para o documento com foco: o iframe.
  useEffect(() => {
    if (!visible) return
    const frame = frameRef.current
    frame?.focus()
    frame?.contentWindow?.focus()
  }, [visible])

  return (
    <iframe
      ref={frameRef}
      className={visible ? 'shell-frame is-visible' : 'shell-frame'}
      src={url}
      title="iPlex"
      allow="autoplay; encrypted-media; fullscreen"
    />
  )
}
