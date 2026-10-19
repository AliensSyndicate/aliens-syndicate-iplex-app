#!/usr/bin/env node
/**
 * Probe de Hosting do iPlex Web — NÃO é o iPlex Web.
 *
 * Gera em build/hosting-probe/ um site mínimo (página de teste que só faz o
 * handshake app.ready) com o firebase.json recomendado (scripts/lib/hosting-config.mjs).
 * Serve para validar Hosting + cabeçalhos + CSP + iframe + ponte na TV antes de o
 * iPlex Web existir, sem publicar nada:
 *
 *   npm run probe:hosting                     # gera build/hosting-probe
 *   (cd build/hosting-probe && firebase emulators:start --only hosting --project iplex-2c8fc)
 *   npm run tv -- --target http://<ip-do-mac>:5050/
 *
 * Opções: --variant frame-ancestors-star  (diagnóstico: CSP com frame-ancestors *)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { CONTENT_SECURITY_POLICY, firebaserc, hostingConfig } from './lib/hosting-config.mjs'
import { readBridgeVersion } from './lib/web-target.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build', 'hosting-probe')
const publicDir = join(outDir, 'public')
const variantIndex = process.argv.indexOf('--variant')
const variant = variantIndex === -1 ? 'default' : process.argv[variantIndex + 1]
const port = 5050

rmSync(outDir, { recursive: true, force: true })
mkdirSync(publicDir, { recursive: true })

// Página de teste (handshake) com o mesmo build compatível com Chromium M56 do Tizen.
process.env.IPLEX_TIZEN_PAGE = 'index.html'
process.env.IPLEX_TIZEN_OUT_DIR = publicDir
await build({ root, mode: 'production', configFile: join(root, 'vite.config.ts'), logLevel: 'warn', publicDir: false })

writeFileSync(
  join(publicDir, 'iplex-web.json'),
  `${JSON.stringify({ app: 'iplex-web', name: 'Probe de Hosting (não é o iPlex Web)', version: 'hosting-probe', bridgeVersion: readBridgeVersion(root) }, null, 2)}\n`,
)

const csp = variant === 'frame-ancestors-star' ? `${CONTENT_SECURITY_POLICY}; frame-ancestors *` : undefined
const config = hostingConfig({ publicDir: 'public', csp })
config.emulators = { hosting: { host: '0.0.0.0', port } }
writeFileSync(join(outDir, 'firebase.json'), `${JSON.stringify(config, null, 2)}\n`)
writeFileSync(join(outDir, '.firebaserc'), `${JSON.stringify(firebaserc(), null, 2)}\n`)

console.log(`Probe de Hosting (${variant}) em ${outDir}`)
console.log(`  emulador: cd build/hosting-probe && firebase emulators:start --only hosting --project iplex-2c8fc  (porta ${port})`)
console.log('  preview (só com autorização): cd build/hosting-probe && firebase hosting:channel:deploy probe --expires 1d --project iplex-2c8fc')
