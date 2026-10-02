<template>
  <cc-dialog
    v-model="dialogOpen"
    :title="weaponTitle"
    icon="cc:weapon"
    color="primary"
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
        class="bg-action--quick font-weight-bold"
        @click="openModal(open)"
      >
        <span class="ml-1 d-flex align-center ga-1">
          <v-icon
            icon="mdi-hexagon-slice-3"
            start
            size="18"
          />
          <span>{{ $t('hud.attack') }}</span>
        </span>
      </v-btn>
    </template>

    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Weapon Header & Mini Profile -->
        <div class="mini-weapon-profile d-flex align-center flex-wrap ga-2 px-3 py-2 mb-3">
          <div class="d-flex align-center ga-1 font-weight-bold">
            <v-icon
              :icon="isTechAttack ? 'mdi-cpu-64-bit' : 'cc:weapon'"
              size="20"
              class="text-primary mr-1"
            />
            <span class="text-subtitle-1">{{ weaponName }}</span>
          </div>
          <span class="text-disabled">//</span>
          <div class="d-flex align-center ga-1 text-caption text-disabled">
            <v-icon
              :icon="isTechAttack ? 'mdi-radar' : 'cc:range'"
              size="16"
            />
            <span>{{ rangeString }}</span>
          </div>
          <span class="text-disabled">//</span>
          <div class="d-flex align-center ga-1 text-caption text-accent">
            <v-icon
              :icon="isTechAttack ? 'mdi-fire' : 'mdi-flash'"
              size="16"
            />
            <span>{{ damageString }}</span>
          </div>
        </div>

        <v-row dense>
          <!-- Main Attack Column -->
          <v-col
            cols="12"
            :md="pilotTalents.length ? 7 : 12"
          >
            <!-- Flat Modifier Section -->
            <flat-modifier-section
              ref="flatModifierRef"
              :grit-bonus="gritBonus"
              :label="isTechAttack ? 'Ataque Tecnológico' : undefined"
            />

            <!-- Accuracy & Difficulty + Manual Adjust + Total Badge -->
            <acc-diff-section
              ref="accDiffRef"
              :initial-acc-mods="pendingAccMods"
              :initial-diff-mods="pendingDiffMods"
              :talent-modifiers="pilotTalents"
            />
          </v-col>

          <!-- Talents Column -->
          <v-col
            v-if="pilotTalents.length"
            cols="12"
            md="5"
          >
            <pilot-talents-column
              :talents="pilotTalents"
              :pilot-name="pilotName"
            />
          </v-col>
        </v-row>

        <!-- Roll Result Banner -->
        <v-slide-y-transition>
          <div
            v-if="lastRollResult"
            class="roll-result-banner pa-3 mt-2 rounded bg-panel border-sm border-panel-border"
          >
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="text-overline text-disabled font-weight-bold">{{ $t('hud.attackRollResult') }}</div>
                <div class="text-h5 font-weight-black text-white">
                  {{ $t('hud.total') }}: {{ lastRollResult.total }}
                  <span
                    v-if="lastRollResult.total >= 20"
                    class="ml-2 text-subtitle-1 text-warning font-weight-bold"
                  >
                    [{{ $t('hud.critical') }}]
                  </span>
                </div>
                <div
                  v-html-safe="lastRollResult.toString()"
                  class="text-caption text-disabled mt-1"
                />
              </div>
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
            color="primary"
            variant="elevated"
            prepend-icon="mdi-dice-d20"
            size="large"
            :loading="isRolling"
            @click="executeAttackRoll"
          >
            {{ $t('hud.roll') }}
          </v-btn>
          <v-btn
            v-if="lastRollResult"
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
  import FlatModifierSection from './FlatModifierSection.vue'
  import AccDiffSection from './AccDiffSection.vue'
  import PilotTalentsColumn from './PilotTalentsColumn.vue'
  import { DiceRoller, D20RollResult } from '@/classes/dice/DiceRoller'
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
  const lastRollResult = ref<D20RollResult | null>(null)

  const flatModifierRef = ref<InstanceType<typeof FlatModifierSection> | null>(null)
  const accDiffRef = ref<InstanceType<typeof AccDiffSection> | null>(null)

  // Props reativas para pré-inicializar AccDiffSection ao abrir o modal
  const pendingAccMods = ref<Partial<{ accurate: boolean; smart: boolean; seeking: boolean; lockOn: boolean }>>({})
  const pendingDiffMods = ref<Partial<{ inaccurate: boolean; impaired: boolean; engaged: boolean; lightCover: boolean; heavyCover: boolean }>>({})

  interface TalentRankInfo {
    rankNum: number
    name: string
    description: string
  }

  interface TalentModifier {
    id: string
    name: string
    rank: number
    acc: number
    diff: number
    ranks?: TalentRankInfo[]
  }
  const pilotTalents = ref<TalentModifier[]>([])

  const isTechAttack = computed(() => {
    return (
      props.item?.WeaponTypes?.includes('Tech') ||
      props.item?.Size === 'Tech' ||
      props.item?.Type === 'Tech' ||
      props.item?.Tags?.some(
        (t: any) => t.Name === 'Ataque Tecnológico' || t.ID === 'tg_tech' || t.Name === 'Invasão'
      )
    )
  })

  const weaponName = computed(() => props.item?.Name || 'Arma')
  const weaponTitle = computed(() => {
    if (isTechAttack.value) return `Ataque Tecnológico: ${weaponName.value}`
    return t('hud.attackTitle', { name: weaponName.value })
  })

  const rangeString = computed(() => {
    let rangeData = props.item?.Range
    if (typeof rangeData === 'function') {
      try { rangeData = rangeData(1, []) } catch(e) { rangeData = [] }
    }
    if (rangeData && Array.isArray(rangeData) && rangeData.length) {
      return rangeData.map((r: any) => {
        let typeLabel = r.Type ? enumLabel('rangeType', r.Type) : ''
        if (r.Type === 'Threat' || typeLabel === 'Threat') typeLabel = 'Ameaça'
        if (r.Type === 'Sensors' || typeLabel === 'Sensors') typeLabel = 'Sensores'
        return `${typeLabel ? typeLabel + ' ' : ''}${r.Value}`
      }).join(', ')
    }
    return isTechAttack.value ? 'Sensores' : '10'
  })

  const damageString = computed(() => {
    let damageData = props.item?.Damage
    if (typeof damageData === 'function') {
      try { damageData = damageData(1, []) } catch(e) { damageData = [] }
    }
    if (damageData && Array.isArray(damageData) && damageData.length) {
      return damageData.map((d: any) => {
        let typeLabel = d.Type ? enumLabel('damageType', d.Type) : ''
        if (d.Type === 'Heat' || typeLabel?.toLowerCase() === 'heat') typeLabel = 'Calor'
        return `${typeLabel ? typeLabel + ' ' : ''}${d.Value}`
      }).join(' + ')
    }
    return isTechAttack.value ? 'Calor 2' : 'Dano'
  })

  const gritBonus = computed(() => {
    if (isTechAttack.value) {
      return props.controller?.TechAttackBonus ?? 0
    }
    return props.controller?.RootActor?.StatController?.getMax('grit') || 0
  })

  const totalFlatModifier = computed(() => flatModifierRef.value?.total ?? gritBonus.value)

  const pilotName = computed(() => {
    const root = props.controller?.RootActor
    return root?.CombatName || root?.Name || 'Piloto'
  })

  const netAccDiff = computed(() => accDiffRef.value?.netAccDiff ?? 0)

  function openModal(openFn: () => void) {
    const tags = props.item?.Tags || []

    // Pré-configura os mods via props reativas; AccDiffSection sincroniza via watch
    pendingAccMods.value = {
      accurate: tags.some((t: any) => t.ID === 'tg_accurate' || t.Name?.toLowerCase().includes('accurate') || t.Name?.toLowerCase().includes('precisa')),
      smart: tags.some((t: any) => t.ID === 'tg_smart' || t.Name?.toLowerCase().includes('smart')),
      seeking: tags.some((t: any) => t.ID === 'tg_seeking' || t.Name?.toLowerCase().includes('seeking')),
    }
    pendingDiffMods.value = {
      inaccurate: tags.some((t: any) => t.ID === 'tg_inaccurate' || t.Name?.toLowerCase().includes('inaccurate') || t.Name?.toLowerCase().includes('imprecisa')),
      impaired: !!props.controller?.HasStatus('impaired'),
      engaged: !!props.controller?.HasStatus('engaged'),
    }

    // Carrega talentos do piloto com as descrições dos ranques desbloqueados
    const talentsSource = (props.controller?.Parent as any)?.Parent?.TalentsController?.Talents
      || (props.controller?.RootActor as any)?.TalentsController?.Talents || []

    pilotTalents.value = talentsSource.map((t: any) => {
      const currentRank = Number(t.Rank || 1)
      const ranksData: TalentRankInfo[] = []

      for (let r = 1; r <= currentRank; r++) {
        let rankName = ''
        let rankDesc = ''

        try {
          if (typeof t.Talent?.Rank === 'function') {
            const rObj = t.Talent.Rank(r)
            if (rObj) {
              rankName = rObj.Name || ''
              rankDesc = rObj.Description || rObj.Terse || ''
            }
          }
        } catch (e) {
          // ignore
        }

        if (!rankDesc && t.Talent?.ranks && t.Talent.ranks[r - 1]) {
          const rawR = t.Talent.ranks[r - 1]
          rankName = rawR.name || rawR.Name || ''
          rankDesc = rawR.description || rawR.Description || rawR.terse || ''
        }

        if (!rankDesc && r === 1) {
          rankDesc = t.Talent?.Description || t.Talent?.Terse || ''
        }

        ranksData.push({
          rankNum: r,
          name: rankName,
          description: rankDesc,
        })
      }

      return {
        id: t.Talent?.ID || t.id || t.name,
        name: t.Talent?.Name || t.name || 'Talento',
        rank: currentRank,
        acc: 0,
        diff: 0,
        ranks: ranksData,
      }
    })

    lastRollResult.value = null
    openFn()
  }

  async function executeAttackRoll() {
    isRolling.value = true
    try {
      if (dddiceService.config.enabled) {
        const labelPrefix = isTechAttack.value ? 'Ataque Tecnológico' : 'Ataque'
        const rollData = await dddiceService.rollDice({
          diceString: '1d20',
          flatBonus: totalFlatModifier.value,
          accuracy: netAccDiff.value,
          label: `${labelPrefix}: ${weaponName.value}`,
          external_id: pilotName.value || undefined,
        })

        if (rollData && rollData.values && rollData.values.length > 0) {
          const d20Die = rollData.values.find((v: any) => v.type?.toLowerCase() === 'd20')
          const rawDieRoll = (d20Die && typeof d20Die.value !== 'undefined') ? Number(d20Die.value) : DiceRoller.rollDie(20)

          const d6Dice = rollData.values.filter((v: any) => v.type?.toLowerCase() === 'd6') || []
          const neededD6 = Math.abs(netAccDiff.value)
          const rawAccuracyRolls: number[] = []

          for (let i = 0; i < neededD6; i++) {
            if (i < d6Dice.length && typeof d6Dice[i].value !== 'undefined') {
              rawAccuracyRolls.push(Number(d6Dice[i].value))
            } else {
              rawAccuracyRolls.push(DiceRoller.rollDie(6))
            }
          }

          let accuracyResult = 0
          if (netAccDiff.value > 0 && rawAccuracyRolls.length > 0) {
            accuracyResult = Math.max(...rawAccuracyRolls)
          } else if (netAccDiff.value < 0 && rawAccuracyRolls.length > 0) {
            accuracyResult = -Math.max(...rawAccuracyRolls)
          }

          const staticBonus = totalFlatModifier.value
          const total = rawDieRoll + staticBonus + accuracyResult

          lastRollResult.value = new D20RollResult(
            total,
            rawDieRoll,
            staticBonus,
            netAccDiff.value,
            rawAccuracyRolls,
            accuracyResult
          )
        }
      }

      if (!lastRollResult.value) {
        // Fallback local se dddice estiver desabilitado ou falhar
        const result = DiceRoller.rollSkillCheck(totalFlatModifier.value, netAccDiff.value)
        lastRollResult.value = result
      }

      if (lastRollResult.value) {
        const res = lastRollResult.value
        const isCrit = Number(res.total) >= 20
        const accCount = res.accuracyDiceCount || 0
        const accText = accCount !== 0 ? (accCount > 0 ? `+${accCount}A` : `${accCount}D`) : ''
        const formulaStr = `1d20${res.staticBonus >= 0 ? '+' : ''}${res.staticBonus}${accText ? ` ${accText}` : ''}`
        const detailStr = `d20 (${res.rawDieRoll}) + Bônus (${res.staticBonus >= 0 ? '+' : ''}${res.staticBonus})${accCount !== 0 ? ` + Acerto (${res.accuracyResult >= 0 ? '+' : ''}${res.accuracyResult})` : ''} | ${rangeString.value} | Dano: ${damageString.value}`

        const labelPrefix = isTechAttack.value ? 'Ataque Tecnológico' : 'Ataque'
        void useTableActionStore().postAction({
          senderName: pilotName.value || 'Piloto',
          category: 'roll',
          title: `${labelPrefix}: ${weaponName.value}`,
          detail: detailStr,
          roll: {
            total: Number(res.total),
            formula: formulaStr,
            isCrit,
            accuracy: accCount,
          },
          tags: [isTechAttack.value ? 'Ataque Tecnológico' : weaponName.value, isCrit ? 'CRÍTICO' : 'ATAQUE'],
        })
      }
    } finally {
      isRolling.value = false
    }
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
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
  }
</style>
