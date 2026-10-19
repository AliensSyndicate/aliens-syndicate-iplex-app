import type { LauncherConfig } from '../config/launchTarget'
import { ActionBar, type ActionItem } from '../navigation/ActionBar'
import { useRemoteControl } from '../navigation/useRemoteControl'
import { getPlatform } from '../platform'
import { ShellFrame } from '../shell/ShellFrame'
import { IplexWordmark } from '../ui/IplexWordmark'
import { useLauncher, type LaunchFailure, type LauncherState } from './useLauncher'
import './launcher.css'

const platform = getPlatform()

function describeFailure(failure: LaunchFailure): { title: string; message: string } {
  switch (failure.kind) {
    case 'config':
      return { title: 'Configuração inválida', message: failure.message }
    case 'offline':
      return {
        title: 'Sem conexão com a internet',
        message: 'Verifique a rede da TV. O iPlex tentará novamente quando a conexão voltar.',
      }
    case 'unreachable':
      return {
        title: 'Servidor do iPlex indisponível',
        message: `O servidor não respondeu (${failure.detail}). Tente novamente em instantes.`,
      }
    case 'not-deployed':
      return {
        title: 'iPlex indisponível no momento',
        message: `O serviço respondeu, mas o iPlex Web não foi encontrado. ${failure.detail}`,
      }
    case 'server-error':
      return {
        title: 'Servidor do iPlex com falha',
        message: `O servidor respondeu com erro (HTTP ${failure.httpStatus}). Tente novamente em instantes.`,
      }
    case 'incompatible':
      return { title: 'Atualização necessária', message: failure.detail }
    case 'load-timeout':
      return {
        title: 'O iPlex não terminou de carregar',
        message: 'A interface não respondeu a tempo. A rede pode estar lenta ou o serviço pode estar instável.',
      }
  }
}

function statusFor(state: LauncherState): { title: string; message: string; busy: boolean } {
  switch (state.phase) {
    case 'checking':
      return { title: 'Conectando ao iPlex…', message: 'Verificando a conexão e o serviço.', busy: true }
    case 'loading':
    case 'opening':
      return { title: 'Carregando o iPlex…', message: state.url, busy: true }
    case 'running':
      return { title: '', message: '', busy: false }
    case 'returned':
      return {
        title: 'Você voltou ao iPlex TV',
        message: `Conteúdo remoto encerrado: ${state.url}`,
        busy: false,
      }
    case 'failed':
      return { ...describeFailure(state.failure), busy: false }
  }
}

/** Origens aceitas pela ponte e destino das respostas. */
function bridgeOrigins(config: LauncherConfig): { allowedOrigins: string; targetOrigin: string } {
  if (config.target.kind === 'remote') {
    return { allowedOrigins: config.target.origin, targetOrigin: config.target.origin }
  }
  // Conteúdo empacotado: mesma origem do shell (file:// no Tizen, opaca).
  const local = new Set([window.location.origin, 'null', 'file://'])
  return { allowedOrigins: [...local].join(' '), targetOrigin: '*' }
}

export function LauncherApp() {
  const { state, online, retry, markReady, config } = useLauncher()
  const status = statusFor(state)
  const running = state.phase === 'running'

  // Return/Back nas telas do shell encerra o app (Samsung: na tela inicial o
  // Return pode encerrar ou ocultar). Com o iPlex Web ativo, as teclas vão ao
  // iframe e o frontend decide (app.exit pela ponte). Exit: comportamento padrão.
  useRemoteControl((action) => {
    if (action !== 'back' || running) return false
    platform.exit()
    return true
  })

  const exitAction: ActionItem = {
    id: 'exit',
    label: platform.canExit ? 'Sair' : 'Sair (somente na TV)',
    onSelect: () => platform.exit(),
  }
  let actions: ActionItem[] = []
  if (state.phase === 'returned') {
    actions = [{ id: 'reopen', label: 'Abrir novamente', onSelect: retry }, exitAction]
  } else if (state.phase === 'failed') {
    actions =
      state.failure.kind === 'config'
        ? [exitAction]
        : [{ id: 'retry', label: 'Tentar novamente', onSelect: retry }, exitAction]
  }

  const frameUrl = state.phase === 'loading' || state.phase === 'running' ? state.url : null

  return (
    <main className="launcher" data-phase={state.phase}>
      {config && frameUrl && (
        <ShellFrame url={frameUrl} {...bridgeOrigins(config)} visible={running} onReady={markReady} />
      )}

      {!running && (
        <div className="launcher-screen">
          <header className="launcher-brand">
            <IplexWordmark />
            <span className="launcher-brand-suffix">TV</span>
          </header>

          <section className="launcher-status" aria-live="polite">
            {status.busy && <div className="launcher-spinner" aria-hidden="true" />}
            <h1 className="launcher-title">{status.title}</h1>
            <p className="launcher-message">{status.message}</p>
            {actions.length > 0 && <ActionBar key={state.phase} actions={actions} />}
          </section>

          <footer className="launcher-details">
            <span>Ambiente: {config ? config.environment : '—'}</span>
            <span>Destino: {config ? config.target.url : '—'}</span>
            <span>
              Plataforma: {platform.label}
              {platform.platformVersion ? ` ${platform.platformVersion}` : ''}
            </span>
          </footer>
        </div>
      )}

      {running && !online && (
        <div className="launcher-offline" role="status">
          Sem conexão com a internet. O iPlex continuará quando a rede voltar.
        </div>
      )}
    </main>
  )
}
