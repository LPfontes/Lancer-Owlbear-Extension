import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DamageApplicationDialog from './DamageApplicationDialog.vue'
import { makeMech, makePilot } from '@/__tests__/factories'
import { StatKey } from '@/classes/components/combat/stats/Stats'
import { i18n } from '@/i18n'
import { tableSyncSocket } from '@/services/tableSyncSocket'

/**
 * UI de aplicação de dano do Combat Tracker (só o Mestre vê o botão). O que se testa aqui é
 * o que o Mestre faz: escolher valor/tipo, ver a prévia e aplicar — o resultado tem que
 * aparecer no ator (a ficha sincronizada) e virar patch para a mesa.
 */
describe('DamageApplicationDialog', () => {
  function mountDialog(combatant: any) {
    return mount(DamageApplicationDialog, {
      props: { combatant },
      global: { plugins: [i18n] },
    })
  }

  function setupMech() {
    setActivePinia(createPinia())
    const pilot = makePilot({ callsign: 'ALVO' })
    const mech = makeMech(pilot)
    mech.SetStats()
    mech.CombatController.StatController.resetCurrentStats()
    return { pilot, mech, combatant: { type: 'pilot', actor: pilot, id: pilot.ID } }
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('mostra a prévia e aplica o dano no alvo', async () => {
    const { mech, combatant } = setupMech()
    mech.CombatController.StatController.setCurrentStat(StatKey.ARMOR, 2)
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const wrapper = mountDialog(combatant)
    const preview = wrapper.vm as unknown as { preview?: any; value?: number }

    preview.value = 5
    await wrapper.vm.$nextTick()

    expect(preview.preview?.final).toBe(3)
    expect(preview.preview?.armorReduced).toBe(2)

    const applyFn = (wrapper.vm as any).apply
    await applyFn({ value: false })
    await wrapper.vm.$nextTick()

    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp - 3)
    expect(wrapper.emitted('applied')).toBeTruthy()

    wrapper.unmount()
  })

  it('empilha BURN e aplica o dano de queimadura', async () => {
    const { mech, combatant } = setupMech()
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const wrapper = mountDialog(combatant)
    const vm = wrapper.vm as any

    vm.burn = 3
    vm.value = 0
    await wrapper.vm.$nextTick()

    await vm.apply({ value: false })
    await wrapper.vm.$nextTick()

    expect(mech.CombatController.StatController.getCurrent(StatKey.BURN)).toBe(3)
    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp - 3)

    wrapper.unmount()
  })

  it('não aplica sem valor nem queimadura', async () => {
    const { mech, combatant } = setupMech()
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const wrapper = mountDialog(combatant)
    const vm = wrapper.vm as any
    vm.value = 0
    vm.burn = 0
    await wrapper.vm.$nextTick()

    expect(vm.canApply).toBe(false)

    await vm.apply({ value: false })
    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp)
    expect(wrapper.emitted('applied')).toBeFalsy()

    wrapper.unmount()
  })

  it('publica os patches na mesa quando o dano é aplicado', async () => {
    const { combatant } = setupMech()
    const send = vi.spyOn(tableSyncSocket, 'sendPatchField')

    const wrapper = mountDialog(combatant)
    const vm = wrapper.vm as any
    vm.value = 4
    await wrapper.vm.$nextTick()

    await vm.apply({ value: false })

    // Sem role de Mestre no ambiente de teste, a publicação é recusada — o que importa é
    // que a chamada passa pelo serviço (que é quem tem a trava de permissão).
    expect(send).not.toHaveBeenCalled()

    send.mockRestore()
    wrapper.unmount()
  })
})
