import { reportDevEvent } from '../devtools/devReport'

/**
 * Registro das tentativas de inicialização, incluindo qual URL foi
 * efetivamente solicitada. Fica no console, no localStorage do launcher e,
 * em builds de `npm run tv`, é enviado ao Mac (src/devtools/devReport.ts).
 */

export interface LaunchLogEntry {
  at: string
  event: string
  detail?: string
}

const STORAGE_KEY = 'iplex.launchLog'
const MAX_ENTRIES = 50

export function readLaunchLog(): LaunchLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as LaunchLogEntry[]) : []
  } catch {
    return []
  }
}

export function logLaunchEvent(event: string, detail?: string) {
  const entry: LaunchLogEntry = { at: new Date().toISOString(), event, detail }
  console.info(`[iPlex] ${event}${detail ? `: ${detail}` : ''}`)
  reportDevEvent(event, detail)
  try {
    const entries = readLaunchLog()
    entries.push(entry)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // Armazenamento indisponível: o console continua sendo o registro.
  }
}
