/**
 * Mapeamento das teclas do controle remoto Samsung.
 *
 * Setas, Enter e Return/Back são teclas obrigatórias no Tizen TV: chegam como
 * eventos keydown sem tizen.tvinputdevice.registerKey() (e, portanto, sem o
 * privilégio tv.inputdevice).
 *
 * Exit (10182) NÃO é registrado nem tratado: pela política da Samsung o
 * comportamento padrão (voltar à Home imediatamente) deve ser preservado.
 */

export type RemoteAction = 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'

export const TIZEN_KEY_CODE = {
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Enter: 13,
  Back: 10009,
  Exit: 10182,
} as const

/** Teclas equivalentes ao Return usadas para testes no navegador. */
const BROWSER_BACK_KEYS = new Set(['Escape', 'Backspace', 'BrowserBack', 'GoBack'])

export function toRemoteAction(event: KeyboardEvent): RemoteAction | null {
  switch (event.keyCode) {
    case TIZEN_KEY_CODE.ArrowUp:
      return 'up'
    case TIZEN_KEY_CODE.ArrowDown:
      return 'down'
    case TIZEN_KEY_CODE.ArrowLeft:
      return 'left'
    case TIZEN_KEY_CODE.ArrowRight:
      return 'right'
    case TIZEN_KEY_CODE.Enter:
      return 'enter'
    case TIZEN_KEY_CODE.Back:
      return 'back'
  }
  return BROWSER_BACK_KEYS.has(event.key) ? 'back' : null
}

/** Nome legível da tecla, para diagnóstico. */
export function describeKey(event: KeyboardEvent): string {
  for (const [name, code] of Object.entries(TIZEN_KEY_CODE)) {
    if (code === event.keyCode) return name
  }
  return event.key || 'Unidentified'
}
