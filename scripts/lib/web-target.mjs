/**
 * Verificação do iPlex Web hospedado, compartilhada por `npm run tv` e
 * `npm run release:tizen`. Não presume que o destino está publicado: confere
 * o manifesto iplex-web.json (identidade, CORS, versão da ponte) e, no modo
 * frame, se a página pode ser exibida dentro do app (X-Frame-Options / CSP).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const TV_USER_AGENT =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36'

export function readBridgeVersion(root) {
  const source = readFileSync(join(root, 'src', 'bridge', 'protocol.ts'), 'utf8')
  return Number(source.match(/BRIDGE_VERSION = (\d+)/)?.[1])
}

/** Mesma regra do app: destino de diretório termina com "/". */
export function directoryUrl(raw) {
  const url = new URL(raw)
  const last = url.pathname.split('/').pop() ?? ''
  if (!url.pathname.endsWith('/') && !last.includes('.')) url.pathname = `${url.pathname}/`
  return url
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': TV_USER_AGENT },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  })
  return { response, text: await response.text() }
}

/**
 * @returns {Promise<{ ok: boolean, base: URL, manifest: object | null, problems: string[], warnings: string[] }>}
 */
export async function verifyWebTarget(raw, { loadMode = 'frame', bridgeVersion }) {
  const base = directoryUrl(raw)
  const manifestUrl = new URL('iplex-web.json', base)
  const problems = []
  const warnings = []
  let manifest = null

  try {
    const { response, text } = await fetchText(manifestUrl)
    try {
      manifest = JSON.parse(text)
    } catch {
      manifest = null
    }
    if (!response.ok || manifest?.app !== 'iplex-web') {
      const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]
      problems.push(
        `iPlex Web não publicado: ${manifestUrl.href} → HTTP ${response.status}, ` +
          `${response.headers.get('content-type') ?? '?'}${title ? `, página "${title}"` : ''}`,
      )
      manifest = null
    } else {
      if (response.headers.get('access-control-allow-origin') !== '*') {
        problems.push(`${manifestUrl.href} sem "Access-Control-Allow-Origin: *" (o app na TV não consegue lê-lo)`)
      }
      if (manifest.bridgeVersion !== bridgeVersion) {
        problems.push(`iPlex Web ${manifest.version} usa a ponte v${manifest.bridgeVersion}; este app usa v${bridgeVersion}`)
      }
    }
  } catch (error) {
    problems.push(`servidor do iPlex Web inacessível (${manifestUrl.href}): ${error.cause?.message ?? error.message}`)
  }

  if (loadMode === 'frame') {
    try {
      const { response } = await fetchText(base)
      const frameOptions = response.headers.get('x-frame-options')
      const frameAncestors = response.headers.get('content-security-policy')?.match(/frame-ancestors([^;]*)/i)?.[1]?.trim()
      if (frameOptions) {
        problems.push(`${base.href} envia "X-Frame-Options: ${frameOptions}": não pode ser exibido dentro do app`)
      }
      // O pai do iframe é o app empacotado (file://): nenhuma lista frame-ancestors
      // o autoriza, nem "*". Verificado na Samsung (Tizen 5.5): bloqueia o iframe.
      if (frameAncestors !== undefined) {
        problems.push(`${base.href} envia CSP "frame-ancestors ${frameAncestors}": bloqueia o iframe do app (pai file://)`)
      }
    } catch (error) {
      problems.push(`página ${base.href} inacessível: ${error.cause?.message ?? error.message}`)
    }
  }

  return { ok: problems.length === 0, base, manifest, problems, warnings }
}
