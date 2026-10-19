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
    exit() {
      console.info('[iPlex] exit() ignorado: disponível apenas na TV.')
    },
    createPlayer: createHtml5Player,
  }
}
