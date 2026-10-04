import { i18n } from '@/i18n'
import { rollDamageRows } from '@/util/diceRoll'
import { useTableActionStore } from '@/stores/tableActionStore'
import type { ActiveEffectLike } from '@/classes/components/feature/active_effects/ActiveEffect'
import type { CombatantData } from '@/classes/encounter/Encounter'

type FormulaRow = { label: string; type?: string; formula: string }

/**
 * Envia a informação de um efeito/ação para o chat da mesa — sem alvo e sem o
 * passo de estágio do card.
 *
 * Regra de rolagem: `rollDamageRows` (dados 3D primeiro, local só sem serviço).
 * Formato do botão "Rolar" do HUD de dano: uma entrada `damage` com o total
 * somado, a quebra de cada rolagem e a caixa de dados (`roll`). Sem nenhuma
 * fórmula, posta o `summary` como mensagem de chat.
 */
export async function broadcastEffectToChat(
  effect: ActiveEffectLike | undefined,
  options: { summary?: string; owner?: CombatantData } = {}
): Promise<void> {
  if (!effect) return

  const { summary, owner } = options
  const store = useTableActionStore()
  const t = i18n.global.t
  const actorName =
    (owner?.actor as any)?.CombatController?.CombatName ||
    (owner?.actor as any)?.Name ||
    (owner as any)?.Name ||
    'Piloto'

  const rows: FormulaRow[] = []

  const pushRow = (label: string, rawFormula: unknown, type?: string) => {
    const formula = String(rawFormula ?? '').trim()
    if (formula) rows.push({ label, type, formula })
  }

  const damages: any[] = (effect as any).Damage || []
  damages.forEach(d =>
    pushRow(t('ui.combat.damage'), d?.TieredDamage?.(1) ?? d?.Value, String(d.Type))
  )

  const bonus: any = (effect as any).BonusDamage
  if (bonus) pushRow(t('ui.combat.bonusDamage'), bonus.Value)

  // Sem rolagem: só anuncia a informação do efeito/ação.
  if (!rows.length) {
    void store.postAction({
      senderName: actorName,
      category: 'chat',
      title: effect.Name,
      detail: summary || undefined,
    })
    return
  }

  const rolled = await rollDamageRows(rows, {
    label: `${t('ui.combat.damage')}: ${effect.Name}`,
  })

  const total = rolled.reduce((acc, r) => acc + r.total, 0)
  const formula = rolled.map(r => r.formula).join(' + ')
  const detail = [
    summary,
    ...rolled.map((r, i) => {
      const row = rows[i]
      return `<b>${row.label}${row.type ? ` [${row.type}]` : ''}</b>: ${r.breakdown} (${r.formula})`
    }),
  ]
    .filter(Boolean)
    .join('\n')

  void store.postAction({
    senderName: actorName,
    category: 'damage',
    title: `${t('ui.combat.damage')}: ${effect.Name}`,
    detail,
    roll: { total, formula, isCrit: false },
    tags: rows.map(r => r.type).filter(Boolean) as string[],
  })
}
