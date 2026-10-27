/**
 * Versão agregada do estado de combate — base do autosave do Modo Ativo.
 * PV, calor, ações, condições e efeitos ficam espalhados em vários
 * `CombatController`s: o do ator, o do mech ativo, o de cada camada de eidolon e
 * o de cada deployable. As telas editam TODOS eles (o painel de mech mexe no
 * `mech.CombatController`, o de piloto no `pilot.CombatController`), então olhar
 * apenas `actor.CombatController.CombatLogVersion` deixava justamente as
 * alterações de mech — PV, calor e ações — fora do autosave e fora do delta
 * enviado ao mestre.
 *
 * A versão é um inteiro determinístico calculado a partir de propriedades
 * reativas: o watcher que consome o sinal só dispara quando algo muda de fato, e
 * a leitura registra a dependência de cada campo observado.
 */

import { activeMechIndex } from '@/services/sheetSyncPaths'
import { equipmentDestroyedRefs } from '@/services/sheetEquipmentPaths'

function mix(acc: number, value: number): number {
  return (Math.imul(acc, 31) + (value | 0)) | 0
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = mix(hash, value.charCodeAt(i))
  return hash
}

function controllerVersion(controller: any): number {
  const version = controller?.CombatLogVersion
  return typeof version === 'number' ? version : 0
}

/**
 * Versão de combate de um combatente: ator + mech ativo + camadas de eidolon +
 * deployables + metadados do combatente (ordem, lado, status, reforço).
 */
export function combatantCombatVersion(combatant: any): number {
  const actor = combatant?.actor
  if (!actor) return 0

  let version = mix(1, controllerVersion(actor.CombatController))

  // Deployables têm PV/ativações próprios e são editados no painel do dono.
  if (Array.isArray(combatant.deployables)) {
    for (const deployable of combatant.deployables) {
      version = mix(version, controllerVersion(deployable?.CombatController))
    }
  }

  if (Array.isArray(actor.Layers)) {
    // O eidolon só expõe a camada ATIVA em `actor.CombatController`; as demais
    // camadas têm PV próprio, e trocar de camada também é estado de combate.
    version = mix(version, Number(actor.ActiveLayerIndex ?? 0) + 1)
    for (const layer of actor.Layers) {
      version = mix(version, controllerVersion(layer?.CombatController))
    }
  }

  const mech = actor.ActiveMech
  if (mech) {
    version = mix(version, controllerVersion(mech.CombatController))
    version = mix(version, mix(mech.CombatController?.CorePower ? 0 : 1, mech.CombatController?.CoreActive ? 2 : 0))
    // Armas/sistemas destruídos são campos simples (`Destroyed`), sem versão própria:
    // sem entrar no sinal, perder uma arma não disparava autosave nem o delta da mesa.
    for (const ref of equipmentDestroyedRefs(actor, activeMechIndex(actor))) {
      version = mix(version, ref.item.Destroyed ? 1 : 0)
    }
  }

  // Metadados do combatente não passam por nenhum CombatController.
  version = mix(version, Number(combatant.index ?? 0) + 1)
  version = mix(version, hashString(String(combatant.side ?? '')))
  version = mix(version, hashString(String(combatant.status ?? '')))
  version = mix(version, hashString(String(combatant.pilotStatus ?? '')))
  version = mix(version, hashString(String(combatant.mechStatus ?? '')))
  version = mix(version, combatant.reinforcement ? 1 : 0)
  version = mix(version, Number(combatant.reinforcementTurn ?? 0))

  return version
}

/**
 * Versões de combate de todos os combatentes de um container (um
 * `EncounterInstance` ou uma `PilotSheet`, que expõe `Combatants`).
 */
export function containerCombatVersions(container: any): number[] {
  const combatants = container?.Combatants
  if (!Array.isArray(combatants)) return []
  return combatants.map(combatantCombatVersion)
}
