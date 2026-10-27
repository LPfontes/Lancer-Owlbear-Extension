import { describe, it, expect, beforeEach } from 'vitest'
import { ActiveEffect } from './ActiveEffect'
import { MechWeapon } from '@/classes/mech/components/equipment/MechWeapon'
import { LocalizationStore } from '@/stores/localization'

describe('ActiveEffect localization', () => {
  beforeEach(() => {
    LocalizationStore().catalog = {}
  })

  it('localizes name, detail, and trigger using derived origin key when keyPrefixes is empty (deserialized)', () => {
    LocalizationStore().catalog = {
      'ms_rapid_maneuver_jets.active_effect_rapid_maneuver_jets.name': 'Jatos de Manobra Rápida',
      'ms_rapid_maneuver_jets.active_effect_rapid_maneuver_jets.detail':
        'Você voa, ganha Escudo Protetor 3 e ignora o engajamento...',
      'ms_rapid_maneuver_jets.active_effect_rapid_maneuver_jets.trigger': 'Quando você Impulsiona',
    }

    const rawData = {
      name: 'Rapid Maneuver Jets',
      detail: 'You fly, gain Overshield 3...',
      trigger: 'When you Boost',
    }
    const origin = {
      ID: 'ms_rapid_maneuver_jets',
      Name: 'Rapid Maneuver Jets',
      Type: 'System',
    }

    const ae = new ActiveEffect(rawData, origin)

    expect(ae.Name).toBe('Jatos de Manobra Rápida')
    expect(ae.Detail).toBe('Você voa, ganha Escudo Protetor 3 e ignora o engajamento...')
    expect(ae.Trigger).toBe('Quando você Impulsiona')
    expect(ae.getDetail()).toBe('Você voa, ganha Escudo Protetor 3 e ignora o engajamento...')
    expect(ae.getTrigger()).toBe('Quando você Impulsiona')
  })

  it('localizes passive effects using derived passive_effect key', () => {
    LocalizationStore().catalog = {
      'mf_kidd.core_system.passive_effect_jolly_roger.name': 'Jolly Roger',
      'mf_kidd.core_system.passive_effect_jolly_roger.detail': 'Seu DADO JOLLY ROGER incrementa...',
    }

    const rawData = {
      name: 'Jolly Roger',
      detail: 'Your JOLLY ROGER DIE increments...',
    }
    const origin = {
      _lkey: 'mf_kidd.core_system',
      Name: 'Jolly Roger',
    }

    const ae = new ActiveEffect(rawData, origin)

    expect(ae.Name).toBe('Jolly Roger')
    expect(ae.Detail).toBe('Seu DADO JOLLY ROGER incrementa...')
  })

  it('falls back to raw English values when no translation exists in catalog', () => {
    const rawData = {
      name: 'Custom Jet',
      detail: 'You fly fast.',
    }
    const origin = {
      ID: 'ms_custom_jet',
    }

    const ae = new ActiveEffect(rawData, origin)

    expect(ae.Name).toBe('Custom Jet')
    expect(ae.Detail).toBe('You fly fast.')
  })

  it('localizes weapon trigger effects using derived trigger key (on_attack, on_hit, etc.)', () => {
    LocalizationStore().catalog = {
      'mw_caliban_integrated.profile_standard.on_attack.detail':
        'Após qualquer ataque com esta arma, você pode golpear um personagem adjacente com a coronha, causando 1 de Dano Cinético e empurrando-o 1 espaço.',
    }

    const rawData = {
      name: 'On Attack Effect',
      detail:
        'After any attack with this weapon, you may smack an adjacent character with the butt end, dealing 1 Kinetic Damage and knocking them back 1 space.',
    }
    const origin = {
      ID: 'mw_caliban_integrated.profile_standard',
      Name: 'Padrão',
    }

    const ae = new ActiveEffect(rawData, origin)

    expect(ae.Detail).toBe(
      'Após qualquer ataque com esta arma, você pode golpear um personagem adjacente com a coronha, causando 1 de Dano Cinético e empurrando-o 1 espaço.'
    )
  })

  it('localizes weapon profiles and on_attack effect properly when deserialized', () => {
    LocalizationStore().catalog = {
      'mw_caliban_integrated.name': 'Espingarda EOP-075 “Devoradora”',
      'mw_caliban_integrated.profile_standard.name': 'Padrão',
      'mw_caliban_integrated.profile_standard.on_attack.detail':
        'Após qualquer ataque com esta arma, você pode golpear um personagem adjacente com a coronha, causando 1 de Dano Cinético e empurrando-o 1 espaço.',
      'mw_caliban_integrated.profile_autochoke_equipped.name': 'Estrangulador Automático Equipado',
      'mw_caliban_integrated.profile_autochoke_equipped.on_attack.detail':
        'Após qualquer ataque com esta arma, você pode golpear um personagem adjacente com a coronha, causando 1 de Dano Cinético e empurrando-o 1 espaço.',
    }

    const rawWeapon = {
      id: 'mw_caliban_integrated',
      name: 'EOP-075 “Devourer” Shotgun',
      mount: 'Main',
      type: 'CQB',
      profiles: [
        {
          name: 'Standard',
          on_attack:
            'After any attack with this weapon, you may smack an adjacent character with the butt end, dealing 1 Kinetic Damage and knocking them back 1 space.',
        },
        {
          name: 'Autochoke Equipped',
          on_attack:
            'After any attack with this weapon, you may smack an adjacent character with the butt end, dealing 1 Kinetic Damage and knocking them back 1 space.',
        },
      ],
    }

    const weapon = new MechWeapon(rawWeapon as any)

    expect(weapon.Profiles[0].Name).toBe('Padrão')
    expect(weapon.Profiles[0].OnAttack?.Detail).toBe(
      'Após qualquer ataque com esta arma, você pode golpear um personagem adjacente com a coronha, causando 1 de Dano Cinético e empurrando-o 1 espaço.'
    )
    expect(weapon.Profiles[1].Name).toBe('Estrangulador Automático Equipado')
    expect(weapon.Profiles[1].OnAttack?.Detail).toBe(
      'Após qualquer ataque com esta arma, você pode golpear um personagem adjacente com a coronha, causando 1 de Dano Cinético e empurrando-o 1 espaço.'
    )
  })
})
