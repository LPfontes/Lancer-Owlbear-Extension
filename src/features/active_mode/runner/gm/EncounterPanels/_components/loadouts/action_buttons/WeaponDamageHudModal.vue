<template>
  <cc-dialog
    v-model="dialogOpen"
    :title="damageTitle"
    icon="mdi-fire"
    color="error"
    max-width="860px"
    :close-on-click="false"
  >
    <template #activator="{ open }">
      <v-btn
        block
        flat
        tile
        size="x-small"
        height="28"
        class="bg-action--full font-weight-bold"
        @click="openModal(open)"
      >
        <span class="ml-1 d-flex align-center ga-1">
          <v-icon
            icon="mdi-hexagon-slice-6"
            start
            size="18"
          />
          <span>{{ $t('hud.damage') }}</span>
        </span>
      </v-btn>
    </template>

    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Weapon Header & Mini Profile -->
        <div class="mini-weapon-profile d-flex align-center flex-wrap ga-2 px-3 py-2 mb-3">
          <div class="d-flex align-center ga-1 font-weight-bold">
            <v-icon
              icon="cc:weapon"
              size="20"
              class="text-error mr-1"
            />
            <span class="text-subtitle-1">{{ weaponName }}</span>
          </div>
          <span class="text-disabled">//</span>
          <div class="d-flex align-center ga-1 text-caption text-disabled">
            <v-icon
              icon="cc:range"
              size="16"
            />
            <span>{{ rangeString }}</span>
          </div>
          <span class="text-disabled">//</span>
          <div class="d-flex align-center ga-1 text-caption text-accent">
            <v-icon
              icon="mdi-flash"
              size="16"
            />
            <span>{{ damageSummaryString }}</span>
          </div>
        </div>

        <v-row dense>
          <!-- Base & Bonus Damage Sections -->
          <v-col
            cols="12"
            md="7"
          >
            <!-- Dano Base Section -->
            <div class="hud-section mb-3">
              <div class="section-label d-flex align-center justify-space-between">
                <span>{{ $t('hud.baseDamage') }}</span>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  prepend-icon="mdi-plus-thick"
                  :aria-label="$t('hud.addBaseDamageType')"
                  @click="addBaseDamage"
                >
                  {{ $t('common.add') }}
                </v-btn>
              </div>

              <div class="pa-2">
                <div
                  v-for="(bd, idx) in baseDamages"
                  :key="`base-${idx}`"
                  class="d-flex align-center ga-2 mb-2"
                >
                  <v-select
                    v-model="bd.type"
                    :items="damageTypeOptions"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 140px;"
                  />

                  <v-text-field
                    v-model="bd.val"
                    density="compact"
                    variant="outlined"
                    hide-details
                    placeholder="ex: 1d6"
                  />

                  <v-btn
                    v-if="baseDamages.length > 1"
                    icon
                    size="x-small"
                    variant="text"
                    color="error"
                    :title="$t('hud.removeDamageType')"
                    @click="removeBaseDamage(idx)"
                  >
                    <v-icon icon="mdi-trash-can-outline" />
                  </v-btn>
                </div>
              </div>
            </div>

            <!-- Dano Bônus Section -->
            <div class="hud-section mb-3">
              <div class="section-label d-flex align-center justify-space-between">
                <span>{{ $t('hud.bonusDamage') }}</span>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="warning"
                  prepend-icon="mdi-plus-thick"
                  :aria-label="$t('hud.addBonusDamageType')"
                  @click="addBonusDamage"
                >
                  {{ $t('common.add') }}
                </v-btn>
              </div>

              <div class="pa-2">
                <div
                  v-if="!bonusDamages.length"
                  class="text-caption text-disabled text-center py-2"
                >
                  {{ $t('common.none') }}
                </div>
                <div
                  v-for="(bd, idx) in bonusDamages"
                  :key="`bonus-${idx}`"
                  class="d-flex align-center ga-2 mb-2"
                >
                  <v-select
                    v-model="bd.type"
                    :items="damageTypeOptions"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 140px;"
                  />

                  <v-text-field
                    v-model="bd.val"
                    density="compact"
                    variant="outlined"
                    hide-details
                    placeholder="ex: 1d6"
                  />

                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    color="error"
                    :title="$t('hud.removeDamageType')"
                    @click="removeBonusDamage(idx)"
                  >
                    <v-icon icon="mdi-trash-can-outline" />
                  </v-btn>
                </div>
              </div>
            </div>

            <!-- Targeting Section -->
            <div class="hud-section pa-2 mb-3">
              <div class="section-label mb-2">{{ $t('hud.targeting') }}</div>
              <v-select
                v-model="selectedTargetId"
                :items="targetOptions"
                item-title="title"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                :placeholder="$t('hud.selectTarget')"
              />
            </div>
          </v-col>

          <!-- Configuration Column (Checkboxes) -->
          <v-col
            cols="12"
            md="5"
          >
            <div class="hud-section h-100 pa-2">
              <div class="section-label mb-2">{{ $t('hud.configuration') }}</div>

              <div class="config-grid">
                <v-checkbox
                  v-model="config.isCrit"
                  density="compact"
                  hide-details
                  color="exotic"
                  :label="$t('hud.critical')"
                />

                <v-checkbox
                  v-model="config.ap"
                  density="compact"
                  hide-details
                  color="primary"
                  :label="$t('hud.apDesc')"
                />

                <v-checkbox
                  v-model="config.overkill"
                  density="compact"
                  hide-details
                  color="primary"
                  :label="$t('hud.overkill')"
                />

                <v-checkbox
                  v-model="config.paracausal"
                  density="compact"
                  hide-details
                  color="primary"
                  :label="$t('hud.paracausalDesc')"
                  :data-tooltip="$t('hud.paracausalTooltip')"
                />

                <v-checkbox
                  v-model="config.halfDamage"
                  density="compact"
                  hide-details
                  color="warning"
                  :label="$t('hud.halfDamageDesc')"
                  :data-tooltip="$t('hud.halfDamageTooltip')"
                />

                <!-- Confiável (Reliable) -->
                <div class="d-flex align-center ga-2 mt-1">
                  <v-checkbox
                    v-model="config.hasReliable"
                    density="compact"
                    hide-details
                    color="primary"
                    :label="$t('hud.reliableDesc')"
                  />
                  <v-text-field
                    v-if="config.hasReliable"
                    v-model.number="config.reliableVal"
                    type="number"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 70px;"
                  />
                </div>

                <!-- Knockback -->
                <div class="d-flex align-center ga-2 mt-1">
                  <v-checkbox
                    v-model="config.hasKnockback"
                    density="compact"
                    hide-details
                    color="primary"
                    :label="$t('hud.knockback')"
                  />
                  <v-text-field
                    v-if="config.hasKnockback"
                    v-model.number="config.knockbackVal"
                    type="number"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="max-width: 70px;"
                  />
                </div>

                <v-checkbox
                  v-model="config.noBonusDmg"
                  density="compact"
                  hide-details
                  color="error"
                  :label="$t('hud.noBonusDmg')"
                />

                <v-checkbox
                  v-model="config.throttled"
                  density="compact"
                  hide-details
                  color="error"
                  :label="$t('hud.throttledDesc')"
                  :data-tooltip="$t('hud.throttledTooltip')"
                />
              </div>
            </div>
          </v-col>
        </v-row>

        <!-- Damage Roll Result Banner -->
        <v-slide-y-transition>
          <div
            v-if="lastRollResults.length"
            class="roll-result-banner pa-3 mt-3 rounded bg-panel border-sm border-error"
          >
            <div class="d-flex align-center justify-space-between flex-wrap ga-2">
              <div>
                <div class="text-overline text-error font-weight-bold">{{ $t('hud.damageRollResult') }}</div>
                <div class="text-h5 font-weight-black text-white">
                  {{ $t('hud.total') }}: {{ totalRolledDamage }} {{ $t('hud.damage') }}
                  <span
                    v-if="totalOverkillHeat > 0"
                    class="ml-2 text-subtitle-1 text-warning"
                  >
                    {{ $t('hud.overkillHeat', { heat: totalOverkillHeat }) }}
                  </span>
                </div>
                <div class="text-caption text-disabled mt-1">
                  <div
                    v-for="(r, idx) in lastRollResults"
                    :key="`res-${idx}`"
                  >
                    <b>{{ formatDamageTypeLabel(r.type) }}:</b> <span v-html-safe="r.breakdown"></span> = <span class="text-white font-weight-bold">{{ r.total }}</span>
                  </div>
                </div>
              </div>

              <!-- Button to apply directly to target if chosen -->
              <v-btn
                v-if="selectedTargetCombatant"
                color="error"
                variant="elevated"
                prepend-icon="mdi-heart-broken"
                size="small"
                @click="applyDamageToTarget"
              >
                {{ $t('hud.applyToTarget') }}
              </v-btn>
            </div>
          </div>
        </v-slide-y-transition>

        <!-- Footer Actions -->
        <div class="d-flex align-center justify-end ga-3 mt-4 pt-2 border-t-sm border-panel-border">
          <v-btn
            variant="text"
            prepend-icon="mdi-close"
            @click="close"
          >
            {{ $t('hud.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="elevated"
            prepend-icon="mdi-dice-multiple"
            size="large"
            :loading="isRolling"
            @click="executeDamageRoll"
          >
            {{ $t('hud.roll') }}
          </v-btn>
          <v-btn
            v-if="lastRollResults.length"
            color="success"
            variant="elevated"
            prepend-icon="mdi-check"
            size="large"
            @click="close"
          >
            {{ $t('hud.finish') }}
          </v-btn>
        </div>
      </div>
    </template>
  </cc-dialog>
</template>

<script setup lang="ts">
  import { ref, computed, reactive } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { DiceRoller, DamageRollResult, DieSet } from '@/classes/dice/DiceRoller'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { useEncounterContext } from '../../../encounterContext'
  import type { CombatController } from '@/classes/components/combat/CombatController'
  import { MechWeapon } from '@/classes/mech/components/equipment/MechWeapon'
  import { NpcWeapon } from '@/classes/npc/feature/NpcItem/NpcWeapon'
  import { PilotWeapon } from '@/classes/pilot/components/Loadout/equipment/PilotWeapon'
  import type { CombatantData } from '@/classes/encounter/Encounter'
  import { enumLabel } from '@/i18n/enumLabel'

  const { t } = useI18n()

  const props = defineProps<{
    item: MechWeapon | NpcWeapon | PilotWeapon | any
    controller: CombatController
  }>()

  const { owner, encounterInstance } = useEncounterContext()

  const dialogOpen = ref(false)
  const isRolling = ref(false)

  interface DamageRow {
    type: string
    val: string
  }

  const baseDamages = ref<DamageRow[]>([])
  const bonusDamages = ref<DamageRow[]>([])

  const config = reactive({
    isCrit: false,
    ap: false,
    overkill: false,
    paracausal: false,
    halfDamage: false,
    hasReliable: false,
    reliableVal: 2,
    hasKnockback: false,
    knockbackVal: 1,
    noBonusDmg: false,
    throttled: false,
  })

  const selectedTargetId = ref<string | null>(null)

  interface DamageResultItem {
    type: string
    total: number
    breakdown: string
    heat: number
  }
  const lastRollResults = ref<DamageResultItem[]>([])

  const damageTypeOptions = computed(() => [
    { title: enumLabel('damageType', 'Kinetic'), value: 'Kinetic' },
    { title: enumLabel('damageType', 'Energy'), value: 'Energy' },
    { title: enumLabel('damageType', 'Explosive'), value: 'Explosive' },
    { title: enumLabel('damageType', 'Heat'), value: 'Heat' },
    { title: enumLabel('damageType', 'Burn'), value: 'Burn' },
    { title: enumLabel('damageType', 'Variable'), value: 'Variable' },
  ])

  function formatDamageTypeLabel(rawType: string): string {
    if (rawType.endsWith(' (Bônus)')) {
      const base = rawType.replace(' (Bônus)', '')
      return `${enumLabel('damageType', base)} (Bônus)`
    }
    return enumLabel('damageType', rawType)
  }

  const weaponName = computed(() => props.item?.Name || 'Arma')
  const damageTitle = computed(() => t('hud.damageTitle', { name: weaponName.value }))

  const rangeString = computed(() => {
    if (props.item?.Range && props.item.Range.length) {
      return props.item.Range.map((r: any) => {
        const typeLabel = r.Type ? enumLabel('rangeType', r.Type) : ''
        return `${typeLabel ? typeLabel + ' ' : ''}${r.Value}`
      }).join(', ')
    }
    return `${t('hud.range')} 10`
  })

  const damageSummaryString = computed(() => {
    if (props.item?.Damage && props.item.Damage.length) {
      return props.item.Damage.map((d: any) => {
        const typeLabel = d.Type ? enumLabel('damageType', d.Type) : ''
        return `${typeLabel ? typeLabel + ' ' : ''}${d.Value}`
      }).join(' + ')
    }
    return '1d6'
  })

  const targetOptions = computed(() => {
    const list: Array<{ title: string; value: string }> = []
    if (encounterInstance.value?.Combatants) {
      for (const c of encounterInstance.value.Combatants) {
        if (c.actor?.ID !== owner.value?.actor?.ID) {
          const name = c.actor?.Name || c.Label || 'Alvo'
          const hp = c.actor?.StatController?.CurrentStats?.['hp'] ?? '?'
          const maxHp = c.actor?.StatController?.MaxStats?.['hp'] ?? '?'
          list.push({
            title: `${name} (PV: ${hp}/${maxHp})`,
            value: c.actor?.ID || c.id,
          })
        }
      }
    }
    return list
  })

  const selectedTargetCombatant = computed(() => {
    if (!selectedTargetId.value) return null
    return encounterInstance.value?.Combatants.find(
      (c: CombatantData) => c.actor?.ID === selectedTargetId.value || c.id === selectedTargetId.value
    )
  })

  const totalRolledDamage = computed(() => {
    return lastRollResults.value.reduce((acc, r) => acc + r.total, 0)
  })

  const totalOverkillHeat = computed(() => {
    return lastRollResults.value.reduce((acc, r) => acc + r.heat, 0)
  })

  function addBaseDamage() {
    baseDamages.value.push({ type: 'Kinetic', val: '1d6' })
  }

  function removeBaseDamage(idx: number) {
    baseDamages.value.splice(idx, 1)
  }

  function addBonusDamage() {
    bonusDamages.value.push({ type: 'Kinetic', val: '1d6' })
  }

  function removeBonusDamage(idx: number) {
    bonusDamages.value.splice(idx, 1)
  }

  function openModal(openFn: () => void) {
    // Inicializa danos base da arma
    baseDamages.value = []
    let damageData = props.item?.Damage
    if (typeof damageData === 'function') {
      try { damageData = damageData(1, []) } catch(e) { damageData = [] }
    }
    if (damageData && Array.isArray(damageData) && damageData.length) {
      for (const d of damageData) {
        baseDamages.value.push({
          type: d.Type || 'Kinetic',
          val: String(d.Value || '1d6'),
        })
      }
    } else {
      baseDamages.value.push({ type: 'Kinetic', val: '1d6' })
    }

    bonusDamages.value = []

    // Inicializa configurações baseadas nas tags da arma
    const tags = props.item?.Tags || []
    config.ap = tags.some((t: any) => t.ID === 'tg_ap' || t.Name?.toLowerCase().includes('ap') || t.Name?.toLowerCase().includes('perfurante'))
    config.overkill = tags.some((t: any) => t.ID === 'tg_overkill' || t.Name?.toLowerCase().includes('overkill'))
    config.paracausal = tags.some((t: any) => t.Name?.toLowerCase().includes('paracausal'))

    const reliableTag = tags.find((t: any) => t.ID === 'tg_reliable' || t.Name?.toLowerCase().includes('reliable') || t.Name?.toLowerCase().includes('confiável'))
    if (reliableTag) {
      config.hasReliable = true
      config.reliableVal = Number(reliableTag.Value) || 2
    } else {
      config.hasReliable = false
    }

    const knockbackTag = tags.find((t: any) => t.ID === 'tg_knockback' || t.Name?.toLowerCase().includes('knockback') || t.Name?.toLowerCase().includes('empurrão'))
    if (knockbackTag) {
      config.hasKnockback = true
      config.knockbackVal = Number(knockbackTag.Value) || 1
    } else {
      config.hasKnockback = false
    }

    config.halfDamage = false
    config.noBonusDmg = false
    config.throttled = false
    config.isCrit = false

    lastRollResults.value = []
    if (!selectedTargetId.value && targetOptions.value.length) {
      selectedTargetId.value = targetOptions.value[0].value
    }

    openFn()
  }

  async function executeDamageRoll() {
    isRolling.value = true
    lastRollResults.value = []

    const isHalved = config.halfDamage || config.throttled

    try {
      // Se dddice estiver habilitado, tenta rolar os dados no dddice e utilizar os resultados retornados
      if (dddiceService.config.enabled) {
        const diceToRoll: Array<{ type: string }> = []
        let totalFlatBonus = 0
        for (const bd of baseDamages.value) {
          const parsed = DiceRoller.parseDiceString(bd.val.trim())
          if (parsed) {
            if (parsed.modifier) totalFlatBonus += parsed.modifier
            if (parsed.dice.length) {
              for (const ds of parsed.dice) {
                const qty = config.isCrit ? ds.quantity * 2 : ds.quantity
                let sides = ds.type
                if (sides <= 3) sides = 4
                const validTypes = [4, 6, 8, 10, 12, 20, 100]
                if (!validTypes.includes(sides)) sides = 6
                for (let i = 0; i < qty; i++) {
                  diceToRoll.push({ type: `d${sides}` })
                }
              }
            }
          }
        }
        if (!config.noBonusDmg) {
          for (const bd of bonusDamages.value) {
            const parsed = DiceRoller.parseDiceString(bd.val.trim())
            if (parsed) {
              if (parsed.modifier) totalFlatBonus += parsed.modifier
              if (parsed.dice.length) {
                for (const ds of parsed.dice) {
                  const qty = config.isCrit ? ds.quantity * 2 : ds.quantity
                  let sides = ds.type
                  if (sides <= 3) sides = 4
                  const validTypes = [4, 6, 8, 10, 12, 20, 100]
                  if (!validTypes.includes(sides)) sides = 6
                  for (let i = 0; i < qty; i++) {
                    diceToRoll.push({ type: `d${sides}` })
                  }
                }
              }
            }
          }
        }

        if (diceToRoll.length > 0) {
          const rollData = await dddiceService.rollDice({
            dice: diceToRoll,
            flatBonus: totalFlatBonus,
            label: `Dano: ${weaponName.value}`,
          })

          if (rollData && rollData.values && rollData.values.length > 0) {
            const pool = rollData.values.filter((v: any) => v.type?.toLowerCase().startsWith('d'))

            for (const bd of baseDamages.value) {
              const diceStr = bd.val.trim()
              const parsed = DiceRoller.parseDiceString(diceStr)
              let total = 0
              let heat = 0
              let rollRes: any

              if (parsed && parsed.dice.length) {
                const rawRolls: number[] = []
                const rollClass: string[] = []
                let okRerolls = 0
                let subTotal = parsed.modifier

                parsed.dice.forEach(dieSet => {
                  const neededCount = config.isCrit ? dieSet.quantity * 2 : dieSet.quantity
                  const rolls: number[] = []
                  for (let i = 0; i < neededCount; i++) {
                    const targetType = `d${dieSet.type <= 3 ? 6 : dieSet.type}`
                    const dieIdx = pool.findIndex(d => d.type?.toLowerCase() === targetType)
                    let rollVal = 0
                    if (dieIdx !== -1 && typeof pool[dieIdx].value !== 'undefined') {
                      rollVal = Number(pool.splice(dieIdx, 1)[0].value)
                      if (dieSet.type <= 3) {
                        rollVal = Math.ceil(rollVal / 2)
                      }
                    } else if (pool.length > 0 && typeof pool[0].value !== 'undefined') {
                      rollVal = Number(pool.shift()!.value)
                      if (dieSet.type <= 3) {
                        rollVal = Math.ceil(rollVal / 2)
                      }
                    } else {
                      rollVal = DiceRoller.rollDie(dieSet.type)
                    }
                    rolls.push(rollVal)
                  }

                  if (config.overkill) {
                    rolls.forEach(r => {
                      if (r === 1) okRerolls++
                    })
                  }

                  rawRolls.push(...rolls)
                  const keptSet = config.isCrit ? new DieSet(dieSet.quantity, dieSet.type) : dieSet
                  const cls = DiceRoller.classifyDamageRolls(keptSet, rolls, config.overkill)
                  rollClass.push(...cls)

                  rolls.forEach((r, idx) => {
                    if (cls[idx] !== 'low') subTotal += r
                  })
                })

                if (config.hasReliable && config.reliableVal && subTotal < config.reliableVal) {
                  subTotal = config.reliableVal
                }

                total = subTotal
                heat = okRerolls
                rollRes = new DamageRollResult(
                  diceStr,
                  total,
                  rawRolls,
                  rollClass,
                  parsed.modifier,
                  okRerolls,
                  config.isCrit,
                  false
                )
              } else {
                total = Number(diceStr) || 0
                rollRes = { total, toString: () => total.toString() }
              }

              if (isHalved) {
                total = Math.ceil(total / 2)
              }

              lastRollResults.value.push({
                type: bd.type,
                total,
                breakdown: rollRes.toString(),
                heat,
              })
            }

            if (!config.noBonusDmg) {
              for (const bd of bonusDamages.value) {
                const diceStr = bd.val.trim()
                const parsed = DiceRoller.parseDiceString(diceStr)
                let total = 0
                let rollRes: any

                if (parsed && parsed.dice.length) {
                  const rawRolls: number[] = []
                  const rollClass: string[] = []
                  let okRerolls = 0
                  let subTotal = parsed.modifier

                  parsed.dice.forEach(dieSet => {
                    const neededCount = config.isCrit ? dieSet.quantity * 2 : dieSet.quantity
                    const rolls: number[] = []
                    for (let i = 0; i < neededCount; i++) {
                      const targetType = `d${dieSet.type <= 3 ? 6 : dieSet.type}`
                      const dieIdx = pool.findIndex(d => d.type?.toLowerCase() === targetType)
                      let rollVal = 0
                      if (dieIdx !== -1 && typeof pool[dieIdx].value !== 'undefined') {
                        rollVal = Number(pool.splice(dieIdx, 1)[0].value)
                        if (dieSet.type <= 3) {
                          rollVal = Math.ceil(rollVal / 2)
                        }
                      } else if (pool.length > 0 && typeof pool[0].value !== 'undefined') {
                        rollVal = Number(pool.shift()!.value)
                        if (dieSet.type <= 3) {
                          rollVal = Math.ceil(rollVal / 2)
                        }
                      } else {
                        rollVal = DiceRoller.rollDie(dieSet.type)
                      }
                      rolls.push(rollVal)
                    }

                    if (config.overkill) {
                      rolls.forEach(r => {
                        if (r === 1) okRerolls++
                      })
                    }

                    rawRolls.push(...rolls)
                    const keptSet = config.isCrit ? new DieSet(dieSet.quantity, dieSet.type) : dieSet
                    const cls = DiceRoller.classifyDamageRolls(keptSet, rolls, config.overkill)
                    rollClass.push(...cls)

                    rolls.forEach((r, idx) => {
                      if (cls[idx] !== 'low') subTotal += r
                    })
                  })

                  total = subTotal
                  rollRes = new DamageRollResult(
                    diceStr,
                    total,
                    rawRolls,
                    rollClass,
                    parsed.modifier,
                    okRerolls,
                    config.isCrit,
                    false
                  )
                } else {
                  total = Number(diceStr) || 0
                  rollRes = { total, toString: () => total.toString() }
                }

                if (isHalved) {
                  total = Math.ceil(total / 2)
                }

                lastRollResults.value.push({
                  type: `${bd.type} (Bônus)`,
                  total,
                  breakdown: rollRes.toString(),
                  heat: 0,
                })
              }
            }
          }
        }
      }

      if (lastRollResults.value.length === 0) {
        // Fallback local se dddice desabilitado ou indisponível
        const allDiceStrings: string[] = []

        // 1. Rola Dano Base
        for (const bd of baseDamages.value) {
          const diceStr = bd.val.trim()
          let rollRes: any
          let total = 0
          let heat = 0

          if (diceStr.includes('d')) {
            allDiceStrings.push(diceStr)
            rollRes = DiceRoller.rollDamage(
              diceStr,
              config.isCrit,
              config.overkill,
              config.hasReliable ? config.reliableVal : undefined
            )
            total = rollRes.total
            heat = rollRes.overkillHeat || rollRes.overkillRerolls || 0
          } else {
            total = Number(diceStr) || 0
            rollRes = { total, toString: () => total.toString() }
          }

          if (isHalved) {
            total = Math.ceil(total / 2)
          }

          lastRollResults.value.push({
            type: bd.type,
            total,
            breakdown: rollRes.toString(),
            heat,
          })
        }

        // 2. Rola Dano Bônus (se não estiver bloqueado por noBonusDmg)
        if (!config.noBonusDmg) {
          for (const bd of bonusDamages.value) {
            const diceStr = bd.val.trim()
            let rollRes: any
            let total = 0

            if (diceStr.includes('d')) {
              allDiceStrings.push(diceStr)
              rollRes = DiceRoller.rollDamage(diceStr, config.isCrit, config.overkill)
              total = rollRes.total
            } else {
              total = Number(diceStr) || 0
              rollRes = { total, toString: () => total.toString() }
            }

            if (isHalved) {
              total = Math.ceil(total / 2)
            }

            lastRollResults.value.push({
              type: `${bd.type} (Bônus)`,
              total,
              breakdown: rollRes.toString(),
              heat: 0,
            })
          }
        }
      }

      if (lastRollResults.value.length > 0) {
        const grandTotal = lastRollResults.value.reduce((acc, r) => acc + (Number(r.total) || 0), 0)
        const detailStr = lastRollResults.value
          .map(r => `${r.total} ${formatDamageTypeLabel(r.type)}${r.breakdown ? ` (${r.breakdown})` : ''}`)
          .join(' + ')
        const formulaStr = [...baseDamages.value, ...(config.noBonusDmg ? [] : bonusDamages.value)]
          .map(b => `${b.val} ${enumLabel('damageType', b.type)}`)
          .join(' + ')

        const tags: string[] = [weaponName.value]
        if (config.isCrit) tags.push('CRÍTICO')
        if (config.ap) tags.push('AP')
        if (config.overkill) tags.push('OVERKILL')
        if (config.paracausal) tags.push('PARACAUSAL')
        if (config.halfDamage) tags.push('METADE')

        const actorName =
          props.controller?.RootActor?.CombatName ||
          props.controller?.RootActor?.Name ||
          (owner.value?.actor as any)?.Callsign ||
          (owner.value?.actor as any)?.Name ||
          'Piloto'

        const targetName =
          (selectedTargetCombatant.value?.actor as any)?.CombatName ||
          (selectedTargetCombatant.value?.actor as any)?.Name ||
          undefined

        void useTableActionStore().postAction({
          senderName: actorName,
          category: 'damage',
          title: `Dano: ${weaponName.value}`,
          detail: detailStr,
          targetName,
          roll: {
            total: grandTotal,
            formula: formulaStr,
            isCrit: config.isCrit,
          },
          tags,
        })
      }
    } finally {
      isRolling.value = false
    }
  }

  function applyDamageToTarget() {
    if (!selectedTargetCombatant.value) return
    const targetCc = selectedTargetCombatant.value.actor?.CombatController
    if (!targetCc) return

    for (const res of lastRollResults.value) {
      if (res.total <= 0) continue
      const type = res.type.replace(/\s*\(Bônus\)/, '') as any
      if (type === 'Heat') {
        targetCc.DamageController?.ApplyHeat(res.total)
      } else {
        targetCc.DamageController?.ApplyDamage(type, res.total, config.ap || config.paracausal)
      }
    }

    const actorName =
      props.controller?.RootActor?.CombatName ||
      props.controller?.RootActor?.Name ||
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      'Piloto'
    const targetName =
      (selectedTargetCombatant.value?.actor as any)?.CombatName ||
      (selectedTargetCombatant.value?.actor as any)?.Name ||
      'Alvo'
    const grandTotal = lastRollResults.value.reduce((acc, r) => acc + (Number(r.total) || 0), 0)

    void useTableActionStore().postAction({
      senderName: actorName,
      category: 'status',
      title: `Aplicou Dano a ${targetName}`,
      detail: `Aplicou ${grandTotal} de dano (${lastRollResults.value.map(r => `${r.total} ${r.type}`).join(', ')})`,
      targetName,
      tags: [weaponName.value],
    })
  }
</script>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
  .mini-weapon-profile {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .hud-section {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
  }
  .section-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
  }
  .config-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
