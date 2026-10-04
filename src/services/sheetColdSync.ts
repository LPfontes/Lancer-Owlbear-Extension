// src/services/sheetColdSync.ts
/**
 * Sincronização automática (padrão) das fichas do Hangar/roster com o catálogo da sala
 * (MongoDB Atlas). Camada 2 → 3, acionada por EVENTO DE FICHA, nunca por watcher de
 * atributo.
 *
 * Escopo: o piloto do Hangar (`StorageType: 'pilots'`) e o NPC do roster (`'npcs'`).
 * As fichas do MODO ATIVO ficam fora: `pilot_sheets`/`active_encounters` mudam a cada
 * PV/calor/ação, e o ator dentro delas é uma cópia desacoplada
 * (`Pilot.Deserialize(Pilot.Serialize(pilot))`). Por isso o gatilho de "salva" exige a
 * ficha CANÔNICA — o mesmo objeto que está em `PilotStore().Pilots` /
 * `NpcStore().Npcs`; salvar uma cópia de combate não vai para o catálogo.
 *
 * Gatilhos, todos de ficha:
 *  - importada/criada (sharecode, JSON ou editor) → `queueSheetColdUpsert`
 *  - salva (`SaveController._save`)              → `queueSheetColdSaveFromParent`
 *  - excluída em definitivo                      → `queueSheetColdDelete`
 *
 * Rajadas viram um único PUT: a fila é coalescida por ficha, com uma requisição em voo
 * por vez e um debounce curto. Sem isso o rate limit do backend (120 req/min por IP)
 * seria o gargalo de uma sessão de edição, e o requisito é "sincronizar sempre", não
 * "sincronizar a cada tecla".
 *
 * Conflito é last-write-wins (ver `pushSheetToCold` em roomColdStorage).
 *
 * O `roomColdStorage` é importado dinamicamente e as stores idem: `SaveController`
 * importa este módulo, e um import estático de volta fecharia um ciclo.
 */

import { toRaw } from 'vue'
import OBR from '@owlbear-rodeo/sdk'
import logger from '@/user/logger'
import type { SheetEntityType } from '@/io/apis/roomStorage'

/** Debounce do lote: uma rajada de gravações da mesma ficha vira um PUT. */
const DEBOUNCE_MS = 3000
/**
 * Teto de espera do lote. O debounce sozinho nunca converge quando as gravações não
 * param: o `SaveController` grava duas vezes por `save()` (leading + trailing do
 * throttle de 1,5 s), e cada gravação reinicia o timer. Com o teto, uma ficha em
 * edição contínua é enviada mesmo assim — no máximo a cada `MAX_WAIT_MS`.
 */
const MAX_WAIT_MS = 10000
/** Tentativas por ficha antes de desistir (o próximo save tenta de novo). */
const MAX_ATTEMPTS = 3
/** Espera entre tentativas; a última se repete nas seguintes. */
const RETRY_MS = [3000, 10000, 30000]
/** Espera quando não há rede — não consome tentativa. */
const OFFLINE_MS = 15000

export type SheetColdSyncState = 'pending' | 'syncing' | 'synced' | 'error'

export interface SheetColdSyncStatus {
  state: SheetColdSyncState
  at: number
  error?: string
}

interface QueueEntryBase {
  attempts: number
}

type QueueEntry =
  | (QueueEntryBase & { action: 'upsert'; type: SheetEntityType; sheet: any })
  | (QueueEntryBase & { action: 'delete' })

const queue = new Map<string, QueueEntry>()
const status = new Map<string, SheetColdSyncStatus>()

let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false
/** Quando o lote atual começou (âncora do teto de espera). */
let batchStartedAt = 0

/** `'pilots' → 'pilot'`, `'npcs' → 'npc'`; qualquer outra coleção fica fora. */
export function coldSheetTypeForStorageType(storageType?: string): SheetEntityType | null {
  if (storageType === 'pilots') return 'pilot'
  if (storageType === 'npcs') return 'npc'
  return null
}

function sheetIdOf(sheet: any): string {
  return String(sheet?.ID ?? sheet?.id ?? '')
}

/**
 * Gatilho de "salva". Chamado pelo `SaveController` a cada gravação; objetos que não
 * são ficha de catálogo (encontros, campanhas, pilot sheets) saem aqui mesmo.
 */
export function queueSheetColdSaveFromParent(parent: any): void {
  const type = coldSheetTypeForStorageType(parent?.StorageType)
  if (!type) return
  const id = sheetIdOf(parent)
  if (!id) return
  enqueue(id, { action: 'upsert', type, sheet: parent, attempts: 0 })
}

/** Gatilho de "importada/criada" (sharecode, JSON, clone, editor). */
export function queueSheetColdUpsert(sheet: any, type: SheetEntityType): void {
  const id = sheetIdOf(sheet)
  if (!id) return
  enqueue(id, { action: 'upsert', type, sheet, attempts: 0 })
}

/** Gatilho de "excluída em definitivo" — cancela um upsert pendente da mesma ficha. */
export function queueSheetColdDelete(sheetId: string): void {
  const id = String(sheetId ?? '')
  if (!id) return
  enqueue(id, { action: 'delete', attempts: 0 })
}

function enqueue(id: string, entry: QueueEntry): void {
  // A fila é um mapa por ficha: a última ação vence e a rajada inteira vira uma
  // requisição. Um `delete` pendente cancela o `upsert` (e vice-versa).
  if (!batchStartedAt) batchStartedAt = Date.now()
  queue.set(id, entry)
  status.set(id, { state: 'pending', at: Date.now() })
  schedule()
}

function schedule(delay: number = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer)

  // O teto de espera é medido a partir do início do lote, então o adiamento causado
  // por gravações novas não empurra o envio indefinidamente.
  const elapsed = batchStartedAt ? Date.now() - batchStartedAt : 0
  const effective = Math.max(0, Math.min(delay, MAX_WAIT_MS - elapsed))

  timer = setTimeout(() => {
    timer = null
    void flushSheetColdSync()
  }, effective)
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/**
 * Fora da sala não existe catálogo: o cold storage é particionado por `room.id`.
 * A fila é descartada (não faz sentido acumular fichas para empurrar numa sala
 * futura) — o próximo evento de ficha dentro da sala sincroniza normalmente.
 */
function currentRoomId(): string | null {
  try {
    if (!OBR.isAvailable) return null
    const id = OBR.room?.id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

/** Verdadeiro se `sheet` é o objeto canônico do Hangar/roster (não uma cópia). */
async function isCanonicalSheet(sheet: any, type: SheetEntityType): Promise<boolean> {
  const id = sheetIdOf(sheet)
  if (!id) return false
  try {
    // As stores ficam atrás de proxies reativos do Pinia: `toRaw` dos dois lados é o
    // que torna a comparação de identidade confiável.
    const list: any[] =
      type === 'pilot'
        ? toRaw((await import('@/features/pilot_management/store')).PilotStore().Pilots)
        : toRaw((await import('@/features/gm/store/npc_store')).NpcStore().Npcs)

    const found = (list as any[]).find(x => sheetIdOf(x) === id)
    return !!found && toRaw(found) === toRaw(sheet)
  } catch {
    return false
  }
}

/**
 * Esvazia a fila. Uma requisição por vez, na ordem de chegada; falha reenfileira com
 * backoff até `MAX_ATTEMPTS` e então apenas registra o erro (o próximo save da ficha
 * tenta de novo).
 */
export async function flushSheetColdSync(): Promise<void> {
  clearTimer()
  if (flushing) return

  if (!currentRoomId()) {
    if (queue.size) logger.debug('[ColdSync] Sem sala Owlbear ativa: fichas não vão para o catálogo.')
    queue.clear()
    batchStartedAt = 0
    return
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (queue.size) schedule(OFFLINE_MS)
    return
  }

  flushing = true
  const { pushSheetToCold, purgeSheetFromCold } = await import('./roomColdStorage')

  try {
    for (const [id, entry] of Array.from(queue.entries())) {
      queue.delete(id)
      status.set(id, { state: 'syncing', at: Date.now() })

      try {
        if (entry.action === 'delete') {
          await purgeSheetFromCold(id)
        } else {
          if (!(await isCanonicalSheet(entry.sheet, entry.type))) {
            // Cópia de combate / objeto fora do Hangar: não é ficha de catálogo.
            status.delete(id)
            continue
          }
          await pushSheetToCold(entry.sheet, entry.type)
        }
        status.set(id, { state: 'synced', at: Date.now() })
      } catch (err) {
        const attempts = entry.attempts + 1
        const message = err instanceof Error ? err.message : String(err)
        if (attempts < MAX_ATTEMPTS) {
          // Só reenfileira se nada mais novo chegou para esta ficha enquanto isso.
          if (!queue.has(id)) queue.set(id, { ...entry, attempts })
          status.set(id, { state: 'pending', at: Date.now() })
          schedule(RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)])
        } else {
          status.set(id, { state: 'error', at: Date.now(), error: message })
          logger.warn(
            `[ColdSync] Não foi possível sincronizar a ficha ${id} com o catálogo da sala: ${message}`,
            { sheetId: id, entityType: entry.action === 'upsert' ? entry.type : undefined, attempts }
          )
        }
      }
    }
  } finally {
    flushing = false
  }

  if (queue.size) schedule(0)
  else batchStartedAt = 0
}

/** Estado da última sincronização desta ficha (para a UI do gerenciador). */
export function getSheetColdSyncStatus(sheetId: string): SheetColdSyncStatus | undefined {
  return status.get(String(sheetId ?? ''))
}

export function hasPendingSheetColdSync(): boolean {
  return queue.size > 0
}

/** Zera fila, estados e timer (troca de sala, logout e testes). */
export function resetSheetColdSyncState(): void {
  clearTimer()
  queue.clear()
  status.clear()
  batchStartedAt = 0
}
