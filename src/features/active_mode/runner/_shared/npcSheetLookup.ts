/**
 * Localização da ficha de um NPC a partir do id que outra janela enviou.
 *
 * Cada janela (iframe) tem o seu próprio Pinia: nada do estado em memória de uma
 * chega à outra. O que cruza é o IndexedDB compartilhado (`active_encounters`,
 * `npcs`) e o id mandado pelo pedido de abrir ficha. Esse id pode ser:
 *
 *  - o item do roster (`actor.OriginId`) — NPCs adicionados à iniciativa a partir
 *    do roster local;
 *  - o id do ator (`actor.ID`) — NPCs de encontros importados por sharecode/JSON,
 *    cujo `originId` aponta para o roster de OUTRA máquina;
 *  - o id do combatente (`combatant.id`, um UUID da instância na iniciativa).
 *
 * Comparar só com o `OriginId` e só no encontro "atual" era o que deixava a janela
 * da ficha presa em "Carregando instância do encontro…" para sempre: o
 * `current_active_encounter_id` é gravado por outra janela e pode chegar depois
 * desta montar, e um NPC pode estar em qualquer um dos encontros ativos.
 */

const NPC_TYPES = ['unit', 'doodad', 'eidolon']

/**
 * O combatente é um NPC (unit, doodad ou eidolon)?
 *
 * Aceita tanto o objeto VIVO (`type`) quanto o registro SERIALIZADO, que é como o
 * encontro chega do IndexedDB (`actor.npcType`).
 */
export function isNpcCombatant(combatant: any): boolean {
  return NPC_TYPES.includes(combatant?.type ?? combatant?.actor?.npcType ?? combatant?.npc?.npcType)
}

/**
 * Ids pelos quais este combatente pode ser pedido.
 *
 * Dados vivos usam `OriginId`/`ID` (classes do app); dados serializados usam
 * `originId`/`id` (registro gravado). Os dois formatos chegam aqui: o encontro
 * recém-criado na outra janela e o registro relido do IndexedDB.
 */
export function combatantSheetIds(combatant: any): string[] {
  const actor = combatant?.actor ?? combatant?.npc
  return [actor?.OriginId, actor?.originId, actor?.ID, actor?.id, combatant?.id].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
}

/** O combatente corresponde ao id pedido por qualquer um dos vínculos possíveis? */
export function combatantMatchesSheetId(combatant: any, sheetId: string): boolean {
  const id = String(sheetId || '')
  if (!id || !isNpcCombatant(combatant)) return false
  return combatantSheetIds(combatant).includes(id)
}

/** Combatente que representa o NPC pedido dentro de um encontro (ou `null`). */
export function findNpcCombatant(encounter: any, sheetId: string): any | null {
  const combatants = encounter?.Combatants
  if (!Array.isArray(combatants)) return null
  return combatants.find((c: any) => combatantMatchesSheetId(c, sheetId)) ?? null
}

/**
 * Encontro ativo que contém o NPC pedido.
 *
 * Varre TODOS os encontros informados, com o `preferredId` (o
 * `current_active_encounter_id` desta janela) na frente: se ele ainda não chegou,
 * o NPC continua sendo encontrado no encontro que de fato o contém.
 */
export function findEncounterForNpc(
  encounters: any[],
  sheetId: string,
  preferredId = ''
): any | null {
  const id = String(sheetId || '')
  if (!id) return null

  const list = (encounters || []).filter(Boolean)
  const preferred = preferredId
    ? list.find((e: any) => e?.ID === preferredId || e?.id === preferredId || e?._id === preferredId)
    : undefined
  const ordered = preferred ? [preferred, ...list.filter((e: any) => e !== preferred)] : list

  for (const encounter of ordered) {
    if (findNpcCombatant(encounter, id)) return encounter
  }
  return null
}
