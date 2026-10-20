import { describe, expect, it } from 'vitest'
import { sameToken } from './checks'

describe('sameToken', () => {
  it('aceita a serialização numérica do motor da TV (Chromium 69)', () => {
    expect(sameToken('rgba(241, 243, 244, 0.0509804)', 'rgba(241, 243, 244, 0.0509803922)')).toBe(true)
    expect(sameToken('#ffffff', '#FFFFFF')).toBe(true)
  })

  it('recusa valores aproximados ou diferentes', () => {
    expect(sameToken('rgba(241,243,244,0.05)', 'rgba(241, 243, 244, 0.0509803922)')).toBe(false)
    expect(sameToken('#fff', '#FFFFFF')).toBe(false)
    expect(sameToken('rgb(241, 243, 244)', 'rgba(241, 243, 244, 0.0509803922)')).toBe(false)
  })
})
