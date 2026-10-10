import { Encounter } from '@/classes/encounter/Encounter'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { EncounterStore, NpcStore } from '@/stores'
import { Pilot } from '@/classes/pilot/Pilot'
import { Placeholder } from '@/classes/encounter/Placeholder'
import { Unit } from '@/classes/npc/unit/Unit'
import { Doodad } from '@/classes/npc/doodad/Doodad'
import { Eidolon } from '@/classes/npc/eidolon/Eidolon'

export interface LoadEncounterOptions {
  pilots?: Pilot[]
  placeholders?: Placeholder[]
  navigate?: boolean
}

export interface LoadEncounterResult {
  instance: EncounterInstance
  encounter: Encounter
  /** Quantos NPCs do arquivo foram materializados no roster local. */
  importedNpcs: number
}

/** Deserializador por `npcType` do arquivo. */
const NPC_DESERIALIZERS: Record<string, (data: any) => any> = {
  unit: Unit.Deserialize,
  doodad: Doodad.Deserialize,
  eidolon: Eidolon.Deserialize,
}

/**
 * Materializa no roster local os NPCs que vieram no encontro importado.
 *
 * Um encontro exportado carrega NPCs como INSTÂNCIAS do roster de quem exportou
 * (`is_instance: true` e `originId` = id do roster do autor). Sem esta etapa o NPC
 * não existe em lugar nenhum desta máquina:
 *
 *  - `NpcStore().getNpcByID(originId)` falha, então a janela da ficha só consegue
 *    resolver o NPC lendo o registro do encontro em `active_encounters`;
 *  - o token do NPC nunca é criado e o NPC não é publicado/sincronizado na mesa;
 *  - a ficha não pode ser reaberta depois que o encontro sai da iniciativa.
 *
 * O item do roster é gravado com o MESMO id que o encontro usa em `originId`, para
 * que todo vínculo que já aponta para ele (combatentes, fichas, tokens) continue
 * resolvendo pelo caminho normal. O estado de combate do arquivo fica no encontro:
 * o item do roster entra com os stats correntes zerados.
 */
export async function materializeEncounterNpcs(data: any): Promise<number> {
  const combatants = Array.isArray(data?.combatants) ? data.combatants : []
  if (!combatants.length) return 0

  const store = NpcStore()
  // Sem o roster carregado, `getNpcByID` não enxerga um NPC que já existe e a
  // gravação sobrescreveria a ficha local com a versão do arquivo.
  if (!store.Npcs.length) await store.LoadNpcs().catch(() => {})

  let imported = 0

  for (const combatant of combatants) {
    const raw = combatant?.actor ?? combatant?.npc
    if (!raw) continue

    const npcType = String(raw.npcType ?? combatant?.type ?? '').toLowerCase()
    const deserialize = NPC_DESERIALIZERS[npcType]
    if (!deserialize) continue

    const originId = String(raw.originId || raw.OriginId || '')
    const actorId = String(raw.id || raw.ID || '')
    const rosterId = originId || actorId
    // Já existe um NPC local com esse id: é o mesmo NPC (re-importação) e a ficha
    // local é a autoridade — não sobrescrevemos.
    if (!rosterId || store.getNpcByID(rosterId)) continue

    try {
      const npc = deserialize({
        ...raw,
        id: rosterId,
        is_instance: false,
        instance: false,
        instanceId: '',
        originId: '',
      })
      npc.CombatController?.ResetForEncounter?.()
      npc.CombatController?.StatController?.resetCurrentStats?.()
      await store.AddNpc(npc)
      imported++
    } catch (err) {
      console.warn(`[encounterLoader] NPC "${rosterId}" do encontro não pôde ser importado:`, err)
    }
  }

  if (imported) {
    console.log(`[encounterLoader] ${imported} NPC(s) do encontro importado(s) para o roster local.`)
  }
  return imported
}

async function fetchFromShareCode(code: string): Promise<any> {
  const cleanCode = code.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (!cleanCode) throw new Error('ShareCode não informado.')

  const response = await fetch(`/api/share/${encodeURIComponent(cleanCode)}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `Falha ao buscar ShareCode: ${response.status}`)
  }
  const data = await response.json()
  if (!data || (!data.itemType && !data.id && !data.ID && !data.name)) {
    throw new Error('Dados inválidos retornados pelo ShareCode.')
  }
  return data
}

function parseJsonInput(input: string): any {
  try { return JSON.parse(input) }
  catch (err) { throw new Error(`JSON inválido: ${err instanceof Error ? err.message : 'Erro desconhecido'}`) }
}

function validateEncounterData(data: any): void {
  if (!data) throw new Error('Dados do encontro vazios.')
  if (data.itemType !== 'Encounter' && !data.id && !data.ID) {
    throw new Error('Dados não parecem ser um encontro válido (itemType !== "Encounter").')
  }
}

export async function loadEncounterFromJsonOrSharecode(
  input: string,
  options: LoadEncounterOptions = {}
): Promise<LoadEncounterResult> {
  const { pilots = [], placeholders = [], navigate = false } = options

  let data: any
  const trimmedInput = input.trim()
  const isLikelyShareCode = /^[A-Z0-9]{8,}$/i.test(trimmedInput) && !trimmedInput.startsWith('{')

  if (isLikelyShareCode) data = await fetchFromShareCode(trimmedInput)
  else data = parseJsonInput(trimmedInput)

  validateEncounterData(data)

  const encounter = Encounter.Deserialize(data)
  encounter.save()

  const instance = new EncounterInstance(undefined, encounter, pilots, placeholders)
  instance.IsActive = true
  instance.Combatants.forEach(c => {
    // Um combatente de tipo conhecido mas com dados incompletos não pode derrubar a
    // importação inteira: sem o controller, seguimos com o ator que veio do arquivo.
    c.actor?.CombatController?.ResetForEncounter?.()
    c.actor?.CombatController?.StartEncounter?.()
  })
  instance.RecordEncounterStart()

  await EncounterStore().AddEncounterInstance(instance)
  await EncounterStore().SetActiveEncounter(instance.ID)

  // Antes de qualquer coisa depender do encontro: os NPCs do arquivo passam a
  // existir no roster local (ver `materializeEncounterNpcs`).
  const importedNpcs = await materializeEncounterNpcs(data)

  if (navigate) {
    const { default: router } = await import('@/router')
    router.push('/table-chat?tab=tracker')
  }

  return { instance, encounter, importedNpcs }
}

export async function loadEncounterFromFile(file: File): Promise<LoadEncounterResult> {
  const text = await file.text()
  return loadEncounterFromJsonOrSharecode(text)
}