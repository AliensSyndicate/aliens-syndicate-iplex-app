import { describe, expect, it } from 'vitest'
import { nextInDirection, type Box } from './spatialNavigation'

const box = (left: number, top: number, width = 100, height = 50): Box => ({ left, top, width, height })

describe('nextInDirection', () => {
  // Linha de botões e, abaixo, uma linha de cards.
  const buttons = [box(0, 0), box(120, 0), box(240, 0)]
  const cards = [box(0, 100, 200, 200), box(220, 100, 200, 200)]
  const all = [...buttons, ...cards]

  it('anda na mesma linha', () => {
    expect(nextInDirection(buttons[0], all, 'right')).toBe(1)
    expect(nextInDirection(buttons[2], all, 'left')).toBe(1)
  })

  it('desce para o elemento mais alinhado', () => {
    expect(nextInDirection(buttons[0], all, 'down')).toBe(3)
    expect(nextInDirection(buttons[2], all, 'down')).toBe(4)
  })

  it('sobe para a linha de cima', () => {
    expect(nextInDirection(cards[1], all, 'up')).toBe(2)
  })

  it('sem vizinho na direção, não move', () => {
    expect(nextInDirection(buttons[2], all, 'right')).toBe(-1)
    expect(nextInDirection(buttons[0], all, 'up')).toBe(-1)
  })
})
