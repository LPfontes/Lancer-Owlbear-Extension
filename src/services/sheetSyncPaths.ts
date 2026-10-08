/**
 * Caminhos e chaves dos campos sincronizados da ficha via WebSocket.
 *
 * O estado de combate que o runner edita vive no **mech** do JSON serializado do
 * piloto (`Pilot.Serialize` → `mechs[i].stats.current.*`, `mechs[i].combatActions`,
 * `mechs[i].statuses`), não na raiz do piloto (`stats.*` é o estado do piloto a pé).
 *
 * Patchear a raiz gravava os PV/calor/estrutura do mecha no nó do piloto: quem
 * reidratava a ficha a partir da sala (reload, `INIT_SYNC`, GM) voltava com os
 * valores do momento do join, porque o nó do mecha nunca era atualizado.
 */

/** Campo `stats.current.<stat>` do mech — ex.: `mechs.0.stats.current.hp`. */
export function mechStatsPath(mechIndex: number, stat: string): string {
  return `mechs.${mechIndex}.stats.current.${stat}`
}

/**
 * Campo `stats.current.<stat>` do PRÓPRIO ator (piloto desmontado/NPC sem mecha).
 *
 * O piloto tem ficha própria: o dano nele não passa pelo mecha e por isso o caminho não
 * leva `mechs.<i>.` — `CombatController.Serialize` grava os stats do ator na raiz.
 */
export function pilotStatsPath(stat: string): string {
  return `stats.current.${stat}`
}

/**
 * O caminho é de um stat (HP, calor, overshield, estrutura, estresse, burn)?
 *
 * Usado como allowlist de `PATCH_FIELD` na janela somente-leitura: ela conduz o combate
 * (aplica dano pelo tracker), mas não pode virar um editor de ficha arbitrário.
 */
export function isDamagePatchPath(field: string): boolean {
  const path = String(field ?? '')
  if (!path) return false
  return /^(mechs\.\d+\.)?stats\.current\.[a-z_]+$/i.test(path)
}

/** Ações de combate do mech — `mechs.0.combatActions`. */
export function mechCombatActionsPath(mechIndex: number): string {
  return `mechs.${mechIndex}.combatActions`
}

/** Condições/status do mech — `mechs.0.statuses`. */
export function mechStatusesPath(mechIndex: number): string {
  return `mechs.${mechIndex}.statuses`
}

/**
 * Índice do mech ativo dentro de `pilot.Mechs`.
 *
 * `Pilot.ActiveMech` é sempre `Mechs[0]` (o setter move o mech escolhido para a
 * frente), e a serialização preserva a ordem — então o caminho do patch aponta para
 * o mesmo mech do outro lado.
 */
export function activeMechIndex(pilot: any): number {
  const mechs = pilot?.Mechs
  const active = pilot?.ActiveMech
  if (!Array.isArray(mechs) || !active) return -1
  return mechs.findIndex((m: any) => m === active || (m?.ID && m.ID === active?.ID))
}

export type SheetPatchTarget = 'combatActions' | 'statuses' | 'stat'

/** Último segmento do caminho: o nome do campo no JSON (`mechs.0.stats.current.hp` → `hp`). */
export function patchFieldKey(field: string): string {
  const parts = String(field ?? '').split('.')
  return parts[parts.length - 1] ?? ''
}

/**
 * Classifica um `PATCH_FIELD` recebido sem depender de o caminho ser absoluto ou
 * relativo — assim o mesmo campo funciona como `statuses` ou `mechs.0.statuses`.
 */
export function patchFieldTarget(field: string): SheetPatchTarget {
  const key = patchFieldKey(field)
  if (key === 'combatActions') return 'combatActions'
  if (key === 'statuses') return 'statuses'
  return 'stat'
}

/**
 * Reaplica no piloto o estado corrente que veio serializado da sala.
 *
 * O `SetStats()` (chamado na hidratação para recalcular os máximos a partir do
 * conteúdo) termina em `resetCurrentStats()`: PV/calor/estrutura/estresse/sobreescudo
 * voltariam ao máximo e o calor para 0 — exatamente o "estado perdido" depois de um
 * reload. Rode isto **depois** do `SetStats()` para devolver o que a sala tinha.
 */
export function applySerializedCurrentStats(pilot: any, data: any): void {
  const applyTo = (statController: any, current: any): void => {
    if (!statController || !current || typeof current !== 'object') return
    for (const [key, value] of Object.entries(current)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      statController.setCurrentStat?.(key, value, { silent: true })
    }
  }

  applyTo(pilot?.CombatController?.StatController, data?.stats?.current)

  const mechs = Array.isArray(pilot?.Mechs) ? pilot.Mechs : []
  const mechData = Array.isArray(data?.mechs) ? data.mechs : []
  mechs.forEach((mech: any, index: number) => {
    applyTo(mech?.CombatController?.StatController, mechData[index]?.stats?.current)
  })
}
