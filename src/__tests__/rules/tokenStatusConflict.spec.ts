import { describe, it, expect } from 'vitest'
import {
  resolveEffectiveStatuses,
  createTokenStatusPayload,
  sortStatusMarkers,
  toggleTokenStatus,
  setTokenCover,
} from '@/services/tokenStatusModel'
import { COMPCON_TOKEN_STATUSES_KEY } from '@/types/token-status'

describe('Prevenção de Conflitos: Token × Ficha × Sala de Sincronização', () => {
  it('T-CONFLICT-01: o efeito aplicado diretamente no token tem prioridade sobre os dados da ficha', () => {
    // 1. Ficha possui 'impaired' e 'slow'
    const sheetStatuses = ['impaired', 'slow']

    // 2. No mapa, o usuário marca o token diretamente com 'lockon' e 'stunned'
    const tokenDirectPayload = createTokenStatusPayload(['lockon', 'stunned'], 'GM', 'override')

    // 3. Resolução de status efetivos para o token
    const effective = resolveEffectiveStatuses(tokenDirectPayload, sheetStatuses)

    // O token reflete EXCLUSIVAMENTE os status aplicados diretamente nele
    expect(effective).toEqual(['lockon', 'stunned'])
    expect(effective).not.toContain('impaired')
    expect(effective).not.toContain('slow')
  })

  it('T-CONFLICT-02: sincronização remota da sala não apaga status marcados no token', () => {
    // 1. Token no mapa com status direto 'shredded'
    const tokenDirectPayload = createTokenStatusPayload(['shredded'], 'GM', 'override')

    // 2. Uma sincronização de sala (syncFromRoom) atualiza a ficha com novos dados (ex: 'exposed', 'dangerzone')
    const roomSyncedSheetStatuses = ['exposed', 'dangerzone']

    // 3. Ao recalcular os marcadores visuais do token, a prioridade do token é respeitada
    const effectiveAfterRoomSync = resolveEffectiveStatuses(tokenDirectPayload, roomSyncedSheetStatuses)

    // O status do token permanece 'shredded', intacto contra a sincronização remota
    expect(effectiveAfterRoomSync).toEqual(['shredded'])
    expect(effectiveAfterRoomSync).not.toContain('exposed')
    expect(effectiveAfterRoomSync).not.toContain('dangerzone')
  })

  it('T-CONFLICT-03: remoção do status direto do token restaura a visualização natural da ficha', () => {
    const sheetStatuses = ['impaired', 'softcover']

    // Quando o override direto é limpo (payload = null), volta a espelhar a ficha
    const effectiveRestored = resolveEffectiveStatuses(null, sheetStatuses)
    expect(effectiveRestored).toEqual(['softcover', 'impaired'])
  })

  it('T-CONFLICT-04: token avulso sem ficha funciona de forma independente', () => {
    // Token não vinculado (ficha = vazia)
    const tokenDirectPayload = createTokenStatusPayload(['lockon', 'custom:Alvo Marcado'], 'Player', 'override')

    const effective = resolveEffectiveStatuses(tokenDirectPayload, [])
    expect(effective).toEqual(['lockon', 'custom:Alvo Marcado'])
  })

  it('T-CONFLICT-05: alternar cobertura no token substitui coberturas anteriores e mantém topo', () => {
    let statuses = ['impaired', 'lockon']

    // Define cobertura leve
    statuses = setTokenCover(statuses, 'soft')
    expect(statuses).toEqual(['softcover', 'impaired', 'lockon'])

    // Altera para pesada (deve substituir leve, não acumular)
    statuses = setTokenCover(statuses, 'hard')
    expect(statuses).toEqual(['hardcover', 'impaired', 'lockon'])

    // Remove cobertura
    statuses = setTokenCover(statuses, 'none')
    expect(statuses).toEqual(['impaired', 'lockon'])
  })
})
