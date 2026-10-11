<template>
  <div
    class="d-inline-flex"
    :class="small ? 'ma-1' : 'ma-2'"
    :style="`width: ${minWidth};`"
  >
    <v-hover>
      <template #default="{ isHovering, props }">
        <v-card
          class="card-outline"
          :min-height="minWidth"
          :min-width="minWidth"
          tile
          flat
          style="position: relative"
          v-bind="props"
          @click="toPilotSheet()"
        >
          <v-icon
            v-if="!small"
            icon="mdi-drag"
            size="18"
            class="drag-handle"
            :aria-label="$t('pm.a11y.dragToReorder')"
            tabindex="0"
            :style="`position: absolute; top: 36px; left: 4px; cursor: move; z-index: 3; opacity: ${isHovering ? 0.8 : 0.3}; transition: opacity 0.2s;`"
            @click.stop
          />
          <div
            v-show="!small"
            class="clipped-large background-standard"
            :style="`
              z-index: 2; position: absolute; top: 0; left: -2px; right: -2px; height: ${
                small ? '25' : '32'
              }px; ${
                small && isHovering ? 'opacity: 1' : 'opacity: 0.6'
              }; transition: opacity 0.2s;`"
          >
            <div
              :class="`heading h3 text-white flavor-text ml-2 mt-1`"
              style="letter-spacing: 3px; text-overflow: ellipsis"
            >
              <v-icon
                v-if="remoteResource"
                size="small"
              >
                mdi-broadcast
              </v-icon>
              {{ pilot.Callsign }}
            </div>
          </div>
          <div
            v-show="!small"
            :class="small ? 'small-triangle' : 'triangle'"
          />
          <div
            v-show="!small"
            class="ll text-white"
            style="line-height: 25px"
          >
            <div
              v-if="!small"
              class="text-overline mb-n1 text-right"
            >
              {{ $t('pm.sheet.ll') }}
            </div>
            <div :class="`heading ${small ? 'h3' : 'h2'} mt-n2`">
              {{ pilot.Level.toString().padStart(2, '0') }}
            </div>
          </div>
          <div style="position: relative">
            <cc-img
              :src="pilot.Portrait"
              position="top center"
              height="100%"
              :aspect-ratio="1"
              cover
            >
              <v-expand-transition>
                <div
                  v-if="isHovering && !small"
                  class="flavor-text bg-grey-darken-3 pa-3"
                  style="height: 100%; max-width: 100%; opacity: 0.85"
                >
                  <div
                    v-if="remoteResource"
                    class="mt-6"
                    style="letter-spacing: 6px !important"
                  >
                    <v-chip
                      label
                      size="x-small"
                    >
                      <v-icon
                        start
                        class="mr-3"
                      >
                        mdi-broadcast
                      </v-icon>
                      {{ $t('common.remoteResource') }}
                    </v-chip>
                  </div>

                  <br v-else />
                  {{ pilot.Name }}
                  <br />
                  <b>{{ pilot.Callsign }}</b>
                  <cc-slashes />
                  <b>{{ pilot.Status }}</b>
                  <v-divider />
                  <span class="text-uppercase">{{ $t('pm.link.hull') }}</span>
                  {{ pilot.MechSkillsController.MechSkills.Hull }} {{ $t('stats.agi') }}
                  {{ pilot.MechSkillsController.MechSkills.Agi }}
                  <span class="text-uppercase">{{ $t('pm.link.sys') }}</span>
                  {{ pilot.MechSkillsController.MechSkills.Sys }}
                  <span class="text-uppercase">{{ $t('pm.link.eng') }}</span>
                  {{ pilot.MechSkillsController.MechSkills.Eng }}
                  <v-divider />
                  <div>
                    <div
                      v-for="s in pilot.TalentsController.Talents"
                      :key="s.Talent.ID"
                    >
                      {{ s.Talent.Name }} {{ 'I'.repeat(s.Rank) }}
                    </div>
                    <v-divider class="my-2" />
                    <v-btn
                      size="x-small"
                      variant="flat"
                      :color="isActiveSheet ? 'primary' : 'surface-variant'"
                      :prepend-icon="isActiveSheet ? 'mdi-check-decagram' : 'mdi-card-account-details-outline'"
                      class="mt-1 w-100"
                      @click.stop="openActiveSheet"
                    >
                      {{ isActiveSheet ? $t('ow.activeSheet') : $t('ow.openActiveSheet') }}
                    </v-btn>
                    <v-btn
                      size="x-small"
                      variant="tonal"
                      color="secondary"
                      prepend-icon="mdi-pencil-outline"
                      class="mt-1 w-100"
                      @click.stop="toPilotSheet"
                    >
                      {{ $t('ow.editHangarSheet') }}
                    </v-btn>
                  </div>
                </div>
              </v-expand-transition>
            </cc-img>
            <div style="position: absolute; bottom: 2px; left: 2px">
              <cc-brew-info :controller="pilot.BrewController" />
            </div>
            <div
              v-if="isActiveSheet"
              style="position: absolute; top: 34px; right: 4px; z-index: 3;"
            >
              <v-chip
                size="x-small"
                color="primary"
                variant="flat"
                prepend-icon="mdi-check-decagram"
              >
                {{ $t('ow.activeSheet') }}
              </v-chip>
            </div>
          </div>
        </v-card>
      </template>
    </v-hover>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useRouter } from 'vue-router'
  import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'

  const props = defineProps<{ pilot: any }>()

  const emit = defineEmits<{ goTo: [id: string] }>()
  const router = useRouter()

  const { smAndDown, xs } = useDisplay()

  const small = computed(() => smAndDown.value)

  const remoteResource = computed(() => props.pilot.SaveController.IsRemote)

  const isActiveSheet = computed(() => {
    const sheetStore = PilotSheetStore()
    const active = sheetStore.CurrentActive
    return Boolean(active && (active.Pilot?.ID === props.pilot.ID || active.ID === props.pilot.ID))
  })

  async function openActiveSheet() {
    const sheetStore = PilotSheetStore()
    const activeSheet = await sheetStore.ensureActiveSheetForPilot(props.pilot)
    router.push({
      name: 'active-mode-pilot-runner',
      params: { id: activeSheet.ID },
    })
  }

  const minWidth = computed(() => {
    if (xs.value) return '26vw'
    return small.value ? '22vw' : '17vw'
  })

  function toPilotSheet() {
    emit('goTo', props.pilot.ID)
    router.push({
      name: 'pilot_sheet_redirect',
      params: { pilotID: props.pilot.ID },
    })
  }
</script>

<style scoped>
  .card-outline {
    border: 1px solid;
    border-color: rgb(var(--v-theme-accent));
  }

  .card-missing-outline {
    border: 1px solid;
    border-color: rgb(var(--v-theme-error));
  }

  .background-standard {
    background-color: rgb(var(--v-theme-primary));
  }

  .background-missing {
    background-color: rgb(var(--v-theme-error));
  }

  .triangle {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 0 65px 65px;
    z-index: 2;
    border-color: transparent transparent rgb(var(--v-theme-primary)) transparent;
  }

  .small-triangle {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 0 45px 45px;
    z-index: 2;
    border-color: transparent transparent rgb(var(--v-theme-primary)) transparent;
  }

  .ll {
    position: absolute;
    bottom: 0;
    right: 4px;
    /* width: 40px; */
    /* height: 40px; */
    z-index: 3;
  }
</style>
