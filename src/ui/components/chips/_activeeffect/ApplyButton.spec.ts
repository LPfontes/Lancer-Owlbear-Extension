import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ApplyButton from './ApplyButton.vue'
import { setSheetReadOnlySession } from '@/services/sheetReadOnlySession'
import { i18n } from '@/i18n'

/**
 * A ficha em modo leitura não pode oferecer rolagem nem ativação: o diálogo até mostra a
 * descrição do efeito (informação), mas os botões "Ativar"/"Rolar" saem da tela e as
 * funções ficam inertes.
 */
function makeProps() {
  const combatController = {
    IsActionUsed: () => false,
    CanActivate: () => true,
    CanTakeAction: () => true,
    CanRepeatAsOvercharge: () => false,
  }

  return {
    event: {
      Effect: {
        IsPassive: false,
        Damage: [],
        Origin: { Icon: '' },
        Icon: '',
        Activation: 'quick',
        ID: 'ef-1',
        Name: 'Efeito',
      },
      Ready: true,
      Staged: false,
      Summary: '',
    },
    encounterInstance: { ItemType: 'PilotSheet' },
    owner: { actor: { CombatController: { ActiveActor: { CombatController: combatController } } } },
    close: () => {},
  }
}

describe('ApplyButton em ficha somente-leitura', () => {
  beforeEach(() => setSheetReadOnlySession(false))
  afterEach(() => setSheetReadOnlySession(false))

  it('mostra os botões de ação numa janela normal', () => {
    const wrapper = mount(ApplyButton, { props: makeProps() as any })

    expect(wrapper.text()).toContain(i18n.global.t('ui.combat.activate'))
    wrapper.unmount()
  })

  it('esconde rolagem e ativação quando a sessão é somente-leitura', () => {
    setSheetReadOnlySession(true)
    const wrapper = mount(ApplyButton, { props: makeProps() as any })

    expect(wrapper.text()).not.toContain(i18n.global.t('ui.combat.activate'))
    expect(wrapper.text()).not.toContain(i18n.global.t('hud.roll'))
    // O cancelar continua: o diálogo pode ser fechado.
    expect(wrapper.text()).toContain(i18n.global.t('hud.cancel'))

    wrapper.unmount()
  })
})
