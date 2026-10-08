import { describe, it, expect, beforeEach } from 'vitest'
import { CoreSystem } from './CoreSystem'
import { ActivationType } from '@/classes/enums'
import { LocalizationStore } from '@/stores/localization'

describe('CoreSystem', () => {
  beforeEach(() => {
    LocalizationStore().catalog = {}
  })

  const mockCoreData = {
    name: 'Devorador',
    description: 'Devorador frame core system',
    active_name: 'Auto-Choke',
    active_effect:
      'The Flayer shotgun comes pre-equipped with a muzzle-mounted auto-choke that allows its user to better define the spread of shot issuing from the weapon.',
    activation: ActivationType.Protocol,
    tags: [],
  }

  it('initializes Actions with ActivateAction and not undefined', () => {
    const cs = new CoreSystem(mockCoreData as any, 'mf_caliban')
    expect(cs.ActivateAction).toBeDefined()
    expect(cs.Actions[0]).toBe(cs.ActivateAction)
    expect(cs.Actions).not.toContain(undefined)
  })

  it('delegates ActivateAction.Detail and getDetail to ActiveEffect', () => {
    const cs = new CoreSystem(mockCoreData as any, 'mf_caliban')

    // Before catalog has translation: falls back to raw active_effect
    expect(cs.ActivateAction.Detail).toBe(mockCoreData.active_effect)
    expect(cs.ActivateAction.getDetail()).toBe(mockCoreData.active_effect)

    // When translation is present in localization store:
    const ptTranslation =
      'A espingarda Devoradora vem pré-equipada com um estrangulador automático montado na boca...'
    LocalizationStore().catalog = {
      'mf_caliban.core_system.active_effect': ptTranslation,
      'mf_caliban.core_system.active_name': 'Estrangulador Automático',
    }

    expect(cs.ActiveEffect).toBe(ptTranslation)
    expect(cs.ActivateAction.Detail).toBe(ptTranslation)
    expect(cs.ActivateAction.getDetail()).toBe(ptTranslation)
    expect(cs.ActivateAction.Terse).toBe('Estrangulador Automático')
  })
})
