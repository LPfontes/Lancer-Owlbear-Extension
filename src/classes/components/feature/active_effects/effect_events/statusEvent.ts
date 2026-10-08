import { Status } from '@/classes/Status'
import { EffectDurationText, EffectDuration } from '../effect_subtype/EffectDuration'
import { EffectStatus } from '../effect_subtype/EffectStatus'

// status, condition, special, or resist
class StatusEvent {
  public Status: Status
  public Duration?: string
  public RawDuration?: string

  constructor(es: EffectStatus) {
    this.Status = es.Status
    this.RawDuration = es.Duration
    if (es.Duration) this.Duration = EffectDurationText(es.Duration as EffectDuration)
  }

  public ToJSON() {
    return {
      StatusName: this.Status.Name,
      Duration: this.Duration,
      RawDuration: this.RawDuration,
    }
  }
}

export { StatusEvent }

