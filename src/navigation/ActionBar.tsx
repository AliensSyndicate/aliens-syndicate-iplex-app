import { useEffect, useRef, useState } from 'react'
import { IplexButton } from '../design-system'
import type { RemoteAction } from './remoteKeys'
import { useRemoteControl } from './useRemoteControl'

export interface ActionItem {
  id: string
  label: string
  onSelect: () => void
  /** Padrão: primary. Ações de saída/cancelamento usam secondary. */
  variant?: 'primary' | 'secondary'
}

interface ActionBarProps {
  actions: ActionItem[]
}

/** Grupo de botões navegável pelas setas e pelo Enter do controle remoto. */
export function ActionBar({ actions }: ActionBarProps) {
  const [focused, setFocused] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    buttons.current[focused]?.focus()
  }, [focused])

  useRemoteControl((action: RemoteAction) => {
    switch (action) {
      case 'left':
      case 'up':
        setFocused((index) => Math.max(0, index - 1))
        return true
      case 'right':
      case 'down':
        setFocused((index) => Math.min(actions.length - 1, index + 1))
        return true
      case 'enter':
        actions[focused]?.onSelect()
        return true
      default:
        return false
    }
  })

  return (
    <div className="action-bar">
      {actions.map((action, index) => (
        <IplexButton
          key={action.id}
          ref={(element) => {
            buttons.current[index] = element
          }}
          variant={action.variant}
          focused={index === focused}
          onClick={action.onSelect}
          onMouseEnter={() => setFocused(index)}
        >
          {action.label}
        </IplexButton>
      ))}
    </div>
  )
}
