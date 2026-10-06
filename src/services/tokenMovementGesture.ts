/**
 * Diff de posição dos tokens no mapa (plano §13.3) — **puro**.
 *
 * O SDK não tem gancho de "antes/depois do movimento": o único sinal é
 * `OBR.scene.items.onChange`, que entrega a **lista inteira** a cada mudança e
 * **sem diff**. A captura é, portanto, um diff nosso — e é esta parte que dá para
 * testar sem uma linha de OBR.
 *
 * Comparar `position` (e não o centro) é de propósito: o diff roda a cada `onChange`
 * e precisa ser barato, enquanto `getItemBounds` é uma ida ao SDK por token. O centro
 * só é buscado quando um gesto começa e quando ele assenta, que é quando a distância
 * importa (§13.3).
 */

export interface CanvasPoint {
  x: number
  y: number
}

/** Um item de token: o que precisamos do `Item` do SDK. */
interface TokenLike {
  id?: unknown
  layer?: unknown
  position?: unknown
}

function isPoint(value: unknown): value is CanvasPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as { x?: unknown; y?: unknown }
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

/**
 * Posição atual de cada token da cena, por id.
 *
 * Só itens de `layer === 'CHARACTER'` entram: os itens do painel são anexados
 * (ATTACHMENT/TEXT) e apareceriam como "movimento" se entrassem aqui — o desenho
 * realimentaria a captura.
 */
export function collectTokenPositions(items: unknown): Map<string, CanvasPoint> {
  const positions = new Map<string, CanvasPoint>()
  if (!Array.isArray(items)) return positions

  for (const raw of items) {
    const item = raw as TokenLike
    if (item?.layer !== 'CHARACTER') continue
    if (typeof item.id !== 'string' || !item.id) continue
    if (!isPoint(item.position)) continue
    positions.set(item.id, { x: item.position.x, y: item.position.y })
  }
  return positions
}

/**
 * Ids que mudaram de posição entre dois retratos.
 *
 * Token novo (sem retrato anterior) **não** conta: aparecer na cena não é
 * movimento — senão colocar um token custaria movimento do mecha.
 */
export function changedTokenIds(
  previous: Map<string, CanvasPoint>,
  next: Map<string, CanvasPoint>
): string[] {
  const changed: string[] = []
  for (const [id, position] of next) {
    const before = previous.get(id)
    if (!before) continue
    if (before.x !== position.x || before.y !== position.y) changed.push(id)
  }
  return changed
}

/** Ids que saíram da cena (o retrato não é mais válido para eles). */
export function removedTokenIds(
  previous: Map<string, CanvasPoint>,
  next: Map<string, CanvasPoint>
): string[] {
  const removed: string[] = []
  for (const id of previous.keys()) {
    if (!next.has(id)) removed.push(id)
  }
  return removed
}

/**
 * Tokens da cena que **têm vínculo de ficha** (`metadata[key]`).
 *
 * Arrastar um token sem vínculo não é movimento de ninguém: sem este filtro a captura
 * faria uma ida ao SDK por gesto para só então descobrir que não há motor para
 * debitar — e encheria o console de "sem alvo de movimento" quando o usuário arrasta
 * cenário.
 */
export function collectBoundTokenIds(items: unknown, metadataKey: string): Set<string> {
  const bound = new Set<string>()
  if (!Array.isArray(items)) return bound

  for (const raw of items) {
    const item = raw as { id?: unknown; layer?: unknown; metadata?: unknown }
    if (item?.layer !== 'CHARACTER') continue
    if (typeof item.id !== 'string' || !item.id) continue
    const metadata = item.metadata as Record<string, unknown> | undefined
    if (metadata && metadata[metadataKey] !== undefined) bound.add(item.id)
  }
  return bound
}

/** Distância em unidades de cena entre dois pontos (fallback do `getDistance`). */
export function euclideanDistance(from: CanvasPoint, to: CanvasPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.sqrt(dx * dx + dy * dy)
}
