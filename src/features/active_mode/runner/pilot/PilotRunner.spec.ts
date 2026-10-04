import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import PilotRunner from './PilotRunner.vue'

/**
 * Regressão: o runner avalia o sinal de autosave no setup, antes de `onMounted`
 * carregar as fichas. Acessar `sheet.value!.Combatant` sem guarda derrubava o
 * componente inteiro ("Cannot read properties of null (reading 'Combatant')").
 */
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/active-mode/pilot-runner/:id?', component: PilotRunner },
    ],
  })
  return router
}

describe('PilotRunner', () => {
  it('monta sem ficha carregada, sem quebrar no setup', async () => {
    const router = makeRouter()
    await router.push('/active-mode/pilot-runner/')
    await router.isReady()

    const wrapper = mount(PilotRunner, {
      props: { id: null },
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(wrapper.text().length).toBeGreaterThan(0)

    wrapper.unmount()
  })
})
