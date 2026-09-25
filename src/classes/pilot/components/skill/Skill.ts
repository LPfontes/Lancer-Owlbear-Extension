import { CompendiumStore } from '../../../../stores'
import { CompendiumItem, ICompendiumItemData } from '../../../CompendiumItem'
import { ContentPack } from '../../../ContentPack'
import { SkillFamily, ItemType } from '../../../enums'
import { localize } from '@/i18n/localize'

interface ISkillData extends ICompendiumItemData {
  detail: string
  family: string
}

class Skill extends CompendiumItem {
  private _detail: string = ''
  public readonly Family: SkillFamily

  public constructor(data: ISkillData, pack?: ContentPack) {
    super(data, pack)

    this._detail = data.detail || ''
    this.Family = SkillFamily[data.family as keyof typeof SkillFamily] as SkillFamily
    this.ItemType = ItemType.Skill
  }

  public get Detail(): string {
    return localize(this.ID, 'detail', this._detail)
  }

  public get Trigger(): string {
    return localize(this.ID, 'name', this._name)
  }

  public override get Color(): string {
    return 'skill'
  }

  public static Deserialize(id: string, data?: ISkillData): Skill {
    if (data) {
      const s = new Skill(data)
      s.FromInstance = true
      return s
    }
    return CompendiumStore().referenceByID('Skills', id) as Skill
  }
}

export { Skill }
export type { ISkillData }
