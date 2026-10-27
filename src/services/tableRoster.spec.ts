import { describe, it, expect, vi, beforeEach } from 'vitest'

const getValue = vi.fn()
const setValue = vi.fn()

vi.mock('@/io/Storage', () => ({
  GetValue: (...args: unknown[]) => getValue(...args),
  SetValue: (...args: unknown[]) => setValue(...args),
}))

import {
  addToTableRoster,
  getTableRosterRoom,
  removeFromTableRoster,
  resetTableRoster,
  setTableRosterRoom,
  tableRosterEntries,
  tableRosterIds,
} from './tableRoster'

describe('tableRoster (roster local da mesa, fora dos metadados do Owlbear)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getValue.mockResolvedValue(null)
    setValue.mockResolvedValue(undefined)
    resetTableRoster()
  })

  it('começa vazio e sem sala definida', async () => {
    expect(getTableRosterRoom()).toBe('sem-sala')
    expect(await tableRosterIds('pilot')).toEqual(new Set())
    expect(await tableRosterEntries('npc')).toEqual({})
  })

  it('registra fichas publicadas e as devolve como ids e como entradas', async () => {
    setTableRosterRoom('sala-1')

    await addToTableRoster('pilot', ['p1', 'p2'])
    await addToTableRoster('npc', ['n1'])

    expect(await tableRosterIds('pilot')).toEqual(new Set(['p1', 'p2']))
    expect(await tableRosterIds('npc')).toEqual(new Set(['n1']))

    const entries = await tableRosterEntries('pilot')
    expect(Object.keys(entries)).toEqual(['p1', 'p2'])
    expect(entries.p1.id).toBe('p1')
    expect(typeof entries.p1.updatedAt).toBe('number')

    // O que é gravado é o documento do roster, nunca metadados do Owlbear.
    expect(setValue).toHaveBeenCalledWith('compcon_table_roster', expect.any(Object))
  })

  it('ignora ids vazios ou ausentes', async () => {
    setTableRosterRoom('sala-1')

    await addToTableRoster('pilot', [undefined, null, '', 'p1'])

    expect(await tableRosterIds('pilot')).toEqual(new Set(['p1']))
  })

  it('remove uma ficha sem diferenciar maiúsculas/minúsculas', async () => {
    setTableRosterRoom('sala-1')
    await addToTableRoster('pilot', ['P1'])

    await removeFromTableRoster('pilot', 'p1')

    expect(await tableRosterIds('pilot')).toEqual(new Set())
  })

  it('separa o roster por sala', async () => {
    setTableRosterRoom('sala-a')
    await addToTableRoster('pilot', ['p-a'])

    setTableRosterRoom('sala-b')
    expect(await tableRosterIds('pilot')).toEqual(new Set())
    await addToTableRoster('pilot', ['p-b'])

    setTableRosterRoom('sala-a')
    expect(await tableRosterIds('pilot')).toEqual(new Set(['p-a']))
  })

  it('carrega o roster já gravado no armazenamento', async () => {
    getValue.mockResolvedValue({
      'sala-1': { pilots: { p1: 111 }, npcs: {} },
    })
    setTableRosterRoom('sala-1')

    expect(await tableRosterIds('pilot')).toEqual(new Set(['p1']))
    expect(getValue).toHaveBeenCalledTimes(1)
  })

  it('não quebra quando o armazenamento falha', async () => {
    getValue.mockRejectedValue(new Error('sem storage'))
    setValue.mockRejectedValue(new Error('sem storage'))
    setTableRosterRoom('sala-1')

    await expect(addToTableRoster('pilot', ['p1'])).resolves.toBeUndefined()
    expect(await tableRosterIds('pilot')).toEqual(new Set(['p1']))
  })
})
