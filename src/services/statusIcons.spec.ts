import { describe, it, expect } from 'vitest'
import {
  getStatusDefinition,
  normalizeStatusId,
  getStatusBadgeUrl,
  burnStatusMarkerId,
  parseBurnMarkerId,
  BURN_STATUS_PREFIX,
} from './statusIcons'

describe('statusIcons - Burn / Queimadura', () => {
  it('normaliza aliases de queimadura para burn', () => {
    expect(normalizeStatusId('burn')).toBe('burn')
    expect(normalizeStatusId('queimadura')).toBe('burn')
    expect(normalizeStatusId('burning')).toBe('burn')
    expect(normalizeStatusId('queimando')).toBe('burn')
    expect(normalizeStatusId('qmd')).toBe('burn')
  })

  it('retorna a definição do status burn com label Queimadura', () => {
    const def = getStatusDefinition('burn')
    expect(def).not.toBeNull()
    expect(def?.id).toBe('burn')
    expect(def?.label).toBe('Queimadura')
    expect(def?.color).toBe('#E65100')
    expect(def?.accentColor).toBe('#FF9100')
  })

  it('gera URL estática do badge burn.svg', () => {
    const url = getStatusBadgeUrl('burn')
    expect(url).toContain('/status-icons/burn.svg')
  })

  it('monta o identificador do marcador de queimadura com quantidade', () => {
    expect(burnStatusMarkerId(3)).toBe('burn:3')
    expect(burnStatusMarkerId(0)).toBe('burn:0')
    expect(burnStatusMarkerId(5.8)).toBe('burn:6')
    expect(BURN_STATUS_PREFIX).toBe('burn:')
  })

  it('faz parse correto do identificador de queimadura', () => {
    expect(parseBurnMarkerId('burn:3')).toEqual({ amount: 3 })
    expect(parseBurnMarkerId('burn:10')).toEqual({ amount: 10 })
    expect(parseBurnMarkerId('burn:0')).toEqual({ amount: 0 })
    expect(parseBurnMarkerId('burn:invalid')).toBeNull()
    expect(parseBurnMarkerId('custom:burn')).toBeNull()
    expect(parseBurnMarkerId('lockon')).toBeNull()
    expect(parseBurnMarkerId('')).toBeNull()
  })
})
