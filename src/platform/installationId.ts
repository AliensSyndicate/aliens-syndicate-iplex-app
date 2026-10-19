/**
 * Identificador desta instalação do app (independente de plataforma).
 *
 * Aleatório (UUID v4), gerado no primeiro uso e guardado no armazenamento do
 * próprio app. Some ao desinstalar. Não é prova de identidade: o backend
 * identifica o dispositivo pelo pareamento, e este valor serve só como dica.
 */

const STORAGE_KEY = 'iplex.installationId'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>

/**
 * UUID v4 com crypto.getRandomValues. crypto.randomUUID (M92) e
 * String.prototype.padStart (M57) não existem no Chromium M56 das TVs 2018.
 */
export function createUuid(random: RandomFill = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = random(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => `0${byte.toString(16)}`.slice(-2)).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

let cached: string | null = null

export function getInstallationId(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()): string {
  if (cached) return cached
  const stored = storage?.getItem(STORAGE_KEY)
  if (stored && UUID_PATTERN.test(stored)) {
    cached = stored
    return stored
  }
  const created = createUuid()
  try {
    storage?.setItem(STORAGE_KEY, created)
  } catch {
    // Sem armazenamento: o ID vale só para esta execução.
  }
  cached = created
  return created
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
