import type { LaunchTarget } from '../config/launchTarget'

/**
 * Verificação de conexão e disponibilidade do destino antes de abri-lo.
 *
 * Para o iPlex Web hospedado, "o servidor respondeu" não basta: um site com
 * rota coringa devolve HTTP 200 para qualquer caminho (soft 404). O shell lê
 * o manifesto `iplex-web.json` publicado pelo iPlex Web (com CORS) e confere
 * a identidade e a versão da ponte.
 */

export interface WebManifest {
  app: 'iplex-web'
  version: string
  bridgeVersion: number
}

export type TargetCheck =
  | { status: 'ready'; manifest: WebManifest | null }
  | { status: 'offline' }
  | { status: 'unreachable'; detail: string }
  | { status: 'not-deployed'; detail: string }
  | { status: 'server-error'; httpStatus: number }
  | { status: 'incompatible'; detail: string }

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  // AbortController não existe no Chromium M56/M63 (TVs 2018/2019).
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/** navigator.onLine é relido a cada chamada (o estado muda durante a verificação). */
function isOffline(): boolean {
  return navigator.onLine === false
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseManifest(value: unknown): WebManifest | null {
  if (typeof value !== 'object' || value === null) return null
  const manifest = value as Record<string, unknown>
  if (manifest.app !== 'iplex-web' || typeof manifest.bridgeVersion !== 'number') return null
  return {
    app: 'iplex-web',
    version: typeof manifest.version === 'string' ? manifest.version : 'desconhecida',
    bridgeVersion: manifest.bridgeVersion,
  }
}

export async function checkTarget(
  target: LaunchTarget,
  { timeoutMs, bridgeVersion }: { timeoutMs: number; bridgeVersion: number },
): Promise<TargetCheck> {
  if (isOffline()) return { status: 'offline' }
  if (target.kind === 'local') return { status: 'ready', manifest: null }

  const bust = `iplex_check=${Date.now()}`
  let response: Response
  try {
    response = await withTimeout(
      fetch(`${target.manifestUrl}?${bust}`, { mode: 'cors', cache: 'no-store', credentials: 'omit' }),
      timeoutMs,
    )
  } catch (error) {
    if (isOffline()) return { status: 'offline' }
    const detail = errorDetail(error)
    if (detail === 'timeout') return { status: 'unreachable', detail: 'tempo esgotado' }
    // Falha de CORS e falha de rede são indistinguíveis aqui: uma segunda
    // sonda (no-cors) separa "servidor fora do ar" de "manifesto ausente".
    try {
      await withTimeout(fetch(`${target.origin}/?${bust}`, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' }), timeoutMs)
    } catch (probeError) {
      return { status: 'unreachable', detail: errorDetail(probeError) }
    }
    return { status: 'not-deployed', detail: `${target.manifestUrl} inacessível (ausente ou sem CORS)` }
  }

  if (response.status >= 500) return { status: 'server-error', httpStatus: response.status }
  if (!response.ok) return { status: 'not-deployed', detail: `${target.manifestUrl} respondeu HTTP ${response.status}` }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { status: 'not-deployed', detail: `${target.manifestUrl} não é JSON (página do site no lugar do iPlex Web?)` }
  }
  const manifest = parseManifest(body)
  if (!manifest) return { status: 'not-deployed', detail: `${target.manifestUrl} não identifica o iPlex Web` }
  if (manifest.bridgeVersion !== bridgeVersion) {
    return {
      status: 'incompatible',
      detail: `iPlex Web ${manifest.version} usa a ponte v${manifest.bridgeVersion}; este app usa v${bridgeVersion}`,
    }
  }
  return { status: 'ready', manifest }
}

/** Notifica mudanças de conectividade informadas pelo motor web. */
export function subscribeNetworkChanges(onChange: (online: boolean) => void): () => void {
  const handleOnline = () => onChange(true)
  const handleOffline = () => onChange(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
