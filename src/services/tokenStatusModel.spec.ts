import { describe, it, expect } from 'vitest'
import {
  sortStatusMarkers,
  sanitizeTokenStatusPayload,
  createTokenStatusPayload,
  resolveEffectiveStatuses,
  toggleTokenStatus,
  setTokenCover,
} from './tokenStatusModel'
import type { TokenDirectStatusPayload } from '@/types/token-status'

describe('tokenStatusModel (Regras de Prioridade e Resolução de Status)', () => {
  describe('sortStatusMarkers', () => {
    it('T-STATUS-sort-01: posiciona Cobertura no topo (índice 0)', () => {
      const sorted = sortStatusMarkers(['impaired', 'softcover', 'lockon'])
      expect(sorted).toEqual(['softcover', 'impaired', 'lockon'])
      expect(sorted[0]).toBe('softcover')
    })

    it('T-STATUS-sort-02: garante apenas uma cobertura ativa se múltiplas forem passadas', () => {
      const sorted = sortStatusMarkers(['softcover', 'hardcover', 'impaired'])
      expect(sorted).toEqual(['hardcover', 'impaired'])
    })

    it('T-STATUS-sort-03: coloca status personalizados (custom:*) no fim', () => {
      const sorted = sortStatusMarkers(['custom:Fogo', 'slow', 'hardcover', 'custom:Laser'])
      expect(sorted).toEqual(['hardcover', 'slow', 'custom:Fogo', 'custom:Laser'])
    })

    it('T-STATUS-sort-04: deduplica e normaliza aliases', () => {
      const sorted = sortStatusMarkers(['lock_on', 'lockon', 'lock on', 'debilitado'])
      expect(sorted).toEqual(['lockon', 'impaired'])
    })
  })

  describe('sanitizeTokenStatusPayload', () => {
    it('T-STATUS-sanitize-01: aceita payload válido', () => {
      const valid = {
        v: 1,
        statuses: ['lockon', 'impaired'],
        updatedAt: 12345678,
        updatedBy: 'GM-User',
        priorityMode: 'override',
      }
      const sanitized = sanitizeTokenStatusPayload(valid)
      expect(sanitized).toEqual({
        v: 1,
        statuses: ['lockon', 'impaired'],
        updatedAt: 12345678,
        updatedBy: 'GM-User',
        priorityMode: 'override',
      })
    })

    it('T-STATUS-sanitize-02: rejeita versão incompatível ou formato inválido', () => {
      expect(sanitizeTokenStatusPayload(null)).toBeNull()
      expect(sanitizeTokenStatusPayload('string')).toBeNull()
      expect(sanitizeTokenStatusPayload({ v: 99, statuses: [] })).toBeNull()
      expect(sanitizeTokenStatusPayload({ v: 1, statuses: 'not-array' })).toBeNull()
    })

    it('T-STATUS-sanitize-03: fornece defaults seguros para campos ausentes', () => {
      const sanitized = sanitizeTokenStatusPayload({
        v: 1,
        statuses: ['slowed'],
      })
      expect(sanitized).not.toBeNull()
      expect(sanitized?.statuses).toEqual(['slow'])
      expect(sanitized?.priorityMode).toBe('override')
      expect(sanitized?.updatedBy).toBe('unknown')
      expect(typeof sanitized?.updatedAt).toBe('number')
    })
  })

  describe('resolveEffectiveStatuses (A REGRA DE PRIORIDADE DO TOKEN)', () => {
    it('T-STATUS-priority-01: sem payload no token, a ficha dita os status', () => {
      const effective = resolveEffectiveStatuses(null, ['impaired', 'lockon'])
      expect(effective).toEqual(['impaired', 'lockon'])
    })

    it('T-STATUS-priority-02: com modo override (padrão), o token tem prioridade absoluta sobre a ficha', () => {
      const tokenPayload = createTokenStatusPayload(['slow', 'stunned'], 'GM', 'override')
      const sheetStatuses = ['lockon', 'impaired']

      const effective = resolveEffectiveStatuses(tokenPayload, sheetStatuses)

      // A ficha tinha lockon e impaired, mas o token foi marcado com slow e stunned diretamente
      expect(effective).toEqual(['slow', 'stunned'])
      expect(effective).not.toContain('lockon')
      expect(effective).not.toContain('impaired')
    })

    it('T-STATUS-priority-03: token limpo com override vazio não mostra status da ficha', () => {
      const tokenPayload = createTokenStatusPayload([], 'GM', 'override')
      const sheetStatuses = ['impaired', 'shredded']

      const effective = resolveEffectiveStatuses(tokenPayload, sheetStatuses)
      expect(effective).toEqual([])
    })

    it('T-STATUS-priority-04: com modo merge_priority, combina ficha e token com preservação de prioridade', () => {
      const tokenPayload = createTokenStatusPayload(['lockon', 'custom:Efeito'], 'Player', 'merge_priority')
      const sheetStatuses = ['impaired', 'softcover']

      const effective = resolveEffectiveStatuses(tokenPayload, sheetStatuses)
      expect(effective).toEqual(['softcover', 'impaired', 'lockon', 'custom:Efeito'])
    })
  })

  describe('toggleTokenStatus', () => {
    it('T-STATUS-toggle-01: adiciona status se não estiver presente', () => {
      const res = toggleTokenStatus(['lockon'], 'impaired')
      expect(res).toEqual(['lockon', 'impaired'])
    })

    it('T-STATUS-toggle-02: remove status se já estiver presente', () => {
      const res = toggleTokenStatus(['lockon', 'impaired'], 'lockon')
      expect(res).toEqual(['impaired'])
    })

    it('T-STATUS-toggle-03: ao ativar softcover, desativa hardcover automaticamente', () => {
      const res = toggleTokenStatus(['hardcover', 'impaired'], 'softcover')
      expect(res).toEqual(['softcover', 'impaired'])
    })

    it('T-STATUS-toggle-04: suporta toggle de status personalizado com custom:', () => {
      const res = toggleTokenStatus(['lockon'], 'custom:Armadura Quebrada')
      expect(res).toEqual(['lockon', 'custom:Armadura Quebrada'])

      const toggledOff = toggleTokenStatus(res, 'custom:Armadura Quebrada')
      expect(toggledOff).toEqual(['lockon'])
    })
  })

  describe('setTokenCover', () => {
    it('T-STATUS-cover-01: define softcover e posiciona no topo', () => {
      const res = setTokenCover(['lockon'], 'soft')
      expect(res).toEqual(['softcover', 'lockon'])
    })

    it('T-STATUS-cover-02: substitui soft por hard', () => {
      const res = setTokenCover(['softcover', 'lockon'], 'hard')
      expect(res).toEqual(['hardcover', 'lockon'])
    })

    it('T-STATUS-cover-03: remove cobertura com none', () => {
      const res = setTokenCover(['hardcover', 'lockon'], 'none')
      expect(res).toEqual(['lockon'])
    })
  })
})
