import { i18n } from '@/i18n'
import {
  CloudController,
  ICloudData,
  IPortraitData,
  ISaveData,
  ISaveable,
  PortraitController,
  SaveController,
} from '../components'
import { ISitrepData, SitrepInstance } from './Sitrep'
import { FolderController, IFolderData } from '../components/folder/FolderController'
import { NarrativeController, NarrativeElementData } from '../narrative/NarrativeController'
import { IFolderPlaceable } from '../components/folder/IFolderPlaceable'
import { INarrativeElement } from '../narrative/INarrativeElement'
import { ImageTag } from '@/io/ImageManagement'
import { Environment, EnvironmentInstance, IEnvironmentData } from '../Environment'
import { Npc } from '../npc/Npc'
import { Unit, UnitData } from '../npc/unit/Unit'
import { Doodad, DoodadData } from '../npc/doodad/Doodad'
import { Eidolon, EidolonData } from '../npc/eidolon/Eidolon'
import { ItemType, PilotStatus, NpcStatus, MechStatus } from '../enums'
import { Pilot, PilotData } from '../pilot/Pilot'
import { ICombatant } from '../components/combat/ICombatant'
import {
  DeployableInstance,
  IDeployableInstanceData,
} from '../components/feature/deployable/DeployableInstance'
import { IPlaceholderData, Placeholder } from './Placeholder'

type CombatantType = 'unit' | 'doodad' | 'eidolon' | 'pilot' | 'placeholder'
type CombatantSide = 'enemy' | 'ally' | 'neutral'
type ActorData = UnitData | DoodadData | EidolonData | PilotData | IPlaceholderData

interface IEncounterData {
  itemType: 'Encounter'
  id: string
  name: string
  note?: string
  description?: string
  gmDescription?: string
  save: ISaveData
  cloud?: ICloudData
  folder: IFolderData
  img: IPortraitData
  narrative: NarrativeElementData
  sitrep?: ISitrepData
  environment?: IEnvironmentData
  combatants?: CombatantSaveData[]
}

export type CombatantData = {
  id: string
  index: number
  type: CombatantType
  actor: ICombatant
  number: number
  readonly Label: string
  side: CombatantSide
  deployables: DeployableInstance[]
  playerCount?: number
  reinforcement?: boolean
  reinforcementTurn?: number
  status?: NpcStatus
  pilotStatus?: PilotStatus
  mechStatus?: MechStatus
}

type CombatantSaveData = {
  id?: string
  index: number
  type: CombatantType
  actor: ActorData
  npc?: ActorData
  side?: CombatantSide
  playerCount?: number
  reinforcement?: boolean
  reinforcementTurn?: number
  deployables?: IDeployableInstanceData[]
  number?: number
  status?: NpcStatus
  pilotStatus?: PilotStatus
  mechStatus?: MechStatus
}

const DESERIALIZE_ACTOR: Record<CombatantType, (d: any) => any> = {
  unit: d => Unit.Deserialize(d),
  doodad: d => Doodad.Deserialize(d),
  eidolon: d => Eidolon.Deserialize(d),
  pilot: d => Pilot.Deserialize(d),
  placeholder: d => Placeholder.Deserialize(d),
}

function makeCombatant(
  actor: ICombatant,
  type: CombatantType,
  over: Partial<CombatantData> = {}
): CombatantData {
  return {
    get Label(): string {
      const name = this.actor?.CombatController?.CombatName || ''
      if (!name) return ''
      if (this.type === 'pilot' || this.type === 'placeholder') return name
      return this.number > 0 ? `${name} #${this.number}` : name
    },
    id: actor.ID,
    index: 0,
    type,
    number: 1,
    actor,
    side: 'enemy',
    playerCount: 0,
    reinforcement: false,
    reinforcementTurn: 0,
    deployables: [],
    status: NpcStatus.Operational,
    pilotStatus: PilotStatus.Active,
    mechStatus: MechStatus.Operational,
    ...over,
  }
}

class Encounter implements INarrativeElement, ISaveable, IFolderPlaceable {
  public readonly ItemType: ItemType = ItemType.Encounter
  public readonly DataType: string = 'savedata'
  public readonly StorageType: string = 'encounters'

  private _id: string
  protected _name: string = i18n.global.t('classes.newEncounter')

  private _note: string
  private _description: string
  private _gmDescription: string
  private _sitrep?: SitrepInstance
  private _environment?: EnvironmentInstance

  public ImageTag: ImageTag = ImageTag.Map
  public SaveController: SaveController
  public CloudController: CloudController
  public PortraitController: PortraitController
  public NarrativeController: NarrativeController
  public FolderController: FolderController

  private _combatants: CombatantData[] = []

  public constructor(data?: IEncounterData | any) {
    this._id = data?.ID || data?.id || data?._id || crypto.randomUUID()
    this._name = data?.name || data?._name || ''
    this._note = data?.note || data?._note || ''
    this._description = data?.description || data?._description || ''
    this._gmDescription = data?.gmDescription || data?._gmDescription || ''

    if (data?.sitrep || data?._sitrep) {
      this._sitrep = SitrepInstance.Deserialize(data.sitrep || data._sitrep, this)
    }

    if (data?.environment || data?._environment) {
      const envData = data.environment || data._environment
      this._environment = new EnvironmentInstance(this, new Environment(envData))
    }

    const combatantsList = data?.combatants || data?._combatants
    if (combatantsList && Array.isArray(combatantsList)) {
      this._combatants = combatantsList.map(c => Encounter.DeserializeCombatant(c))
      this.renumber()
    }

    this.SaveController = new SaveController(this)
    this.CloudController = new CloudController(this)

    this.PortraitController = new PortraitController(this)
    this.NarrativeController = new NarrativeController(this)
    this.FolderController = new FolderController(this)
  }

  public save(): void {
    this.SaveController.save()
  }

  public get Created(): number {
    return this.SaveController.Created
  }

  public get Updated(): number {
    return this.SaveController.LastModified
  }

  public get Portrait(): string {
    return this.PortraitController.Portrait
  }

  public get ID(): string {
    return this._id
  }

  public RenewID(): void {
    this._id = crypto.randomUUID()
    this.CloudController.ResetIdentity()
    this.save()
  }

  public get Name(): string {
    if (!this._name) {
      return this.DefaultName
    }
    return this._name
  }

  public get DefaultName(): string {
    return `${this.Environment.Name} - ${this.Sitrep.Name}`
  }

  public set Name(val: string) {
    this._name = val
    this.save()
  }

  public get Note(): string {
    return this._note
  }

  public set Note(val: string) {
    this._note = val
    this.save()
  }

  public get Description(): string {
    return this._description
  }

  public set Description(val: string) {
    this._description = val
    this.save()
  }

  public get GmDescription(): string {
    return this._gmDescription
  }

  public set GmDescription(val: string) {
    this._gmDescription = val
    this.save()
  }

  public get Sitrep(): SitrepInstance {
    if (!this._sitrep) {
      this._sitrep = new SitrepInstance(this)
    }
    return this._sitrep
  }

  public set Sitrep(val: SitrepInstance) {
    this._sitrep = val
    this.save()
  }

  public get Environment(): EnvironmentInstance {
    if (!this._environment) {
      this._environment = new EnvironmentInstance(this)
    }

    return this._environment
  }

  public set Environment(val: EnvironmentInstance) {
    this._environment = val
    this.save()
  }

  public get Combatants(): CombatantData[] {
    return this._combatants
  }

  public set Combatants(val: CombatantData[]) {
    this._combatants = val
  }

  public AddCombatant(npc: Npc): void {
    const type = npc.ItemType.toLowerCase() as CombatantType
    if (type !== 'unit' && type !== 'doodad' && type !== 'eidolon') {
      throw new Error('Invalid combatant type')
    }

    const actor = DESERIALIZE_ACTOR[type](npc.CreateInstance())
    this._combatants.push(makeCombatant(actor, type, { index: this._combatants.length }))
    this.renumber()
    this.save()
  }

  private renumber(): void {
    const counts: Record<string, number> = {}
    this._combatants.forEach(c => {
      counts[c.actor.Name] = (counts[c.actor.Name] || 0) + 1
      c.number = counts[c.actor.Name]
    })
  }

  public RemoveCombatant(index: number): void {
    const removed = this.Combatants[index]
    this.Combatants.splice(index, 1)
    if (removed?.id) {
      this.CloudController.stampTombstone(`combatants.${removed.id}`)
    }
    this.save()
  }

  public ReorderCombatant(fromAbsolute: number, toAbsolute: number): void {
    const item = this._combatants.splice(fromAbsolute, 1)[0]
    this._combatants.splice(toAbsolute, 0, item)
    this.save()
  }

  public static Serialize(enc: any): IEncounterData {
    if (!enc || typeof enc !== 'object') return {} as IEncounterData

    // Only an encounter is serialized as one. Anything else is handed back
    // untouched instead of being coerced into an empty encounter: callers rely
    // on that pass-through for payloads that turn out not to be encounters.
    const isLive = enc.ItemType === ItemType.Encounter
    const isSerialized = enc.itemType === 'Encounter'
    if (!isLive && !isSerialized) return enc as IEncounterData

    // If it is already a serialized plain JSON object with id and save
    if (isSerialized && !enc.SaveController && enc.save && (enc.id || enc.ID)) {
      return enc as IEncounterData
    }

    const combatantsList = enc.Combatants || enc._combatants || []
    const sitrepVal = enc.Sitrep || enc._sitrep
    const envVal = enc.Environment || enc._environment

    const data = {
      itemType: 'Encounter',
      id: enc.ID || enc._id || enc.id || crypto.randomUUID(),
      name: enc.Name || enc._name || (typeof enc.DefaultName === 'string' ? enc.DefaultName : '') || 'Novo Encontro',
      note: enc.Note || enc._note || '',
      description: enc.Description || enc._description || '',
      gmDescription: enc.GmDescription || enc._gmDescription || '',
      sitrep: sitrepVal ? SitrepInstance.Serialize(sitrepVal) : undefined,
      environment: envVal ? EnvironmentInstance.Serialize(envVal) : undefined,
      combatants: combatantsList.map((c: any) => Encounter.SerializeCombatant(c)),
    } as IEncounterData

    if (enc.SaveController) SaveController.Serialize(enc, data)
    else if (enc.save) data.save = enc.save

    if (enc.CloudController) CloudController.Serialize(enc, data)
    else if (enc.cloud) data.cloud = enc.cloud

    if (enc.PortraitController) PortraitController.Serialize(enc, data)
    else if (enc.img) data.img = enc.img

    if (enc.NarrativeController) NarrativeController.Serialize(enc, data)
    else if (enc.narrative) data.narrative = enc.narrative

    if (enc.FolderController) FolderController.Serialize(enc, data)
    else if (enc.folder) data.folder = enc.folder

    return data as IEncounterData
  }

  public static SerializeCombatant(combatant: any): CombatantSaveData {
    const actorData = typeof combatant.actor?.Serialize === 'function'
      ? combatant.actor.Serialize(true)
      : (combatant.actor || combatant.npc || {})

    const deployablesList = combatant.deployables || []

    return {
      id: combatant.id || crypto.randomUUID(),
      index: combatant.index ?? 0,
      type: combatant.type || 'unit',
      actor: actorData,
      side: combatant.side || 'enemy',
      playerCount: combatant.playerCount || 1,
      reinforcement: combatant.reinforcement || false,
      reinforcementTurn: Number(combatant.reinforcementTurn) || 0,
      deployables: deployablesList.map((d: any) =>
        typeof DeployableInstance.Serialize === 'function' ? DeployableInstance.Serialize(d) : d
      ),
      number: combatant.number || 1,
      status: combatant.status || NpcStatus.Operational,
      pilotStatus: combatant.pilotStatus || PilotStatus.Active,
      mechStatus: combatant.mechStatus || MechStatus.Operational,
    }
  }

  public Serialize(): IEncounterData {
    return Encounter.Serialize(this)
  }

  public Clone(): Encounter {
    const clone = Encounter.Deserialize(structuredClone(Encounter.Serialize(this)))
    clone.RenewID()
    return clone
  }

  public static Deserialize(data: IEncounterData | any): Encounter {
    if (!data) return new Encounter()
    if (data instanceof Encounter) return data

    const encounter = new Encounter(data)
    if (data.save) SaveController.Deserialize(encounter, data.save)
    if (data.cloud) CloudController.Deserialize(encounter, data.cloud)
    if (data.img) PortraitController.Deserialize(encounter, data.img)
    if (data.narrative) NarrativeController.Deserialize(encounter, data.narrative)
    if (data.folder) FolderController.Deserialize(encounter, data.folder)

    return encounter
  }

  public static DeserializeCombatant(data: CombatantSaveData | any): CombatantData {
    const deserialize = DESERIALIZE_ACTOR[data.type]
    if (!deserialize) throw new Error('Invalid combatant type')

    const rawActor = data.npc ?? data.actor
    const actor = rawActor?.ItemType || rawActor?.CombatController ? rawActor : deserialize(rawActor)

    const item = makeCombatant(actor, data.type, {
      id: data.id || crypto.randomUUID(),
      index: data.index ?? 0,
      number: data.number || 1,
      side: (data.side?.toLowerCase() as CombatantSide) || 'enemy',
      playerCount: data.playerCount || 1,
      reinforcement: data.reinforcement || false,
      reinforcementTurn: Number(data.reinforcementTurn) || 0,
      status: data.status || NpcStatus.Operational,
      pilotStatus: data.pilotStatus || PilotStatus.Active,
      mechStatus: data.mechStatus || MechStatus.Operational,
    })

    if (data.deployables && Array.isArray(data.deployables))
      item.deployables = data.deployables.map((d: any) => DeployableInstance.Deserialize(d, item))

    return item
  }
}

const ACTIVE_STATUSES = new Set<string>([
  NpcStatus.Operational,
  PilotStatus.Active,
  PilotStatus.Injured,
  MechStatus.Operational,
  MechStatus.Cascade,
])

// null == still in combat; otherwise the out-of-combat group key (a status label).
// A destroyed or reactor-melted actor (both zero structure => IsDestroyed) groups as Destroyed.
function statusGroupKey(c: CombatantData): string | null {
  const cc = c.actor.CombatController
  const isPilot = c.actor.ItemType === 'Pilot'
  if (isPilot && cc.IsDead) return PilotStatus.KIA
  if (cc.IsDestroyed) return NpcStatus.Destroyed
  const label = isPilot ? c.pilotStatus : c.status
  if (!label || ACTIVE_STATUSES.has(label)) return null
  return label
}

function isOutOfCombat(c: CombatantData): boolean {
  return statusGroupKey(c) !== null
}

export { Encounter, makeCombatant, statusGroupKey, isOutOfCombat }
export type { IEncounterData, CombatantSaveData, CombatantSide }
