import { i18n } from '@/i18n'
import { ActiveEffectEvent } from './ActiveEffectEvent'
import { translateDamageType } from './_activeEffectUtils'

type ActionSummaryData = {
  initiatorName: string
  initiatorType: string
  initiatorID: string
  effectName: string
  activation?: string
  damageEvents: any[]
  statusEvents: any[]
  otherEvents: any[]
  specialEvents: any[]
  resistEvents: any[]
}

class ActionSummary {
  private data: ActionSummaryData

  constructor(data: ActionSummaryData) {
    this.data = { ...data }
  }

  public Summarize(actorId: string): string {
    const d = (this.data as any).data || this.data

    if (d.initiatorID === actorId) return this.initiatorSummary(d)
    else return this.targetSummary(d)
  }

  private initiatorSummary(data: ActionSummaryData): string {
    const t = i18n?.global?.t?.bind(i18n.global)
    let str = data.effectName
    if (data.activation) {
      const asAction = t ? t('ui.combat.asAction', { action: data.activation }) : `as a ${data.activation} Action`
      str += ` ${asAction}`
    }
    const out = [`${str}:`]

    // if target is self name should be 'self'
    out.push(...this.summarizeDamageEvents(data.damageEvents, 'initiator'))
    out.push(...this.summarizeEvents(data.statusEvents, 'initiator'))
    out.push(...this.summarizeEvents(data.specialEvents, 'initiator'))
    out.push(...this.summarizeEvents(data.resistEvents, 'initiator'))
    out.push(...this.summarizeOtherEvents(data.otherEvents, 'initiator'))

    return out.join('\n')
  }

  private targetSummary(data: ActionSummaryData): string {
    const t = i18n?.global?.t?.bind(i18n.global)
    const targetedBy = t
      ? t('ui.combat.targetedBy', { initiator: data.initiatorName, effect: data.effectName })
      : `Targeted by ${data.initiatorName}'s ${data.effectName}:`
    const out = [targetedBy]

    out.push(...this.summarizeDamageEvents(data.damageEvents, 'target'))
    out.push(...this.summarizeEvents(data.statusEvents, 'target'))
    out.push(...this.summarizeEvents(data.specialEvents, 'target'))
    out.push(...this.summarizeEvents(data.resistEvents, 'target'))
    out.push(...this.summarizeOtherEvents(data.otherEvents, 'target'))

    return out.join('\n')
  }

  private summarizeDamageEvents(events: any[], perspective: 'initiator' | 'target'): string[] {
    if (!events || events.length === 0) return []
    const t = i18n?.global?.t?.bind(i18n.global)
    const te = i18n?.global?.te?.bind(i18n.global)

    return events.flatMap(e => {
      const hasAttack = e.AttackRolledValue !== undefined
      const hasDamage =
        (e.HitResult !== 'miss' && e.FinalDamageValue > 0) ||
        e.DamageRolledValue !== undefined ||
        Boolean(e.DamageRollString)
      if (!hasAttack && !hasDamage) return []

      let str = ''
      const hitKey = e.HitResult ? `ui.combat.${String(e.HitResult).toLowerCase()}` : ''
      const hitResultText = hitKey && te && te(hitKey) ? t!(hitKey).toUpperCase() : (e.HitResult || '').toUpperCase()

      if (perspective === 'initiator') {
        if (hasAttack) {
          const target = e.CombatantName ? `[${e.CombatantName}] ` : ''
          str += `${target}${e.AttackRolledValue} vs ${e.TargetDefenseValue} ${e.TargetDefense || ''} : ${hitResultText}`
        }
      } else {
        if (hasAttack) {
          const incomingPrefix = t ? t('ui.combat.incomingAttack') : 'Incoming'
          str += `${incomingPrefix} ${e.AttackRolledValue} vs ${e.TargetDefenseValue} ${e.TargetDefense || ''} : ${hitResultText}`
        }
      }
      if (hasDamage) {
        const prefix = str ? ' - ' : perspective === 'initiator' && e.CombatantName ? `[${e.CombatantName}] ` : ''
        const dmgVal = e.FinalDamageValue ?? e.DamageRolledValue ?? e.DamageRollString
        const dmgType = translateDamageType(e.DamageType)
        const totalDamageLabel = t ? t('ui.combat.totalDamage') : 'Total Damage'
        const apLabel = t ? t('ui.combat.ap') : 'AP'
        const irreducLabel = t ? t('ui.combat.irreducible') : 'Irreducible'
        const reliableLabel = t ? t('ui.combat.reliable') : 'Reliable'

        const apStr = e.AP ? ` (${apLabel})` : ''
        const irreducStr = e.Irreducible ? ` (${irreducLabel})` : ''
        const reliableStr =
          e.FinalDamageValue && e.FinalDamageValue === e.Reliable
            ? ` (${reliableLabel} ${e.Reliable})`
            : ''

        str += `${prefix}${totalDamageLabel}: ${dmgVal}${dmgType ? ` ${dmgType}` : ''}${apStr}${irreducStr}${reliableStr}`
      }
      return [str]
    })
  }

  private summarizeEvents(events: any[], perspective: 'initiator' | 'target'): string[] {
    if (!events || events.length === 0) return []
    const t = i18n?.global?.t?.bind(i18n.global)
    const untilWord = t ? t('ui.combat.until').toLowerCase() : 'until'
    const appliedWord = t ? t('ui.combat.applied') : 'Applied'
    const gainedWord = t ? t('ui.combat.gained') : 'Gained'
    const failedSaveWord = t ? t('ui.combat.failedSave') : 'Failed Save'
    const successfulSaveWord = t ? t('ui.combat.successfulSave') : 'Successful Save'

    return events.map(e => {
      const eventName = e.StatusName || `${e.ResistType || ''} ${e.Resist || ''}`.trim()
      let str = ''
      const target = e.CombatantName ? `[${e.CombatantName}] ` : ''
      const durationPart = e.Duration ? ` ${untilWord} ${e.Duration}` : ''

      if (perspective === 'initiator') {
        str = target
        if (e.SaveRolledValue) {
          if (e.SaveResult === 'failed') {
            str += `${failedSaveWord} (${e.SaveRolledValue} vs ${e.SaveTarget}) → ${appliedWord} ${eventName}${durationPart}`
          } else {
            str += `${successfulSaveWord} (${e.SaveRolledValue} vs ${e.SaveTarget})`
          }
        } else {
          str += `${appliedWord} ${eventName}${durationPart}`
        }
      } else {
        if (e.SaveRolledValue) {
          if (e.SaveResult === 'failed') {
            str += `${failedSaveWord} (${e.SaveRolledValue} vs ${e.SaveTarget}) → ${gainedWord} ${eventName}${durationPart}`
          } else {
            str += `${successfulSaveWord} (${e.SaveRolledValue} vs ${e.SaveTarget})`
          }
        } else {
          str += `${gainedWord} ${eventName}${durationPart}`
        }
      }

      return str
    })
  }

  private summarizeOtherEvents(events: any[], perspective: 'initiator' | 'target'): string[] {
    if (!events || events.length === 0) return []
    const t = i18n?.global?.t?.bind(i18n.global)
    const appliedEffect = t ? t('ui.combat.appliedEffect') : 'Applied Effect'
    const gainedEffect = t ? t('ui.combat.gainedEffect') : 'Gained Effect'

    return events.map(e => {
      let str = ''
      const target = e.CombatantName ? `[${e.CombatantName}] ` : ''
      if (perspective === 'initiator') {
        str += `${target}${appliedEffect} ${e.Type} ${e.Value}`
      } else {
        str += `${gainedEffect} ${e.Type} ${e.Value}`
      }
      return str
    })
  }

  public static fromActiveEffectEvent(event: ActiveEffectEvent): ActionSummaryData {
    const initiator = event.Initiator.actor.CombatController.RootActor
    return {
      initiatorName: event.Initiator.Label,
      initiatorType: initiator.ItemType,
      initiatorID: initiator.ID,
      effectName: event.Effect.Name,
      activation: (event.Effect as any).Activation,
      damageEvents: this.processSubEventArray(event.DamageEvents, event.Targets),
      statusEvents: this.processSubEventArray(event.StatusEvents, event.Targets),
      otherEvents: this.processSubEventArray(event.OtherEvents, event.Targets),
      specialEvents: this.processSubEventArray(event.SpecialEvents, event.Targets),
      resistEvents: this.processSubEventArray(event.ResistEvents, event.Targets),
    }
  }

  private static processSubEventArray(se: any[], targets: any[]): any[] {
    if (!se || !Array.isArray(se)) return []
    const validTargets = (targets || []).filter(t => t != null)

    return se
      .map(s => {
        const sJson = s && typeof s.ToJSON === 'function' ? s.ToJSON() : (s || {})
        if (validTargets.length === 0) {
          return [sJson]
        }
        return validTargets.map(t => {
          const tJson = t && typeof t.ToJSON === 'function' ? t.ToJSON() : (t || {})
          return { ...sJson, ...tJson }
        })
      })
      .flat()
  }
}

export { ActionSummary }
export type { ActionSummaryData }
