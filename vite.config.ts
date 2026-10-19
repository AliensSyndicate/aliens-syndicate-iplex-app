import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const root = import.meta.dirname

/**
 * Tizen: o runtime web das TVs 2018/2019 (Chromium M56/M63) não executa
 * <script type="module">, e o conteúdo empacotado é servido de arquivo local.
 * O bundle vira um script clássico (IIFE) com `defer`. No shell (launcher)
 * entra também a biblioteca Samsung WebAPIs, necessária ao AVPlay.
 */
function tizenHtml(page: string): Plugin {
  return {
    name: 'iplex-tizen-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => {
        let output = html
          .replace(/<script type="module" crossorigin/g, '<script defer')
          .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
        if (page === 'launcher.html') {
          output = output.replace('<head>', '<head>\n    <script src="$WEBAPIS/webapis/webapis.js"></script>')
        }
        return output
      },
    },
  }
}

// https://vite.dev/config/
// Modo = ambiente: development (.env.development) | production (.env.production).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'IPLEX_')
  const plugins = [react(), babel({ presets: [reactCompilerPreset()] })]
  const define = {
    __IPLEX_APP_VERSION__: JSON.stringify(env.IPLEX_TIZEN_VERSION || '0.0.0'),
    __IPLEX_APP_NAME__: JSON.stringify(env.IPLEX_TIZEN_APP_NAME || 'iPlex TV'),
  }

  const tizenPage = process.env.IPLEX_TIZEN_PAGE
  if (!tizenPage) {
    return {
      plugins,
      define,
      build: {
        rollupOptions: {
          input: {
            main: resolve(root, 'index.html'),
            launcher: resolve(root, 'launcher.html'),
          },
        },
      },
    }
  }

  // Uma página por execução (IIFE não permite múltiplas entradas);
  // scripts/build-tizen.mjs executa uma vez por página.
  return {
    plugins: [...plugins, tizenHtml(tizenPage)],
    define,
    base: './',
    build: {
      outDir: process.env.IPLEX_TIZEN_OUT_DIR ?? 'dist-tizen/widget',
      emptyOutDir: false,
      // Menor motor suportado: Tizen 4.0 (TVs 2018), Chromium M56.
      target: 'chrome56',
      modulePreload: false,
      cssCodeSplit: false,
      rollupOptions: {
        input: resolve(root, tizenPage),
        output: { format: 'iife', codeSplitting: false },
      },
    },
  }
})
