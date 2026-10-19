#!/usr/bin/env node
/**
 * Build do iPlex App para Samsung Tizen.
 *
 *   npm run build:tizen     -> dist-tizen/widget (pasta do widget, sem assinatura)
 *   npm run package:tizen   -> build + `tizen package -t wgt` -> build/tizen/*.wgt
 *   ... -- --env development  (padrão: production)
 *
 * O widget contém o shell (launcher.html, página inicial do config.xml). O
 * destino vem do ambiente: .env.production (iPlex Web hospedado) ou
 * .env.development (página de teste controlada, incluída no widget).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const widgetDir = join(root, 'dist-tizen', 'widget')
const packageDir = join(root, 'build', 'tizen')
const shouldPackage = process.argv.includes('--package')

function fail(message) {
  console.error(`\n[build-tizen] ERRO: ${message}`)
  process.exit(1)
}

const envArgIndex = process.argv.indexOf('--env')
const environment = envArgIndex === -1 ? 'production' : process.argv[envArgIndex + 1]
if (environment !== 'production' && environment !== 'development') {
  fail(`--env deve ser production ou development (recebido "${environment}").`)
}
// .env + .env.<ambiente> + .env.local + .env.<ambiente>.local; process.env tem prioridade.
const env = loadEnv(environment, root, '')

// ---- Configuração -----------------------------------------------------------

const version = env.IPLEX_TIZEN_VERSION || '1.0.0'
const versionParts = version.split('.').map(Number)
if (
  versionParts.length !== 3 ||
  versionParts.some((part) => !Number.isInteger(part) || part < 0) ||
  versionParts[0] > 255 ||
  versionParts[1] > 255 ||
  versionParts[2] > 65535
) {
  fail(`IPLEX_TIZEN_VERSION inválida (${version}); use x.y.z com x,y <= 255 e z <= 65535.`)
}

// Título exibido na TV; precisa ser igual ao título padrão no Seller Office.
const appName = (env.IPLEX_TIZEN_APP_NAME || 'iPlex TV').trim()
if (!appName || appName.length > 50 || /[<>&"]/.test(appName)) fail(`IPLEX_TIZEN_APP_NAME inválido: "${appName}"`)

// Identificador já instalado na TV: alterá-lo cria outro app (sem atualização).
const packageId = env.IPLEX_TIZEN_PACKAGE_ID || 'iPlexTVApp'
if (!/^[0-9a-zA-Z]{10}$/.test(packageId)) {
  fail(`IPLEX_TIZEN_PACKAGE_ID deve ter exatamente 10 caracteres alfanuméricos (recebido "${packageId}").`)
}

const targetRaw = (env.VITE_IPLEX_TARGET_URL || '').trim()
if (!targetRaw) fail(`VITE_IPLEX_TARGET_URL não definida para o ambiente ${environment}.`)
const remoteTarget = /^[a-z][a-z0-9+.-]*:/i.test(targetRaw) ? new URL(targetRaw) : null
if (remoteTarget && remoteTarget.protocol !== 'https:') {
  const devHttp = environment === 'development' && env.VITE_IPLEX_ALLOW_INSECURE_TARGET === 'true'
  if (!devHttp || remoteTarget.protocol !== 'http:') {
    fail(`VITE_IPLEX_TARGET_URL precisa ser HTTPS (recebido ${remoteTarget.protocol}).`)
  }
}

/** Domínio-base liberado com subdomínios: www.exemplo.com -> exemplo.com. */
function baseDomain(host) {
  const clean = host.trim().toLowerCase().replace(/^\*\./, '').replace(/^www\./, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) fail(`Host inválido para a política de acesso: "${host}"`)
  return clean
}

const accessEntries = []
const navigationEntries = []
const allowDomain = (domain) => {
  accessEntries.push(`    <access origin="https://${domain}" subdomains="true"/>`)
  navigationEntries.push(domain, `*.${domain}`)
}
if (remoteTarget?.protocol === 'https:') allowDomain(baseDomain(remoteTarget.hostname))
if (remoteTarget?.protocol === 'http:') {
  // Desenvolvimento: página de teste servida pelo Mac (origem exata, sem subdomínios).
  accessEntries.push(`    <access origin="${remoteTarget.origin}" subdomains="false"/> <!-- desenvolvimento -->`)
  navigationEntries.push(remoteTarget.hostname)
}
for (const host of (env.IPLEX_TIZEN_EXTRA_HOSTS || '').split(/\s+/).filter(Boolean)) allowDomain(baseDomain(host))

// Somente `npm run tv`: receptor de eventos de desenvolvimento no Mac.
const devReportUrl = env.VITE_IPLEX_DEV_REPORT_URL
if (devReportUrl) {
  const url = new URL(devReportUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`VITE_IPLEX_DEV_REPORT_URL inválida: ${devReportUrl}`)
  const entry = `    <access origin="${url.origin}" subdomains="false"/> <!-- desenvolvimento: npm run tv -->`
  if (!accessEntries.some((line) => line.includes(`"${url.origin}"`))) accessEntries.push(entry)
  console.log('[build-tizen] relatório de desenvolvimento:', url.href)
}

const accessXml = [...new Set(accessEntries)].join('\n') || '    <!-- modo empacotado: nenhum acesso externo declarado -->'
const allowNavigationXml = navigationEntries.length
  ? `    <tizen:allow-navigation>${[...new Set(navigationEntries)].join(' ')}</tizen:allow-navigation>`
  : '    <!-- modo empacotado: nenhuma navegação externa declarada -->'

// A página de teste só entra no widget em desenvolvimento ou quando é o destino local.
const pages = ['launcher.html']
if (environment === 'development' || !remoteTarget) pages.push('index.html')

console.log(`[build-tizen] ambiente: ${environment}`)
console.log('[build-tizen] destino:', targetRaw, remoteTarget ? '(hospedado)' : '(empacotado)')
console.log('[build-tizen] páginas:', pages.join(', '))

// ---- Build Vite (uma página por vez: IIFE) ---------------------------------

rmSync(join(root, 'dist-tizen'), { recursive: true, force: true })
mkdirSync(widgetDir, { recursive: true })

for (const page of pages) {
  process.env.IPLEX_TIZEN_PAGE = page
  process.env.IPLEX_TIZEN_OUT_DIR = widgetDir
  console.log(`\n[build-tizen] vite build --mode ${environment} (${page})`)
  await build({
    root,
    mode: environment,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'info',
    // public/ (favicon, manifesto da página de teste) só no desenvolvimento.
    publicDir: pages.includes('index.html') ? undefined : false,
  })
}

// ---- Arquivos do widget -----------------------------------------------------

const template = readFileSync(join(root, 'tizen', 'config.template.xml'), 'utf8')
const configXml = template
  .replace('{{VERSION}}', version)
  .replace('{{APP_NAME}}', appName)
  .replaceAll('{{PACKAGE_ID}}', packageId)
  .replace('{{ACCESS}}', accessXml)
  .replace('{{ALLOW_NAVIGATION}}', allowNavigationXml)
writeFileSync(join(widgetDir, 'config.xml'), configXml)
copyFileSync(join(root, 'tizen', 'icon.png'), join(widgetDir, 'icon.png'))

for (const file of ['config.xml', 'icon.png', ...pages]) {
  if (!existsSync(join(widgetDir, file))) fail(`arquivo ausente no widget: ${file}`)
}
for (const page of pages) {
  const html = readFileSync(join(widgetDir, page), 'utf8')
  if (html.includes('type="module"')) fail(`${page} ainda contém <script type="module">`)
}
if (!readFileSync(join(widgetDir, 'launcher.html'), 'utf8').includes('$WEBAPIS/webapis/webapis.js')) {
  fail('launcher.html sem $WEBAPIS/webapis/webapis.js (necessário ao AVPlay)')
}
console.log(`\n[build-tizen] widget pronto em ${widgetDir}`)
console.log(readdirSync(widgetDir).map((name) => `  - ${name}`).join('\n'))

if (!shouldPackage) process.exit(0)

// ---- Empacotamento WGT (Tizen CLI) ----------------------------------------

const tizenCli = env.TIZEN_CLI || join(homedir(), 'tizen-studio', 'tools', 'ide', 'bin', 'tizen')
if (!existsSync(tizenCli)) fail(`Tizen CLI não encontrado em ${tizenCli} (defina TIZEN_CLI).`)
const profile = env.IPLEX_TIZEN_SIGNING_PROFILE || 'iplex-dev'

rmSync(packageDir, { recursive: true, force: true })
mkdirSync(packageDir, { recursive: true })
console.log(`\n[build-tizen] tizen package -t wgt -s ${profile}`)
const result = spawnSync(tizenCli, ['package', '-t', 'wgt', '-s', profile, '-o', packageDir, '--', widgetDir], {
  stdio: 'inherit',
})
if (result.status !== 0) fail(`tizen package falhou (código ${result.status}).`)

const generated = readdirSync(packageDir).find((name) => name.endsWith('.wgt'))
if (!generated) fail('tizen package terminou sem gerar .wgt.')
// O CLI nomeia o pacote pelo <name> ("iPlex TV.wgt"); renomeia sem espaços.
const wgt = join(packageDir, `IplexTV-${version}.wgt`)
renameSync(join(packageDir, generated), wgt)
console.log(`\n[build-tizen] pacote gerado (${environment}): ${wgt}`)
