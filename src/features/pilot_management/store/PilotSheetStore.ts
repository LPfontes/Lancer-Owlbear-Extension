import { defineStore } from 'pinia'
import { GetAll, RemoveItem, SetItem, SetValue, GetValue } from '@/io/Storage'
import logger from '@/user/logger'
import PilotSheet from './PilotSheet'
import type { Pilot } from '@/classes/pilot/Pilot'

export const PilotSheetStore = defineStore('pilot_sheet', {
  state: () => ({
    PilotSheets: [] as PilotSheet[],
    CurrentActiveID: '' as string,
    /** Já rodamos `LoadPilotSheets()` nesta sessão? */
    SheetsLoaded: false,
  }),
  getters: {
    getPilotSheetByID: state => (id: string) => {
      return state.PilotSheets.find(ps => ps.Combatant.id === id)
    },
    getPilotSheets: state => {
      if (!state.PilotSheets.length) return []
      return state.PilotSheets
    },
  },
  actions: {
    async LoadPilotSheets(): Promise<void> {
      this.PilotSheets = await GetAll('pilot_sheets').then(data =>
        data.map(x => PilotSheet.Deserialize(x))
      )
      await this.LoadSheetId()
      this.SheetsLoaded = true
    },
    async AddPilotSheet(pilot: Pilot, campaign?: string): Promise<void> {
      const newSheet = PilotSheet.FromPilot(pilot, campaign)
      newSheet.Combatant.actor.CombatController.Reset()
      this.PilotSheets.push(newSheet)
      await SetItem('pilot_sheets', PilotSheet.Serialize(newSheet))
      await this.SetActiveSheet(newSheet.ID)
    },
    async ImportPilotSheet(pilotSheet: PilotSheet): Promise<void> {
      const idx = this.PilotSheets.findIndex(x => x.ID === pilotSheet.ID)
      if (idx !== -1) {
        logger.info(`Pilot sheet ${pilotSheet.Name} already exists`)
        this.PilotSheets.splice(idx, 1, pilotSheet)
      } else {
        this.PilotSheets.push(pilotSheet)
      }
      await SetItem('pilot_sheets', PilotSheet.Serialize(pilotSheet))
      await this.SetActiveSheet(pilotSheet.ID)
    },
    async RemovePilotSheet(pilotSheet: PilotSheet): Promise<void> {
      const idx = this.PilotSheets.findIndex(ps => ps.ID === pilotSheet.ID)
      if (idx === -1) return
      this.PilotSheets.splice(idx, 1)
      await RemoveItem('pilot_sheets', pilotSheet.ID)
      if (this.CurrentActiveID === pilotSheet.ID) {
        await this.SetActiveSheet('')
      }
    },
    async SetActiveSheet(id: string): Promise<void> {
      this.CurrentActiveID = id
      await SetValue('current_active_sheet', id)
    },
    async LoadSheetId(): Promise<void> {
      const id = await GetValue('current_active_sheet')
      if (id) this.CurrentActiveID = id
    },
    GetSheet(id: string): PilotSheet | null {
      // Id vazio é um estado normal durante o boot (rota `pilot-runner` sem id,
      // ficha ativa ainda não resolvida), então não é erro.
      if (!id) return null
      const sheet = this.PilotSheets.find((ps: any) => ps.ID === id)
      if (sheet) return sheet as PilotSheet
      // Ainda não carregamos do storage: um "não encontrado" aqui é transitório,
      // não uma ficha perdida.
      if (!this.SheetsLoaded) return null
      logger.error(`No pilot sheet found with ID "${id}" (${this.PilotSheets.length} carregadas)`)
      return null
    },
    GetActiveSheet(): PilotSheet | null {
      const id = this.CurrentActiveID
      if (!id) return null
      const activeSheet = this.PilotSheets.find((ps: any) => ps.ID === id)
      if (activeSheet) return activeSheet as PilotSheet
      if (!this.SheetsLoaded) return null
      logger.error(`No active pilot sheet found with ID "${id}" (${this.PilotSheets.length} carregadas)`)
      return null
    },
    async AssignActiveSheet(payload: PilotSheet): Promise<void> {
      this.CurrentActiveID = payload.ID
      await SetValue('current_active_sheet', payload.ID)
    },
  },
})
