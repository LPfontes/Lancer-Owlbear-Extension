<template>
  <combat-action-button
    :action="action"
    :mobile="mobile"
    min-width="860px"
  >
    <template #default="{ close }">
      <div class="hud-container pa-3">
        <!-- Header -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 px-3 py-2 mb-3 bg-panel rounded border-sm">
          <div class="d-flex align-center ga-2">
            <v-icon
              icon="mdi-hexagon-slice-6"
              color="action--full"
              size="24"
            />
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                Programar Completo
              </div>
              <div class="text-caption text-disabled">
                Para Programar Completo, escolha duas opções de Programar Rápido ou uma única opção que requer Programar Completo para ativar. Se escolher duas ações de Programar Rápido, você pode escolher a mesma opção múltiplas vezes.
              </div>
            </div>
          </div>
          <v-chip
            color="action--full"
            size="small"
            variant="elevated"
            class="font-weight-bold"
          >
            Ação Completa
          </v-chip>
        </div>

        <!-- Mode Selector -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3 bg-panel px-3 py-2 rounded border-sm">
          <span class="text-overline font-weight-bold text-accent">
            <v-icon icon="mdi-tune-vertical" size="16" class="mr-1" />
            Configuração da Ação
          </span>
          <v-btn-toggle
            v-model="mode"
            mandatory
            density="compact"
            color="primary"
            variant="outlined"
            divided
          >
            <v-btn value="quick" size="small" class="font-weight-bold">
              <v-icon icon="mdi-numeric-2-box-multiple" start size="16" />
              2x Programar Rápido
            </v-btn>
            <v-btn
              value="full"
              size="small"
              class="font-weight-bold"
              :disabled="availableFullTechOptions.length === 0"
            >
              <v-icon icon="mdi-numeric-1-box" start size="16" />
              1x Programar Completo
              <v-chip
                v-if="availableFullTechOptions.length > 0"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                {{ availableFullTechOptions.length }}
              </v-chip>
            </v-btn>
          </v-btn-toggle>
        </div>

        <!-- MODE 1: DUAL QUICK TECH -->
        <div v-if="mode === 'quick'">
          <!-- Dual Quick Selectors Banner -->
          <v-row dense class="mb-3">
            <!-- Quick Option 1 Selector -->
            <v-col cols="12" md="6">
              <div class="action-selector-card pa-3 rounded bg-panel border-sm h-100">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-overline font-weight-bold text-accent">
                    <v-icon icon="mdi-numeric-1-box" size="16" class="mr-1" />
                    1ª Opção (Programar Rápido)
                  </span>
                </div>

                <v-select
                  v-model="selectedQuick1Id"
                  :items="availableQuickTechOptions"
                  item-value="id"
                  variant="outlined"
                  density="compact"
                  hide-details
                  bg-color="surface"
                  class="action-select"
                >
                  <template #selection="{ item }">
                    <div class="d-flex align-center ga-2">
                      <v-icon :icon="item.raw.icon" size="18" color="accent" />
                      <span class="font-weight-bold text-white">{{ item.raw.title }}</span>
                    </div>
                  </template>
                  <template #item="{ item, props: itemProps }">
                    <v-list-item v-bind="itemProps">
                      <template #prepend>
                        <v-icon :icon="item.raw.icon" size="20" class="mr-2" color="accent" />
                      </template>
                      <template #title>
                        <span class="font-weight-bold">{{ item.raw.title }}</span>
                      </template>
                      <template #subtitle>
                        <span class="text-caption text-disabled">{{ item.raw.subtitle }}</span>
                      </template>
                    </v-list-item>
                  </template>
                </v-select>
              </div>
            </v-col>

            <!-- Quick Option 2 Selector -->
            <v-col cols="12" md="6">
              <div class="action-selector-card pa-3 rounded bg-panel border-sm h-100">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-overline font-weight-bold text-accent">
                    <v-icon icon="mdi-numeric-2-box" size="16" class="mr-1" />
                    2ª Opção (Programar Rápido)
                  </span>
                  <v-chip size="x-small" color="secondary" variant="tonal">
                    Pode repetir a 1ª opção
                  </v-chip>
                </div>

                <v-select
                  v-model="selectedQuick2Id"
                  :items="availableQuickTechOptions"
                  item-value="id"
                  variant="outlined"
                  density="compact"
                  hide-details
                  bg-color="surface"
                  class="action-select"
                >
                  <template #selection="{ item }">
                    <div class="d-flex align-center ga-2">
                      <v-icon :icon="item.raw.icon" size="18" color="accent" />
                      <span class="font-weight-bold text-white">{{ item.raw.title }}</span>
                    </div>
                  </template>
                  <template #item="{ item, props: itemProps }">
                    <v-list-item v-bind="itemProps">
                      <template #prepend>
                        <v-icon :icon="item.raw.icon" size="20" class="mr-2" color="accent" />
                      </template>
                      <template #title>
                        <span class="font-weight-bold">{{ item.raw.title }}</span>
                      </template>
                      <template #subtitle>
                        <span class="text-caption text-disabled">{{ item.raw.subtitle }}</span>
                      </template>
                    </v-list-item>
                  </template>
                </v-select>
              </div>
            </v-col>
          </v-row>

          <!-- Dual Quick Action Detail Columns -->
          <v-row dense>
            <!-- Panel for Action 1 -->
            <v-col cols="12" md="6">
              <div class="action-card-detail pa-3 rounded bg-panel border-sm h-100">
                <div class="action-section-header d-flex align-center justify-space-between px-3 py-1 mb-3 rounded">
                  <div class="d-flex align-center ga-2">
                    <v-chip size="x-small" color="primary" variant="elevated" class="font-weight-bold">
                      1ª AÇÃO
                    </v-chip>
                    <span class="font-weight-bold text-white text-body-2">{{ currentQuick1?.title }}</span>
                  </div>
                  <v-icon :icon="currentQuick1?.icon || 'mdi-radio-tower'" size="20" color="primary" />
                </div>

                <div class="text-body-2 text-text opacity-90 mb-3 px-1">
                  {{ currentQuick1?.detail }}
                </div>


                <!-- Invade Specific: Invasion Options and Attack HUD for Action 1 -->
                <div v-if="currentQuick1?.isInvade" class="mt-2">
                  <div class="mb-2">
                    <span class="text-caption text-disabled font-weight-bold d-block mb-1">
                      Opção de Invasão:
                    </span>
                    <v-select
                      v-model="selectedInvadeOpt1Id"
                      :items="invadeOptions"
                      item-value="ID"
                      item-title="Name"
                      variant="outlined"
                      density="compact"
                      hide-details
                      bg-color="surface"
                    />
                  </div>

                  <!-- Tech Attack Roll HUD -->
                  <div class="pa-2 rounded bg-surface border-sm mt-2">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <span class="text-caption font-weight-bold text-accent">
                        <v-icon icon="mdi-cpu-64-bit" size="14" class="mr-1" />
                        Ataque Tecnológico
                      </span>
                      <v-chip size="x-small" color="secondary" variant="outlined">
                        Sensores {{ sensorRange }} // Ataque Tec {{ techAttackBonus >= 0 ? `+${techAttackBonus}` : techAttackBonus }}
                      </v-chip>
                    </div>
                    <weapon-attack-hud-modal
                      :item="syntheticTechAttackWeapon1"
                      :controller="controller"
                    />
                  </div>
                </div>

                <!-- Status Badges for non-invade -->
                <div v-else class="pa-2 rounded bg-surface border-sm mt-2">
                  <div class="d-flex align-center ga-2">
                    <v-icon icon="mdi-information-outline" size="16" color="accent" />
                    <span class="text-caption text-disabled">{{ currentQuick1?.subtitle }}</span>
                  </div>
                </div>
              </div>
            </v-col>

            <!-- Panel for Action 2 -->
            <v-col cols="12" md="6">
              <div class="action-card-detail pa-3 rounded bg-panel border-sm h-100">
                <div class="action-section-header d-flex align-center justify-space-between px-3 py-1 mb-3 rounded">
                  <div class="d-flex align-center ga-2">
                    <v-chip size="x-small" color="secondary" variant="elevated" class="font-weight-bold">
                      2ª AÇÃO
                    </v-chip>
                    <span class="font-weight-bold text-white text-body-2">{{ currentQuick2?.title }}</span>
                  </div>
                  <v-icon :icon="currentQuick2?.icon || 'mdi-radio-tower'" size="20" color="secondary" />
                </div>

                <div class="text-body-2 text-text opacity-90 mb-3 px-1">
                  {{ currentQuick2?.detail }}
                </div>


                <!-- Invade Specific: Invasion Options and Attack HUD for Action 2 -->
                <div v-if="currentQuick2?.isInvade" class="mt-2">
                  <div class="mb-2">
                    <span class="text-caption text-disabled font-weight-bold d-block mb-1">
                      Opção de Invasão:
                    </span>
                    <v-select
                      v-model="selectedInvadeOpt2Id"
                      :items="invadeOptions"
                      item-value="ID"
                      item-title="Name"
                      variant="outlined"
                      density="compact"
                      hide-details
                      bg-color="surface"
                    />
                  </div>

                  <!-- Tech Attack Roll HUD -->
                  <div class="pa-2 rounded bg-surface border-sm mt-2">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <span class="text-caption font-weight-bold text-accent">
                        <v-icon icon="mdi-cpu-64-bit" size="14" class="mr-1" />
                        Ataque Tecnológico
                      </span>
                      <v-chip size="x-small" color="secondary" variant="outlined">
                        Sensores {{ sensorRange }} // Ataque Tec {{ techAttackBonus >= 0 ? `+${techAttackBonus}` : techAttackBonus }}
                      </v-chip>
                    </div>
                    <weapon-attack-hud-modal
                      :item="syntheticTechAttackWeapon2"
                      :controller="controller"
                    />
                  </div>
                </div>

                <!-- Status Badges for non-invade -->
                <div v-else class="pa-2 rounded bg-surface border-sm mt-2">
                  <div class="d-flex align-center ga-2">
                    <v-icon icon="mdi-information-outline" size="16" color="accent" />
                    <span class="text-caption text-disabled">{{ currentQuick2?.subtitle }}</span>
                  </div>
                </div>
              </div>
            </v-col>
          </v-row>
        </div>

        <!-- MODE 2: SINGLE FULL TECH -->
        <div v-else>
          <div v-if="availableFullTechOptions.length > 0">
            <div class="pa-3 rounded bg-panel border-sm mb-3">
              <span class="text-overline font-weight-bold text-accent d-block mb-2">
                Selecione o Sistema / Ação de Programar Completo:
              </span>
              <v-select
                v-model="selectedFullTechId"
                :items="availableFullTechOptions"
                item-value="id"
                item-title="title"
                variant="outlined"
                density="compact"
                hide-details
                bg-color="surface"
              >
                <template #selection="{ item }">
                  <div class="d-flex align-center ga-2">
                    <v-icon :icon="item.raw.icon" size="18" color="accent" />
                    <span class="font-weight-bold text-white">{{ item.raw.title }}</span>
                  </div>
                </template>
                <template #item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <template #prepend>
                      <v-icon :icon="item.raw.icon" size="20" class="mr-2" color="accent" />
                    </template>
                    <template #title>
                      <span class="font-weight-bold">{{ item.raw.title }}</span>
                    </template>
                    <template #subtitle>
                      <span class="text-caption text-disabled">{{ item.raw.subtitle }}</span>
                    </template>
                  </v-list-item>
                </template>
              </v-select>
            </div>

            <!-- Full Tech Action Card -->
            <div class="pa-4 rounded bg-panel border-sm">
              <div class="d-flex align-center ga-2 mb-2">
                <v-icon :icon="currentFullTech?.icon || 'cc:full_tech'" size="22" color="action--full" />
                <span class="text-subtitle-1 font-weight-bold text-white">
                  {{ currentFullTech?.title }}
                </span>
              </div>
              <div class="text-body-2 text-text opacity-90 mb-3">
                {{ currentFullTech?.detail || currentFullTech?.subtitle }}
              </div>

            </div>
          </div>

          <div v-else class="pa-4 text-center text-disabled bg-panel rounded border-sm mb-3">
            <v-icon icon="mdi-alert-circle-outline" size="32" class="mb-2" />
            <div>Nenhum sistema com ativação de Programar Completo equipado neste Mech.</div>
            <div class="text-caption mt-1">Utilize a opção "2x Programar Rápido" para combinar duas ações.</div>
          </div>
        </div>

        <!-- Footer Actions -->
        <v-divider class="my-3" />
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <v-btn
            variant="plain"
            color="disabled"
            @click="close"
          >
            {{ $t('hud.cancel') }}
          </v-btn>

          <v-btn
            color="action--full"
            variant="elevated"
            class="font-weight-bold px-4"
            height="36"
            @click="finishFullTech(close)"
          >
            <v-icon icon="mdi-check-all" start size="18" />
            <span>Concluir Programar Completo</span>
          </v-btn>
        </div>
      </div>
    </template>
  </combat-action-button>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import type { Action } from '@/classes/Action'
  import { useEncounterContext } from '../../../encounterContext'
  import CombatActionButton from './CombatActionButton.vue'
  import WeaponAttackHudModal from './WeaponAttackHudModal.vue'
  import { CompendiumStore } from '@/stores'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { notify } from '@/util/notify'

  defineOptions({ name: 'MechFullTechButton' })

  const _display = useDisplay()
  const mobile = computed(() => _display.mdAndDown.value)

  const props = defineProps<{
    action: Action
  }>()

  const emit = defineEmits<{
    activate: [payload: string]
  }>()

  const { owner, activeController, ownerController } = useEncounterContext()

  const controller = computed(() => {
    return (
      activeController.value ||
      (owner.value?.actor as any)?.ActiveMech?.CombatController ||
      (owner.value?.actor as any)?.CombatController ||
      ownerController.value
    )
  })

  const mode = ref<'quick' | 'full'>('quick')

  // Available Quick Tech Options
  const availableQuickTechOptions = computed(() => {
    const list = [
      {
        id: 'act_invade',
        title: 'Invadir',
        icon: 'cc:invade',
        subtitle: 'Ataque eletrônico (+2 Calor no alvo, opções de invasão)',
        detail:
          'Faça um ataque tecnológico contra um personagem dentro dos seus sensores. Em caso de sucesso, o alvo sofre 2 de calor e você escolhe uma opção de invasão.',
        isInvade: true,
      }
    ]

    const extra = (controller.value?.AllActions?.('Quick Tech') || []).filter(
      (a: any) => !list.some(b => b.id === a.ID)
    )
    for (const a of extra) {
      list.push({
        id: a.ID,
        title: a.Name,
        icon: a.Icon || 'mdi-chip',
        subtitle: a.Terse || 'Ação de Sistema Tecnológico Rápido',
        detail: a.Detail || a.Terse || '',
        isInvade: a.ID?.toLowerCase().includes('invade') || false,
      })
    }

    return list
  })

  // Available Full Tech Options
  const availableFullTechOptions = computed(() => {
    const list: Array<{
      id: string
      title: string
      icon: string
      subtitle: string
      detail: string
    }> = []

    const extra = (controller.value?.AllActions?.('Full Tech') || []).filter(
      (a: any) => a.ID !== 'act_full_tech'
    )
    for (const a of extra) {
      list.push({
        id: a.ID,
        title: a.Name,
        icon: a.Icon || 'cc:full_tech',
        subtitle: a.Terse || 'Ação de Sistema Tecnológico Completo',
        detail: a.Detail || a.Terse || '',
      })
    }
    return list
  })

  const selectedQuick1Id = ref('act_invade')
  const selectedQuick2Id = ref('act_lockon')
  const selectedFullTechId = ref(availableFullTechOptions.value[0]?.id || '')

  watch(availableFullTechOptions, (val) => {
    if (val.length && !val.some(v => v.id === selectedFullTechId.value)) {
      selectedFullTechId.value = val[0]?.id || ''
    }
  }, { immediate: true })

  const currentQuick1 = computed(() => {
    return availableQuickTechOptions.value.find(o => o.id === selectedQuick1Id.value) || availableQuickTechOptions.value[0]
  })

  const currentQuick2 = computed(() => {
    return availableQuickTechOptions.value.find(o => o.id === selectedQuick2Id.value) || availableQuickTechOptions.value[1] || availableQuickTechOptions.value[0]
  })

  const currentFullTech = computed(() => {
    return availableFullTechOptions.value.find(o => o.id === selectedFullTechId.value) || availableFullTechOptions.value[0]
  })

  // Invade Options
  const invadeOptions = computed(() => {
    const opts = controller.value?.InvadeOptions?.() || []
    const list = [...opts]
    if (!list.some((o: any) => o.ID === 'act_inv_fragment_signal')) {
      const fromComp = CompendiumStore().Actions.find((a: any) => a.ID === 'act_inv_fragment_signal')
      if (fromComp) {
        list.unshift(fromComp)
      } else {
        list.unshift({
          ID: 'act_inv_fragment_signal',
          Name: 'Fragmentar Sinal',
          Icon: 'mdi-radio-tower',
          Detail:
            'Você transmite informações falsas, mensagens obscenas ou sinais fantasmas para o núcleo computacional do alvo. Ele fica IMPEDIDO e LENTO até o final do próximo turno dele.',
          Terse: 'Deixa um personagem IMPEDIDO e LENTO até o final do próximo turno dele.',
          Activation: 'Invade',
        } as any)
      }
    }
    return list
  })

  const selectedInvadeOpt1Id = ref(invadeOptions.value[0]?.ID || 'act_inv_fragment_signal')
  const selectedInvadeOpt2Id = ref(invadeOptions.value[0]?.ID || 'act_inv_fragment_signal')

  const currentInvadeOpt1 = computed(() => {
    return invadeOptions.value.find((a: any) => a.ID === selectedInvadeOpt1Id.value) || invadeOptions.value[0]
  })

  const currentInvadeOpt2 = computed(() => {
    return invadeOptions.value.find((a: any) => a.ID === selectedInvadeOpt2Id.value) || invadeOptions.value[0]
  })

  const sensorRange = computed(() => {
    return (
      (controller.value?.Parent as any)?.SensorRange ||
      (controller.value?.Parent as any)?.Sensors ||
      controller.value?.StatController?.getCurrent?.('sensors') ||
      controller.value?.RootActor?.SensorRange ||
      10
    )
  })

  const techAttackBonus = computed(() => {
    return controller.value?.TechAttackBonus ?? 0
  })

  const syntheticTechAttackWeapon1 = computed(() => {
    const opt = currentInvadeOpt1.value
    return {
      Name: `${currentQuick1.value?.title}: ${opt?.Name || 'Ataque Tecnológico'}`,
      Size: 'Tech',
      WeaponTypes: ['Tech'],
      Range: [{ Type: 'Sensors', Value: sensorRange.value }],
      Damage: [{ Type: 'Heat', Value: 2 }],
      Tags: [{ Name: 'Ataque Tecnológico' }, { Name: 'Programar Completo' }],
    }
  })

  const syntheticTechAttackWeapon2 = computed(() => {
    const opt = currentInvadeOpt2.value
    return {
      Name: `${currentQuick2.value?.title}: ${opt?.Name || 'Ataque Tecnológico'}`,
      Size: 'Tech',
      WeaponTypes: ['Tech'],
      Range: [{ Type: 'Sensors', Value: sensorRange.value }],
      Damage: [{ Type: 'Heat', Value: 2 }],
      Tags: [{ Name: 'Ataque Tecnológico' }, { Name: 'Programar Completo' }],
    }
  })

  function executeSubAction(actionOpt: any) {
    const cc = controller.value
    if (!actionOpt?.id || !cc) return
    try {
      cc.RunAction?.(actionOpt.id)
    } catch (_e) {
      // ignore
    }
    cc.MarkActionUsed?.(actionOpt.id)
  }

  function finishFullTech(close: () => void) {
    const cc = controller.value
    if (!cc) return

    // Spend full action pool
    cc.SetCombatAction('full', false)
    if (activeController.value && activeController.value !== cc) {
      activeController.value.SetCombatAction('full', false)
    }
    if (
      ownerController.value &&
      ownerController.value !== cc &&
      ownerController.value !== activeController.value
    ) {
      ownerController.value.SetCombatAction('full', false)
    }

    cc.MarkActionUsed('act_full_tech')

    const actorName =
      (owner.value?.actor as any)?.Callsign ||
      (owner.value?.actor as any)?.Name ||
      cc.CombatName ||
      'Piloto'

    if (mode.value === 'quick') {
      const q1 = currentQuick1.value
      const q2 = currentQuick2.value

      executeSubAction(q1)
      executeSubAction(q2)

      try {
        cc.Record?.('action', {
          action: { id: 'act_full_tech', name: 'Programar Completo' },
          activation: 'full',
          free: false,
          options: [q1?.id, q2?.id].filter(Boolean),
        })
      } catch (_e) {}

      const detailMsg = `1ª Ação: ${q1?.title || 'Programar Rápido'} | 2ª Ação: ${q2?.title || 'Programar Rápido'}`
      void useTableActionStore().broadcastCombatAction({
        actorName,
        actionName: 'Programar Completo',
        actionType: 'full_action',
        detail: detailMsg,
      })

      notify({
        title: 'Programar Completo',
        text: `${q1?.title || 'Ação 1'} + ${q2?.title || 'Ação 2'} executadas com sucesso!`,
        type: 'success',
      })
    } else {
      const ft = currentFullTech.value
      if (ft?.id) {
        executeSubAction(ft)
      }

      try {
        cc.Record?.('action', {
          action: { id: ft?.id || 'act_full_tech', name: ft?.title || 'Programar Completo' },
          activation: 'full',
          free: false,
        })
      } catch (_e) {}

      void useTableActionStore().broadcastCombatAction({
        actorName,
        actionName: `Programar Completo: ${ft?.title || 'Ação'}`,
        actionType: 'full_action',
        detail: ft?.detail || ft?.subtitle,
      })

      notify({
        title: 'Programar Completo',
        text: `${ft?.title || 'Ação'} executada com sucesso!`,
        type: 'success',
      })
    }

    emit('activate', 'act_full_tech')
    close()
  }
</script>

<style scoped>
  .hud-container {
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }
  .action-selector-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .action-card-detail {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .action-section-header {
    border-left: 3px solid rgb(var(--v-theme-primary));
    background: rgba(255, 255, 255, 0.03);
  }
</style>
