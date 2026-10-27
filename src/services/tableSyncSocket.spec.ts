import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { makeMech, makePilot } from '@/__tests__/factories'
import { CompendiumStore } from '@/features/compendium/store'
import type { MechSystem } from '@/classes/mech/components/equipment/MechSystem'
import { mechCombatActionsPath, mechStatsPath } from './sheetSyncPaths'
import { DamageType } from '@/classes/enums'
import { corePowerPath, equipmentDestroyedRefs } from './sheetEquipmentPaths'
import { tableSyncSocket } from './tableSyncSocket'

describe('TableSyncSocket', () => {
  beforeEach(() => {
    tableSyncSocket.disconnect()
  })

  afterEach(() => {
    tableSyncSocket.disconnect()
  })

  it('inicia no estado desconectado', () => {
    expect(tableSyncSocket.Status).toBe('disconnected')
    expect(tableSyncSocket.IsConnected).toBe(false)
  })

  it('enfileira mensagens na fila offline se não estiver conectado', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    tableSyncSocket.sendPilotJoinCombat({
      pilotId: 'pilot-test-1',
      pilotData: { callsign: 'TITAN' },
      version: 1,
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[TableSyncSocket] Socket offline, enfileirando mensagem tipo PILOT_JOIN_COMBAT')
    )
    consoleSpy.mockRestore()
  })

  it('emite evento compcon-ws-status ao mudar estado', () => {
    const statusHandler = vi.fn()
    window.addEventListener('compcon-ws-status', statusHandler)

    // @ts-expect-error testando método privado
    tableSyncSocket.setStatus('connecting')

    expect(statusHandler).toHaveBeenCalled()
    expect(tableSyncSocket.Status).toBe('connecting')

    window.removeEventListener('compcon-ws-status', statusHandler)
  })

  it('processa e despacha envelope PILOT_JOIN_COMBAT corretamente', async () => {
    const joinHandler = vi.fn()
    window.addEventListener('compcon-pilot-join-combat', joinHandler)

    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'PILOT_JOIN_COMBAT',
      roomId: 'room-1',
      senderId: 'player-1',
      timestamp: 1000,
      payload: {
        pilotId: 'pilot-123',
        pilotData: { callsign: 'PHANTOM' },
        version: 1,
      },
    })

    expect(joinHandler).toHaveBeenCalled()
    const eventDetail = joinHandler.mock.calls[0][0].detail
    expect(eventDetail.pilotId).toBe('pilot-123')
    expect(eventDetail.pilotData.callsign).toBe('PHANTOM')

    window.removeEventListener('compcon-pilot-join-combat', joinHandler)
  })

  it('atualiza roomSyncedSheets ao receber INIT_SYNC e REMOVE_SHEET', async () => {
    const { roomSyncedSheets } = await import('./tableSyncSocket')

    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'INIT_SYNC',
      roomId: 'room-1',
      senderId: 'server',
      timestamp: 1000,
      payload: {
        roomId: 'room-1',
        sheets: {
          'pilot-sync-1': {
            characterId: 'pilot-sync-1',
            characterType: 'pilot',
            data: { id: 'pilot-sync-1', callsign: 'VALKYRIE' },
            inCombat: false,
            version: 1,
            updatedAt: 1000,
          },
        },
        gmConnected: true,
      },
    })

    expect(roomSyncedSheets.value['pilot-sync-1']).toBeDefined()
    expect(roomSyncedSheets.value['pilot-sync-1'].data.callsign).toBe('VALKYRIE')

    // Remove a ficha da sala
    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'REMOVE_SHEET',
      roomId: 'room-1',
      senderId: 'player-1',
      timestamp: 1005,
      payload: {
        characterId: 'pilot-sync-1',
        characterType: 'pilot',
      },
    })

    expect(roomSyncedSheets.value['pilot-sync-1']).toBeUndefined()
  })

  /**
   * Regressão: o runner passou a enviar o caminho absoluto do mech
   * (`mechs.0.stats.current.hp`, `mechs.0.combatActions`). O receptor precisa achar o
   * stat pelo último segmento do caminho, senão o patch era aplicado com a chave
   * errada (`mechs.0.stats.current.hp`) e a ficha nunca recebia a alteração.
   */
  it('aplica PATCH_FIELD vindo do mech (caminho absoluto) na ficha do piloto', async () => {
    setActivePinia(createPinia())

    const pilot = makePilot({ callsign: 'SCOUT' })
    const mech = makeMech(pilot)
    mech.SetStats()

    const { PilotStore } = await import('@/features/pilot_management/store')
    PilotStore().Pilots.push(pilot)

    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'PATCH_FIELD',
      roomId: 'room-1',
      senderId: 'player-2',
      timestamp: 2000,
      payload: {
        characterId: pilot.ID,
        characterType: 'pilot',
        field: mechStatsPath(0, 'hp'),
        value: 5,
        version: 2,
      },
    })

    expect(mech.StatController.getCurrent('hp')).toBe(5)

    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'PATCH_FIELD',
      roomId: 'room-1',
      senderId: 'player-2',
      timestamp: 2001,
      payload: {
        characterId: pilot.ID,
        characterType: 'pilot',
        field: mechCombatActionsPath(0),
        value: { Protocol: true },
        version: 3,
      },
    })

    expect(mech.CombatController.CombatActions.Protocol).toBe(true)
  })

  /**
   * Regressão: arma/sistema destruído e poder de núcleo gasto não passam pelo
   * `StatController`; o caminho do patch aponta para o nó do JSON serializado e o
   * receptor precisa achar o item de verdade no mech da ficha.
   */
  it('aplica equipamento destruído e poder de núcleo na ficha do piloto', async () => {
    setActivePinia(createPinia())

    const pilot = makePilot({ callsign: 'WRENCH' })
    const mech = makeMech(pilot)
    const loadout = mech.MechLoadoutController.ActiveLoadout
    loadout.AddSystem(
      CompendiumStore().instantiate(
        'MechSystems',
        CompendiumStore().MechSystems.find(s => !s.IsHidden)!.ID
      ) as MechSystem
    )
    const system = loadout.Systems[loadout.Systems.length - 1]

    const { PilotStore } = await import('@/features/pilot_management/store')
    PilotStore().Pilots.push(pilot)

    const systemPath = equipmentDestroyedRefs(pilot).find(r => r.item === system)!.path

    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'PATCH_FIELD',
      roomId: 'room-1',
      senderId: 'player-2',
      timestamp: 3000,
      payload: {
        characterId: pilot.ID,
        characterType: 'pilot',
        field: systemPath,
        value: true,
        version: 9,
      },
    })

    expect(system.Destroyed).toBe(true)

    // @ts-expect-error testando processamento interno de envelope
    await tableSyncSocket.handleEnvelope({
      type: 'PATCH_FIELD',
      roomId: 'room-1',
      senderId: 'player-2',
      timestamp: 3001,
      payload: {
        characterId: pilot.ID,
        characterType: 'pilot',
        field: corePowerPath(0),
        value: false,
        version: 10,
      },
    })

    expect(mech.CombatController.CorePower).toBe(false)
  })



  /**
   * O `INIT_SYNC` carrega o tracker publicado na sala (`activeTracker`) — é o "encontro
   * salvo na mesa". Ele precisa chegar pelo mesmo evento do `TRACKER_SYNC` vivo E ficar
   * guardado em `roomSyncedTracker`, porque a aba do Combat Tracker monta depois do
   * handshake na maioria dos boots.
   */
  it('recebe o encontro salvo na sala (activeTracker) no INIT_SYNC', async () => {
    const { roomSyncedTracker } = await import('./tableSyncSocket')
    const onTrackerSync = vi.fn()
    window.addEventListener('compcon-tracker-sync', onTrackerSync)

    const snapshot = {
      encounterId: 'enc-1',
      encounterName: 'Combate da Sessão',
      round: 2,
      cards: [{ id: 'c1', name: 'Piloto Um', side: 'ally' }],
    }

    try {
      // @ts-expect-error testando processamento interno de envelope
      await tableSyncSocket.handleEnvelope({
        type: 'INIT_SYNC',
        roomId: 'room-1',
        senderId: 'server',
        timestamp: 5000,
        payload: {
          roomId: 'room-1',
          sheets: {},
          activeTracker: snapshot,
          gmConnected: true,
        },
      })

      expect(roomSyncedTracker.value).toEqual(snapshot)
      expect(onTrackerSync).toHaveBeenCalledTimes(1)
      expect(onTrackerSync.mock.calls[0][0].detail).toEqual(snapshot)

      // Fim do combate na sala limpa o encontro recebido
      // @ts-expect-error testando processamento interno de envelope
      await tableSyncSocket.handleEnvelope({
        type: 'TRACKER_CLEAR',
        roomId: 'room-1',
        senderId: 'gm-1',
        timestamp: 5001,
      })
      expect(roomSyncedTracker.value).toBeNull()
    } finally {
      window.removeEventListener('compcon-tracker-sync', onTrackerSync)
      roomSyncedTracker.value = null
    }
  })

  /**
   * Uma janela sem a ficha (o container vive em `pilot_sheets`, que pode não existir
   * naquele iframe) pede a cópia à mesa. A sala já espelha as fichas, então a resposta
   * sai de `roomSyncedSheets` e a ficha é materializada nos stores locais.
   */
  it('solicita à sala a ficha que esta janela não tem', async () => {
    setActivePinia(createPinia())
    const { roomSyncedSheets } = await import('./tableSyncSocket')

    const pilot = makePilot({ callsign: 'PEDIDA' })

    roomSyncedSheets.value = {
      [pilot.ID]: {
        characterId: pilot.ID,
        characterType: 'pilot',
        data: { id: pilot.ID, callsign: 'PEDIDA', mechs: [], originId: 'piloto-base' },
        inCombat: true,
        version: 2,
        updatedAt: 1000,
        sheetId: 'sheet-pedida',
      },
    }

    try {
      // pelo id do piloto (chave da sala)
      expect((await tableSyncSocket.requestSheet(pilot.ID))?.callsign).toBe('PEDIDA')

      const { PilotStore } = await import('@/features/pilot_management/store')
      expect(PilotStore().Pilots.some((p: any) => p.ID === pilot.ID)).toBe(true)

      // pelo id do container da ficha (anunciado no PILOT_JOIN_COMBAT)
      expect((await tableSyncSocket.requestSheet('sheet-pedida'))?.callsign).toBe('PEDIDA')

      // pelo piloto de ORIGEM (`PilotInstance.OriginId`), que não é o id da ficha viva
      expect((await tableSyncSocket.requestSheet('piloto-base'))?.callsign).toBe('PEDIDA')

      // a sala não conhece: nada a devolver
      expect(await tableSyncSocket.requestSheet('nao-existe')).toBeNull()
    } finally {
      roomSyncedSheets.value = {}
    }
  })

  /**
   * O painel de chat é somente-leitura, mas é ELE que publica o tracker na mesa. Se a
   * reconciliação do encontro contínuo fosse pulada ali, ele publicaria uma iniciativa
   * vazia — os outros jogadores viam "Encontro Vazio" mesmo com os pilotos na sala.
   */
  it('reconcilia o piloto no encontro contínuo ao receber PILOT_JOIN_COMBAT', async () => {
    setActivePinia(createPinia())
    const { EncounterStore } = await import('@/stores')

    const pilot = makePilot({ callsign: 'DO PAINEL' })
    const socket = tableSyncSocket as any
    const previousRole = socket.activeRole
    socket.activeRole = 'GM'

    try {
      // @ts-expect-error testando processamento interno de envelope
      await tableSyncSocket.handleEnvelope({
        type: 'PILOT_JOIN_COMBAT',
        roomId: 'room-1',
        senderId: 'player-7',
        timestamp: 6000,
        payload: {
          pilotId: pilot.ID,
          pilotData: { id: pilot.ID, callsign: 'DO PAINEL', mechs: [] },
          version: 1,
        },
      })

      const combatants = EncounterStore().ActiveEncounters[0]?.Combatants ?? []
      expect(combatants.some((c: any) => c.actor?.ID === pilot.ID || c.id === pilot.ID)).toBe(true)
    } finally {
      socket.activeRole = previousRole
    }
  })

  it('permite envio de END_ENCOUNTER e limpa iniciativa', async () => {
    const { roomSyncedTracker, roomSyncedSheets } = await import('./tableSyncSocket')
    roomSyncedTracker.value = { encounterId: 'enc-1', cards: [] }
    roomSyncedSheets.value = {
      'pilot-1': {
        characterId: 'pilot-1',
        characterType: 'pilot',
        data: {},
        inCombat: true,
        version: 1,
        updatedAt: 100,
      },
      'npc-1': {
        characterId: 'npc-1',
        characterType: 'npc',
        data: {},
        inCombat: true,
        version: 1,
        updatedAt: 100,
      },
    }

    const trackerClearHandler = vi.fn()
    const endEncounterHandler = vi.fn()
    window.addEventListener('compcon-tracker-clear', trackerClearHandler)
    window.addEventListener('compcon-end-encounter', endEncounterHandler)

    try {
      tableSyncSocket.sendEndEncounter({ encounterId: 'enc-1', reason: 'victory' })

      expect(roomSyncedTracker.value).toBeNull()
      expect(roomSyncedSheets.value['pilot-1']?.inCombat).toBe(false)
      expect(trackerClearHandler).toHaveBeenCalled()
      expect(endEncounterHandler).toHaveBeenCalled()
      expect(endEncounterHandler.mock.calls[0][0].detail).toEqual({ encounterId: 'enc-1', reason: 'victory' })
    } finally {
      window.removeEventListener('compcon-tracker-clear', trackerClearHandler)
      window.removeEventListener('compcon-end-encounter', endEncounterHandler)
      roomSyncedSheets.value = {}
      roomSyncedTracker.value = null
    }
  })

  it('limpa tracker e remove NPCs ao receber END_ENCOUNTER da sala', async () => {
    const { roomSyncedTracker, roomSyncedSheets } = await import('./tableSyncSocket')
    roomSyncedTracker.value = { encounterId: 'enc-2', cards: [] }
    roomSyncedSheets.value = {
      'pilot-1': {
        characterId: 'pilot-1',
        characterType: 'pilot',
        data: {},
        inCombat: true,
        version: 1,
        updatedAt: 100,
      },
      'npc-1': {
        characterId: 'npc-1',
        characterType: 'npc',
        data: {},
        inCombat: true,
        version: 1,
        updatedAt: 100,
      },
    }

    const clearHandler = vi.fn()
    const endHandler = vi.fn()
    window.addEventListener('compcon-tracker-clear', clearHandler)
    window.addEventListener('compcon-end-encounter', endHandler)

    try {
      // @ts-expect-error testando processamento interno de envelope
      await tableSyncSocket.handleEnvelope({
        type: 'END_ENCOUNTER',
        roomId: 'room-1',
        senderId: 'gm-1',
        timestamp: 2000,
        payload: { encounterId: 'enc-2', reason: 'completed' },
      })

      expect(roomSyncedTracker.value).toBeNull()
      expect(roomSyncedSheets.value['npc-1']).toBeUndefined()
      expect(roomSyncedSheets.value['pilot-1']?.inCombat).toBe(false)
      expect(clearHandler).toHaveBeenCalled()
      expect(endHandler).toHaveBeenCalled()
    } finally {
      window.removeEventListener('compcon-tracker-clear', clearHandler)
      window.removeEventListener('compcon-end-encounter', endHandler)
      roomSyncedSheets.value = {}
      roomSyncedTracker.value = null
    }
  })
})

/**
 * Camada que o Combat Tracker usa para aplicar dano na ficha sincronizada: normalização da
 * entrada, resolução do alvo, queimadura (pilha + dano), os deltas que vão para a mesa
 * (`PATCH_FIELD`) e a trava de "só o Mestre aplica".
 *
 * As REGRAS de LANCER em si têm spec próprio (`src/__tests__/rules/damage.spec.ts`); aqui
 * o alvo é a tradução para a sincronização.
 */
describe('damage application (tracker → mesa)', () => {
  const input = (over: Partial<import('./damageApplication').DamageInput> = {}) =>
    ({
      type: DamageType.Kinetic,
      value: 5,
      ...over,
    }) as import('./damageApplication').DamageInput

  function setup() {
    setActivePinia(createPinia())
    const pilot = makePilot({ callsign: 'ALVO' })
    const mech = makeMech(pilot)
    mech.SetStats()
    mech.CombatController.StatController.resetCurrentStats()
    return { pilot, mech, combatant: { type: 'pilot', actor: pilot } }
  }

  /**
   * A segunda metade do bug do dano que "enviava mas não chegava": esta janela não recebe os
   * patches das outras janelas do MESMO jogador, então precisa anotar na própria cópia da
   * sala a versão que enviou — senão o próximo patch sai com número menor e o servidor
   * descarta (a ficha do jogador fica divergente).
   */
  it('acompanha a versão da sala ao enviar um patch', async () => {
    const { roomSyncedSheets } = await import('./tableSyncSocket')
    roomSyncedSheets.value = {
      'pilot-x': {
        characterId: 'pilot-x',
        characterType: 'pilot',
        data: { id: 'pilot-x' },
        inCombat: true,
        version: 4,
        updatedAt: 1,
      },
    }

    try {
      tableSyncSocket.sendPatchField('pilot-x', 'pilot', 'mechs.0.stats.current.hp', 9, 12)

      expect(roomSyncedSheets.value['pilot-x'].version).toBe(12)
    } finally {
      roomSyncedSheets.value = {}
    }
  })

  it('prévia mostra o total e a ARMOR absorvida sem aplicar nada', async () => {
    const { previewDamage } = await import('./damageApplication')
    const { mech, combatant } = setup()
    const { StatKey } = await import('@/classes/components/combat/stats/Stats')
    mech.CombatController.StatController.setCurrentStat(StatKey.ARMOR, 2)
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const report = previewDamage(combatant, input({ value: 5 }))!

    expect(report.final).toBe(3)
    expect(report.armorReduced).toBe(2)
    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp)
    expect(report.deltas).toHaveLength(0)
  })

  it('aplica no mecha montado e devolve o delta no caminho do mecha', async () => {
    const { applyDamageToCombatant } = await import('./damageApplication')
    const { mech, combatant } = setup()
    const { StatKey } = await import('@/classes/components/combat/stats/Stats')
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const report = applyDamageToCombatant(combatant, input({ value: 4 }))!

    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp - 4)
    const hpDelta = report.deltas.find(d => d.field.endsWith('hp'))
    expect(hpDelta?.field).toBe('mechs.0.stats.current.hp')
    expect(hpDelta?.previous).toBe(hp)
    // Nada de publicar stat que não mudou.
    expect(report.deltas.every(d => d.field.endsWith('hp'))).toBe(true)
  })

  it('meia dano arredonda para cima e AP ignora a ARMOR', async () => {
    const { applyDamageToCombatant } = await import('./damageApplication')
    const { mech, combatant } = setup()
    const { StatKey } = await import('@/classes/components/combat/stats/Stats')
    mech.CombatController.StatController.setCurrentStat(StatKey.ARMOR, 2)
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const half = applyDamageToCombatant(combatant, input({ value: 5, half: true }))!
    expect(half.incoming).toBe(3)

    const ap = applyDamageToCombatant(combatant, input({ value: 5, ap: true }))!
    expect(ap.final).toBe(5)
    // Metade (3) passa pela ARMOR 2 → 1; o perfurante (5) ignora a ARMOR: 1 + 5 = 6.
    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp - 6)
  })

  it('queimadura empilha o status E aplica o dano (ignorando ARMOR)', async () => {
    const { applyDamageToCombatant } = await import('./damageApplication')
    const { mech, combatant } = setup()
    const { StatKey } = await import('@/classes/components/combat/stats/Stats')
    mech.CombatController.StatController.setCurrentStat(StatKey.ARMOR, 2)
    const hp = mech.CombatController.StatController.getCurrent(StatKey.HP)

    const report = applyDamageToCombatant(
      combatant,
      input({ value: 0, type: DamageType.Burn, burn: 3 })
    )!

    expect(mech.CombatController.StatController.getCurrent(StatKey.BURN)).toBe(3)
    expect(report.burn).toBe(3)
    expect(mech.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp - 3)
    expect(report.deltas.some(d => d.field === 'mechs.0.stats.current.burn')).toBe(true)
    expect(report.deltas.some(d => d.field === 'mechs.0.stats.current.hp')).toBe(true)
  })

  it('piloto desmontado tem ficha própria: o delta sai no caminho do ator', async () => {
    const { applyDamageToCombatant } = await import('./damageApplication')
    const { StatKey } = await import('@/classes/components/combat/stats/Stats')
    const pilot = makePilot({ callsign: 'A PE' })
    pilot.SetStats()
    const hp = pilot.CombatController.StatController.getCurrent(StatKey.HP)

    const report = applyDamageToCombatant({ type: 'pilot', actor: pilot }, input({ value: 4 }))!

    expect(report.deltas.find(d => d.field.endsWith('hp'))?.field).toBe('stats.current.hp')
    expect(pilot.CombatController.StatController.getCurrent(StatKey.HP)).toBe(hp - 4)
  })

  it('devolve null sem alvo válido', async () => {
    const { applyDamageToCombatant } = await import('./damageApplication')

    expect(applyDamageToCombatant(null, input())).toBeNull()
    expect(applyDamageToCombatant({ type: 'pilot', actor: {} }, input())).toBeNull()
  })

  it('não publica quando não é o Mestre nem quando não há delta', async () => {
    const { publishDamageReport, applyDamageToCombatant } = await import('./damageApplication')
    const { combatant } = setup()
    const send = vi.spyOn(tableSyncSocket, 'sendPatchField')

    const report = applyDamageToCombatant(combatant, input({ value: 4 }))!

    expect(await publishDamageReport(report)).toBe(false)
    expect(await publishDamageReport(null)).toBe(false)
    expect(send).not.toHaveBeenCalled()

    send.mockRestore()
  })
})
