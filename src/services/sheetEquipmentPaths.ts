/**
 * Caminhos do estado de EQUIPAMENTO (arma/sistema destruído) e do poder de núcleo no
 * JSON serializado do piloto, para o delta da mesa (`PATCH_FIELD`).
 *
 * Por que caminho posicional em vez de um campo com o ID do item: a sala guarda o JSON
 * da ficha e é dele que o `Pilot.Deserialize` reidrata a ficha (reload, GM, `INIT_SYNC`).
 * Patchear o nó real (`mechs.0.loadouts.0.systems.2.destroyed`) faz o estado voltar
 * sozinho na hidratação; um campo inventado (ex.: `equipment.<id>.destroyed`) seria
 * ignorado pelo `Deserialize` e se perderia — o mesmo problema que os stats tiveram
 * quando eram gravados na raiz do piloto.
 *
 * A gramática espelha `MechLoadout.Serialize` / `EquippableMount.Serialize` /
 * `IntegratedMount.Serialize` / `WeaponSlot.Serialize`:
 *
 *   mechs.<m>.loadouts.<l>.systems.<s>.destroyed
 *   mechs.<m>.loadouts.<l>.integratedSystems.<s>.destroyed
 *   mechs.<m>.loadouts.<l>.mounts.<mount>.slots.<slot>.weapon.destroyed
 *   mechs.<m>.loadouts.<l>.mounts.<mount>.extra.<slot>.weapon.destroyed
 *   mechs.<m>.loadouts.<l>.integratedMounts.<mount>.weapon.destroyed
 *   mechs.<m>.loadouts.<l>.improved_armament.slots.<slot>.weapon.destroyed
 *   mechs.<m>.loadouts.<l>.integratedWeapon.slots.<slot>.weapon.destroyed
 *   mechs.<m>.loadouts.<l>.superheavy_mounting.slots.<slot>.weapon.destroyed
 *   mechs.<m>.corePower / mechs.<m>.coreActive
 */

import { activeMechIndex } from './sheetSyncPaths'

export type EquipmentKind = 'weapon' | 'system'

export interface EquipmentRef {
  /** Instância runtime (`MechWeapon`/`MechSystem`). */
  item: any
  /** Caminho completo até o flag `.destroyed` no JSON serializado. */
  path: string
  kind: EquipmentKind
}

export type EquipmentPatchTarget =
  | 'equipmentDestroyed'
  | 'corePower'
  | 'coreActive'
  | 'other'

/** Classifica um campo de patch que não é stat/ações/status. */
export function equipmentPatchTarget(field: string): EquipmentPatchTarget {
  const parts = String(field ?? '').split('.')
  const tail = parts[parts.length - 1]

  if (tail === 'corePower') return 'corePower'
  if (tail === 'coreActive') return 'coreActive'
  if (tail === 'destroyed' && parts[0] === 'mechs') return 'equipmentDestroyed'
  return 'other'
}

/** Caminho do "poder de núcleo disponível" (`false` = já foi gasto). */
export function corePowerPath(mechIndex: number): string {
  return `mechs.${mechIndex}.corePower`
}

/** Caminho do "núcleo ativo" no mech. */
export function coreActivePath(mechIndex: number): string {
  return `mechs.${mechIndex}.coreActive`
}

interface LoadoutLocation {
  loadout: any
  index: number
}

/** Loadout ATIVA e seu índice no array serializado (`loadouts` preserva a ordem). */
export function activeLoadoutLocation(actor: any, mechIndex: number): LoadoutLocation | null {
  const controller = actor?.Mechs?.[mechIndex]?.MechLoadoutController
  const loadouts = controller?.Loadouts
  if (!Array.isArray(loadouts) || !loadouts.length) return null

  const active = controller?.ActiveLoadout
  const found = loadouts.findIndex(
    (l: any) => l === active || (l?.ID && active?.ID && l.ID === active.ID)
  )
  const index = found >= 0 ? found : 0

  return { loadout: loadouts[index], index }
}

/**
 * Todas as armas e sistemas da loadout ativa, com o caminho do flag `destroyed`.
 *
 * Só a loadout ATIVA: é a que está em jogo (a destruição acontece nela) e o índice dela
 * dentro de `loadouts` é estável entre as janelas, porque as duas serializam a mesma
 * lista na mesma ordem.
 */
export function equipmentDestroyedRefs(
  actor: any,
  mechIndex: number = activeMechIndex(actor)
): EquipmentRef[] {
  if (!Number.isFinite(mechIndex) || mechIndex < 0) return []

  const location = activeLoadoutLocation(actor, mechIndex)
  if (!location) return []

  const { loadout, index } = location
  const base = `mechs.${mechIndex}.loadouts.${index}`
  const refs: EquipmentRef[] = []

  const pushSystems = (systems: any, key: string) => {
    if (!Array.isArray(systems)) return
    systems.forEach((item: any, i: number) => {
      if (item) refs.push({ item, kind: 'system', path: `${base}.${key}.${i}.destroyed` })
    })
  }

  // `slots` e `extra` são os arrays que `EquippableMount.Serialize` grava — não use o
  // getter `Slots`, que para montagens Flex concatena `extra` e desloca os índices.
  const pushMount = (mount: any, key: string, mountIndex: number | null) => {
    if (!mount) return
    const prefix = mountIndex === null ? `${base}.${key}` : `${base}.${key}.${mountIndex}`

    for (const bag of ['slots', 'extra'] as const) {
      const slots = (mount as any)?.[bag]
      if (!Array.isArray(slots)) continue
      slots.forEach((slot: any, i: number) => {
        const weapon = slot?.Weapon
        if (weapon) {
          refs.push({ item: weapon, kind: 'weapon', path: `${prefix}.${bag}.${i}.weapon.destroyed` })
        }
      })
    }
  }

  pushSystems(loadout.Systems, 'systems')
  pushSystems(loadout.IntegratedSystems, 'integratedSystems')

  if (Array.isArray(loadout.EquippableMounts)) {
    loadout.EquippableMounts.forEach((mount: any, m: number) => pushMount(mount, 'mounts', m))
  }

  if (Array.isArray(loadout.IntegratedMounts)) {
    loadout.IntegratedMounts.forEach((mount: any, m: number) => {
      const weapon = mount?.Weapon
      if (weapon) {
        refs.push({
          item: weapon,
          kind: 'weapon',
          path: `${base}.integratedMounts.${m}.weapon.destroyed`,
        })
      }
    })
  }

  pushMount(loadout.ImprovedArmamentMount, 'improved_armament', null)
  pushMount(loadout.IntegratedWeaponMount, 'integratedWeapon', null)
  pushMount(loadout.SuperheavyMount, 'superheavy_mounting', null)

  return refs
}

function weaponFromSlotChain(mount: any, chain: string[], field: string): EquipmentRef | null {
  const [bag, index, leaf] = chain
  if ((bag !== 'slots' && bag !== 'extra') || leaf !== 'weapon') return null

  const weapon = (mount as any)?.[bag]?.[Number(index)]?.Weapon
  return weapon ? { item: weapon, kind: 'weapon', path: field } : null
}

/**
 * Resolve o item apontado por um caminho de equipamento da MESMA gramática acima.
 * Devolve `null` quando o caminho não é de equipamento ou o slot está vazio.
 */
export function resolveEquipmentByPath(actor: any, field: string): EquipmentRef | null {
  const parts = String(field ?? '').split('.')
  if (parts[0] !== 'mechs' || parts[2] !== 'loadouts') return null
  if (parts[parts.length - 1] !== 'destroyed') return null

  const mechIndex = Number(parts[1])
  const loadoutIndex = Number(parts[3])
  if (!Number.isFinite(mechIndex) || mechIndex < 0) return null

  const loadout = actor?.Mechs?.[mechIndex]?.MechLoadoutController?.Loadouts?.[loadoutIndex]
  if (!loadout) return null

  const rest = parts.slice(4, parts.length - 1)
  const [head, first] = rest

  if (head === 'systems' || head === 'integratedSystems') {
    const systems = head === 'systems' ? loadout.Systems : loadout.IntegratedSystems
    const item = systems?.[Number(first)]
    return item ? { item, kind: 'system', path: field } : null
  }

  if (head === 'integratedMounts') {
    const weapon = loadout.IntegratedMounts?.[Number(first)]?.Weapon
    return weapon ? { item: weapon, kind: 'weapon', path: field } : null
  }

  if (head === 'mounts') {
    // `rest` = ['mounts', <mount>, 'slots'|'extra', <slot>, 'weapon']
    return weaponFromSlotChain(loadout.EquippableMounts?.[Number(first)], rest.slice(2), field)
  }

  const singleMounts: Record<string, any> = {
    improved_armament: loadout.ImprovedArmamentMount,
    integratedWeapon: loadout.IntegratedWeaponMount,
    superheavy_mounting: loadout.SuperheavyMount,
  }
  if (head in singleMounts) {
    return weaponFromSlotChain(singleMounts[head], rest.slice(1), field)
  }

  return null
}
