import { describe, it, expect, beforeEach } from 'vitest'
import { makeMech, makeNpc, makePilot } from '@/__tests__/factories'
import { Encounter } from '@/classes/encounter/Encounter'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { ActiveEffect } from '@/classes/components/feature/active_effects/ActiveEffect'
import { ActiveEffectEvent } from '@/classes/components/feature/active_effects/ActiveEffectEvent'
import { ActionSummary } from '@/classes/components/feature/active_effects/EffectActionSummary'
import { EffectDurationText, normalizeDurationKey } from '@/classes/components/feature/active_effects/effect_subtype/EffectDuration'
import { expiration } from '@/classes/components/combat/Expiration'
import { i18n } from '@/i18n'
import type { CombatantData } from '@/classes/encounter/Encounter'

describe('EffectActionSummary & ActiveEffectEvent.Summary', () => {
  let instance: EncounterInstance
  let initiator: CombatantData
  let victim: CombatantData

  beforeEach(() => {
    i18n.global.locale.value = 'pt'
    const pilot = makePilot({ level: 3 })
    makeMech(pilot)
    const encounter = new Encounter()
    encounter.Name = 'Test Encounter'
    encounter.AddCombatant(makeNpc('Target Dummy'))
    instance = new EncounterInstance(undefined, encounter, [pilot])
    initiator = instance.Combatants.find(c => c.type === 'pilot')!
    victim = instance.Combatants.find(c => c.type !== 'pilot')!
  })

  it('normalizes end_next_turn_target and translates it correctly', () => {
    expect(normalizeDurationKey('end_next_turn_target')).toBe('next_turn_end_target')
    expect(normalizeDurationKey('next_turn_end_target')).toBe('next_turn_end_target')

    const ptText = EffectDurationText('end_next_turn_target')
    expect(ptText).toContain('próximo turno')
    expect(ptText).not.toContain('Encounter')
    expect(ptText).not.toContain('encontro')
  })

  it('sets correct turn-based expiration for end_next_turn_target', () => {
    const exp = new expiration('end_next_turn_target', initiator.actor.CombatController, victim.actor.CombatController)
    expect(exp.Period).toBe('turn')
    expect(exp.EndsOn).toBe('end')
    expect(exp.ExpirationActorID).toBe(victim.actor.ID)
  })

  it('does not throw when Targets contains null (no target chosen on grid) and formats localized summary', () => {
    const effect = new ActiveEffect(
      {
        name: 'Impacto',
        damage: [{ type: 'Kinetic', val: '1d6' }],
        add_status: [{ id: 'impaired', duration: 'end_next_turn_target' }],
      } as any,
      initiator.actor
    )
    const event = new ActiveEffectEvent(initiator, effect, instance)

    // Simulating no target chosen: Targets has [null]
    expect(event.Targets).toEqual([null])

    // Should not throw TypeError: Cannot read properties of null (reading 'ToJSON')
    expect(() => ActionSummary.fromActiveEffectEvent(event)).not.toThrow()
    const summaryData = ActionSummary.fromActiveEffectEvent(event)
    expect(summaryData.damageEvents.length).toBeGreaterThan(0)
    expect(summaryData.statusEvents.length).toBeGreaterThan(0)

    // Summary getter must succeed and be localized
    expect(() => event.Summary).not.toThrow()
    const summaryText = event.Summary
    expect(summaryText).toContain('Impacto')
    expect(summaryText).toContain('Dano Total: 1d6 Cinético')
    expect(summaryText).toMatch(/Impedido|Impaired/)
    expect(summaryText).toContain('próximo turno')
    expect(summaryText).not.toContain('Encounter')
    expect(summaryText).not.toContain('encontro')
  })

  it('correctly associates target when a valid target is set', () => {
    const effect = new ActiveEffect(
      {
        name: 'Impacto',
        damage: [{ type: 'Kinetic', val: '1d6' }],
      } as any,
      initiator.actor
    )
    const event = new ActiveEffectEvent(initiator, effect, instance)
    event.SetTarget(victim, 0)

    const summaryData = ActionSummary.fromActiveEffectEvent(event)
    expect(summaryData.damageEvents[0].CombatantName).toBe(victim.Label)

    const summaryText = event.Summary
    expect(summaryText).toContain(victim.Label)
    expect(summaryText).toContain('Cinético')
  })
})
