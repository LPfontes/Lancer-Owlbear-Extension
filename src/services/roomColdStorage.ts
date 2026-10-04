// src/services/roomColdStorage.ts
// Orquestra a transição entre o estado ativo (Owlbear) e o cold storage (MongoDB Atlas).
// NUNCA é chamado por watchers de atributo/rolagem — apenas por ações explícitas do usuário.

import OBR from '@owlbear-rodeo/sdk'
import { toRaw } from 'vue'
import {
  getRoomSheet,
  saveRoomSheet,
  deleteRoomSheet,
  ColdConflictError,
  type SheetEntityType,
  type ColdSheetDoc,
} from '@/io/apis/roomStorage'
import { obrBridge } from './obrBridge'
import { SetItem } from '@/io/Storage'

const sanitize = (v: unknown) => JSON.parse(JSON.stringify(v))

// Guarda de re-entrada (mesmo padrão isSavingToRemote/isSyncingFromRemote do obrBridge).
let busy = false

// Cache das revisions conhecidas (populado ao listar/carregar), para concorrência otimista.
const knownRevisions = new Map<string, number>()

function rememberRevision(sheetId: string, revision?: number) {
  if (typeof revision === 'number') knownRevisions.set(sheetId, revision)
}

function roomId(): string {
  const id = OBR.room?.id
  if (!id) throw new Error('Sala Owlbear não disponível.')
  return id
}

/**
 * ENVIAR: estado ativo → MongoDB.
 * Não altera o Owlbear. Usa expectedRevision quando conhecida; em conflito (409) pergunta.
 */
export async function exportSheetToCold(
  sheet: any,
  type: SheetEntityType,
  onConflict?: (remote: ColdSheetDoc) => Promise<boolean>
): Promise<void> {
  if (busy) return
  busy = true
  try {
    const raw = toRaw(sheet)
    const id = raw.ID ?? raw.id
    if (!id) throw new Error('Ficha sem ID.')

    const payload = typeof raw.Serialize === 'function' ? raw.Serialize() : raw
    const expectedRevision = knownRevisions.get(id)

    const doc = {
      roomId: roomId(),
      sheetId: id,
      entityType: type,
      name: raw.Name || raw.name || raw.Callsign || raw.callsign || 'Ficha',
      callsign: raw.Callsign || raw.callsign || null,
      meta: {
        authorId: OBR.player?.id ?? '',
        lastModified: raw.SaveController?.LastModified ?? Date.now(),
        source: 'table' as const,
      },
      payload: sanitize(payload),
      ...(expectedRevision != null ? { expectedRevision } : {}),
    }

    try {
      const saved = await saveRoomSheet(doc)
      rememberRevision(id, saved.revision)
      await OBR.notification.show(`"${saved.name}" salvo no catálogo da sala.`)
    } catch (e) {
      if (e instanceof ColdConflictError && onConflict) {
        const overwrite = await onConflict(e.current as ColdSheetDoc)
        if (overwrite) {
          const forced = await saveRoomSheet({ ...doc, expectedRevision: undefined })
          rememberRevision(id, forced.revision)
          await OBR.notification.show(`"${forced.name}" sobrescrito no catálogo.`)
        }
      } else {
        throw e
      }
    }
  } finally {
    busy = false
  }
}

/**
 * CARREGAR: MongoDB → estado ativo do Owlbear.
 * Deserializa, grava no store local (IndexedDB) e instancia na sala (roster+cena+broadcast).
 */
export async function importSheetFromCold(sheetId: string, type: SheetEntityType): Promise<void> {
  if (busy) return
  busy = true
  try {
    const doc = await getRoomSheet(roomId(), sheetId)
    rememberRevision(doc.sheetId, doc.revision)
    const data = { ...(doc.payload ?? {}), id: doc.sheetId }

    if (type === 'pilot') {
      const { Pilot } = await import('@/classes/pilot/Pilot')
      const { PilotStore } = await import('@/features/pilot_management/store')
      const pilot = Pilot.Deserialize(data)
      const store = PilotStore()
      const idx = store.Pilots.findIndex((p: any) => (p.ID || p.id) === doc.sheetId)
      if (idx === -1) store.Pilots.push(pilot)
      else store.Pilots.splice(idx, 1, pilot)
      await SetItem('pilots', sanitize(data))
      await obrBridge.savePilotToRoom(pilot, true)
      await obrBridge.createTokenForSheet(pilot, 'pilot')
    } else {
      const { NpcStore } = await import('@/features/gm/store/npc_store')
      let npc: any = null
      if (data.npcType === 'unit') {
        const { Unit } = await import('@/classes/npc/unit/Unit')
        npc = Unit.Deserialize(data)
      } else if (data.npcType === 'doodad') {
        const { Doodad } = await import('@/classes/npc/doodad/Doodad')
        npc = Doodad.Deserialize(data)
      } else if (data.npcType === 'eidolon') {
        const { Eidolon } = await import('@/classes/npc/eidolon/Eidolon')
        npc = Eidolon.Deserialize(data)
      }
      if (!npc) throw new Error('Tipo de NPC não reconhecido.')

      const store = NpcStore()
      const idx = store.Npcs.findIndex((n: any) => (n.ID || n.id) === doc.sheetId)
      if (idx === -1) store.Npcs.push(npc)
      else store.Npcs.splice(idx, 1, npc)
      await SetItem('npcs', sanitize(data))
      await obrBridge.saveNpcToRoom(npc, true)
      await obrBridge.createTokenForSheet(npc, 'npc')
    }

    await OBR.notification.show(`"${doc.name}" carregado para a mesa.`)
  } finally {
    busy = false
  }
}

/**
 * APAGAR: remove do MongoDB.
 * NÃO remove da mesa Owlbear — isso é removePilotFromRoom/removeNpcFromRoom.
 */
export async function deleteSheetFromCold(sheetId: string): Promise<void> {
  if (busy) return
  busy = true
  try {
    await deleteRoomSheet(roomId(), sheetId)
    knownRevisions.delete(sheetId)
    await OBR.notification.show('Ficha removida do catálogo da sala.')
  } finally {
    busy = false
  }
}

/** Popula a cache de revisions a partir da listagem (use na UI antes de "Enviar"). */
export async function syncKnownRevisions(type?: SheetEntityType): Promise<void> {
  const { listRoomSheets } = await import('@/io/apis/roomStorage')
  const sheets = await listRoomSheets(roomId(), type)
  for (const s of sheets) rememberRevision(s.sheetId, s.revision)
}
