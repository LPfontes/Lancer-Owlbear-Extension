import { describe, it, expect } from 'vitest'
import {
  buildTrackerSnapshot,
  fitSnapshotToBudget,
  sanitizeTrackerSnapshot,
  trackerSnapshotSignature,
  MAX_SNAPSHOT_CHARS,
  MAX_SYNCED_CARDS,
} from '@/services/trackerSyncPayload'

/** Combatente do encontro no formato usado pelo CombatTrackerTab. */
function combatant(overrides: Record<string, any> = {}) {
  const { activations, ...rest } = overrides
  return {
    id: 'c1',
    index: 0,
    number: -1,
    side: 'ally',
    type: 'pilot',
    actor: {
      ID: 'sheet-1',
      Name: 'Piloto Um',
      CombatController: {
        StatController: {
          CurrentStats: { activations: activations?.current ?? 1 },
          MaxStats: { activations: activations?.max ?? 1 },
        },
      },
    },
    ...rest,
  }
}

function encounter(combatants: any[], overrides: Record<string, any> = {}) {
  return { ID: 'enc-1', Name: 'Combate da Sessão', Round: 1, Combatants: combatants, ...overrides }
}

describe('buildTrackerSnapshot', () => {
  it('devolve null quando não há encontro', () => {
    expect(buildTrackerSnapshot(null)).toBeNull()
    expect(buildTrackerSnapshot(undefined)).toBeNull()
  })

  it('monta os cards com nome, lado, ordem e ativações', () => {
    const snapshot = buildTrackerSnapshot(
      encounter([
        combatant({ id: 'c1', index: 0, side: 'ally' }),
        combatant({ id: 'c2', index: 1, side: 'enemy', type: 'unit', number: 2, actor: { Name: 'Hostil', CombatController: { StatController: { CurrentStats: { activations: 0 }, MaxStats: { activations: 2 } } } } }),
      ])
    )

    expect(snapshot).not.toBeNull()
    expect(snapshot!.encounterId).toBe('enc-1')
    expect(snapshot!.round).toBe(1)
    expect(snapshot!.cards).toHaveLength(2)
    expect(snapshot!.cards[0]).toMatchObject({ id: 'c1', name: 'Piloto Um', side: 'ally', index: 0, kind: 'pilot' })
    expect(snapshot!.cards[1]).toMatchObject({
      id: 'c2',
      name: 'Hostil',
      side: 'enemy',
      number: 2,
      kind: 'unit',
      activations: { current: 0, max: 2 },
    })
  })

  it('não vaza nenhum dado de ficha no payload', () => {
    const snapshot = buildTrackerSnapshot(encounter([combatant()]))
    const serialized = JSON.stringify(snapshot)

    expect(serialized).not.toContain('sheet-1')
    expect(serialized).not.toContain('CurrentStats')
    expect(serialized).not.toContain('Portrait')
    for (const key of ['hp', 'heat', 'structure', 'stress', 'actor']) {
      expect(serialized.toLowerCase()).not.toContain(`"${key}"`)
    }
  })

  it('omite combatentes ocultos dos jogadores e reforços ainda não posicionados', () => {
    const snapshot = buildTrackerSnapshot(
      encounter([
        combatant({ id: 'visivel' }),
        combatant({ id: 'oculto', hiddenFromPlayers: true }),
        combatant({ id: 'reforco', reinforcement: true }),
      ])
    )

    expect(snapshot!.cards.map(c => c.id)).toEqual(['visivel'])
  })

  it('ordena os cards pela posição na iniciativa', () => {
    const snapshot = buildTrackerSnapshot(
      encounter([
        combatant({ id: 'terceiro', index: 2 }),
        combatant({ id: 'primeiro', index: 0 }),
        combatant({ id: 'segundo', index: 1 }),
      ])
    )

    expect(snapshot!.cards.map(c => c.id)).toEqual(['primeiro', 'segundo', 'terceiro'])
  })

  it('marca o combatente em turno apenas se ele estiver visível', () => {
    const instance = encounter([combatant({ id: 'c1' }), combatant({ id: 'c2', hiddenFromPlayers: true })])

    expect(buildTrackerSnapshot(instance, 'c1')!.inTurnId).toBe('c1')
    expect(buildTrackerSnapshot(instance, 'c2')!.inTurnId).toBeNull()
    expect(buildTrackerSnapshot(instance, 'inexistente')!.inTurnId).toBeNull()
  })

  it('normaliza ativações ausentes ou inválidas', () => {
    const snapshot = buildTrackerSnapshot(
      encounter([
        combatant({ id: 'sem-stats', actor: { Name: 'Sem Stats' } }),
        combatant({ id: 'negativo', activations: { current: -5, max: 3 } }),
      ])
    )

    expect(snapshot!.cards[0].activations).toEqual({ current: 0, max: 1 })
    expect(snapshot!.cards[1].activations).toEqual({ current: 0, max: 3 })
  })

  it('limita a quantidade de cards publicados', () => {
    const many = Array.from({ length: MAX_SYNCED_CARDS + 10 }, (_, i) =>
      combatant({ id: `c${i}`, index: i })
    )
    const snapshot = buildTrackerSnapshot(encounter(many))

    expect(snapshot!.cards).toHaveLength(MAX_SYNCED_CARDS)
    expect(snapshot!.cards[0].id).toBe('c0')
  })

  it('ignora combatentes sem id', () => {
    const snapshot = buildTrackerSnapshot(encounter([combatant({ id: '' }), combatant({ id: 'ok' })]))
    expect(snapshot!.cards.map(c => c.id)).toEqual(['ok'])
  })
})

describe('sanitizeTrackerSnapshot', () => {
  it('rejeita payloads sem a forma mínima', () => {
    expect(sanitizeTrackerSnapshot(null)).toBeNull()
    expect(sanitizeTrackerSnapshot('nope')).toBeNull()
    expect(sanitizeTrackerSnapshot({ name: 'x' })).toBeNull()
    expect(sanitizeTrackerSnapshot({ cards: 'nope' })).toBeNull()
  })

  it('descarta campos desconhecidos do payload recebido', () => {
    const snapshot = sanitizeTrackerSnapshot({
      encounterId: 'enc',
      name: 'Combate',
      round: 2,
      inTurnId: 'c1',
      evil: { injected: true },
      cards: [{ id: 'c1', name: 'Piloto', side: 'ally', index: 0, activations: { current: 1, max: 2 }, hp: 99 }],
    })

    expect(snapshot).not.toBeNull()
    expect(Object.keys(snapshot!).sort()).toEqual(['cards', 'encounterId', 'inTurnId', 'name', 'round', 'updatedAt'])
    expect(Object.keys(snapshot!.cards[0]).sort()).toEqual([
      'activations',
      'id',
      'index',
      'kind',
      'name',
      'number',
      'side',
    ])
  })

  it('coage tipos inválidos em vez de confiar no payload', () => {
    const snapshot = sanitizeTrackerSnapshot({
      round: 'abc',
      cards: [{ id: 'c1', name: 42, side: null, index: 'x', activations: { current: 'z', max: 0 }, kind: 'hacker' }],
    })

    expect(snapshot!.round).toBe(1)
    expect(snapshot!.cards[0]).toMatchObject({
      name: '42',
      side: 'neutral',
      index: 0,
      kind: 'unit',
      activations: { current: 0, max: 1 },
    })
  })

  it('descarta cards sem id e limita a lista', () => {
    const cards = Array.from({ length: MAX_SYNCED_CARDS + 5 }, (_, i) => ({ id: `c${i}`, activations: { current: 1, max: 1 } }))
    const snapshot = sanitizeTrackerSnapshot({ cards: [{ id: '' }, ...cards] })

    // O corte acontece antes da validação, então a garantia é o teto e a ausência de ids vazios.
    expect(snapshot!.cards.length).toBeLessThanOrEqual(MAX_SYNCED_CARDS)
    expect(snapshot!.cards.every(card => !!card.id)).toBe(true)
  })

  it('mantém exatamente o teto quando todos os cards são válidos', () => {
    const cards = Array.from({ length: MAX_SYNCED_CARDS + 5 }, (_, i) => ({ id: `c${i}`, activations: { current: 1, max: 1 } }))
    const snapshot = sanitizeTrackerSnapshot({ cards })

    expect(snapshot!.cards).toHaveLength(MAX_SYNCED_CARDS)
  })

  it('descarta inTurnId que não corresponde a nenhum card', () => {
    const snapshot = sanitizeTrackerSnapshot({ inTurnId: 'fantasma', cards: [{ id: 'c1' }] })
    expect(snapshot!.inTurnId).toBeNull()
  })

  it('fecha o lado em enemy/ally/neutral (o valor vira classe CSS)', () => {
    const snapshot = sanitizeTrackerSnapshot({
      cards: [
        { id: 'c1', side: 'enemy' },
        { id: 'c2', side: 'ally' },
        { id: 'c3', side: 'x" onload="alert(1)' },
      ],
    })

    expect(snapshot!.cards.map(c => c.side)).toEqual(['enemy', 'ally', 'neutral'])
  })
})

describe('trackerSnapshotSignature', () => {
  it('ignora o updatedAt (não republica payloads idênticos)', () => {
    const instance = encounter([combatant()])
    const a = buildTrackerSnapshot(instance)
    const b = { ...buildTrackerSnapshot(instance)!, updatedAt: a!.updatedAt + 5000 }

    expect(trackerSnapshotSignature(a)).toBe(trackerSnapshotSignature(b))
  })

  it('muda quando as ativações mudam', () => {
    const instance = encounter([combatant()])
    const before = buildTrackerSnapshot(instance)
    instance.Combatants[0].actor.CombatController.StatController.CurrentStats.activations = 0
    const after = buildTrackerSnapshot(instance)

    expect(trackerSnapshotSignature(before)).not.toBe(trackerSnapshotSignature(after))
  })

  it('devolve string vazia para snapshot nulo', () => {
    expect(trackerSnapshotSignature(null)).toBe('')
  })
})

describe('fitSnapshotToBudget', () => {
  it('mantém o payload intacto quando ele já cabe', () => {
    const snapshot = buildTrackerSnapshot(encounter([combatant()]))!
    const fitted = fitSnapshotToBudget(snapshot)

    expect(fitted.cards).toHaveLength(snapshot.cards.length)
  })

  it('remove cards do fim até o payload caber no metadata da sala', () => {
    const many = Array.from({ length: MAX_SYNCED_CARDS }, (_, i) =>
      combatant({ id: `c${i}`, index: i, actor: { Name: `Combatente com nome longo ${i}` } })
    )
    const snapshot = buildTrackerSnapshot(encounter(many))!
    const fitted = fitSnapshotToBudget({ ...snapshot, cards: snapshot.cards.map(c => ({ ...c, name: 'x'.repeat(600) })) })

    expect(fitted.cards.length).toBeLessThan(snapshot.cards.length)
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS)
  })
})
