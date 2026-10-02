import { describe, it, expect, beforeEach } from 'vitest'
import { makePilot } from '@/__tests__/factories'
import { ContentPackStore, CompendiumStore } from '@/features/compendium/store'
import { Frame } from '../frame/Frame'
import { Mech } from '../../Mech'
import { MechLoadout } from './MechLoadout'
import { Talent } from '@/classes/pilot/components/talent/Talent'
import PilotTalent from '@/classes/pilot/components/talent/PilotTalent'
import type { Pilot } from '@/classes/pilot/Pilot'
import type { IFrameData } from '../frame/Frame'
import type { IMechLoadoutData } from './MechLoadout'

/**
 * Regression coverage for the Caliban's CORE-integrated HHS-075 "Flayer"
 * Shotgun (a Long Rim LCP weapon granted by `core_system.integrated`).
 *
 * A saved pilot always embeds the full weapon data for its integrated mounts,
 * so the sheet must keep showing them even when the granting content pack is
 * not installed on this device - exactly like it already does for the frame
 * (`frameData`), equippable weapons and systems.
 */

const FLAYER_DATA = {
  id: 'mw_caliban_integrated',
  name: 'HHS-075 "Flayer" Shotgun',
  mount: 'Main',
  type: 'CQB',
  profiles: [
    {
      name: 'Standard',
      range: [
        { type: 'Range', val: 3 },
        { type: 'Threat', val: 3 },
      ],
      damage: [{ type: 'Kinetic', val: '1d6+1' }],
      tags: [
        { id: 'tg_inaccurate' },
        { id: 'tg_knockback', val: 2 },
      ],
    },
  ],
  license_id: '',
}

const calibanFrameData = () =>
  ({
    id: 'mf_caliban',
    source: 'IPS-N',
    name: 'Caliban',
    mechtype: ['Striker', 'Controller'],
    license: 'Caliban',
    license_level: 2,
    license_id: 'mf_caliban',
    mounts: ['Heavy'],
    stats: {
      size: 0.5,
      structure: 4,
      stress: 4,
      armor: 2,
      hp: 6,
      evasion: 8,
      edef: 8,
      heatcap: 5,
      repcap: 5,
      sensor_range: 3,
      tech_attack: -2,
      save: 11,
      speed: 3,
      sp: 5,
    },
    traits: [],
    core_system: {
      name: 'Flayer Shotgun',
      description: 'Integrated HHS-075.',
      active_name: 'Equip Autochoke',
      active_effect: 'Gain the autochoke profile.',
      activation: 'Protocol',
      integrated: ['mw_caliban_integrated'],
      tags: [],
    },
  }) as unknown as IFrameData

const emptyMount = (mount_type: string, size: string) => ({
  mount_type,
  lock: false,
  slots: [{ size, weapon: null }],
  extra: [],
  bonus_effects: [],
})

const savedLoadout = () =>
  ({
    id: 'fe9ae8a9-db68-475a-b099-9003a2c21eeb',
    name: 'Primary',
    systems: [],
    integratedSystems: [],
    mounts: [emptyMount('Heavy', 'Heavy')],
    integratedMounts: [
      {
        weapon: {
          id: 'mw_caliban_integrated',
          instanceId: '0b19e936-a651-4f30-844e-e23712c5312a',
          data: structuredClone(FLAYER_DATA),
          note: '',
          flavorName: '',
          flavorDescription: '',
          selectedProfile: 0,
          maxUseOverride: 0,
          maxUses: 0,
          currentUses: 0,
          destroyed: false,
          isUsed: false,
        },
      },
    ],
    improved_armament: { ...emptyMount('Flex', 'Flex'), extra: [{ size: 'Auxiliary', weapon: null }] },
    integratedWeapon: emptyMount('Aux', 'Auxiliary'),
    superheavy_mounting: emptyMount('Superheavy', 'Superheavy'),
  }) as unknown as IMechLoadoutData

const longRimPack = () =>
  ({
    ID: 'long-rim',
    Name: 'Lancer Long Rim Data',
    Version: '2.0.2',
    Active: true,
    Data: {},
    Serialize: () => ({}),
    MechWeapons: [{ ...structuredClone(FLAYER_DATA), ID: 'mw_caliban_integrated' }],
  }) as any

let pilot: Pilot

beforeEach(() => {
  ContentPackStore().ContentPacks = []
  pilot = makePilot({ level: 3 })
})

describe('integrated mounts from a saved loadout', () => {
  it('keeps an embedded integrated weapon when its content pack is not installed', () => {
    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    const loadout = MechLoadout.Deserialize(savedLoadout(), mech)

    expect(loadout.IntegratedMounts.map(m => m.ID)).toEqual(['mw_caliban_integrated'])
    expect(loadout.IntegratedMounts[0].Weapons.map(w => w.ID)).toEqual(['mw_caliban_integrated'])
  })

  it('still exposes the integrated weapon to the sheet mount list', () => {
    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    mech.MechLoadoutController.ActiveLoadout = MechLoadout.Deserialize(savedLoadout(), mech)

    const mounted = mech.MechLoadoutController.ActiveLoadout.IntegratedMounts

    expect(mounted).toHaveLength(1)
    expect(mounted[0].Name).toBe('Integrated Mount')
    expect(mech.ActiveMounts.map(m => m.Type)).toContain('Integrated')
  })

  it('keeps the embedded integrated weapon when the pack is installed', () => {
    ContentPackStore().ContentPacks = [longRimPack()]

    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    const loadout = MechLoadout.Deserialize(savedLoadout(), mech)

    expect(loadout.IntegratedMounts.map(m => m.ID)).toEqual(['mw_caliban_integrated'])
  })

  it('drops an integrated weapon when the granting source is gone but the weapon is known', () => {
    // The weapon resolves from the compendium, but no feature grants it any more:
    // stale entries must still be cleaned up.
    ContentPackStore().ContentPacks = [longRimPack()]

    const frameData = calibanFrameData() as any
    frameData.core_system.integrated = []
    const mech = new Mech(new Frame(frameData), pilot)
    const loadout = MechLoadout.Deserialize(savedLoadout(), mech)

    expect(loadout.IntegratedMounts).toHaveLength(0)
  })

  it('keeps embedded integrations when the loadout is saved again', () => {
    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    const loadout = MechLoadout.Deserialize(savedLoadout(), mech)

    // every save re-runs the integration pass
    loadout.SetAllIntegrated()
    loadout.SetAllIntegrated()

    expect(loadout.IntegratedMounts.map(m => m.ID)).toEqual(['mw_caliban_integrated'])
    expect(MechLoadout.Serialize(loadout).integratedMounts.map(x => x.weapon.id)).toEqual([
      'mw_caliban_integrated',
    ])
  })
})

describe('integrated systems from a saved loadout', () => {
  const ammoCase = () => {
    const data = savedLoadout() as any
    data.integratedSystems = [
      {
        id: 'ms_walking_armory_2',
        instanceId: '085589bd-0c36-474d-9b53-3daaadba4fd5',
        data: {
          id: 'ms_walking_armory_2',
          name: 'Ammo Case II',
          type: 'System',
          sp: 0,
          talent_item: true,
          tags: [
            { id: 'tg_limited', val: 6 },
            { id: 'tg_turn', val: 1 },
          ],
          effect: 'Expend charges to modify Main ranged attacks.',
        },
        note: '',
        maxUses: 6,
        currentUses: 3,
        destroyed: false,
        isUsed: false,
      },
    ]
    return data as IMechLoadoutData
  }

  it('keeps an integrated system granted by a talent rank, with its saved uses', () => {
    const talent = CompendiumStore().referenceByID('Talents', 't_walking_armory') as Talent
    pilot.TalentsController.Talents = [new PilotTalent(talent, 2)]

    expect(pilot.FeatureController.IntegratedIDs).toContain('ms_walking_armory_2')

    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    const loadout = MechLoadout.Deserialize(ammoCase(), mech)

    expect(loadout.IntegratedSystems.map(s => s.ID)).toEqual(['ms_walking_armory_2'])
    expect(loadout.IntegratedSystems[0].Uses).toBe(3)
  })

  it('keeps an embedded integrated system when its content pack is not installed', () => {
    const frameData = calibanFrameData() as any
    frameData.core_system.integrated = ['mw_caliban_integrated', 'ms_longrim_autoloader']
    const mech = new Mech(new Frame(frameData), pilot)

    const data = savedLoadout() as any
    data.integratedSystems = [
      {
        id: 'ms_longrim_autoloader',
        instanceId: 'sys-long-rim-1',
        data: {
          id: 'ms_longrim_autoloader',
          name: 'Autoloader',
          type: 'System',
          sp: 3,
          tags: [],
          effect: 'Reload as a quick action.',
        },
        note: '',
        maxUses: 0,
        currentUses: 0,
        destroyed: false,
        isUsed: false,
      },
    ]

    const loadout = MechLoadout.Deserialize(data as IMechLoadoutData, mech)

    expect(loadout.IntegratedSystems.map(s => s.ID)).toEqual(['ms_longrim_autoloader'])
    expect(loadout.IntegratedMounts.map(m => m.ID)).toEqual(['mw_caliban_integrated'])
  })

  it('drops an integrated system that no feature grants any more', () => {
    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    const loadout = MechLoadout.Deserialize(ammoCase(), mech)

    expect(loadout.IntegratedSystems).toHaveLength(0)
  })

  it('survives a legacy integrated system entry with no embedded data', () => {
    // v2 exports store integrations as a bare id; when the pack is gone there is
    // nothing to rebuild them from, and the rest of the loadout must still load.
    const data = savedLoadout() as any
    data.integratedSystems = [{ id: 'ms_from_a_pack_that_is_gone', instanceId: 'x' }]

    const mech = new Mech(new Frame(calibanFrameData()), pilot)
    const loadout = MechLoadout.Deserialize(data as IMechLoadoutData, mech)

    expect(loadout.IntegratedSystems).toHaveLength(0)
    expect(loadout.IntegratedMounts.map(m => m.ID)).toEqual(['mw_caliban_integrated'])
    expect(loadout.EquippableMounts).toHaveLength(1)
  })
})
