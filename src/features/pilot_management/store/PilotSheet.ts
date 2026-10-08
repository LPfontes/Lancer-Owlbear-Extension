// container for pilot-as-combatant data
import { Deployable } from '@/classes/components/feature/deployable/Deployable'
import { ItemType } from '@/classes/enums'
import { Mech } from '@/classes/mech/Mech'
import { Pilot } from '@/classes/pilot/Pilot'
import { CombatantData, Encounter } from '@/classes/encounter/Encounter'
import { CloudController, ICloudData } from '@/classes/components/cloud/CloudController'
import { ICloudSyncable } from '@/classes/components/cloud/ICloudSyncable'
import { ISaveable } from '@/classes/components/save/ISaveable'
import { ISaveData, SaveController } from '@/classes/components/save/SaveController'
import { EncounterInstance } from '@/classes/encounter/EncounterInstance'
import { deployToCombatant } from '@/classes/components/feature/deployable/DeployableInstance'
import { buildStream } from '@/classes/components/combat/log/stream'
import { actorRef } from '@/classes/components/combat/log/refs'
import type { ILogStream } from '@/classes/components/combat/log/events'
import { StatKey } from '@/classes/components/combat/stats/Stats'
import { ActivePeriod } from '@/classes/Frequency'

type PilotSheetData = {
  id: string
  combatant: any
  encounter: number
  archived: boolean
  round: number
  save: ISaveData
  cloud: ICloudData
  campaign?: string
  simple_tickbars?: boolean
  force_complex_tickbars?: boolean
  layout_columns?: boolean
  max_masonry_columns?: number
  autosave?: boolean
}

class PilotSheet implements ISaveable, ICloudSyncable {
  public readonly ID: string
  public readonly ItemType: ItemType = ItemType.PilotSheet
  public readonly DataType = 'savedata'
  public readonly StorageType = 'pilot_sheets'
  public Name: string
  public Combatant: CombatantData
  public Campaign?: string
  public Round: number = 1

  public Archived: boolean = false

  public SimpleTickbars: boolean = false
  public ForceComplexTickbars: boolean = false
  public LayoutColumns: boolean = true
  public MaxMasonryColumns: number = 1
  public Autosave: boolean = true

  public SaveController: SaveController
  public CloudController: CloudController
  public RollHistory: string[] = []

  constructor(data: PilotSheetData) {
    this.ID = data.id
    this.Name = data.combatant.actor.name
    this.Campaign = data.campaign
    this.Round = data.round

    this.Archived = data.archived

    this.SimpleTickbars = data.simple_tickbars || false
    this.ForceComplexTickbars = data.force_complex_tickbars || false
    this.LayoutColumns = data.layout_columns ?? true
    this.MaxMasonryColumns = data.max_masonry_columns || 1
    this.Autosave = data.autosave ?? true

    this.Combatant = Encounter.DeserializeCombatant(data.combatant)

    this.SaveController = new SaveController(this)
    SaveController.Deserialize(this, data.save)
    this.CloudController = new CloudController(this)
    CloudController.Deserialize(this, data.cloud)

    this.StampLogContext()
  }

  public get PilotID(): string {
    return this.Combatant.actor.ID
  }

  /**
   * Monta o container de uma ficha a partir de um piloto.
   *
   * `preserveCombatState` existe para a VISÃO de leitura: sem ele o `SetStats()` +
   * `ResetForEncounter()` abaixo zeram PV/calor/estrutura (é o estado inicial de um
   * encontro novo), e quem só quer olhar a ficha veria os máximos em vez do estado real.
   */
  public static FromPilot(
    pilot: Pilot,
    campaign?: string,
    options: { preserveCombatState?: boolean } = {}
  ) {
    const combatPilot = Pilot.Deserialize(JSON.parse(JSON.stringify(Pilot.Serialize(pilot))))
    if (!options.preserveCombatState) {
      combatPilot.SetStats()
      combatPilot.FeatureController.BonusController.applyToStats(
        combatPilot.CombatController.StatController
      )
      combatPilot.CombatController.ResetForEncounter()
      combatPilot.CombatController.Record('encounter.start', { name: combatPilot.Callsign })
    }
    const data = {
      id: crypto.randomUUID(),
      combatant: {
        id: combatPilot.ID,
        index: -1,
        number: -1,
        side: 'ally',
        type: 'pilot',
        actor: Pilot.Serialize(combatPilot),
        deployables: [],
      },
      campaign: campaign,
      encounter: 1,
      round: 1,
      archived: false,
      save: {
        created: new Date().getTime(),
        lastModified: 0,
        deleteTime: 0,
      },
    } as PilotSheetData

    return new PilotSheet(data)
  }

  public Save() {
    this.SaveController.save()
  }

  public Archive() {
    this.Archived = true
    this.Save()
  }

  public Unarchive() {
    this.Archived = false
    this.Save()
  }

  public get Created(): number {
    return this.SaveController.Created
  }

  public get Updated(): number {
    return this.SaveController.LastModified
  }

  public get Pilot(): Pilot {
    return <Pilot>this.Combatant.actor
  }

  public get Combatants(): CombatantData[] {
    return [this.Combatant]
  }
  public get Encounter(): Encounter {
    return { NarrativeController: { Tables: [] as any[] } } as Encounter
  }

  public SetActiveMech(mech: Mech) {
    this.Pilot.ActiveMech = mech
    this.Save()
  }

  public Deploy(deployable: Deployable, combatant: CombatantData): void {
    deployToCombatant(deployable, combatant)
  }

  public async EndRound(): Promise<void> {
    await this.Combatant.actor.CombatController.EndRound(this)
    await this.Pilot.ActiveMech!.CombatController.EndRound(this, true)

    if (this.Autosave) {
      this.Save()
    }
  }

  /**
   * Encerra o TURNO desta ficha — **sem encontro**.
   *
   * Diferente do `EndRound` acima (que recebe `this` como contexto de mesa), aqui
   * `EndTurn()` vai sem argumento de propósito: o pilot-runner não tem instância de
   * encontro, então não há iniciativa, ordem de lado nem reações de mesa para mexer.
   * O que interessa do turno continua valendo, porque vem do próprio
   * `EndTurnFlow`: burn, checagens pendentes, gasto de ativação, usos de turno e —
   * via `Reset(ActivePeriod.Turn)` — o **movimento de volta ao máximo**.
   */
  public async EndTurn(): Promise<void> {
    const pilotCc = this.Combatant?.actor?.CombatController
    const mechCc = this.Pilot?.ActiveMech?.CombatController

    pilotCc?.EndTurn()
    mechCc?.EndTurn()

    pilotCc?.ResetCombatActions()
    pilotCc?.ClearBoost()
    if (pilotCc) {
      pilotCc.StatController.setCurrentStat(StatKey.SPEED, pilotCc.StatController.getMax(StatKey.SPEED))
      pilotCc.ClearUses(ActivePeriod.Turn)
      pilotCc.ActionPoolController.ClearReactionUses()
      pilotCc.CombatLogVersion++
    }

    mechCc?.ResetCombatActions()
    mechCc?.ClearBoost()
    if (mechCc) {
      mechCc.StatController.setCurrentStat(StatKey.SPEED, mechCc.StatController.getMax(StatKey.SPEED))
      mechCc.ClearUses(ActivePeriod.Turn)
      mechCc.ActionPoolController.ClearReactionUses()
      mechCc.CombatLogVersion++
    }

    if (this.Autosave) {
      this.Save()
    }
  }

  public getTargetsSorted(): CombatantData[] {
    return [this.Combatant]
  }

  public StampLogContext(): void {
    const recorders = [
      this.Combatant?.actor?.CombatController,
      this.Combatant?.actor?.ActiveMech?.CombatController,
    ]
    for (const cc of recorders) {
      if (!cc?.CombatLog) continue
      cc.CombatLog.EncounterId = this.ID
      cc.CombatLog.Source = 'self'
      cc.CombatLog.CampaignId = this.Campaign || undefined
      cc.CombatLog.Side = this.Combatant?.side ?? 'ally'
    }
  }

  public get Stream(): ILogStream {
    const recorders = [
      this.Combatant?.actor?.CombatController,
      this.Combatant?.actor?.ActiveMech?.CombatController,
    ].filter(Boolean)

    return buildStream(
      {
        encounterId: this.ID,
        encounterName: this.Name,
        campaignId: this.Campaign || undefined,
        start: this.Created,
        end: this.Updated,
        rounds: this.Round,
      },
      [actorRef(this.Combatant?.actor?.CombatController, this.Combatant?.side)],
      recorders.flatMap(cc => cc?.CombatLog?.Events ?? []),
      'self'
    )
  }

  // this mocks the encounter instance for the pilot sheet so that we can use the same components for both
  public get EncounterInstance(): EncounterInstance {
    return this as any as EncounterInstance
  }

  public static Serialize(pilotSheet: PilotSheet): any {
    const data = {
      id: pilotSheet.ID,
      combatant: Encounter.SerializeCombatant(pilotSheet.Combatant),
      campaign: pilotSheet.Campaign,
      archived: pilotSheet.Archived,
      simple_tickbars: pilotSheet.SimpleTickbars,
      autosave: pilotSheet.Autosave,
      round: pilotSheet.Round,
      force_complex_tickbars: pilotSheet.ForceComplexTickbars,
      layout_columns: pilotSheet.LayoutColumns,
      max_masonry_columns: pilotSheet.MaxMasonryColumns,
    }

    SaveController.Serialize(pilotSheet, data)
    CloudController.Serialize(pilotSheet, data)

    return data
  }

  public Serialize(): any {
    return PilotSheet.Serialize(this)
  }

  public Clone(): PilotSheet {
    return PilotSheet.Deserialize(structuredClone(PilotSheet.Serialize(this)))
  }

  public static Deserialize(data: any): PilotSheet {
    const pilotSheet = new PilotSheet(data)

    return pilotSheet
  }
}

export default PilotSheet
