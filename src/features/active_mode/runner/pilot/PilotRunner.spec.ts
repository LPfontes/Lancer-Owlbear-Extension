import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { makeMech, makePilot } from '@/__tests__/factories'
import { ClearAll } from '@/io/Storage'
import { i18n } from '@/i18n'
import { obrBridge } from '@/services/obrBridge'
import { tableSyncSocket } from '@/services/tableSyncSocket'
import { isSheetReadOnlySession } from '@/services/sheetReadOnlySession'
import { StatKey } from '@/classes/components/combat/stats/Stats'
import { Pilot } from '@/classes/pilot/Pilot'
import PilotSheet from '@/features/pilot_management/store/PilotSheet'
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
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  /**
   * Modo leitura (`?readonly=1`): visão da ficha sem nenhuma escrita — não anuncia
   * entrada em combate, não cria/ativa ficha na janela e preserva o estado de combate
   * da cópia que já existe (PV atual, não o máximo de uma ficha recém-criada).
   */
  it('em modo leitura não anuncia nem cria ficha na janela', async () => {
    setActivePinia(createPinia())

    const pilot = makePilot({ callsign: 'LEITURA' })
    const mech = makeMech(pilot)

    const { PilotStore } = await import('@/features/pilot_management/store')
    PilotStore().Pilots.push(pilot)

    const announce = vi.spyOn(tableSyncSocket, 'sendPilotJoinCombat')

    const router = makeRouter()
    await router.push(`/active-mode/pilot-runner/${pilot.ID}?readonly=1`)
    await router.isReady()

    const wrapper = mount(PilotRunner, {
      props: { id: pilot.ID },
      global: { plugins: [router] },
      // `shallow` porque os painéis do runner arrastam meio app (UserStore, layout
      // options): aqui o alvo é o caminho de dados do modo leitura, não a renderização.
      shallow: true,
    })
    await flushPromises()

    expect(announce).not.toHaveBeenCalled()

    const { PilotSheetStore } = await import('@/features/pilot_management/store/PilotSheetStore')
    expect(PilotSheetStore().CurrentActiveID).toBe('')
    expect(PilotSheetStore().PilotSheets).toHaveLength(0)

    wrapper.unmount()
  })

  /**
   * O modo leitura é uma sessão isolada: nada sai para a mesa, nenhum token é criado ou
   * alterado e nada é salvo — nem quando um stat da cópia muda (o watcher que agenda os
   * deltas e o autosave é desligado, e os serviços que desenham no token ficam inertes).
   */
  it('em modo leitura não envia deltas, não cria token, não salva e isola a sessão', async () => {
    setActivePinia(createPinia())

    const pilot = makePilot({ callsign: 'ISOLADA' })
    makeMech(pilot)
    const { PilotStore } = await import('@/features/pilot_management/store')
    PilotStore().Pilots.push(pilot)

    const sendPatch = vi.spyOn(tableSyncSocket, 'sendPatchField')
    const announce = vi.spyOn(tableSyncSocket, 'sendPilotJoinCombat')
    const createToken = vi.spyOn(obrBridge, 'createTokenForSheet')
    const saveSheet = vi.spyOn(PilotSheet.prototype, 'Save')

    const router = makeRouter()
    await router.push(`/active-mode/pilot-runner/${pilot.ID}?readonly=1`)
    await router.isReady()

    const wrapper = mount(PilotRunner, {
      props: { id: pilot.ID },
      global: { plugins: [router] },
      shallow: true,
    })
    await flushPromises()

    // A janela está marcada como sessão de leitura (serviços de token ficam inertes).
    expect(isSheetReadOnlySession()).toBe(true)

    // Mexer num stat da cópia exibida não pode virar delta nem save.
    const shown = (wrapper.vm as unknown as { sheet?: any }).sheet
    expect(shown).toBeTruthy()
    shown.Pilot.ActiveMech.StatController.setCurrentStat(StatKey.HP, 1, { silent: true })

    // Passa da janela de debounce do dispatcher (600 ms) com folga.
    await new Promise(resolve => setTimeout(resolve, 800))
    await flushPromises()

    expect(sendPatch).not.toHaveBeenCalled()
    expect(announce).not.toHaveBeenCalled()
    expect(createToken).not.toHaveBeenCalled()
    expect(saveSheet).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(isSheetReadOnlySession()).toBe(false)
  })

  /**
   * Cenário do erro "No pilot sheet found with ID … (0 carregadas)": esta janela não tem
   * nem o container (`pilot_sheets`) nem o piloto (`pilots`), mas a MESA tem a ficha. O
   * runner precisa pedi-la ao TableSyncSocket e materializar a cópia da sala — sem zerar
   * o estado de combate (PV/calor do combate em andamento).
   */
  it('pede a ficha à mesa quando a janela não tem nem ficha nem piloto', async () => {
    setActivePinia(createPinia())
    // O armazenamento é compartilhado entre os testes deste arquivo: começa limpo para a
    // contagem de fichas criadas ser determinística.
    await ClearAll('pilot_sheets')
    await ClearAll('pilots')

    const pilot = makePilot({ callsign: 'DA SALA' })
    const sourceMech = makeMech(pilot)
    sourceMech.StatController.setCurrentStat(StatKey.HP, 5, { silent: true })

    const { roomSyncedSheets } = await import('@/services/tableSyncSocket')
    roomSyncedSheets.value = {
      [pilot.ID]: {
        characterId: pilot.ID,
        characterType: 'pilot',
        data: JSON.parse(JSON.stringify(Pilot.Serialize(pilot))),
        inCombat: true,
        version: 1,
        updatedAt: 1,
        sheetId: 'sheet-da-sala',
      },
    }

    // Libera o gate do anúncio (o runner espera o INIT_SYNC para decidir) sem esperar os 3s.
    const release = setTimeout(
      () => window.dispatchEvent(new CustomEvent('compcon-init-sync', { detail: {} })),
      30
    )

    try {
      const router = makeRouter()
      await router.push(`/active-mode/pilot-runner/${pilot.ID}`)
      await router.isReady()

      const wrapper = mount(PilotRunner, {
        props: { id: pilot.ID },
        global: { plugins: [router] },
        shallow: true,
      })
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 120))
      await flushPromises()

      const { PilotSheetStore } = await import('@/features/pilot_management/store/PilotSheetStore')
      const sheets = (PilotSheetStore().PilotSheets as any[]).filter(s => s.Pilot?.ID === pilot.ID)
      expect(sheets).toHaveLength(1)
      expect(sheets[0].Pilot.ActiveMech.StatController.getCurrent(StatKey.HP)).toBe(5)

      wrapper.unmount()
    } finally {
      clearTimeout(release)
      roomSyncedSheets.value = {}
    }
  })

  /**
   * A janela da ficha é reutilizada: o botão "abrir em modo leitura" troca o alvo pela
   * rota e o componente NÃO remonta. Sem watcher, a tela ficava presa em "Carregando
   * ficha do piloto…" (ou mostrando a ficha anterior).
   */
  it('troca a ficha exibida quando a rota muda sem remontar a janela', async () => {
    setActivePinia(createPinia())
    await ClearAll('pilots')

    const pilotA = makePilot({ callsign: 'PRIMEIRA' })
    const pilotB = makePilot({ callsign: 'SEGUNDA' })
    const { roomSyncedSheets } = await import('@/services/tableSyncSocket')
    roomSyncedSheets.value = {
      [pilotA.ID]: {
        characterId: pilotA.ID,
        characterType: 'pilot',
        data: { id: pilotA.ID, callsign: 'PRIMEIRA', mechs: [] },
        inCombat: true,
        version: 1,
        updatedAt: 1,
      },
      [pilotB.ID]: {
        characterId: pilotB.ID,
        characterType: 'pilot',
        data: { id: pilotB.ID, callsign: 'SEGUNDA', mechs: [] },
        inCombat: true,
        version: 1,
        updatedAt: 2,
      },
    }

    try {
      const router = makeRouter()
      await router.push(`/active-mode/pilot-runner/${pilotA.ID}?readonly=1`)
      await router.isReady()

      const wrapper = mount(PilotRunner, {
        props: { id: pilotA.ID },
        global: { plugins: [router] },
        shallow: true,
      })
      await flushPromises()

      const shown = () => (wrapper.vm as unknown as { sheet?: any }).sheet
      expect(shown()?.Pilot?.ID).toBe(pilotA.ID)

      // Navegação real: a rota E a prop mudam (a rota é `props: true`).
      await router.push(`/active-mode/pilot-runner/${pilotB.ID}?readonly=1`)
      await wrapper.setProps({ id: pilotB.ID })
      await flushPromises()

      expect(shown()?.Pilot?.ID).toBe(pilotB.ID)

      wrapper.unmount()
    } finally {
      roomSyncedSheets.value = {}
    }
  })

  /**
   * `PilotInstance`: o `OriginId` é o piloto de origem e o `ID` é a ficha viva, que é como
   * a sala guarda. O alvo pode chegar como `OriginId` (encontro antigo, botão de outra
   * janela) — a busca precisa achar de qualquer jeito.
   */
  it('resolve a ficha quando o alvo é o piloto de origem (PilotInstance)', async () => {
    setActivePinia(createPinia())
    await ClearAll('pilots')

    const pilot = makePilot({ callsign: 'INSTANCIA' })
    const { roomSyncedSheets } = await import('@/services/tableSyncSocket')
    roomSyncedSheets.value = {
      [pilot.ID]: {
        characterId: pilot.ID,
        characterType: 'pilot',
        data: { id: pilot.ID, callsign: 'INSTANCIA', mechs: [], originId: 'piloto-base' },
        inCombat: true,
        version: 1,
        updatedAt: 1,
      },
    }

    try {
      const router = makeRouter()
      await router.push('/active-mode/pilot-runner/piloto-base?readonly=1')
      await router.isReady()

      const wrapper = mount(PilotRunner, {
        props: { id: 'piloto-base' },
        global: { plugins: [router] },
        shallow: true,
      })
      await flushPromises()

      const shown = (wrapper.vm as unknown as { sheet?: any }).sheet
      expect(shown?.Pilot?.ID).toBe(pilot.ID)

      wrapper.unmount()
    } finally {
      roomSyncedSheets.value = {}
    }
  })

  /**
   * Ficha que não está nesta janela nem na sala: a tela precisa dizer que não achou, não
   * girar o spinner para sempre.
   */
  it('mostra "ficha não encontrada" em vez de carregar para sempre', async () => {
    setActivePinia(createPinia())
    const { roomSyncedSheets } = await import('@/services/tableSyncSocket')
    roomSyncedSheets.value = {}

    try {
      const router = makeRouter()
      await router.push('/active-mode/pilot-runner/nao-existe?readonly=1')
      await router.isReady()

      const wrapper = mount(PilotRunner, {
        props: { id: 'nao-existe' },
        global: { plugins: [router] },
        shallow: true,
      })
      await flushPromises()

      // A locale dos testes é o inglês: compara com a própria tradução, não com o texto.
      expect(wrapper.text()).toContain(i18n.global.t('active.pilotRunner.notFoundTitle'))
      expect(wrapper.text()).not.toContain(i18n.global.t('active.pilotRunner.loading'))

      wrapper.unmount()
    } finally {
      roomSyncedSheets.value = {}
    }
  })

  it('identifica modo leitura e aplica readOnly quando ?readonly=1', async () => {
    setActivePinia(createPinia())

    const pilot = makePilot({ callsign: 'LEITURA-CSS' })
    makeMech(pilot)

    const { PilotStore } = await import('@/features/pilot_management/store')
    PilotStore().Pilots.push(pilot)

    const router = makeRouter()
    await router.push(`/active-mode/pilot-runner/${pilot.ID}?readonly=1`)
    await router.isReady()

    const wrapper = mount(PilotRunner, {
      props: { id: pilot.ID },
      global: { plugins: [router] },
      shallow: true,
    })
    await flushPromises()

    expect((wrapper.vm as any).readOnly).toBe(true)
    expect(isSheetReadOnlySession()).toBe(true)

    wrapper.unmount()
  })
})
