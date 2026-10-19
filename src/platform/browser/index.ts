import { createHtml5Player } from '../../player/html5Player'
import type { PlatformAdapter } from '../types'

/** Adaptador usado fora da TV (desenvolvimento no navegador). */
export function createBrowserAdapter(): PlatformAdapter {
  return {
    id: 'browser',
    label: 'Navegador (desenvolvimento)',
    platformVersion: null,
    canExit: false,
    nativePlayer: false,
    model: null,
    // Navegador: Escape faz o papel do Return.
    keys: { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Back: 27 },
    mediaKeys: false,
    exit() {
      console.info('[iPlex] exit() ignorado: disponível apenas na TV.')
    },
    createPlayer: createHtml5Player,
  }
}
