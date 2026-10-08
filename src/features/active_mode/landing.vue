<template>
  <v-container fluid>
    <v-row
      justify="space-between"
      align="center"
      class="my-2"
    >
      <v-col><v-divider /></v-col>
      <v-col cols="auto" class="text-center">
        <div
          class="font-weight-light text-center my-n2"
          style="letter-spacing: calc(5px + 2cqw); font-size: calc(20px + 2cqw)"
        >
          {{ $t('common.activeMode') }}
        </div>
      </v-col>
      <v-col><v-divider /></v-col>
    </v-row>

    <v-row
      class="mt-1"
      :class="!mobile && 'px-5'"
      justify="space-around"
    >
      <v-col
        v-for="(list, i) in lists"
        :key="`list-${i}`"
        cols="12"
        md="6"
      >
        <v-card
          variant="tonal"
          height="100%"
          :class="!mobile && 'px-6'"
          flat
          tile
        >
          <v-list
            height="100%"
            class="pt-0"
            flat
            tile
          >
            <v-list-item class="text-center">
              <v-icon
                :icon="headers[i].icon"
                size="20vw"
              />
              <v-list-item-title
                class="heading h2"
                :class="headers[i].subtitle ? 'text-grey' : 'text-accent'"
                v-text="headers[i].title"
              />
              <v-list-item-subtitle
                v-if="headers[i].subtitle"
                class="text-cc-overline my-n1"
                v-text="headers[i].subtitle"
              />
            </v-list-item>
            <template v-for="(e, index) in list" :key="`entry-${index}`">
  <!-- Item padrão em lista -->
  <v-list-item
    v-if="!e.small"
    lines="two"
    density="compact"
    :title="e.title"
    :subtitle="e.subtitle"
    :to="e.to"
    :disabled="e.disabled"
    :class="['my-1', e.disabled ? 'bg-panel' : 'bg-primary']"
  >
    <template #prepend>
      <v-avatar>
        <v-icon size="x-large" :icon="e.icon" />
      </v-avatar>
    </template>
  </v-list-item>

  <!-- Botões compactos (e.small) -->
  <template v-else>
    <!-- Retomar Encounter Local -->
    <v-btn
      v-if="(e as any).id === 'last-local' && lastLocalEncounter"
      block
      size="small"
      tile
      flat
      color="accent"
      class="my-1"
      :prepend-icon="e.icon"
      @click="loadLastLocalEncounter()"
    >
      {{
        $t('active.landing.resumeRound', {
          name: lastLocalEncounter.Encounter.Name,
          n: lastLocalEncounter.Round,
        })
      }}
    </v-btn>

    <!-- Retomar Sheet Local -->
    <v-btn
      v-else-if="(e as any).id === 'last-sheet' && lastLocalSheet"
      block
      size="small"
      tile
      flat
      color="accent"
      class="my-1"
      :prepend-icon="e.icon"
      @click="loadLastLocalSheet()"
    >
      {{
        $t('active.landing.resumeRound', {
          name: lastLocalSheet.Combatant.actor.Name,
          n: lastLocalSheet.Combatant.actor.CombatController.Round,
        })
      }}
    </v-btn>

    <!-- Botão Fallback Desabilitado -->
    <v-btn
      v-else
      block
      size="small"
      tile
      flat
      disabled
      color="grey"
      class="my-1"
      :prepend-icon="e.icon"
      :to="e.to"
    >
      {{ e.subtitle }}
    </v-btn>
  </template>

  <!-- Ação Rápida de NPCs -->
  <v-list-item
    v-if="(e as any).id === 'npcs'"
    class="bg-primary my-1"
    :prepend-icon="e.icon"
    :title="$t('active.landing.openQuickReference')"
    @click.stop="quickReferenceDialog = true"
  />
</template>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-container>

  <v-dialog v-model="quickReferenceDialog" max-width="900px">
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span class="heading h2">{{ $t('active.landing.quickReference') }}</span>
        <v-btn variant="text" @click="quickReferenceDialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text class="pt-0">
        <QuickReferencePanel />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { EncounterStore, PilotSheetStore } from '@/stores'
  import { useI18n } from 'vue-i18n'
  import { usePilotJoinRequest } from '@/composables/usePilotJoinRequest'
  import QuickReferencePanel from './runner/gm/InfoPanels/QuickReferencePanel.vue'
  const { t } = useI18n()
  const router = useRouter()

  const _display = useDisplay()

  interface HeaderItem {
    icon: string
    title: string
    subtitle?: string
  }
  interface ListItem {
    title?: string
    subtitle?: string
    icon: string
    to?: string
    id?: string
    small?: boolean
    disabled?: boolean
  }

  const headers = ref<HeaderItem[]>([
    {
      icon: 'cc:lancer',
      title: t('common.gameName'),
    },
    {
      icon: 'cc:nhp',
      title: t('active.titles.gameMaster'),
    },
  ])
  const lists = ref<ListItem[][]>([
    [
      {
        title: 'Criar Personagem (Piloto)',
        subtitle: 'Assistente completo de criação de piloto e ficha técnica',
        icon: 'mdi-account-plus',
        to: '/new/no_group',
      },
      {
        title: 'Hangar de Pilotos (Roster)',
        subtitle: 'Gerencie pilotos cadastrados, mechs, talentos e licenças',
        icon: 'cc:pilot',
        to: '/pilot_management',
      },
      {
        title: t('active.titles.activeCharacterSheets'),
        subtitle: t('active.subtitles.createManageAndRunActivePlayer'),
        icon: 'mdi-card-account-details-outline',
        to: '/active-mode/sheet-manager',
      },
      {
        id: 'last-sheet',
        small: true,
        subtitle: t('active.subtitles.resumeLast'),
        icon: 'mdi-restart',
        to: '',
      },
    ],
    [
      {
        id: 'tracker',
        title: t('ow.combatTracker'),
        subtitle: t('ow.combatTrackerSubtitle'),
        icon: 'cc:encounter',
        to: '/table-chat?tab=tracker',
      },
      {
        id: 'npcs',
        title: t('gm.titles.npcRoster'),
        subtitle: t('gm.subtitles.manageNonPlayerCombatUnits'),
        icon: 'cc:npc',
        to: '/active-mode/npcs',
      },
    ],
  ])

  const mobile = computed(() => {
    return _display.mdAndDown.value
  })
  const quickReferenceDialog = ref<boolean>(false)
  const lastLocalEncounter = computed(() => {
    return EncounterStore().getActiveEncounter(EncounterStore().CurrentActiveID)
  })
  const lastLocalSheet = computed(() => {
    return PilotSheetStore().GetSheet(PilotSheetStore().CurrentActiveID)
  })

  function openNpcs() {
    router.push('/active-mode/npcs')
  }

  function loadLastLocalEncounter() {
    if (lastLocalEncounter.value) {
      router.push(`/active-mode/gm-encounter-runner/${lastLocalEncounter.value.ID}`)
    }
  }
  const { requestPilotJoin } = usePilotJoinRequest()
  async function loadLastLocalSheet() {
    if (lastLocalSheet.value) {
      const approved = await requestPilotJoin(lastLocalSheet.value)
      if (approved) {
        router.push(`/active-mode/pilot-runner/${lastLocalSheet.value.ID}`)
      }
    }
  }
</script>
