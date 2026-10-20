import type { LauncherConfig } from '../config/launchTarget'
import { ActionBar, type ActionItem } from '../navigation/ActionBar'
import { useRemoteControl } from '../navigation/useRemoteControl'
import { getPlatform } from '../platform'
import { ShellFrame } from '../shell/ShellFrame'
import { IplexContainer, IplexLogo, IplexText } from '../design-system'
import { useLauncher, type LaunchFailure, type LauncherState } from './useLauncher'
import './launcher.css'

const platform = getPlatform()

interface FailureText {
  title: string
  /** Mensagem para o usuário final. */
  message: string
  /** Código curto para suporte (exibido em produção). */
  code: string
  /** Detalhe técnico (exibido só em desenvolvimento). */
  detail: string
}

function describeFailure(failure: LaunchFailure): FailureText {
  switch (failure.kind) {
    case 'config':
      return { title: 'Configuração inválida', message: 'O aplicativo não está configurado corretamente.', code: 'E-CONFIG', detail: failure.message }
    case 'offline':
      return {
        title: 'Sem conexão com a internet',
        message: 'Verifique a conexão da TV. O iPlex tentará novamente quando a conexão voltar.',
        code: 'E-OFFLINE',
        detail: 'navigator.onLine = false',
      }
    case 'unreachable':
      return {
        title: 'Servidor do iPlex indisponível',
        message: 'Não foi possível falar com o servidor do iPlex. Tente novamente em instantes.',
        code: 'E-UNREACHABLE',
        detail: failure.detail,
      }
    case 'not-deployed':
      return {
        title: 'iPlex indisponível no momento',
        message: 'O iPlex está temporariamente fora do ar. Tente novamente mais tarde.',
        code: 'E-NOT-DEPLOYED',
        detail: failure.detail,
      }
    case 'server-error':
      return {
        title: 'Servidor do iPlex com falha',
        message: 'O servidor do iPlex está com problemas. Tente novamente em instantes.',
        code: `E-SERVER-${failure.httpStatus}`,
        detail: `HTTP ${failure.httpStatus}`,
      }
    case 'incompatible':
      return {
        title: 'Atualização necessária',
        message: 'Atualize o aplicativo iPlex pela loja da TV para continuar.',
        code: 'E-BRIDGE-VERSION',
        detail: failure.detail,
      }
    case 'load-timeout':
      return {
        title: 'O iPlex não terminou de carregar',
        message: 'O carregamento demorou demais. Verifique a conexão e tente novamente.',
        code: 'E-LOAD-TIMEOUT',
        detail: 'sem app.ready no tempo limite',
      }
  }
}

function statusFor(state: LauncherState): { title: string; message: string; busy: boolean; failure?: FailureText } {
  switch (state.phase) {
    case 'checking':
      return { title: 'Conectando ao iPlex…', message: 'Verificando a conexão e o serviço.', busy: true }
    case 'loading':
    case 'opening':
      return { title: 'Carregando o iPlex…', message: 'Só um instante.', busy: true }
    case 'running':
      return { title: '', message: '', busy: false }
    case 'returned':
      return {
        title: 'Você voltou ao iPlex TV',
        message: `Conteúdo remoto encerrado: ${state.url}`,
        busy: false,
      }
    case 'failed': {
      const failure = describeFailure(state.failure)
      return { title: failure.title, message: failure.message, busy: false, failure }
    }
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
  const { state, online, retry, markReady, config, autoRetry } = useLauncher()
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
    variant: 'secondary',
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
        <IplexContainer className="launcher-screen">
          <section className="launcher-status" aria-live="polite">
            <IplexLogo className="launcher-logo" />
            <IplexText variant="display" className="launcher-title">
              {status.title}
            </IplexText>
            <IplexText tone="secondary" className="launcher-message">
              {status.message}
            </IplexText>
            {autoRetry && (
              <IplexText variant="caption" tone="secondary" as="p" className="launcher-code">
                Nova tentativa automática em {autoRetry.inSeconds} s ({autoRetry.attempt}/{autoRetry.of}).
              </IplexText>
            )}
            {status.failure && (
              <IplexText variant="caption" tone="secondary" as="p" className="launcher-code">
                {config?.environment === 'production'
                  ? `Código: ${status.failure.code}`
                  : `${status.failure.code} · ${status.failure.detail}`}
              </IplexText>
            )}
            {status.busy && <div className="launcher-spinner" aria-hidden="true" />}
            {actions.length > 0 && <ActionBar key={state.phase} actions={actions} />}
          </section>

          {config?.environment === 'production' ? (
            <footer className="launcher-details is-production">
              <IplexText variant="caption" tone="secondary" as="span">
                {__IPLEX_APP_NAME__} · versão {__IPLEX_APP_VERSION__}
              </IplexText>
            </footer>
          ) : (
            <footer className="launcher-details">
              <IplexText variant="caption" tone="secondary" as="span">
                Ambiente: {config ? config.environment : '—'}
              </IplexText>
              <IplexText variant="caption" tone="secondary" as="span">
                Destino: {config ? config.target.url : '—'}
              </IplexText>
              <IplexText variant="caption" tone="secondary" as="span">
                Plataforma: {platform.label}
                {platform.platformVersion ? ` ${platform.platformVersion}` : ''}
              </IplexText>
            </footer>
          )}
        </IplexContainer>
      )}

      {running && !online && (
        <div className="launcher-offline" role="status">
          <IplexText variant="caption" as="span">
            Sem conexão com a internet. O iPlex continuará quando a rede voltar.
          </IplexText>
        </div>
      )}
    </main>
  )
}
