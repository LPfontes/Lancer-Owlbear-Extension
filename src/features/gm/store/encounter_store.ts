import { GetAll, SetItem, RemoveItem, SetValue, GetValue, saveAll } from '@/io/Storage'
import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { useFolderManagement } from '@/composables/useFolderManagement'
import * as _ from 'lodash-es'
import { Encounter, IEncounterData, makeCombatant, type CombatantData } from '@/classes/encounter/Encounter'
import { NavStore } from '@/stores/nav'
import type { IndexItem } from '@/stores/nav'
import { CloudController } from '@/classes/components/cloud/CloudController'
import logger from '@/user/logger'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { EncounterArchive } from '@/classes/encounter/EncounterArchive'
import { clearUndoStack } from '@/classes/encounter/EncounterUndoStack'
import { PilotStore } from '@/features/pilot_management/store'
import { TAB_ID } from '@/services/tabId'

function idOf(item: any): string {
  return item?.ID || item?.id || item?._id || ''
}

// A stored copy may only replace a live object when it is strictly newer.
// Otherwise a reload would swap objects out from under the components and the
// encounter runner, which hold references across awaits — the "my edit
// vanished" bug class. Equal or older on disk means the in-memory object is
// authoritative (it is either freshly written or holds unsaved changes).
function storedCopyIsNewer(live: any, stored: any): boolean {
  const storedTime = Number(stored?.save?.lastModified ?? 0)
  const liveTime = Number(live?.SaveController?.LastModified ?? live?.LastModified ?? 0)
  return storedTime > liveTime
}

// Reconcile a stored collection into the live list by ID:
//  - an ID in both keeps the live object unless the stored copy is newer;
//  - an ID only in storage is deserialized and added;
//  - an ID only in memory is dropped, so a deletion made in another window
//    sticks instead of being resurrected from memory.
function mergeByID<T>(
  live: T[],
  stored: any[],
  deserialize: (data: any) => T,
  onError: (err: unknown) => void
): T[] {
  const liveByID = new Map<string, T>()
  for (const item of live) {
    const id = idOf(item)
    if (id) liveByID.set(id, item)
  }

  const merged: T[] = []
  for (const data of stored) {
    const id = idOf(data)
    const current = id ? liveByID.get(id) : undefined
    if (current && !storedCopyIsNewer(current, data)) {
      merged.push(current)
      continue
    }
    try {
      merged.push(deserialize(data))
    } catch (err) {
      onError(err)
    }
  }
  return merged
}

/**
 * Desserializa o ator de uma ficha sincronizada pela SALA, pelo tipo declarado nela.
 *
 * Importa as classes por `await import` de propósito: o store é carregado no boot de
 * qualquer janela e as classes de piloto/NPC arrastam meio domínio.
 */
async function deserializeSyncedActor(sheet: any): Promise<any | null> {
  try {
    if (sheet?.characterType === 'npc') {
      const data = sheet.data
      if (data?.npcType === 'doodad') {
        return (await import('@/classes/npc/doodad/Doodad')).Doodad.Deserialize(data)
      }
      if (data?.npcType === 'eidolon') {
        return (await import('@/classes/npc/eidolon/Eidolon')).Eidolon.Deserialize(data)
      }
      return (await import('@/classes/npc/unit/Unit')).Unit.Deserialize(data)
    }

    const { Pilot } = await import('@/classes/pilot/Pilot')
    const { applySerializedCurrentStats } = await import('@/services/sheetSyncPaths')
    const pilot = Pilot.Deserialize(sheet.data)
    if (pilot && !pilot.ActiveMech && pilot.Mechs?.length) pilot.ActiveMech = pilot.Mechs[0]
    // `SetStats()` recalcula os máximos e zera o corrente: reaplica o estado da sala.
    pilot?.SetStats?.()
    pilot?.ActiveMech?.SetStats?.()
    applySerializedCurrentStats(pilot, sheet.data)
    return pilot
  } catch (err) {
    console.warn('[EncounterStore] Falha ao desserializar ficha da sala:', err)
    return null
  }
}

/**
 * Identidade de um combatente para deduplicação/busca.
 *
 * O mesmo integrante pode aparecer com o id do container (`c.id`), com o id do ator
 * (`actor.ID`) ou com o piloto de origem (`PilotInstance.OriginId`) — comparar só um deles
 * deixava a reconciliação passar por cima e o combatente entrava duas vezes.
 */
function combatantKeys(c: any): string[] {
  const raw = [c?.id, c?.actor?.ID, c?.actor?.id, c?.actor?.OriginId, c?.actor?.originId]
  return raw
    .filter((v: any) => typeof v === 'string' && v.length > 0)
    .map((v: string) => v.toLowerCase())
}

/** Todos os valores de identidade de um combatente, normalizados. */
function combatantIdentity(c: any): string {
  return combatantKeys(c)[0] ?? ''
}

/** Remove combatentes repetidos (mesma identidade), preservando a ordem da lista. */
function dedupeCombatants(combatants: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const c of combatants ?? []) {
    const keys = combatantKeys(c)
    if (keys.length && keys.some(k => seen.has(k))) continue
    keys.forEach(k => seen.add(k))
    out.push(c)
  }
  return out
}

/** Procura um combatente por qualquer uma das identidades dele (case-insensitive). */
function findCombatant(combatants: any[], id: string, type?: string): any | null {
  const needle = String(id ?? '').toLowerCase()
  if (!needle) return null
  return (
    (combatants ?? []).find(
      (c: any) =>
        (!type || c?.type === type) &&
        combatantKeys(c).some(key => key === needle)
    ) ?? null
  )
}

export const EncounterStore = defineStore('encounter', {
  state: () => ({
    Encounters: [] as Encounter[],
    ActiveEncounters: [] as EncounterInstance[],
    ArchivedEncounters: [] as EncounterArchive[],
    Folders: [] as string[],
    CurrentActiveID: '' as string,
  }),
  getters: {
    getEncounterByID: state => (id: string) => {
      return state.Encounters.find(x => x.ID === id)
    },
    getAllLabels: state => {
      return _.uniqBy(
        state.Encounters.flatMap((x: any) => x.NarrativeController.Labels),
        'title'
      )
    },
    getFolders: (state): string[] =>
      _.uniq(
        state.Folders.concat(
          state.Encounters.filter(x => !x.SaveController.IsDeleted).flatMap(
            (x: any) => x.FolderController.Folder
          )
        ).filter(x => !!x)
      ) as string[],
    encounterIndexes: (state): IndexItem[] => {
      const encounters = state.Encounters.filter((x: any) => x && !x.SaveController.IsDeleted)
      return encounters.map((x: any) => ({
        id: x.ID,
        title: x.Name,
        type: 'Encounter',
        pack: '',
        path: `/gm/encounters/${x.ID}`,
        icon: x.Icon || 'cc:encounter',
      }))
    },
  },
  actions: {
    getActiveEncounter(id: string): EncounterInstance | undefined {
      const found = this.ActiveEncounters.find(
        (x: any) => x?.ID === id || x?._id === id || x?.id === id
      ) as EncounterInstance | undefined
      if (found && this.CurrentActiveID === id && found.IsActive === false) {
        found.IsActive = true
      }
      return found
    },
    async ensureContinuousEncounter(): Promise<EncounterInstance> {
      let active = this.getActiveEncounter(this.CurrentActiveID)
      if (!active) {
        if (this.ActiveEncounters.length > 0) {
          active = this.ActiveEncounters[0] as unknown as EncounterInstance
        } else {
          const defaultEncounter = new Encounter()
          defaultEncounter.Name = 'Operação em Andamento'
          active = new EncounterInstance(undefined, defaultEncounter, [])
          // O construtor da instância batiza com o nome genérico (`classes.newEncounter`):
          // sem isto o encontro contínuo se chamava "Novo Encontro" na interface.
          active.Name = defaultEncounter.Name
          active.IsActive = true
          this.ActiveEncounters.push(active as any)
          await SetItem('active_encounters', toRaw(active).Serialize())
        }
        this.CurrentActiveID = active.ID
        await SetValue('current_active_encounter_id', active.ID)
        this.notifyEncounterChange()
      }

      // Saneamento: um salvamento anterior pode ter deixado o mesmo combatente duas vezes
      // (o card aparecia duplicado na lista depois de recarregar a janela).
      const deduped = dedupeCombatants(active.Combatants)
      if (deduped.length !== (active.Combatants?.length ?? 0)) {
        active.Combatants = deduped
        await active.Save()
        this.notifyEncounterChange()
      }

      return active
    },
    async reconcilePilotCombatant(pilotId: string, pilotData: any): Promise<CombatantData> {
      const enc = await this.ensureContinuousEncounter()
      const existing = findCombatant(enc.Combatants, pilotId, 'pilot')
      
      const { Pilot } = await import('@/classes/pilot/Pilot')
      const pc = Pilot.Deserialize(pilotData)
      pc.SetStats()
      pc.FeatureController.BonusController.applyToStats(
        pc.CombatController.StatController,
        enc
      )

      if (existing) {
        // Se já existia (ex: adicionado previamente pelo Mestre pelo tracker),
        // atualizamos o ator com a ficha mais recente vinda do jogador,
        // preservando o vínculo com o estado atual do painel do jogador.
        pc.CombatController.StatController.resetCurrentStats()
        // Transfere estado vivo de dano/calor (se houver e for válido) do ator anterior
        if (existing.actor?.CombatController?.StatController) {
          const { StatKey } = await import('@/classes/components/combat/stats/Stats')
          const oldStats = existing.actor.CombatController.StatController
          const newStats = pc.CombatController.StatController
          newStats.setCurrentStat(StatKey.HP, oldStats.getCurrent(StatKey.HP))
          newStats.setCurrentStat(StatKey.HEATCAP, oldStats.getCurrent(StatKey.HEATCAP))
          newStats.setCurrentStat(StatKey.STRUCTURE, oldStats.getCurrent(StatKey.STRUCTURE))
          newStats.setCurrentStat(StatKey.STRESS, oldStats.getCurrent(StatKey.STRESS))
          newStats.setCurrentStat(StatKey.OVERSHIELD, oldStats.getCurrent(StatKey.OVERSHIELD))
        }
        existing.actor = pc
        existing.side = 'ally'
        await enc.Save()
        this.notifyEncounterChange()
        return existing
      }

      pc.CombatController.ResetForEncounter()

      const combatant = makeCombatant(pc, 'pilot', {
        id: pc.ID,
        index: -1,
        number: -1,
        side: 'ally',
      })
      enc.Combatants.push(combatant)
      await enc.Save()
      this.notifyEncounterChange()
      return combatant
    },
    /**
     * Troca o encontro local pelo combate publicado na SALA (snapshot do tracker).
     *
     * Reconstrói a lista de combatentes a partir dos cards + das fichas sincronizadas, e
     * a rodada do snapshot. É uma SUBSTITUIÇÃO, não uma mescla: o que está na sala é a
     * fonte da verdade da mesa, então combatentes locais que não estão no snapshot saem
     * (senão o Mestre ficaria com uma mistura de duas iniciativas). Cards cuja ficha não
     * chegou nesta janela são avisados e ficam de fora — nenhum combatente é inventado.
     */
    async adoptRoomEncounter(
      snapshot: any,
      sheets: Record<string, any> = {}
    ): Promise<EncounterInstance | null> {
      const cards: any[] = Array.isArray(snapshot?.cards) ? snapshot.cards : []
      if (!cards.length) return null

      const enc = await this.ensureContinuousEncounter()
      const sheetList = Object.values(sheets || {})
      const rebuilt: CombatantData[] = []
      const missing: string[] = []

      for (const card of cards) {
        const id = card?.id
        if (!id) continue
        // O snapshot pode trazer o mesmo integrante em dois cards (salvamento anterior
        // duplicado): o combatente entra uma vez só.
        if (findCombatant(rebuilt, id)) continue

        const sheet: any =
          sheets?.[id] ?? sheetList.find((s: any) => s?.data?.id === id || s?.data?.ID === id)
        if (!sheet?.data) {
          missing.push(id)
          continue
        }

        const actor = await deserializeSyncedActor(sheet)
        if (!actor) {
          missing.push(id)
          continue
        }

        const kind = sheet.characterType === 'npc' ? (actor as any).npcType || 'unit' : 'pilot'
        const combatant = makeCombatant(actor, kind as any, {
          id: actor.ID,
          index: Number.isFinite(card.index) ? Number(card.index) : -1,
          number: Number.isFinite(card.number) ? Number(card.number) : -1,
          side: card.side || 'ally',
        })

        if (card.activations) {
          actor.CombatController?.StatController?.setCurrentStat?.(
            'activations',
            Number(card.activations.current) || 0,
            { silent: true }
          )
        }

        // O mesmo ator pode ser referenciado por dois cards (ids diferentes, mesmo ator).
        if (findCombatant(rebuilt, actor.ID)) continue

        rebuilt.push(combatant)
      }

      if (!rebuilt.length) {
        console.warn(
          `[EncounterStore] Nenhuma ficha da sala pôde ser materializada (${missing.length} card(s) sem dado); o encontro local foi mantido.`
        )
        return null
      }

      if (missing.length) {
        console.warn(
          `[EncounterStore] Combatentes sem ficha sincronizada ficaram fora do encontro: ${missing.join(', ')}`
        )
      }

      enc.Combatants = dedupeCombatants(rebuilt)
      if (Number.isFinite(snapshot?.round)) enc.Round = Math.max(1, Number(snapshot.round))

      await enc.Save()
      this.notifyEncounterChange()
      return enc
    },
    async updateContinuousEncounterWithTemplate(template: Encounter): Promise<void> {
      const enc = await this.ensureContinuousEncounter()
      enc.Name = template.Name
      enc.Encounter = template

      // Preserva combatentes aliados (PCs já conectados à mesa)
      const existingPCs = enc.Combatants.filter((c: any) => c.type === 'pilot')

      // Mapeia novos combatentes do template
      const templateNpcs = template.Combatants.map(c =>
        Encounter.DeserializeCombatant(Encounter.SerializeCombatant(c))
      )

      enc.Combatants = [...existingPCs, ...templateNpcs]
      await enc.Save()
      this.notifyEncounterChange()
    },
    async LoadEncounters(): Promise<void> {
      const all = await GetAll('encounters')
      this.Encounters = mergeByID(
        this.Encounters,
        all,
        x => Encounter.Deserialize(x as IEncounterData),
        err => logger.error('Failed to deserialize encounter, skipping', this, err)
      )
      await this.LoadActiveEncounters()
      await this.LoadArchivedEncounters()
    },

    // Local mutations update this store in place. Em arquitetura de janela única,
    // não há outro iframe concorrente para sincronizar localmente.
    notifyEncounterChange(): void {
      // Store Pinia compartilhado em memória
    },

    async LoadActiveEncounters(): Promise<void> {
      const all = await GetAll('active_encounters')
      this.ActiveEncounters = mergeByID(
        this.ActiveEncounters,
        all,
        x => EncounterInstance.Deserialize(x),
        err => logger.error('Failed to deserialize active encounter, skipping', this, err)
      )
      await this.LoadActiveEncounterID()
    },

    async LoadArchivedEncounters(): Promise<void> {
      const all = await GetAll('encounter_archives')
      this.ArchivedEncounters = mergeByID(
        this.ArchivedEncounters,
        all,
        x => EncounterArchive.Deserialize(x),
        err => logger.error('Failed to deserialize encounter archive, skipping', this, err)
      )
    },

    async LoadActiveEncounterID(): Promise<void> {
      const id = await GetValue('current_active_encounter_id')
      if (id) this.CurrentActiveID = id
    },

    AddFolder(payload: string): void {
      useFolderManagement(this.Encounters, this.Folders).AddFolder(payload)
    },

    EditFolder(payload: { old: string; newName: string }): void {
      useFolderManagement(this.Encounters, this.Folders).EditFolder(payload)
    },

    RemoveFolder(payload: string): void {
      useFolderManagement(this.Encounters, this.Folders).RemoveFolder(payload)
    },

    async AddEncounter(payload: Encounter): Promise<void> {
      if (this.Encounters.some(x => x.ID === payload.ID)) {
        logger.warn(`Encounter with ID ${payload.ID} already exists, updating instead.`, this)
        await this.SetEncounter(
          this.Encounters.findIndex(x => x.ID === payload.ID),
          payload
        )
        return
      }

      this.Encounters.push(payload)
      NavStore().updateEncounterEntry(payload)
      await SetItem('encounters', payload.Serialize())
      this.notifyEncounterChange()
    },

    async SetEncounter(index: number, payload: Encounter): Promise<void> {
      if (!this.Encounters[index]) return
      this.Encounters.splice(index, 1, payload)
      NavStore().updateEncounterEntry(payload)
      await SetItem('encounters', payload.Serialize())
      this.notifyEncounterChange()
    },

    async AddEncounterInstance(payload: EncounterInstance): Promise<void> {
      const idx = this.ActiveEncounters.findIndex(x => x.ID === payload.ID)
      if (idx !== -1) {
        logger.warn(
          `EncounterInstance with ID ${payload.ID} already exists, updating instead.`,
          this
        )
        this.ActiveEncounters.splice(idx, 1, payload)
      } else {
        this.ActiveEncounters.push(payload)
      }
      await SetItem('active_encounters', toRaw(payload).Serialize())
      this.notifyEncounterChange()
    },

    ReplaceActiveEncounter(payload: EncounterInstance): void {
      const idx = this.ActiveEncounters.findIndex(x => x.ID === payload.ID)
      if (idx === -1) return
      this.ActiveEncounters.splice(idx, 1, payload)
    },

    async RemoveEncounterInstance(payload: EncounterInstance): Promise<void> {
      payload.Autosave = false
      payload.IsActive = false
      payload.SaveController?.cancel?.()
      this.ActiveEncounters.forEach(x => {
        if (x.ID === payload.ID || (x as any)._id === payload.ID) {
          x.IsActive = false
          x.Autosave = false
          x.SaveController?.cancel?.()
        }
      })
      const id = payload.ID || (payload as any)._id
      const idx = this.ActiveEncounters.findIndex(x => x.ID === id)
      if (idx !== -1) {
        this.ActiveEncounters.splice(idx, 1)
        await RemoveItem('active_encounters', id)
        await this.SaveActiveEncounterData()
        clearUndoStack(id)
      }
      if (this.CurrentActiveID === id || !this.ActiveEncounters.some((x: any) => (x.ID || x.id || x._id) === this.CurrentActiveID)) {
        this.CurrentActiveID = ''
        await SetValue('current_active_encounter_id', '')
      }
      this.notifyEncounterChange()
    },

    async ArchiveEncounterInstance(
      payload: EncounterInstance,
      report: string,
      result: string
    ): Promise<void> {
      const archive = EncounterArchive.FromInstance(payload, report, result)
      await this.AddEncounterArchive(archive)
      await this.RouteArchiveToLogbooks(archive)
      await this.RemoveEncounterInstance(payload)
      if (this.CurrentActiveID === payload.ID) {
        this.CurrentActiveID = ''
        await SetValue('current_active_encounter_id', '')
        try {
          const { tableSyncSocket } = await import('@/services/tableSyncSocket')
          tableSyncSocket.sendEndEncounter({ encounterId: payload.ID, reason: result })
        } catch (e) {
          logger.warn('Failed to sendEndEncounter on archive active encounter: ' + String(e), this)
        }
      }
      this.notifyEncounterChange()
    },

    // the common case is a GM running local-roster pilots, which needs no share code and no import
    // screen: the archive goes straight to each participant's logbook
    async RouteArchiveToLogbooks(archive: EncounterArchive): Promise<void> {
      const pilots = PilotStore()
      const logbooks = PilotStore()
      for (const participant of archive.History.participants) {
        if (participant.type !== 'pilot') continue
        const pilot = pilots.getPilotByID(participant.originId || participant.id)
        if (!pilot) continue
        try {
          await logbooks.RecordStream(archive.StreamFor(participant.id), pilot.ID, participant.id)
        } catch (err) {
          logger.error(`Failed to record encounter log for pilot ${pilot.ID}`, this, err)
        }
      }
    },

    async AddEncounterArchive(payload: EncounterArchive): Promise<void> {
      const idx = this.ArchivedEncounters.findIndex(x => x.ID === payload.ID)
      if (idx !== -1) {
        logger.warn(
          `EncounterArchive with ID ${payload.ID} already exists, updating instead.`,
          this
        )
        this.ArchivedEncounters.splice(idx, 1, payload)
      } else {
        this.ArchivedEncounters.push(payload)
      }
      await SetItem('encounter_archives', payload.Serialize())
    },

    async RemoveEncounterArchive(payload: EncounterArchive): Promise<void> {
      const id = payload.ID || (payload as any)._id
      const idx = this.ArchivedEncounters.findIndex(x => x.ID === id)
      if (idx !== -1) {
        this.ArchivedEncounters.splice(idx, 1)
        await RemoveItem('encounter_archives', id)
      }
    },

    async SetActiveEncounter(id: string): Promise<void> {
      this.CurrentActiveID = id
      await SetValue('current_active_encounter_id', id)
      const enc = this.ActiveEncounters.find(x => (x.ID || (x as any).id || (x as any)._id) === id)
      if (enc) {
        enc.IsActive = true
      }
      this.notifyEncounterChange()
    },

    async AssignActiveEncounter(payload: EncounterInstance): Promise<void> {
      this.CurrentActiveID = payload.ID
      payload.IsActive = true
      await SetValue('current_active_encounter_id', payload.ID)
      this.notifyEncounterChange()
    },

    async CloneEncounter(payload: Encounter): Promise<void> {
      const clone = toRaw(payload).Clone()
      this.Encounters.push(clone)
      await SetItem('encounters', clone.Serialize())
      this.notifyEncounterChange()
    },

    async DeleteEncounterPermanent(payload: Encounter): Promise<void> {
      const id = payload.ID || (payload as any)._id
      const idx = this.Encounters.findIndex(x => x.ID === id)
      if (idx !== -1) this.Encounters.splice(idx, 1)
      NavStore().removeEncounterEntry(id)
      await RemoveItem('Encounters', id)
      this.SaveEncounterData()
      if (payload.CloudController.ShareCode) {
        await CloudController.MarkCloudDeleted(payload.CloudController.Metadata)
      }
      this.notifyEncounterChange()
    },

    async SaveEncounterData(): Promise<void> {
      await saveAll('encounters', this.Encounters, y => toRaw(y).Serialize(), 'Encounter data')
      this.notifyEncounterChange()
    },

    async SaveActiveEncounterData(): Promise<void> {
      await saveAll(
        'active_encounters',
        this.ActiveEncounters,
        y => toRaw(y).Serialize(),
        'Active Encounter data'
      )
      this.notifyEncounterChange()
    },
  },
})
