// src/services/roomColdStorage.ts
// Orquestra a transição entre o estado ativo (Owlbear) e o cold storage (MongoDB Atlas).
//
// Duas portas de entrada:
//  - AÇÕES EXPLÍCITAS do usuário (botões do Gerenciador de Fichas da Mesa):
//    `exportSheetToCold`, `importSheetFromCold`, `deleteSheetFromCold` — notificam no
//    Owlbear e usam concorrência otimista (`expectedRevision`).
//  - SINCRONIZAÇÃO AUTOMÁTICA (padrão): `pushSheetToCold` / `purgeSheetFromCold`,
//    chamadas apenas pelo `sheetColdSync` — silenciosas e last-write-wins.
//
// Nenhuma delas é chamada por watcher de atributo: o gatilho é sempre um evento de
// ficha (importada, salva, excluída), coalescido pelo `sheetColdSync`.

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

// As operações de cold storage são SERIALIZADAS: uma por vez, na ordem de chegada.
// Antes havia um `busy` que simplesmente descartava a chamada concorrente — com a
// sincronização automática ligada isso perderia gravações legítimas (um save
// automático chegando enquanto o usuário usa o botão "Enviar", por exemplo).
let coldChain: Promise<unknown> = Promise.resolve()

function withColdLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = coldChain.then(operation, operation)
  coldChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

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

/** Ficha do estado ativo → documento do catálogo (payload já serializado). */
function buildSheetDoc(
  sheet: any,
  type: SheetEntityType
): { id: string; doc: Omit<ColdSheetDoc, 'revision' | 'updatedAt'> } {
  const raw = toRaw(sheet)
  const id = raw.ID ?? raw.id
  if (!id) throw new Error('Ficha sem ID.')

  const payload = typeof raw.Serialize === 'function' ? raw.Serialize() : raw

  return {
    id,
    doc: {
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
    },
  }
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
  return withColdLock(async () => {
    const { id, doc } = buildSheetDoc(sheet, type)
    const expectedRevision = knownRevisions.get(id)

    try {
      const saved = await saveRoomSheet({
        ...doc,
        ...(expectedRevision != null ? { expectedRevision } : {}),
      })
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
        return
      }
      throw e
    }
  })
}

/**
 * SINCRONIZAÇÃO AUTOMÁTICA — upsert silencioso dos eventos de ficha.
 *
 * Last-write-wins: NÃO envia `expectedRevision`, e o servidor só responde 409 quando
 * ela vem (ver api/rooms/[roomId]/sheets/[sheetId].js) — a versão local sempre vence.
 * Tampouco notifica: isto roda a cada gravação de ficha, e um aviso por gravação
 * seria ruído puro.
 */
export async function pushSheetToCold(sheet: any, type: SheetEntityType): Promise<void> {
  return withColdLock(async () => {
    const { id, doc } = buildSheetDoc(sheet, type)
    const saved = await saveRoomSheet(doc)
    rememberRevision(id, saved.revision)
  })
}

/** SINCRONIZAÇÃO AUTOMÁTICA — remove do catálogo, sem notificação. */
export async function purgeSheetFromCold(sheetId: string): Promise<void> {
  return withColdLock(async () => {
    try {
      await deleteRoomSheet(roomId(), sheetId)
    } finally {
      knownRevisions.delete(sheetId)
    }
  })
}

/**
 * CARREGAR: MongoDB → estado ativo do Owlbear.
 * Deserializa, grava no store local (IndexedDB) e instancia na sala (roster+cena+broadcast).
 *
 * Escreve por `SetItem`/push direto no store, nunca por `AddPilot`/`AddNpc` nem pelo
 * `SaveController`: por construção, o ato de carregar NÃO dispara a sincronização
 * automática de volta.
 */
export async function importSheetFromCold(sheetId: string, type: SheetEntityType): Promise<void> {
  return withColdLock(async () => {
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
  })
}

/**
 * APAGAR: remove do MongoDB.
 * NÃO remove da mesa Owlbear — isso é removePilotFromRoom/removeNpcFromRoom.
 */
export async function deleteSheetFromCold(sheetId: string): Promise<void> {
  return withColdLock(async () => {
    await deleteRoomSheet(roomId(), sheetId)
    knownRevisions.delete(sheetId)
    await OBR.notification.show('Ficha removida do catálogo da sala.')
  })
}

/** Popula a cache de revisions a partir da listagem (use na UI antes de "Enviar"). */
export async function syncKnownRevisions(type?: SheetEntityType): Promise<void> {
  const { listRoomSheets } = await import('@/io/apis/roomStorage')
  const sheets = await listRoomSheets(roomId(), type)
  for (const s of sheets) rememberRevision(s.sheetId, s.revision)
}
