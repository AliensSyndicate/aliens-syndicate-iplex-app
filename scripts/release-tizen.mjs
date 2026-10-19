#!/usr/bin/env node
/**
 * Release do iPlex App para a Samsung (Seller Office).
 *
 *   npm run release:tizen               -> verifica todos os requisitos; só gera o
 *                                          pacote de loja se nenhum bloquear
 *   npm run release:tizen -- --candidate -> gera também um CANDIDATO de produção
 *                                          (perfil de desenvolvimento, não publicável)
 *
 * Requisitos verificados:
 *   1. Árvore Git limpa (aviso)
 *   2. TypeScript e ESLint
 *   3. iPlex Web publicado na URL de produção (manifesto, CORS, ponte, iframe)
 *   4. Perfil de assinatura da loja (IPLEX_TIZEN_RELEASE_PROFILE)
 *   5. Materiais do Seller Office em store/samsung/ (ícones e screenshots)
 *   6. Pacote gerado: só o shell, sem página de teste nem canal de desenvolvimento
 *
 * Saída: build/release/IplexTV-<versão>.wgt, .sha256 e RELEASE.md.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { readBridgeVersion, verifyWebTarget } from './lib/web-target.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = loadEnv('production', root, '')
const candidate = process.argv.includes('--candidate')

const version = env.IPLEX_TIZEN_VERSION || '1.0.0'
const appName = env.IPLEX_TIZEN_APP_NAME || 'iPlex TV'
const devProfile = env.IPLEX_TIZEN_SIGNING_PROFILE || 'iplex-dev'
const releaseProfile = env.IPLEX_TIZEN_RELEASE_PROFILE || 'iplex-samsung'
const targetUrl = env.VITE_IPLEX_TARGET_URL || ''
const loadMode = env.VITE_IPLEX_LOAD_MODE === 'navigate' ? 'navigate' : 'frame'
const tizenCli = env.TIZEN_CLI || join(homedir(), 'tizen-studio', 'tools', 'ide', 'bin', 'tizen')
const storeDir = join(root, 'store', 'samsung')
const releaseDir = join(root, 'build', 'release')

const tty = process.stdout.isTTY
const paint = (code, text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text)
const results = []

function report(gate, status, detail) {
  results.push({ gate, status, detail })
  const icon = status === 'ok' ? paint(32, '✔') : status === 'aviso' ? paint(33, '⚠') : paint(31, '✖')
  console.log(`  ${icon} ${detail}`)
}

function section(title) {
  console.log(`\n${paint(1, title)}`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, ...options })
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` }
}

/** Dimensões/alfa/tamanho de uma imagem via sips (macOS). */
function imageInfo(path) {
  const output = run('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', '-g', 'format', path]).output
  const read = (key) => output.match(new RegExp(`${key}: (\\S+)`))?.[1]
  return {
    width: Number(read('pixelWidth')),
    height: Number(read('pixelHeight')),
    alpha: read('hasAlpha') === 'yes',
    format: read('format'),
    kb: Math.round(statSync(path).size / 1024),
  }
}

function checkImage(label, path, { width, height, alpha, formats, maxKb }) {
  if (!existsSync(path)) {
    report(5, 'bloqueia', `${label}: falta ${relative(root, path)}`)
    return
  }
  const info = imageInfo(path)
  const problems = []
  if (info.width !== width || info.height !== height) problems.push(`${info.width}x${info.height} (esperado ${width}x${height})`)
  if (alpha !== undefined && info.alpha !== alpha) problems.push(alpha ? 'sem transparência (precisa RGBA)' : 'com transparência (precisa RGB)')
  if (formats && !formats.includes(info.format)) problems.push(`formato ${info.format} (esperado ${formats.join('/')})`)
  if (info.kb > maxKb) problems.push(`${info.kb} KB (máximo ${maxKb} KB)`)
  report(5, problems.length ? 'bloqueia' : 'ok', `${label}: ${problems.length ? problems.join('; ') : `${width}x${height}, ${info.kb} KB`}`)
}

function profileKeys(name) {
  const path = join(homedir(), 'tizen-studio-data', 'profile', 'profiles.xml')
  if (!existsSync(path)) return null
  const block = readFileSync(path, 'utf8').match(new RegExp(`<profile name="${name}">([\\s\\S]*?)</profile>`))?.[1]
  if (!block) return null
  return {
    author: block.match(/distributor="0" key="([^"]*)"/)?.[1] ?? '',
    distributor: block.match(/distributor="1" key="([^"]*)"/)?.[1] ?? '',
  }
}

console.log(paint(1, `Release ${appName} ${version} — Samsung Tizen (produção)`))
console.log(`destino: ${targetUrl || '(não definido)'} · modo ${loadMode}${candidate ? ' · com --candidate' : ''}`)

// 1 --------------------------------------------------------------------------
section('[1] Git')
const gitStatus = run('git', ['status', '--porcelain']).output.trim()
const commit = run('git', ['rev-parse', '--short', 'HEAD']).output.trim()
report(1, gitStatus ? 'aviso' : 'ok', gitStatus ? `há alterações sem commit (o pacote não corresponde a ${commit})` : `árvore limpa no commit ${commit}`)

// 2 --------------------------------------------------------------------------
section('[2] TypeScript e ESLint')
const tsc = run(join(root, 'node_modules', '.bin', 'tsc'), ['-b'])
report(2, tsc.status === 0 ? 'ok' : 'bloqueia', tsc.status === 0 ? 'tsc -b sem erros' : `erros de TypeScript:\n${tsc.output.trim().slice(0, 800)}`)
const lint = run(join(root, 'node_modules', '.bin', 'eslint'), ['.'])
report(2, lint.status === 0 ? 'ok' : 'bloqueia', lint.status === 0 ? 'eslint sem erros' : `erros de ESLint:\n${lint.output.trim().slice(0, 800)}`)

// 3 --------------------------------------------------------------------------
section('[3] iPlex Web em produção')
if (!/^https:/i.test(targetUrl)) {
  report(3, 'bloqueia', `VITE_IPLEX_TARGET_URL de produção deve ser https (atual: "${targetUrl}")`)
} else {
  const web = await verifyWebTarget(targetUrl, { loadMode, bridgeVersion: readBridgeVersion(root) })
  if (web.ok) report(3, 'ok', `publicado em ${web.base.href} (versão ${web.manifest.version}, ponte v${web.manifest.bridgeVersion})`)
  web.problems.forEach((problem) => report(3, 'bloqueia', problem))
  web.warnings.forEach((warning) => report(3, 'aviso', warning))
}

// 4 --------------------------------------------------------------------------
section('[4] Certificado da loja')
const release = profileKeys(releaseProfile)
if (!release) {
  report(4, 'bloqueia', `perfil "${releaseProfile}" não existe: crie o certificado Samsung no Certificate Manager (docs/PUBLICACAO.md)`)
} else {
  report(4, existsSync(release.author) ? 'ok' : 'bloqueia', `autor: ${release.author || '(vazio)'}${existsSync(release.author) ? '' : ' — arquivo ausente'}`)
  const dev = profileKeys(devProfile)
  if (dev && dev.author === release.author) {
    report(4, 'aviso', `o perfil da loja usa o mesmo autor do desenvolvimento (${devProfile}); confirme que é o certificado definitivo`)
  }
  if (/tizen-distributor-signer/.test(release.distributor)) {
    report(4, 'aviso', 'distribuidor Tizen padrão: confirme no Seller Office o certificado exigido para o upload')
  }
  report(4, 'aviso', 'guarde backup do certificado de autor: todas as atualizações precisam dele e ele não é recuperável')
}

// 5 --------------------------------------------------------------------------
section('[5] Materiais do Seller Office (store/samsung)')
checkImage('Ícone 512x423', join(storeDir, 'icon-512x423.png'), { width: 512, height: 423, alpha: false, formats: ['png'], maxKb: 300 })
checkImage('Logo 1920x1080 (transparente)', join(storeDir, 'logo-1920x1080.png'), { width: 1920, height: 1080, alpha: true, formats: ['png'], maxKb: 300 })
const background = ['background-1920x1080.png', 'background-1920x1080.jpg'].map((name) => join(storeDir, name)).find(existsSync)
checkImage('Fundo 1920x1080', background ?? join(storeDir, 'background-1920x1080.png'), {
  width: 1920,
  height: 1080,
  formats: ['png', 'jpeg'],
  maxKb: 300,
})
const shotsDir = join(storeDir, 'screenshots')
const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((name) => /\.jpe?g$/i.test(name)) : []
if (shots.length < 4) report(5, 'bloqueia', `Screenshots: ${shots.length} de no mínimo 4 JPG 1920x1080 em ${relative(root, shotsDir)}`)
for (const name of shots) {
  const info = imageInfo(join(shotsDir, name))
  const sizeOk = (info.width === 1920 && info.height === 1080) || (info.width === 1280 && info.height === 720)
  report(5, sizeOk && info.kb <= 500 ? 'ok' : 'bloqueia', `Screenshot ${name}: ${info.width}x${info.height}, ${info.kb} KB`)
}
for (const doc of ['app-ui-description', 'politica-de-privacidade.url']) {
  const found = existsSync(storeDir) && readdirSync(storeDir).some((name) => name.startsWith(doc))
  report(5, found ? 'ok' : 'aviso', `${doc}: ${found ? 'presente' : `ausente em ${relative(root, storeDir)} (exigido pelo Seller Office; ver docs/PUBLICACAO.md)`}`)
}

// 6 --------------------------------------------------------------------------
const blocking = results.filter((result) => result.status === 'bloqueia')
const buildable = results.filter((result) => result.status === 'bloqueia' && result.gate === 2).length === 0
const storeReady = blocking.length === 0

section('[6] Pacote de produção')
if (!storeReady && !(candidate && buildable)) {
  report(6, 'bloqueia', `não gerado: ${blocking.length} requisito(s) bloqueando${buildable ? ' (use --candidate para um pacote de teste)' : ''}`)
} else {
  const profile = storeReady ? releaseProfile : devProfile
  const build = run(process.execPath, [join(root, 'scripts', 'build-tizen.mjs'), '--package', '--env', 'production'], {
    env: { ...process.env, IPLEX_TIZEN_SIGNING_PROFILE: profile, VITE_IPLEX_DEV_REPORT_URL: '' },
  })
  const wgtSource = join(root, 'build', 'tizen', `IplexTV-${version}.wgt`)
  if (build.status !== 0 || !existsSync(wgtSource)) {
    report(6, 'bloqueia', `falha no build/empacotamento:\n${build.output.trim().split('\n').slice(-8).join('\n')}`)
  } else {
    const outDir = storeReady ? releaseDir : join(releaseDir, 'candidato')
    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(outDir, { recursive: true })
    const wgt = join(outDir, `IplexTV-${version}${storeReady ? '' : '-candidato'}.wgt`)
    copyFileSync(wgtSource, wgt)

    // Conteúdo do pacote: só o shell de produção.
    const listing = run('/usr/bin/unzip', ['-Z1', wgt]).output.split('\n').filter(Boolean)
    const configXml = run('/usr/bin/unzip', ['-p', wgt, 'config.xml']).output
    const bundle = listing.filter((name) => name.endsWith('.js')).map((name) => run('/usr/bin/unzip', ['-p', wgt, name]).output).join('\n')
    const contentProblems = []
    for (const file of ['config.xml', 'launcher.html', 'icon.png', 'author-signature.xml', 'signature1.xml']) {
      if (!listing.includes(file)) contentProblems.push(`falta ${file}`)
    }
    for (const file of ['index.html', 'iplex-web.json']) if (listing.includes(file)) contentProblems.push(`contém ${file} (página de teste)`)
    if (/iplex-dev-report|test-streams\.mux|VITE_IPLEX_TEST_CHANNELS/.test(bundle)) contentProblems.push('bundle contém recursos de desenvolvimento')
    if (!configXml.includes('screen.size.normal.1080.1920')) contentProblems.push('config.xml sem <feature> de tamanho de tela')
    if (!configXml.includes(`<name>${appName}</name>`)) contentProblems.push(`config.xml sem <name>${appName}</name>`)
    if (/<access origin="http:/.test(configXml)) contentProblems.push('config.xml libera origem http')
    report(6, contentProblems.length ? 'bloqueia' : 'ok', contentProblems.length ? `pacote inválido: ${contentProblems.join('; ')}` : `conteúdo verificado: ${listing.length} arquivos, só o shell de produção`)

    const sha256 = createHash('sha256').update(readFileSync(wgt)).digest('hex')
    writeFileSync(`${wgt}.sha256`, `${sha256}  ${relative(outDir, wgt)}\n`)
    report(6, storeReady ? 'ok' : 'aviso', `${relative(root, wgt)} (${Math.round(statSync(wgt).size / 1024)} KB) assinado com "${profile}"${storeReady ? '' : ' — CANDIDATO, não publicável'}`)

    const lines = [
      `# ${appName} ${version} — ${storeReady ? 'pacote de loja' : 'candidato (não publicável)'}`,
      '',
      `- Gerado em: ${new Date().toISOString()}`,
      `- Commit: ${commit}${gitStatus ? ' (com alterações locais sem commit)' : ''}`,
      `- Destino: ${targetUrl} (modo ${loadMode})`,
      `- Assinatura: perfil "${profile}"`,
      `- SHA-256: ${sha256}`,
      '',
      '## Requisitos',
      '',
      ...results.map((result) => `- [${result.status === 'ok' ? 'x' : ' '}] (${result.status}) ${result.detail.split('\n')[0]}`),
      '',
      '## Conteúdo do pacote',
      '',
      ...listing.map((name) => `- ${name}`),
      '',
    ]
    writeFileSync(join(outDir, 'RELEASE.md'), lines.join('\n'))
  }
}

// Resumo ---------------------------------------------------------------------
const finalBlocking = results.filter((result) => result.status === 'bloqueia')
const warnings = results.filter((result) => result.status === 'aviso')
console.log(`\n${paint(1, 'Resumo')}: ${results.filter((r) => r.status === 'ok').length} ok · ${warnings.length} aviso(s) · ${finalBlocking.length} bloqueio(s)`)
if (finalBlocking.length) {
  console.log(paint(31, `\n✖ Não está pronto para a loja. Resolva os bloqueios acima (docs/PUBLICACAO.md).`))
  process.exit(1)
}
console.log(paint(32, `\n✔ Pacote de loja pronto em ${relative(root, releaseDir)}.`))
