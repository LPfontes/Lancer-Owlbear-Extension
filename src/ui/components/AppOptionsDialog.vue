<template>
  <v-dialog
    v-model="isOpen"
    :fullscreen="mobile"
    max-width="1150px"
    scrollable
    transition="dialog-bottom-transition"
  >
    <v-card class="bg-grey-darken-4 border-accent options-dialog-card d-flex flex-column" style="max-height: 92vh;">
      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center px-4 py-3 border-b border-grey-darken-3 bg-grey-darken-4">
        <div class="d-flex align-center ga-2">
          <v-avatar size="32" color="accent" class="rounded-0 elevation-2">
            <v-icon icon="mdi-cog" size="20" color="black" />
          </v-avatar>
          <div>
            <span class="text-subtitle-1 font-weight-bold text-accent text-uppercase" style="letter-spacing: 1px;">
              {{ $t('ow.optionsTitle') }}
            </span>
            <div class="text-caption text-grey-lighten-1" style="margin-top: -4px;">
              {{ $t('ow.optionsSubtitle') }}
            </div>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="grey-lighten-1" @click="close" />
      </v-card-title>

      <!-- Main Tabs -->
      <div class="bg-grey-darken-4 px-2 pt-1 border-b border-grey-darken-3">
        <v-tabs
          v-model="activeTab"
          color="accent"
          density="comfortable"
          show-arrows
        >
          <v-tab value="lcps" prepend-icon="mdi-package-down" class="font-weight-bold text-uppercase">
            {{ $t('ow.tabLcps') }}
          </v-tab>
          <v-tab value="language" prepend-icon="mdi-translate" class="font-weight-bold text-uppercase">
            {{ $t('ow.tabLanguage') }}
          </v-tab>
          <v-tab value="settings" prepend-icon="mdi-palette" class="font-weight-bold text-uppercase">
            {{ $t('ow.tabAppearance') }}
          </v-tab>
          <v-tab value="dddice" prepend-icon="mdi-dice-multiple" class="font-weight-bold text-uppercase">
            Dados 3D (dddice)
          </v-tab>
        </v-tabs>
      </div>

      <!-- Tab Content Area -->
      <v-card-text class="pa-0 flex-grow-1 overflow-hidden" style="min-height: 0;">
        <v-window v-model="activeTab" class="h-100">
          <!-- TAB 1: LCPs -->
          <v-window-item value="lcps" class="pa-4 h-100 overflow-y-auto">
            <!-- LCP Sub-navigation -->
            <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4 pb-2 border-b border-grey-darken-3">
              <v-btn-toggle
                v-model="lcpSubTab"
                mandatory
                density="compact"
                color="accent"
                variant="outlined"
              >
                <v-btn value="install" prepend-icon="mdi-download">
                  {{ $t('ow.subtabInstall') }}
                </v-btn>
                <v-btn value="list" prepend-icon="mdi-format-list-bulleted">
                  {{ $t('ow.subtabList') }}
                </v-btn>
                <v-btn value="directory" prepend-icon="mdi-web">
                  {{ $t('ow.subtabDirectory') }}
                </v-btn>
                <v-btn value="config" prepend-icon="mdi-tune">
                  {{ $t('ow.subtabConfig') }}
                </v-btn>
              </v-btn-toggle>

              <v-chip size="small" color="accent" variant="outlined" prepend-icon="mdi-information-outline">
                {{ $t('ow.supportLcpLlp') }}
              </v-chip>
            </div>

            <!-- Subtab Views -->
            <div v-if="lcpSubTab === 'install'">
              <PackInstall />
            </div>

            <div v-else-if="lcpSubTab === 'list'">
              <PacksList />
            </div>

            <div v-else-if="lcpSubTab === 'directory'">
              <PacksDirectory />
            </div>

            <div v-else-if="lcpSubTab === 'config'">
              <PackConfig />
            </div>
          </v-window-item>

          <!-- TAB 2: Language & Translation -->
          <v-window-item value="language" class="pa-4 pa-sm-6 h-100 overflow-y-auto">
            <v-row>
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-4 border-grey-darken-3 bg-grey-darken-4 mb-4">
                  <div class="d-flex align-center ga-2 mb-3">
                    <v-icon icon="mdi-translate" color="accent" />
                    <div class="text-subtitle-1 font-weight-bold text-white">
                      {{ $t('language.selectLanguage') }}
                    </div>
                  </div>

                  <p class="text-body-2 text-grey-lighten-1 mb-4">
                    {{ $t('ow.languageDescription') }}
                  </p>

                  <v-select
                    v-model="currentLanguage"
                    :items="languages"
                    item-title="name"
                    item-value="code"
                    variant="outlined"
                    density="comfortable"
                    color="accent"
                    prepend-inner-icon="mdi-web"
                    :label="$t('ow.selectedLanguage')"
                    class="mb-2"
                  >
                    <template #item="{ props: itemProps, item }">
                      <v-list-item v-bind="itemProps">
                        <template #append>
                          <v-chip
                            v-if="item.raw.code === 'pt'"
                            size="x-small"
                            color="success"
                            variant="elevated"
                          >
                            PT-BR
                          </v-chip>
                          <v-chip
                            v-else-if="item.raw.code === 'en'"
                            size="x-small"
                            color="primary"
                            variant="elevated"
                          >
                            Oficial
                          </v-chip>
                        </template>
                      </v-list-item>
                    </template>
                  </v-select>

                  <v-alert
                    v-if="currentLanguage === 'pt'"
                    type="success"
                    variant="tonal"
                    density="compact"
                    icon="mdi-check-circle"
                    class="mt-2"
                  >
                    {{ $t('ow.ptActivated') }}
                  </v-alert>

                  <v-alert
                    v-else-if="currentLanguage !== 'en'"
                    type="info"
                    variant="tonal"
                    density="compact"
                    icon="mdi-information"
                    class="mt-2"
                  >
                    {{ $t('ow.communityWarning') }}
                  </v-alert>
                </v-card>

                <!-- LLP Information Card -->
                <v-card variant="outlined" class="pa-4 border-grey-darken-3 bg-grey-darken-4">
                  <div class="d-flex align-center ga-2 mb-2">
                    <v-icon icon="mdi-file-document-edit-outline" color="accent" />
                    <div class="text-subtitle-2 font-weight-bold text-accent">
                      {{ $t('ow.llpTitle') }}
                    </div>
                  </div>
                  <div class="text-caption text-grey-lighten-1">
                    {{ $t('ow.llpDesc') }}
                  </div>
                </v-card>
              </v-col>

              <!-- Translation Completeness Details -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-4 border-grey-darken-3 bg-grey-darken-4 h-100">
                  <div class="d-flex align-center justify-space-between mb-3">
                    <div class="text-subtitle-1 font-weight-bold text-white d-flex align-center ga-2">
                      <v-icon icon="mdi-chart-bar" color="accent" />
                      {{ $t('ow.translationStatus', { lang: currentLanguage.toUpperCase() }) }}
                    </div>
                  </div>

                  <div v-for="comp in TRANSLATION_COMPONENTS" :key="comp" class="mb-4">
                    <div class="d-flex justify-space-between align-center mb-1">
                      <span class="text-body-2 text-grey-lighten-1 text-capitalize">
                        {{ $t(`language.components.${comp}`) }}
                      </span>
                      <v-chip
                        size="x-small"
                        :color="getTransColor(comp, currentLanguage)"
                        variant="elevated"
                        class="font-weight-bold"
                      >
                        {{ componentPct(comp, currentLanguage) }}%
                      </v-chip>
                    </div>

                    <v-progress-linear
                      :model-value="componentPct(comp, currentLanguage)"
                      :color="getTransColor(comp, currentLanguage)"
                      height="10"
                      rounded
                      class="bg-grey-darken-3"
                    />
                  </div>

                  <v-divider class="my-4 border-grey-darken-3" />

                  <div class="text-caption text-grey">
                    {{ $t('ow.translationNote') }}
                  </div>
                </v-card>
              </v-col>
            </v-row>
          </v-window-item>

          <!-- TAB 3: Settings & Appearance -->
          <v-window-item value="settings" class="pa-4 pa-sm-6 h-100 overflow-y-auto">
            <v-row>
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-4 border-grey-darken-3 bg-grey-darken-4 mb-4">
                  <div class="d-flex align-center ga-2 mb-3">
                    <v-icon icon="mdi-palette" color="accent" />
                    <div class="text-subtitle-1 font-weight-bold text-white">
                      {{ $t('nav.settingsPage.theme') }}
                    </div>
                  </div>

                  <v-select
                    v-model="theme"
                    :items="themes"
                    item-title="name"
                    item-value="value"
                    variant="outlined"
                    density="comfortable"
                    color="accent"
                    :label="$t('ow.themeVisual')"
                    class="mb-3"
                  />

                  <div class="d-flex align-center ga-2 mb-3 mt-4">
                    <v-icon icon="mdi-format-font" color="accent" />
                    <div class="text-subtitle-1 font-weight-bold text-white">
                      {{ $t('nav.settingsPage.font') }}
                    </div>
                  </div>

                  <v-select
                    v-model="font"
                    :items="fonts"
                    item-title="label"
                    item-value="value"
                    variant="outlined"
                    density="comfortable"
                    color="accent"
                    :label="$t('ow.typography')"
                  />
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-4 border-grey-darken-3 bg-grey-darken-4">
                  <div class="d-flex align-center ga-2 mb-3">
                    <v-icon icon="mdi-tune-vertical" color="accent" />
                    <div class="text-subtitle-1 font-weight-bold text-white">
                      {{ $t('ow.displayPreferences') }}
                    </div>
                  </div>

                  <v-switch
                    v-model="userViewExotics"
                    color="accent"
                    density="compact"
                    :label="$t('ow.showExoticContent')"
                    class="mb-2"
                  />

                  <v-switch
                    v-model="userDesktopTables"
                    color="accent"
                    density="compact"
                    :label="$t('ow.desktopTables')"
                  />
                </v-card>
              </v-col>
            </v-row>
          </v-window-item>

          <!-- TAB 4: Dados 3D (dddice) -->
          <v-window-item value="dddice" class="h-100 overflow-y-auto">
            <DddiceConfigPanel />
          </v-window-item>
        </v-window>
      </v-card-text>

      <!-- Footer -->
      <v-card-actions class="px-4 py-3 border-t border-grey-darken-3 bg-grey-darken-4 d-flex justify-space-between align-center">
        <div class="text-caption text-grey">
          COMP/CON Active Mode
        </div>
        <v-btn
          color="accent"
          variant="flat"
          class="font-weight-bold rounded-0"
          prepend-icon="mdi-check"
          @click="close"
        >
          {{ $t('ow.finish') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { SUPPORTED_LOCALES, i18n } from '@/i18n'
import {
  completeness,
  fetchCompleteness,
  QUALITY_THRESHOLD,
  TRANSLATION_COMPONENTS,
} from '@/i18n/completeness'
import { NavStore, UserStore } from '@/stores'
import * as allThemes from '@/ui/style/themes'
import { SetValue } from '@/io/Storage'

import PacksList from '@/features/nav/pages/ExtraContent/PacksList.vue'
import PackInstall from '@/features/nav/pages/ExtraContent/PackInstall.vue'
import PacksDirectory from '@/features/nav/pages/ExtraContent/PacksDirectory.vue'
import PackConfig from '@/features/nav/pages/ExtraContent/PackConfig.vue'
import DddiceConfigPanel from './DddiceConfigPanel.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    initialTab?: 'lcps' | 'language' | 'settings' | 'dddice'
  }>(),
  {
    initialTab: 'lcps',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { mdAndDown: mobile } = useDisplay()
const themeObj = useTheme()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

const activeTab = ref<'lcps' | 'language' | 'settings' | 'dddice'>(props.initialTab)
const lcpSubTab = ref<'install' | 'list' | 'directory' | 'config'>('install')

watch(
  () => props.initialTab,
  (val) => {
    if (val) activeTab.value = val
  }
)

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.initialTab) {
      activeTab.value = props.initialTab
    }
  }
)

function close() {
  isOpen.value = false
}

// ----------------------------------------------------
// Language & Translation
// ----------------------------------------------------
const languages = computed(() =>
  SUPPORTED_LOCALES.map((l) => ({
    code: l.code,
    name: l.name,
  }))
)

const currentLanguage = computed({
  get: () => NavStore().Language,
  set: (newVal: string) => {
    NavStore().setLanguage(newVal)
  },
})

function componentPct(comp: string, lang: string): number {
  return completeness.value[lang]?.[comp] ?? (lang === 'en' ? 100 : 0)
}

function getTransColor(comp: string, lang: string): string {
  const pct = componentPct(comp, lang)
  if (pct >= QUALITY_THRESHOLD) return 'success'
  if (pct >= 50) return 'warning'
  return 'error'
}

onMounted(() => {
  fetchCompleteness()
})

// ----------------------------------------------------
// Appearance & Settings
// ----------------------------------------------------
const user = computed(() => UserStore().User)

const fonts = [
  { label: 'Inter (Padrão COMP/CON v3)', value: 'inter' },
  { label: 'Noto Sans (Alternativo)', value: 'noto' },
  { label: 'Helvetica (Clássico v2)', value: 'helvetica' },
  { label: 'OpenDyslexic (Acessibilidade)', value: 'opendyslexic' },
]

const themes = Object.keys(allThemes)
  .map((x) => ({
    id: (allThemes as any)[x].id,
    name: (allThemes as any)[x].name,
    value: x,
    category: (allThemes as any)[x].category || '',
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const font = computed({
  get: () => user.value.Font,
  set: (newVal: string) => {
    user.value.Font = newVal
    document.documentElement.setAttribute('data-font', newVal)
  },
})

const theme = computed({
  get: () => user.value?.Theme || themeObj.global.name.value,
  set: (newVal: string) => {
    if (!newVal) return
    if (user.value) user.value.Theme = newVal
    themeObj.global.name.value = newVal
    void SetValue('user_theme', newVal)
  },
})

const userViewExotics = computed({
  get: () => !!user.value.Option('showExotics'),
  set: (newVal: boolean) => user.value.SetOption('showExotics', newVal),
})

const userDesktopTables = computed({
  get: () => user.value.View('useDesktopTables', false),
  set: (newVal: boolean) => user.value.SetView('useDesktopTables', newVal),
})
</script>

<style scoped>
.options-dialog-card {
  border: 1px solid rgba(var(--v-theme-accent), 0.35) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6) !important;
}

.options-dialog-card :deep(.v-window) {
  height: 100%;
}

.options-dialog-card :deep(.v-window__container) {
  height: 100%;
}

.options-dialog-card :deep(.v-window-item) {
  height: 100%;
  overflow-y: auto;
}

/* Custom sleek scrollbar */
.options-dialog-card :deep(.v-window-item)::-webkit-scrollbar {
  width: 8px;
}

.options-dialog-card :deep(.v-window-item)::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.25);
}

.options-dialog-card :deep(.v-window-item)::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-accent), 0.4);
  border-radius: 4px;
}

.options-dialog-card :deep(.v-window-item)::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-accent), 0.8);
}
</style>
