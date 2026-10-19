/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** production | development (definido em .env.production / .env.development). */
  readonly VITE_IPLEX_ENV?: string
  /** Destino do shell: URL do iPlex Web ou caminho local empacotado. */
  readonly VITE_IPLEX_TARGET_URL?: string
  /** frame (padrão, com ponte) | navigate (sem ponte). */
  readonly VITE_IPLEX_LOAD_MODE?: string
  readonly VITE_IPLEX_PROBE_TIMEOUT_MS?: string
  readonly VITE_IPLEX_LOAD_TIMEOUT_MS?: string
  /** Somente desenvolvimento: permite destino http (página servida pelo Mac). */
  readonly VITE_IPLEX_ALLOW_INSECURE_TARGET?: string
  /** Somente página de teste: "canais" (URLs de mídia) separados por espaço. */
  readonly VITE_IPLEX_TEST_CHANNELS?: string
  /** Somente `npm run tv`: receptor de eventos no Mac. */
  readonly VITE_IPLEX_DEV_REPORT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versão e título do aplicativo (IPLEX_TIZEN_VERSION / IPLEX_TIZEN_APP_NAME), injetados pelo vite.config.ts. */
declare const __IPLEX_APP_VERSION__: string
declare const __IPLEX_APP_NAME__: string
