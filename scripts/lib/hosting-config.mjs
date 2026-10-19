/**
 * Configuração recomendada do Firebase Hosting do iPlex Web (site iplex-2c8fc).
 *
 * Fonte única usada pelo probe de Hosting (scripts/build-hosting-probe.mjs),
 * pelos testes e como modelo do firebase.json do repositório do iPlex Web
 * (docs/HOSTING.md). Regras para funcionar dentro do app Samsung:
 *  - SEM X-Frame-Options e SEM CSP frame-ancestors: o app Tizen exibe o Web
 *    num iframe cujo pai é file:// (origem opaca, que nenhuma lista
 *    frame-ancestors consegue autorizar; nem "*", que cobre só http/https/ws).
 *  - Manifesto iplex-web.json com CORS aberto e sem cache.
 *  - index.html (e rotas SPA) sem cache; assets com hash imutáveis.
 *  - CSP sem 'unsafe-inline'/'unsafe-eval' (exigência Samsung para hosted apps).
 */

export const HOSTING_SITE = 'iplex-2c8fc'
export const FIREBASE_PROJECT = 'iplex-2c8fc'

/** CSP do Web. connect-src cobre Firebase Auth/Functions/Firestore/App Check. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com https://www.gstatic.com",
  "style-src 'self'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "media-src 'self' https: blob:",
  "connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net https://*.firebaseio.com wss://*.firebaseio.com https://www.google.com",
  'frame-src https://www.google.com https://recaptcha.google.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
]

/**
 * @param {{ publicDir?: string, csp?: string | null }} options
 *   csp: null remove a CSP (diagnóstico); string substitui.
 */
export function hostingConfig({ publicDir = 'dist', csp } = {}) {
  const security = SECURITY_HEADERS.flatMap((header) => {
    if (header.key !== 'Content-Security-Policy' || csp === undefined) return [header]
    return csp === null ? [] : [{ key: header.key, value: csp }]
  })
  return {
    hosting: {
      site: HOSTING_SITE,
      public: publicDir,
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      // Arquivos existentes têm prioridade; o resto é rota do SPA.
      rewrites: [{ source: '**', destination: '/index.html' }],
      headers: [
        // Segurança em todas as respostas (inclusive "/" e o fallback do SPA).
        { source: '**', headers: security },
        // Páginas ("/", rotas SPA, *.html): sempre revalidar, para cada publicação
        // do Web chegar às TVs na próxima abertura do app. O padrão **/!(*.*) não
        // cobre "/" (verificado no emulador do Hosting).
        { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: '**/!(*.*)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: '**/*.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        // Assets com hash no nome (Vite): imutáveis.
        { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
        // Manifesto lido pelo app da TV (origem file://): CORS aberto, sem cache.
        {
          source: '/iplex-web.json',
          headers: [
            { key: 'Access-Control-Allow-Origin', value: '*' },
            { key: 'Cache-Control', value: 'no-cache' },
          ],
        },
      ],
    },
  }
}

export function firebaserc() {
  return { projects: { default: FIREBASE_PROJECT } }
}
