import { describe, it, expect, beforeEach } from 'vitest'
import { makeMech, makePilot } from '@/__tests__/factories'
import { CompendiumStore } from '@/features/compendium/store'
import { Pilot } from '@/classes/pilot/Pilot'
import type { Mech } from '@/classes/mech/Mech'
import type { MechSystem } from '@/classes/mech/components/equipment/MechSystem'
import type { MechWeapon } from '@/classes/mech/components/equipment/MechWeapon'
import {
  coreActivePath,
  corePowerPath,
  equipmentDestroyedRefs,
  equipmentPatchTarget,
  resolveEquipmentByPath,
} from './sheetEquipmentPaths'

let mech: Mech

const instantiate = (collection: 'MechWeapons' | 'MechSystems') =>
  CompendiumStore().instantiate(
    collection,
    collection === 'MechWeapons'
      ? CompendiumStore().MechWeapons.find(w => !w.IsHidden)!.ID
      : CompendiumStore().MechSystems.find(s => !s.IsHidden)!.ID
  ) as MechWeapon | MechSystem

// `EquipWeapon`/`AddSystem` guardam uma CÓPIA do item: os helpers devolvem a instância
// que ficou na loadout, que é a que o delta observa.
const equipWeapon = (): MechWeapon => {
  const mount = mech.MechLoadoutController.ActiveLoadout.EquippableMounts.find(m => m.Slots.length)!
  mount.Slots[0].EquipWeapon(instantiate('MechWeapons') as MechWeapon, false)
  return mount.Slots[0].Weapon!
}

const addSystem = (): MechSystem => {
  const loadout = mech.MechLoadoutController.ActiveLoadout
  loadout.AddSystem(instantiate('MechSystems') as MechSystem)
  return loadout.Systems[loadout.Systems.length - 1]
}

beforeEach(() => {
  mech = makeMech(makePilot({ level: 3 }))
})

describe('equipmentPatchTarget', () => {
  it('reconhece equipamento destruído e poder de núcleo', () => {
    expect(equipmentPatchTarget('mechs.0.loadouts.0.systems.1.destroyed')).toBe('equipmentDestroyed')
    expect(equipmentPatchTarget('mechs.0.loadouts.0.mounts.2.slots.0.weapon.destroyed')).toBe(
      'equipmentDestroyed'
    )
    expect(equipmentPatchTarget('mechs.0.corePower')).toBe('corePower')
    expect(equipmentPatchTarget('mechs.0.coreActive')).toBe('coreActive')
  })

  it('não confunde stats, ações e status com equipamento', () => {
    expect(equipmentPatchTarget('mechs.0.stats.current.hp')).toBe('other')
    expect(equipmentPatchTarget('mechs.0.combatActions')).toBe('other')
    expect(equipmentPatchTarget('mechs.0.statuses')).toBe('other')
    expect(equipmentPatchTarget('destroyed')).toBe('other')
  })

  it('monta os caminhos do núcleo', () => {
    expect(corePowerPath(0)).toBe('mechs.0.corePower')
    expect(coreActivePath(0)).toBe('mechs.0.coreActive')
  })
})

describe('equipmentDestroyedRefs', () => {
  it('aponta cada sistema e arma da loadout ativa para o nó do JSON', () => {
    const system = addSystem()
    const weapon = equipWeapon()

    const refs = equipmentDestroyedRefs(mech.Pilot)
    const systemRef = refs.find(r => r.item === system)
    const weaponRef = refs.find(r => r.item === weapon)

    expect(systemRef?.path).toBe('mechs.0.loadouts.0.systems.0.destroyed')
    expect(weaponRef?.path).toBe('mechs.0.loadouts.0.mounts.0.slots.0.weapon.destroyed')
    expect(weaponRef?.kind).toBe('weapon')
    expect(systemRef?.kind).toBe('system')
  })

  it('resolve o nó do caminho de volta para a mesma instância', () => {
    const system = addSystem()
    const weapon = equipWeapon()

    const data: any = Pilot.Serialize(mech.Pilot)

    for (const ref of equipmentDestroyedRefs(mech.Pilot)) {
      // O caminho existe no JSON serializado do piloto?
      const node = ref.path
        .split('.')
        .reduce<any>((acc, key) => (acc === undefined || acc === null ? acc : acc[key]), data)
      expect(node, `nó ausente no JSON para ${ref.path}`).toBe(false)

      const resolved = resolveEquipmentByPath(mech.Pilot, ref.path)
      expect(resolved?.item).toBe(ref.item)
      expect(resolved?.kind).toBe(ref.kind)
    }

    expect(resolveEquipmentByPath(mech.Pilot, 'mechs.0.loadouts.0.systems.0.destroyed')?.item).toBe(
      system
    )
    expect(
      resolveEquipmentByPath(mech.Pilot, 'mechs.0.loadouts.0.mounts.0.slots.0.weapon.destroyed')?.item
    ).toBe(weapon)
  })

  it('não resolve caminho de outro mech, loadout inexistente ou slot vazio', () => {
    equipWeapon()
    expect(resolveEquipmentByPath(mech.Pilot, 'mechs.9.loadouts.0.systems.0.destroyed')).toBeNull()
    expect(resolveEquipmentByPath(mech.Pilot, 'mechs.0.loadouts.9.systems.0.destroyed')).toBeNull()
    expect(
      resolveEquipmentByPath(mech.Pilot, 'mechs.0.loadouts.0.mounts.0.slots.7.weapon.destroyed')
    ).toBeNull()
    expect(resolveEquipmentByPath(mech.Pilot, 'mechs.0.corePower')).toBeNull()
    expect(resolveEquipmentByPath(mech.Pilot, 'stats.current.hp')).toBeNull()
  })

  it('reflete o flag destruído marcado em runtime', () => {
    const system = addSystem()
    system.Destroyed = true

    const ref = equipmentDestroyedRefs(mech.Pilot).find(r => r.item === system)!
    expect(ref.item.Destroyed).toBe(true)
  })
})
