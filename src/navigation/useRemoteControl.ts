import { useEffect, useEffectEvent } from 'react'
import { toRemoteAction, type RemoteAction } from './remoteKeys'

/**
 * Assina keydown no documento e repassa a ação do controle remoto.
 * O handler retorna true quando consumiu a tecla (preventDefault).
 */
export function useRemoteControl(onAction: (action: RemoteAction, event: KeyboardEvent) => boolean) {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    const action = toRemoteAction(event)
    if (action && onAction(action, event)) {
      event.preventDefault()
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])
}
