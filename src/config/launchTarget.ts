/**
 * Configuração do destino carregado pelo shell, por ambiente.
 *
 * Única leitura das variáveis no código. Os valores ficam nos arquivos do Vite:
 *   .env.production   -> VITE_IPLEX_TARGET_URL=https://iplex-2c8fc.web.app/
 *   .env.development  -> página de teste controlada (desenvolvimento)
 *   .env              -> valores comuns (tempos limite, modo de carregamento)
 *
 * Destino absoluto (https) = iPlex Web hospedado; caminho relativo = conteúdo
 * empacotado no próprio .wgt (alternativa para a Samsung Apps).
 */
import { BRIDGE_VERSION } from '../bridge/protocol'

export type IplexEnvironment = 'production' | 'development'

/** frame: iPlex Web em <iframe> com ponte; navigate: navegação de nível superior, sem ponte. */
export type LoadMode = 'frame' | 'navigate'

export type LaunchTarget =
  | { kind: 'remote'; url: string; origin: string; host: string; manifestUrl: string }
  | { kind: 'local'; url: string }

export interface LauncherConfig {
  environment: IplexEnvironment
  target: LaunchTarget
  loadMode: LoadMode
  probeTimeoutMs: number
  loadTimeoutMs: number
  bridgeVersion: number
}

export class LaunchConfigError extends Error {}

/** Arquivo que o iPlex Web publica na raiz da sua base (ex.: /apps/iplex/iplex-web.json). */
export const WEB_MANIFEST_FILE = 'iplex-web.json'

function readNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Garante a barra final em destinos de diretório (/apps/iplex -> /apps/iplex/),
 * para que caminhos relativos do frontend e do manifesto resolvam dentro da base.
 */
function withDirectorySlash(url: URL): URL {
  const lastSegment = url.pathname.split('/').pop() ?? ''
  if (!url.pathname.endsWith('/') && !lastSegment.includes('.')) url.pathname = `${url.pathname}/`
  return url
}

export function resolveLaunchTarget(raw: string, options: { allowInsecure?: boolean } = {}): LaunchTarget {
  const value = raw.trim()
  if (value === '') {
    throw new LaunchConfigError('VITE_IPLEX_TARGET_URL não está definida para este ambiente.')
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    let parsed: URL
    try {
      parsed = withDirectorySlash(new URL(value))
    } catch {
      throw new LaunchConfigError(`URL de destino inválida: ${value}`)
    }
    const insecureAllowed = options.allowInsecure && parsed.protocol === 'http:'
    if (parsed.protocol !== 'https:' && !insecureAllowed) {
      throw new LaunchConfigError(`O destino remoto precisa usar HTTPS (recebido ${parsed.protocol}).`)
    }
    return {
      kind: 'remote',
      url: parsed.href,
      origin: parsed.origin,
      host: parsed.hostname,
      manifestUrl: new URL(WEB_MANIFEST_FILE, parsed).href,
    }
  }

  return { kind: 'local', url: value }
}

export function loadLauncherConfig(): LauncherConfig {
  const env = import.meta.env
  const environment: IplexEnvironment = env.VITE_IPLEX_ENV === 'production' ? 'production' : 'development'
  // HTTP só no desenvolvimento (página de teste servida pelo Mac em `npm run tv`).
  const allowInsecure = environment === 'development' && env.VITE_IPLEX_ALLOW_INSECURE_TARGET === 'true'
  return {
    environment,
    target: resolveLaunchTarget(env.VITE_IPLEX_TARGET_URL ?? '', { allowInsecure }),
    loadMode: env.VITE_IPLEX_LOAD_MODE === 'navigate' ? 'navigate' : 'frame',
    probeTimeoutMs: readNumber(env.VITE_IPLEX_PROBE_TIMEOUT_MS, 8000),
    loadTimeoutMs: readNumber(env.VITE_IPLEX_LOAD_TIMEOUT_MS, 20000),
    bridgeVersion: BRIDGE_VERSION,
  }
}
