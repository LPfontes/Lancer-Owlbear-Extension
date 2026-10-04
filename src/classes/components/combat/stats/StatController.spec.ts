import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, watchEffect, nextTick } from 'vue'
import { makePilot, makeMech } from '@/__tests__/factories'
import type { Mech } from '@/classes/mech/Mech'
import type { Pilot } from '@/classes/pilot/Pilot'
import { StatKey } from './Stats'

let pilot: Pilot
let mech: Mech

beforeEach(() => {
  pilot = makePilot({ level: 3 })
  mech = makeMech(pilot)
})

describe('CurrentStats', () => {
  it('routes a write through setCurrentStat and stays observable', async () => {
    const raw = mech.StatController
    const spy = vi.spyOn(raw, 'setCurrentStat')
    const sc = reactive(raw) as any

    const seen: number[] = []
    watchEffect(() => {
      seen.push(sc.CurrentStats[StatKey.SPEED])
    })

    const next = sc.CurrentStats[StatKey.SPEED] - 2
    sc.CurrentStats[StatKey.SPEED] = next
    await nextTick()

    expect(spy).toHaveBeenCalledWith(StatKey.SPEED, next)
    expect(raw.getCurrent(StatKey.SPEED)).toBe(next)
    expect(seen.at(-1)).toBe(next)
  })

  it('records the movement a manual speed tick spends', () => {
    const sc = reactive(mech.StatController) as any
    const before = sc.CurrentStats[StatKey.SPEED]
    sc.CurrentStats[StatKey.SPEED] = before - 3

    const moves = mech.CombatController.CombatLog.Events.filter((e: any) => e.kind === 'move')
    expect((moves.at(-1)?.payload as any).spent).toBe(3)
  })

  it('enqueues a structure check when a pip is ticked off by hand', () => {
    const sc = reactive(mech.StatController) as any
    sc.CurrentStats[StatKey.STRUCTURE] = sc.CurrentStats[StatKey.STRUCTURE] - 1

    expect(mech.CombatController.PendingCheckController.PendingChecks.length).toBe(1)
  })
})

describe('MaxStats', () => {
  it('routes a write through setMax, bumps the combat version and stays observable', async () => {
    const sc = reactive(mech.StatController) as any
    const spy = vi.spyOn(mech.StatController, 'setMax')
    const versionBefore = mech.CombatController.CombatLogVersion

    const seen: number[] = []
    watchEffect(() => {
      seen.push(sc.MaxStats[StatKey.HP])
    })

    const next = (sc.MaxStats[StatKey.HP] as number) + 3
    sc.MaxStats[StatKey.HP] = next
    await nextTick()

    expect(spy).toHaveBeenCalledWith(StatKey.HP, next)
    expect(mech.StatController.getMax(StatKey.HP)).toBe(next)
    expect(mech.CombatController.CombatLogVersion).toBeGreaterThan(versionBefore)
    expect(seen.at(-1)).toBe(next)
  })

  it('does not bump the version when the value is unchanged', () => {
    const sc = reactive(mech.StatController) as any
    const current = sc.MaxStats[StatKey.HP]
    const versionBefore = mech.CombatController.CombatLogVersion

    sc.MaxStats[StatKey.HP] = current

    expect(mech.CombatController.CombatLogVersion).toBe(versionBefore)
  })
})
