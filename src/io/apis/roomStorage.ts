// src/io/apis/roomStorage.ts
// Client HTTP fino para o cold storage (MongoDB Atlas via Vercel Functions).
// A URI do Mongo NUNCA aparece aqui. Sem token: o backend expõe apenas um CRUD
// estreito sobre a coleção "room_sheets" (ver server/coldStorage.mjs).

export type SheetEntityType = 'pilot' | 'npc'

export interface ColdSheetMeta {
  authorId: string
  lastModified: number
  source: 'table' | 'catalog' | 'manual'
  tags?: string[]
}

export interface ColdSheetSummary {
  roomId: string
  sheetId: string
  entityType: SheetEntityType
  name: string
  callsign?: string | null
  meta: ColdSheetMeta
  revision: number
  updatedAt: string
}

export interface ColdSheetDoc extends ColdSheetSummary {
  payload: any
}

/** Base do backend. Default relativo (/api) porque a extensão é servida da própria Vercel. */
const BASE = ((import.meta as any).env?.VITE_COLD_STORAGE_URL as string | undefined) || ''

export class ColdConflictError extends Error {
  public current?: ColdSheetDoc
  constructor(current?: ColdSheetDoc) {
    super('conflito')
    this.name = 'ColdConflictError'
    this.current = current
  }
}

async function roomFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (res.status === 409) {
    const body = await res.json().catch(() => null)
    throw new ColdConflictError(body?.current)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `room storage ${res.status}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Resposta inválida do servidor: esperado JSON, recebido "${contentType || 'desconhecido'}". Verifique se o servidor backend está ativo.`
    )
  }
  return res
}

export async function listRoomSheets(roomId: string, type?: SheetEntityType): Promise<ColdSheetSummary[]> {
  const q = type ? `?type=${type}` : ''
  const res = await roomFetch(`/api/rooms/${encodeURIComponent(roomId)}/sheets${q}`)
  return res.json()
}

export async function getRoomSheet(roomId: string, sheetId: string): Promise<ColdSheetDoc> {
  const res = await roomFetch(
    `/api/rooms/${encodeURIComponent(roomId)}/sheets/${encodeURIComponent(sheetId)}`
  )
  return res.json()
}

export async function saveRoomSheet(
  doc: Omit<ColdSheetDoc, 'revision' | 'updatedAt'> & { expectedRevision?: number }
): Promise<ColdSheetDoc> {
  const res = await roomFetch(
    `/api/rooms/${encodeURIComponent(doc.roomId)}/sheets/${encodeURIComponent(doc.sheetId)}`,
    { method: 'PUT', body: JSON.stringify(doc) }
  )
  return res.json()
}

export async function deleteRoomSheet(roomId: string, sheetId: string): Promise<void> {
  await roomFetch(`/api/rooms/${encodeURIComponent(roomId)}/sheets/${encodeURIComponent(sheetId)}`, {
    method: 'DELETE',
  })
}
