import { Encounter } from '@/classes/encounter/Encounter'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { EncounterStore } from '@/stores'
import { Pilot } from '@/classes/pilot/Pilot'
import { Placeholder } from '@/classes/encounter/Placeholder'

export interface LoadEncounterOptions {
  pilots?: Pilot[]
  placeholders?: Placeholder[]
  navigate?: boolean
}

export interface LoadEncounterResult {
  instance: EncounterInstance
  encounter: Encounter
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
  instance.Combatants.forEach(c => {
    c.actor.CombatController.ResetForEncounter()
    c.actor.CombatController.StartEncounter()
  })
  instance.RecordEncounterStart()

  await EncounterStore().AddEncounterInstance(instance)
  await EncounterStore().SetActiveEncounter(instance.ID)

  if (navigate) {
    const { default: router } = await import('@/router')
    router.push('gm-encounter-runner')
  }

  return { instance, encounter }
}

export async function loadEncounterFromFile(file: File): Promise<LoadEncounterResult> {
  const text = await file.text()
  return loadEncounterFromJsonOrSharecode(text)
}