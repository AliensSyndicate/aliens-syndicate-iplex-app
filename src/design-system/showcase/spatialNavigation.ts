export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Navegação espacial do controle remoto: escolhe o elemento mais próximo na
 * direção pedida (distância no eixo principal + desvio lateral com peso 2).
 * Retorna o índice em `candidates` ou -1 quando não há nada naquela direção.
 */
export function nextInDirection(current: Box, candidates: Box[], direction: Direction): number {
  const cx = current.left + current.width / 2
  const cy = current.top + current.height / 2
  let best = -1
  let bestScore = Infinity
  candidates.forEach((box, index) => {
    const bx = box.left + box.width / 2
    const by = box.top + box.height / 2
    const dx = bx - cx
    const dy = by - cy
    let primary: number
    let lateral: number
    switch (direction) {
      case 'right':
        if (box.left < current.left + current.width - 1) return
        primary = dx
        lateral = Math.abs(dy)
        break
      case 'left':
        if (box.left + box.width > current.left + 1) return
        primary = -dx
        lateral = Math.abs(dy)
        break
      case 'down':
        if (box.top < current.top + current.height - 1) return
        primary = dy
        lateral = Math.abs(dx)
        break
      case 'up':
        if (box.top + box.height > current.top + 1) return
        primary = -dy
        lateral = Math.abs(dx)
        break
    }
    const score = primary + lateral * 2
    if (score < bestScore) {
      bestScore = score
      best = index
    }
  })
  return best
}
