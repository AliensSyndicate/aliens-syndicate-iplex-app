#!/usr/bin/env node
/**
 * iPlex App — automação "um clique" para a Samsung Tizen.
 *
 *   npm run tv                      (ou duplo clique em iPlex-TV.command)
 *   npm run tv -- --env production  (destino de produção, verificado antes)
 *   npm run tv -- --host 192.168.0.50 [--port 26101] [--force-install] [--watch 60]
 *
 * Etapas: ferramentas → TV na rede → servidor SDB → conexão → autorização →
 * certificado → destino (iPlex Web) → TypeScript → build/empacotamento WGT →
 * identificador → instalação (só se mudou) → abertura → validação real na TV.
 *
 * Ambientes: development (padrão) instala o shell apontando para a página de
 * teste controlada servida por este Mac; production usa a URL de
 * .env.production e só prossegue se o iPlex Web estiver publicado.
 *
 * Configuração (sem pedir nada a cada execução): .env / .env.local
 *   IPLEX_TV_HOST, IPLEX_TV_SDB_PORT, IPLEX_TV_ENV, IPLEX_TV_CONNECT_ATTEMPTS,
 *   IPLEX_TV_REPORT_PORT, IPLEX_TV_VALIDATE_TIMEOUT_MS, TIZEN_STUDIO_HOME
 *
 * Comandos do SDK usados (conferidos na versão instalada, Tizen CLI 2.5.25 /
 * sdb 4.2.36): `sdb start-server|devices|connect|capability`,
 * `sdb shell 0 vd_applist` e `0 kill <pkg>` (comandos de TV), `tizen version`,
 * `tizen security-profiles list`, `tizen package`, `tizen install`, `tizen run`.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { homedir, networkInterfaces } from 'node:os'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---- Argumentos e configuração ---------------------------------------------

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

// .env (comum) decide o ambiente padrão; depois carrega .env.<ambiente>.
const environment = argValue('--env') || loadEnv('common', root, '').IPLEX_TV_ENV || 'development'
const env = loadEnv(environment, root, '')

function positiveInt(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

const tizenHome = env.TIZEN_STUDIO_HOME || join(homedir(), 'tizen-studio')
const cfg = {
  host: argValue('--host') || env.IPLEX_TV_HOST,
  sdbPort: positiveInt(argValue('--port') || env.IPLEX_TV_SDB_PORT, 26101),
  attempts: positiveInt(env.IPLEX_TV_CONNECT_ATTEMPTS, 3),
  retryDelayMs: 3000,
  reportPort: positiveInt(env.IPLEX_TV_REPORT_PORT, 8765),
  validateTimeoutMs: positiveInt(env.IPLEX_TV_VALIDATE_TIMEOUT_MS, 60000),
  watchSeconds: positiveInt(argValue('--watch'), 0),
  forceInstall: process.argv.includes('--force-install'),
  sdb: join(tizenHome, 'tools', 'sdb'),
  tizen: join(tizenHome, 'tools', 'ide', 'bin', 'tizen'),
  profile: env.IPLEX_TIZEN_SIGNING_PROFILE || 'iplex-dev',
  packageId: env.IPLEX_TIZEN_PACKAGE_ID || 'iPlexTVApp',
  version: env.IPLEX_TIZEN_VERSION || '1.0.0',
  target: (env.VITE_IPLEX_TARGET_URL || '').trim(),
  loadMode: env.VITE_IPLEX_LOAD_MODE === 'navigate' ? 'navigate' : 'frame',
}
const appId = `${cfg.packageId}.IplexTV`
const serial = `${cfg.host}:${cfg.sdbPort}`
const widgetDir = join(root, 'dist-tizen', 'widget')
const packageDir = join(root, 'build', 'tizen')
const statePath = join(packageDir, '..', 'tv-state.json')

// ---- Saída e log -------------------------------------------------------------

const logDir = join(root, 'build', 'logs')
mkdirSync(logDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const logPath = join(logDir, `tv-${stamp}.log`)
const color = process.stdout.isTTY
  ? { ok: '\x1b[32m', err: '\x1b[31m', warn: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { ok: '', err: '', warn: '', dim: '', bold: '', off: '' }

function writeLog(text) {
  appendFileSync(logPath, `${text}\n`)
}

function print(text = '') {
  console.log(text)
  writeLog(text.replace(/\x1b\[[0-9;]*m/g, ''))
}

const TOTAL_STEPS = 13
let stepNumber = 0
let stepLabel = ''

function step(label) {
  stepNumber += 1
  stepLabel = label
  print(`\n${color.bold}[${stepNumber}/${TOTAL_STEPS}] ${label}${color.off}`)
}

function ok(message) {
  print(`  ${color.ok}✔${color.off} ${message}`)
}

function info(message) {
  print(`  ${color.dim}${message}${color.off}`)
}

function warn(message) {
  print(`  ${color.warn}!${color.off} ${message}`)
}

class StepError extends Error {
  constructor(message, hint) {
    super(message)
    this.hint = hint
  }
}

function fail(message, hint) {
  throw new StepError(message, hint)
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

/** Executa um comando com tempo limite (nunca fica preso) e registra no log. */
function run(command, args, { timeoutMs = 120000, envExtra } = {}) {
  writeLog(`$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, ...envExtra },
    maxBuffer: 64 * 1024 * 1024,
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  if (stdout) writeLog(stdout.trimEnd())
  if (stderr) writeLog(stderr.trimEnd())
  const timedOut = result.error?.code === 'ETIMEDOUT'
  if (result.error && !timedOut) writeLog(`erro: ${result.error.message}`)
  return { status: result.status, output: `${stdout}\n${stderr}`, timedOut, error: result.error }
}

// ---- Utilitários de rede ------------------------------------------------------

function probeTcp(host, port, timeoutMs = 3000) {
  return new Promise((resolveProbe) => {
    const socket = connect({ host, port })
    const done = (reachable) => {
      socket.destroy()
      resolveProbe(reachable)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

/** IPv4 deste Mac na interface usada para alcançar a TV. */
function localAddressFor(host) {
  const route = run('/sbin/route', ['-n', 'get', host], { timeoutMs: 5000 })
  const iface = route.output.match(/interface:\s*(\S+)/)?.[1]
  const candidates = iface ? [iface] : Object.keys(networkInterfaces())
  for (const name of candidates) {
    const address = networkInterfaces()[name]?.find((entry) => entry.family === 'IPv4' && !entry.internal)
    if (address) return address.address
  }
  return null
}

// ---- SDB / Tizen --------------------------------------------------------------

function sdbDevices() {
  const result = run(cfg.sdb, ['devices'], { timeoutMs: 20000 })
  const devices = []
  for (const line of result.output.split('\n')) {
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized|unknown)\s*(.*)$/)
    if (match) devices.push({ serial: match[1], state: match[2], name: match[3].trim() })
  }
  return devices
}

function tvApplist() {
  const result = run(cfg.sdb, ['-s', serial, 'shell', '0', 'vd_applist'], { timeoutMs: 30000 })
  if (result.timedOut || result.status !== 0) return null
  const apps = []
  let current = null
  for (const line of result.output.split('\n')) {
    const match = line.match(/-+([a-z_()0-9:,]+?)\s*=(.*?)-+\s*$/i)
    if (!match) continue
    const [, key, value] = match
    if (key === 'app_id') {
      current = { app_id: value }
      apps.push(current)
    } else if (current) {
      current[key] = value
    }
  }
  return apps
}

/** Hash do conteúdo do widget, sem as assinaturas (que mudam a cada pacote). */
function widgetHash() {
  const hash = createHash('sha256')
  const skip = new Set(['author-signature.xml', 'signature1.xml', '.manifest.tmp'])
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (!skip.has(name)) {
        hash.update(relative(widgetDir, path))
        hash.update(readFileSync(path))
      }
    }
  }
  walk(widgetDir)
  return hash.digest('hex')
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

// ---- Servidor de desenvolvimento no Mac ---------------------------------------
// Serve a página de teste (dist-tizen/widget) e recebe os eventos da TV.
// Atende somente a TV e o próprio Mac.

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

function serveWidgetFile(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname)
  const requested = resolve(widgetDir, `.${pathname === '/' ? '/index.html' : pathname}`)
  let file
  try {
    file = realpathSync(requested)
  } catch {
    response.writeHead(404).end()
    return
  }
  if (!file.startsWith(realpathSync(widgetDir) + sep) || !statSync(file).isFile()) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    // O shell empacotado (origem file://) lê o manifesto iplex-web.json via CORS.
    'Access-Control-Allow-Origin': '*',
  })
  response.end(readFileSync(file))
}

function startDevServer(tvHost) {
  const events = []
  const listeners = new Set()
  const server = createServer((request, response) => {
    const from = (request.socket.remoteAddress || '').replace(/^::ffff:/, '')
    if (from !== tvHost && from !== '127.0.0.1' && from !== '::1') {
      response.writeHead(403).end()
      return
    }
    if (request.method === 'GET') {
      serveWidgetFile(request, response)
      return
    }
    if (request.method !== 'POST' || request.url !== '/iplex-dev-report') {
      response.writeHead(404).end()
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) request.destroy()
    })
    request.on('end', () => {
      response.writeHead(204).end()
      if (from !== tvHost) return
      try {
        const event = { ...JSON.parse(body), receivedAt: Date.now() }
        events.push(event)
        info(`TV ▸ ${event.event}${event.detail ? ` — ${event.detail}` : ''}`)
        for (const listener of listeners) listener(event)
      } catch {
        writeLog(`evento inválido: ${body.slice(0, 200)}`)
      }
    })
  })
  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer)
    server.listen(cfg.reportPort, '0.0.0.0', () =>
      resolveServer({
        events,
        onEvent: (listener) => listeners.add(listener),
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      }),
    )
  })
}

// ---- Verificação do iPlex Web hospedado ---------------------------------------

const BRIDGE_VERSION = Number(
  readFileSync(join(root, 'src', 'bridge', 'protocol.ts'), 'utf8').match(/BRIDGE_VERSION = (\d+)/)?.[1],
)
const TV_USER_AGENT = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36'

/** Mesma regra do app: destino de diretório termina com "/". */
function directoryUrl(raw) {
  const url = new URL(raw)
  const last = url.pathname.split('/').pop() ?? ''
  if (!url.pathname.endsWith('/') && !last.includes('.')) url.pathname = `${url.pathname}/`
  return url
}

async function fetchChecked(url) {
  try {
    return await fetch(url, { headers: { 'User-Agent': TV_USER_AGENT }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
  } catch (error) {
    fail(`Servidor do iPlex Web inacessível: ${url}`, error.cause?.message ?? error.message)
  }
}

/** Não presume que o destino está publicado: confere manifesto, CORS e embutimento. */
async function verifyWebTarget(raw) {
  const base = directoryUrl(raw)
  const manifestUrl = new URL('iplex-web.json', base)
  const manifestResponse = await fetchChecked(manifestUrl)
  const contentType = manifestResponse.headers.get('content-type') ?? '?'
  const text = await manifestResponse.text()
  let manifest = null
  try {
    manifest = JSON.parse(text)
  } catch {
    manifest = null
  }
  if (!manifestResponse.ok || manifest?.app !== 'iplex-web') {
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]
    fail(
      `O iPlex Web não está publicado em ${base.href}`,
      `${manifestUrl.href} → HTTP ${manifestResponse.status}, ${contentType}${title ? `, página "${title}"` : ''}.\n` +
        'Publique o iPlex Web com o manifesto (docs/IPLEX-WEB.md) ou teste com o ambiente development.',
    )
  }
  if (manifestResponse.headers.get('access-control-allow-origin') !== '*') {
    fail(`${manifestUrl.href} sem "Access-Control-Allow-Origin: *": o app na TV não consegue verificá-lo.`)
  }
  if (manifest.bridgeVersion !== BRIDGE_VERSION) {
    fail(`iPlex Web ${manifest.version} usa a ponte v${manifest.bridgeVersion}; este app usa v${BRIDGE_VERSION}.`)
  }
  if (cfg.loadMode === 'frame') {
    const page = await fetchChecked(base)
    const frameOptions = page.headers.get('x-frame-options')
    const frameAncestors = page.headers.get('content-security-policy')?.match(/frame-ancestors([^;]*)/i)?.[1]?.trim()
    if (frameOptions) {
      fail(
        `${base.href} envia "X-Frame-Options: ${frameOptions}" e não pode ser exibido dentro do app (modo frame).`,
        'Remova o cabeçalho para /apps/iplex/** (docs/IPLEX-WEB.md).',
      )
    }
    if (frameAncestors && frameAncestors !== '*') {
      warn(`CSP frame-ancestors "${frameAncestors}" pode impedir o app de exibir o iPlex Web.`)
    }
  }
  return { base, manifest }
}

// ---- Fluxo -------------------------------------------------------------------

async function main() {
  print(`${color.bold}iPlex App → Samsung Tizen (${environment})${color.off}  ${color.dim}(${new Date().toLocaleString('pt-BR')})${color.off}`)
  print(`${color.dim}log: ${relative(root, logPath)}${color.off}`)
  if (!cfg.host) {
    fail('IP da TV não configurado.', 'Defina IPLEX_TV_HOST no .env (ou .env.local), ou use: npm run tv -- --host <IP>')
  }

  // 1 -----------------------------------------------------------------------
  step('Ferramentas Tizen')
  if (!existsSync(cfg.sdb)) fail(`sdb não encontrado em ${cfg.sdb}`, 'Instale o Tizen Studio CLI ou defina TIZEN_STUDIO_HOME.')
  if (!existsSync(cfg.tizen)) fail(`Tizen CLI não encontrado em ${cfg.tizen}`)
  const sdbVersion = run(cfg.sdb, ['version'], { timeoutMs: 15000 })
  if (/Bad CPU type/i.test(sdbVersion.output)) {
    fail('O sdb é x86_64 e o Rosetta 2 não está disponível.', 'Execute: softwareupdate --install-rosetta --agree-to-license')
  }
  if (sdbVersion.status !== 0) fail('sdb não respondeu.', sdbVersion.output.trim())
  const tizenVersion = run(cfg.tizen, ['version'], { timeoutMs: 60000 })
  if (tizenVersion.status !== 0) fail('Tizen CLI não respondeu.', tizenVersion.output.trim().slice(-400))
  ok(`${sdbVersion.output.trim()} · ${tizenVersion.output.trim().split('\n').pop()}`)

  // 2 -----------------------------------------------------------------------
  step(`Samsung na rede (${serial})`)
  let reachable = false
  for (let attempt = 1; attempt <= cfg.attempts && !reachable; attempt += 1) {
    reachable = await probeTcp(cfg.host, cfg.sdbPort)
    if (!reachable && attempt < cfg.attempts) {
      warn(`porta SDB sem resposta (tentativa ${attempt}/${cfg.attempts}); nova tentativa em ${cfg.retryDelayMs / 1000}s`)
      await sleep(cfg.retryDelayMs)
    }
  }
  if (!reachable) {
    const ping = run('/sbin/ping', ['-c', '1', '-t', '2', cfg.host], { timeoutMs: 5000 })
    if (ping.status === 0) {
      fail(
        `A TV responde na rede, mas a porta SDB ${cfg.sdbPort} está fechada.`,
        `Ative o Modo Desenvolvedor na TV (Apps → 1 2 3 4 5), informe o IP deste Mac (${localAddressFor(cfg.host) ?? '?'}) e reinicie a TV.`,
      )
    }
    fail(
      `A TV ${cfg.host} não respondeu após ${cfg.attempts} tentativas.`,
      'Ligue a TV (o SDB não liga a TV remotamente) e confirme que ela e o Mac estão na mesma rede e que o IP não mudou (IPLEX_TV_HOST).',
    )
  }
  ok('TV ligada e porta do Modo Desenvolvedor acessível')

  // 3 -----------------------------------------------------------------------
  step('Servidor SDB')
  const server = run(cfg.sdb, ['start-server'], { timeoutMs: 30000 })
  if (server.status !== 0) fail('Não foi possível iniciar o servidor SDB.', server.output.trim())
  ok('servidor SDB em execução')

  // 4 -----------------------------------------------------------------------
  step('Conexão Wi-Fi com a TV')
  let device = sdbDevices().find((entry) => entry.serial === serial)
  if (device?.state === 'device') {
    ok(`já conectado (${device.name || serial})`)
  } else {
    for (let attempt = 1; attempt <= cfg.attempts; attempt += 1) {
      const result = run(cfg.sdb, ['connect', serial], { timeoutMs: 20000 })
      device = sdbDevices().find((entry) => entry.serial === serial)
      if (device?.state === 'device') break
      warn(`conexão não estabelecida (tentativa ${attempt}/${cfg.attempts}): ${result.output.trim().split('\n').pop()}`)
      if (attempt < cfg.attempts) await sleep(cfg.retryDelayMs)
    }
    if (!device) {
      fail(
        `A TV recusou a conexão SDB após ${cfg.attempts} tentativas (a porta ${cfg.sdbPort} está aberta).`,
        `Confirme o Modo Desenvolvedor ativo com o IP deste Mac (${localAddressFor(cfg.host) ?? '?'}). ` +
          'Se já estiver, o serviço SDB da TV travou: reinicie a TV (segure o botão Power até reiniciar, ou desligue da tomada por 30s) e rode de novo.',
      )
    }
    if (device.state === 'device') ok(`conectado (${device.name || serial})`)
  }

  // 5 -----------------------------------------------------------------------
  step('Dispositivo autorizado')
  if (device.state !== 'device') {
    fail(
      `A TV está como "${device.state}" no SDB.`,
      `No Modo Desenvolvedor da TV, o IP do host deve ser o deste Mac (${localAddressFor(cfg.host) ?? '?'}); depois reinicie a TV.`,
    )
  }
  const capability = run(cfg.sdb, ['-s', serial, 'capability'], { timeoutMs: 20000 })
  if (capability.timedOut || !capability.output.includes('profile_name')) {
    fail(
      'A TV está conectada, mas não responde aos comandos SDB (sessão travada).',
      'Reinicie a TV (segure o botão Power até reiniciar, ou desligue da tomada por 30s) e rode de novo.',
    )
  }
  const cap = Object.fromEntries(
    capability.output.split('\n').map((line) => line.split(':')).filter((parts) => parts.length >= 2).map(([key, ...rest]) => [key.trim(), rest.join(':').trim()]),
  )
  if (cap.profile_name !== 'tv' || !(cap.can_launch || '').includes('tv-samsung')) {
    fail(`O dispositivo ${serial} não se identificou como Samsung TV (profile_name=${cap.profile_name ?? '?'}).`)
  }
  ok(`${device.name || 'Samsung TV'} · Tizen ${cap.platform_version ?? '?'} · ${cap.cpu_arch ?? '?'}`)

  // 6 -----------------------------------------------------------------------
  step('Certificado de assinatura')
  const profiles = run(cfg.tizen, ['security-profiles', 'list'], { timeoutMs: 60000 })
  if (!new RegExp(`^\\s*${cfg.profile}\\s`, 'm').test(profiles.output)) {
    fail(
      `Perfil de assinatura "${cfg.profile}" não encontrado no Tizen CLI.`,
      'O certificado não é recriado automaticamente. Veja docs/TIZEN.md ("Certificado de desenvolvimento").',
    )
  }
  const profilesXml = join(homedir(), 'tizen-studio-data', 'profile', 'profiles.xml')
  const authorKey = existsSync(profilesXml)
    ? readFileSync(profilesXml, 'utf8').match(new RegExp(`<profile name="${cfg.profile}">[\\s\\S]*?distributor="0" key="([^"]+)"`))?.[1]
    : undefined
  if (!authorKey || !existsSync(authorKey)) fail(`Certificado de autor do perfil "${cfg.profile}" ausente (${authorKey ?? '?'}).`)
  ok(`perfil "${cfg.profile}" · ${relative(homedir(), authorKey)}`)

  // 7 -----------------------------------------------------------------------
  step(`Destino do iPlex (${environment})`)
  const macAddress = localAddressFor(cfg.host)
  if (!macAddress) fail('Não foi possível descobrir o IP deste Mac na rede da TV.')
  const devServerOrigin = `http://${macAddress}:${cfg.reportPort}`
  const reportUrl = `${devServerOrigin}/iplex-dev-report`
  const buildEnv = { VITE_IPLEX_DEV_REPORT_URL: reportUrl }
  const remoteTarget = /^https?:/i.test(cfg.target)
  // Página de teste servida pelo Mac: desenvolvimento sem URL remota própria.
  const servesTestPage = environment === 'development' && !remoteTarget
  let expectTestPage = servesTestPage
  if (servesTestPage) {
    Object.assign(buildEnv, {
      VITE_IPLEX_TARGET_URL: `${devServerOrigin}/index.html`,
      VITE_IPLEX_ALLOW_INSECURE_TARGET: 'true',
    })
    ok(`página de teste controlada servida por este Mac: ${devServerOrigin}/index.html`)
  } else if (remoteTarget) {
    const { base, manifest } = await verifyWebTarget(cfg.target)
    expectTestPage = manifest.version === 'test-page'
    ok(`iPlex Web publicado em ${base.href} (versão ${manifest.version}, ponte v${manifest.bridgeVersion})`)
  } else if (cfg.target) {
    ok(`conteúdo empacotado no widget: ${cfg.target}`)
  } else {
    fail(`VITE_IPLEX_TARGET_URL não definida para o ambiente ${environment}.`)
  }

  // 8 -----------------------------------------------------------------------
  step('TypeScript')
  const tsc = run(join(root, 'node_modules', '.bin', 'tsc'), ['-b'], { timeoutMs: 180000 })
  if (tsc.status !== 0) fail('Erros de TypeScript.', tsc.output.trim().split('\n').slice(0, 20).join('\n'))
  ok('tsc -b sem erros')

  // 9 -----------------------------------------------------------------------
  step('Build Vite + widget Tizen + pacote WGT assinado')
  const packaging = run(process.execPath, [join(root, 'scripts', 'build-tizen.mjs'), '--package', '--env', environment], {
    timeoutMs: 300000,
    envExtra: buildEnv,
  })
  if (packaging.status !== 0) {
    fail('Falha no build/empacotamento.', packaging.output.trim().split('\n').filter((line) => /ERRO|error/i.test(line)).slice(-10).join('\n'))
  }
  const wgtName = `IplexTV-${cfg.version}.wgt`
  if (!existsSync(join(packageDir, wgtName))) fail(`Pacote ${wgtName} não foi gerado.`)
  ok(`${relative(root, join(packageDir, wgtName))} (${environment}, assinado com "${cfg.profile}")`)
  info(`destino: ${buildEnv.VITE_IPLEX_TARGET_URL ?? cfg.target} · modo ${cfg.loadMode} · relatório: ${reportUrl}`)

  // 10 ----------------------------------------------------------------------
  step('Identificador do aplicativo')
  const configXml = readFileSync(join(widgetDir, 'config.xml'), 'utf8')
  const declaredId = configXml.match(/<tizen:application[^>]*\bid="([^"]+)"/)?.[1]
  const declaredPackage = configXml.match(/<tizen:application[^>]*\bpackage="([^"]+)"/)?.[1]
  const declaredVersion = configXml.match(/<widget[^>]*\bversion="([^"]+)"/)?.[1]
  if (declaredId !== appId || declaredPackage !== cfg.packageId) {
    fail(`config.xml declara ${declaredId}/${declaredPackage}, esperado ${appId}/${cfg.packageId}.`)
  }
  ok(`${appId} · versão ${declaredVersion}`)

  // 11 ----------------------------------------------------------------------
  step('Instalação na TV')
  const hash = widgetHash()
  const installedBefore = tvApplist()?.find((app) => app.app_id === appId)
  const state = readState()
  const unchanged =
    !cfg.forceInstall &&
    installedBefore?.app_version === declaredVersion &&
    state?.serial === serial &&
    state?.appId === appId &&
    state?.hash === hash
  if (unchanged) {
    ok(`versão instalada já corresponde a este build (instalada em ${installedBefore.install_date}); instalação pulada`)
  } else {
    info(installedBefore ? `atualizando (instalada: ${installedBefore.app_version}, ${installedBefore.install_date}); dados do app preservados` : 'primeira instalação')
    const install = run(cfg.tizen, ['install', '-n', wgtName, '-s', serial, '--', packageDir], { timeoutMs: 300000 })
    if (install.status !== 0 || !/successfully installed|install completed/i.test(install.output)) {
      fail('A instalação falhou.', install.output.trim().split('\n').slice(-8).join('\n'))
    }
    const installed = tvApplist()?.find((app) => app.app_id === appId)
    if (!installed || installed.app_version !== declaredVersion) {
      fail(`Após instalar, ${appId} ${declaredVersion} não aparece na lista de apps da TV.`)
    }
    writeFileSync(statePath, JSON.stringify({ serial, appId, hash, version: declaredVersion, environment, installedAt: new Date().toISOString() }, null, 2))
    ok(`instalado: ${installed.app_title} ${installed.app_version} (${installed.install_date})`)
  }

  // 12 ----------------------------------------------------------------------
  step('Abrindo o iPlex na TV')
  const devServer = await startDevServer(cfg.host).catch((error) =>
    fail(`Não foi possível abrir o servidor na porta ${cfg.reportPort}: ${error.message}`, 'Defina outra porta em IPLEX_TV_REPORT_PORT.'),
  )
  // Encerra uma instância anterior para garantir abertura limpa (comando de TV `0 kill`).
  run(cfg.sdb, ['-s', serial, 'shell', '0', 'kill', cfg.packageId], { timeoutMs: 20000 })
  const launchedAt = Date.now()
  const launch = run(cfg.tizen, ['run', '-p', appId, '-s', serial], { timeoutMs: 120000 })
  if (launch.status !== 0 || !/successfully launched/i.test(launch.output)) {
    await devServer.close()
    fail('A TV não confirmou a abertura do app.', launch.output.trim().split('\n').slice(-6).join('\n'))
  }
  ok('TV confirmou a abertura (tizen run)')

  // 13 ----------------------------------------------------------------------
  step('Validação real na TV')
  const FAILURES = ['offline', 'unreachable', 'not-deployed', 'server-error', 'incompatible', 'load-timeout', 'config-error', 'test:error']
  const outcome = await new Promise((resolveOutcome) => {
    const timer = setTimeout(() => resolveOutcome({ status: 'timeout', started, ready }), cfg.validateTimeoutMs)
    let started = null
    let ready = null
    let navigateTo = null
    const finish = (result) => {
      clearTimeout(timer)
      resolveOutcome(result)
    }
    devServer.onEvent((event) => {
      if (event.receivedAt < launchedAt) return
      if (event.event === 'launcher-start') started = event
      if (event.event === 'navigate') navigateTo = event.detail
      if (event.event === 'frame-ready') ready = event
      if (FAILURES.includes(event.event)) return finish({ status: 'failed', started, event })
      if (cfg.loadMode === 'navigate' && event.event === 'launcher-pagehide' && navigateTo) {
        return finish({ status: 'navigated', started, url: navigateTo })
      }
      if (ready && (!expectTestPage || event.event === 'test:done')) return finish({ status: 'ready', started, ready })
    })
  })
  await sleep(500) // eventos atrasados (visibilidade, teclas)

  if (outcome.status === 'timeout') {
    await devServer.close()
    fail(
      `Nenhuma confirmação completa da TV em ${cfg.validateTimeoutMs / 1000}s.`,
      outcome.started
        ? `O shell iniciou, mas ${outcome.ready ? 'o teste da página não terminou' : 'o frontend não respondeu app.ready'}. Olhe a tela da TV e o log.`
        : `O app foi aberto, mas não reportou a execução. Verifique se a porta ${cfg.reportPort} do Mac aceita conexões da TV.`,
    )
  }
  if (outcome.started) ok(`shell em execução na TV (${outcome.started.detail ?? 'tizen'}) · ${outcome.started.userAgent ?? ''}`)
  if (outcome.status === 'failed') {
    await devServer.close()
    fail(`A TV reportou falha: ${outcome.event.event}${outcome.event.detail ? ` — ${outcome.event.detail}` : ''}`)
  }
  if (outcome.status === 'navigated') {
    ok(`navegação de nível superior concluída na TV (shell descarregado): ${outcome.url}`)
    info('modo navigate: a página remota não tem ponte nem envia relatórios.')
  } else {
    ok(`frontend pronto na TV (app.ready: ${outcome.ready.detail})`)
    if (expectTestPage) ok('página de teste: ponte e player verificados na TV (detalhes acima)')
  }

  if (cfg.watchSeconds) {
    info(`acompanhando eventos da TV por ${cfg.watchSeconds}s (teclas do controle remoto aparecem aqui)…`)
    await sleep(cfg.watchSeconds * 1000)
  } else if (servesTestPage) {
    info('o servidor da página de teste é encerrado agora; reabrir o app na TV sem `npm run tv` mostrará "servidor indisponível".')
  }
  await devServer.close()

  print(`\n${color.ok}${color.bold}✔ iPlex (${environment}) atualizado e aberto na Samsung.${color.off}`)
  print(`${color.dim}log: ${relative(root, logPath)}${color.off}`)
}

main().catch((error) => {
  const known = error instanceof StepError
  print(`\n  ${color.err}✖ ${known ? error.message : `Erro inesperado: ${error.stack || error}`}${color.off}`)
  if (known && error.hint) print(`    ${error.hint.split('\n').join('\n    ')}`)
  print(`\n${color.err}${color.bold}Falhou na etapa ${stepNumber}/${TOTAL_STEPS}: ${stepLabel || 'configuração'}.${color.off}`)
  print(`${color.dim}log completo: ${logPath}${color.off}`)
  process.exit(1)
})
