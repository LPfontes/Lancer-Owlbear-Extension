<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { dddiceService } from '@/services/dddiceService'

const showApiKey = ref(false)
const isDetecting = ref(false)
const isTesting = ref(false)
const isLoadingThemes = ref(false)
const testFeedback = ref<{ success: boolean; message: string } | null>(null)

const statusText = computed(() => {
  if (!dddiceService.config.enabled) return 'Desativado'
  if (!dddiceService.config.roomSlug) return 'Aguardando Sala'
  return 'Conectado'
})

const statusColor = computed(() => {
  if (!dddiceService.config.enabled) return 'grey'
  if (!dddiceService.config.roomSlug) return 'warning'
  return 'success'
})

const themeOptions = computed(() => {
  return dddiceService.availableThemes.value
})

function saveSettings() {
  dddiceService.saveConfig()
}

function onSlugChange(val: string | null) {
  if (val) {
    // Limpa links completos caso o usuário cole a URL da sala
    const match = /dddice\.com\/rooms?\/([a-zA-Z0-9_-]+)/.exec(val)
    if (match && match[1]) {
      dddiceService.config.roomSlug = match[1]
    }
  }
  saveSettings()
  if (dddiceService.config.roomSlug) {
    void dddiceService.joinRoom(dddiceService.config.roomSlug)
  }
}

async function detectRoom() {
  isDetecting.value = true
  testFeedback.value = null
  try {
    const slug = await dddiceService.detectRoomFromObr()
    if (slug) {
      testFeedback.value = {
        success: true,
        message: `Sala '${slug}' detectada com sucesso nos metadados do Owlbear Rodeo!`,
      }
      void dddiceService.joinRoom(slug)
    } else {
      testFeedback.value = {
        success: false,
        message: 'Nenhuma sala do dddice detectada automaticamente. Certifique-se de que a extensão dddice está aberta no Owlbear Rodeo ou insira o Room Slug manualmente.',
      }
    }
  } finally {
    isDetecting.value = false
  }
}

async function runTestRoll() {
  isTesting.value = true
  testFeedback.value = null
  try {
    const res = await dddiceService.testRoll()
    testFeedback.value = res
  } finally {
    isTesting.value = false
  }
}

async function loadThemes() {
  isLoadingThemes.value = true
  try {
    await dddiceService.fetchDiceBoxThemes()
  } finally {
    isLoadingThemes.value = false
  }
}

onMounted(() => {
  dddiceService.init()
  if (dddiceService.config.apiKey) {
    void loadThemes()
  }
  if (dddiceService.config.roomSlug) {
    void dddiceService.joinRoom(dddiceService.config.roomSlug)
  }
})
</script>

<template>
  <div class="dddice-config-panel pa-2 pa-sm-4">
    <!-- Header Hero Banner -->
    <v-card
      variant="outlined"
      class="border-accent bg-grey-darken-4 mb-4 pa-4 position-relative overflow-hidden"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-3">
        <div class="d-flex align-center ga-3">
          <v-avatar size="44" color="accent" class="rounded-0 elevation-3">
            <v-icon icon="mdi-dice-multiple" size="28" color="black" />
          </v-avatar>
          <div>
            <div class="d-flex align-center ga-2">
              <span class="text-h6 font-weight-bold text-accent text-uppercase" style="letter-spacing: 1px;">
                dddice
              </span>
              <v-chip
                size="x-small"
                :color="statusColor"
                variant="flat"
                class="font-weight-bold text-uppercase"
              >
                {{ statusText }}
              </v-chip>
            </div>
          </div>
        </div>

        <!-- Global Toggle -->
        <div class="d-flex align-center">
          <v-switch
            v-model="dddiceService.config.enabled"
            color="accent"
            hide-details
            density="compact"
            inset
            label="Ativar Dados 3D"
            @update:model-value="saveSettings"
          />
        </div>
      </div>
    </v-card>

    <v-row dense>
      <!-- Left Column: Configuração da Sala -->
      <v-col cols="12" md="7">
        <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-4 mb-4 fill-height">
          <div class="text-subtitle-1 font-weight-bold text-accent text-uppercase mb-3 d-flex align-center ga-2">
            <v-icon icon="mdi-link-variant" size="18" />
            Conexão com a Sala dddice
          </div>

          <v-text-field
            v-model="dddiceService.config.roomSlug"
            label="Código da Sala (Room Slug)"
            placeholder="ex: eKVCvaz ou https://dddice.com/rooms/..."
            density="comfortable"
            variant="outlined"
            color="accent"
            class="mb-3"
            clearable
            @update:model-value="onSlugChange"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-cube-outline" color="accent" />
            </template>
            <template #append>
              <v-btn
                color="accent"
                variant="tonal"
                size="small"
                class="font-weight-bold"
                prepend-icon="mdi-radar"
                :loading="isDetecting"
                title="Procura a sala configurada pela extensão dddice no Owlbear Rodeo"
                @click="detectRoom"
              >
                Auto-Detectar
              </v-btn>
            </template>
          </v-text-field>

          <v-text-field
            v-model="dddiceService.config.passcode"
            label="Senha da Sala (Passcode - Opcional)"
            placeholder="Apenas se a sala dddice exigir senha"
            density="compact"
            variant="outlined"
            color="accent"
            type="password"
            class="mb-3"
            clearable
            @update:model-value="saveSettings"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-lock-outline" color="grey" />
            </template>
          </v-text-field>

          <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
            <v-checkbox
              v-model="dddiceService.config.autoDetectRoom"
              color="accent"
              density="compact"
              hide-details
              label="Detectar automaticamente ao abrir sala no Owlbear"
              @update:model-value="saveSettings"
            />

            <v-btn
              v-if="dddiceService.config.roomSlug"
              :href="`https://dddice.com/rooms/${dddiceService.config.roomSlug}`"
              target="_blank"
              variant="text"
              size="small"
              color="accent"
              prepend-icon="mdi-open-in-new"
            >
              Abrir Sala no dddice
            </v-btn>
          </div>

          <v-divider class="my-3 border-grey-darken-3" />

          <!-- Notificações -->
          <v-checkbox
            v-model="dddiceService.config.showNotification"
            color="accent"
            density="compact"
            hide-details
            label="Exibir notificação no Owlbear quando rolar dados"
            @update:model-value="saveSettings"
          />

          <!-- Auto-minimizar durante rolagem -->
          <v-checkbox
            v-model="dddiceService.config.minimizeOnRoll"
            color="accent"
            density="compact"
            hide-details
            class="mt-2"
            label="Minimizar janela durante a rolagem (exibe o mapa e dados 3D)"
            @update:model-value="saveSettings"
          />

          <div v-if="dddiceService.config.minimizeOnRoll" class="ml-7 mt-1 d-flex align-center ga-3">
            <span class="text-caption text-grey">Tempo minimizado:</span>
            <v-btn-toggle
              v-model="dddiceService.config.minimizeDuration"
              density="compact"
              color="accent"
              mandatory
              variant="outlined"
              @update:model-value="saveSettings"
            >
              <v-btn :value="3" size="x-small">3s</v-btn>
              <v-btn :value="4" size="x-small">4s</v-btn>
              <v-btn :value="5" size="x-small">5s</v-btn>
              <v-btn :value="6" size="x-small">6s</v-btn>
            </v-btn-toggle>
          </div>

          <!-- Botão de Teste -->
          <div class="mt-4 pt-2 border-t border-grey-darken-3">
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="text-caption font-weight-bold text-white">Testar Conexão</div>
                <div class="text-caption text-grey">Dispara um teste com 1d20 + 1d6 na sala configurada.</div>
              </div>

              <v-btn
                color="secondary"
                variant="flat"
                size="small"
                prepend-icon="mdi-dice-5"
                :loading="isTesting"
                :disabled="!dddiceService.config.roomSlug"
                class="font-weight-bold"
                @click="runTestRoll"
              >
                Testar Rolagem 3D
              </v-btn>
            </div>

            <!-- Feedback de Teste -->
            <v-alert
              v-if="testFeedback"
              :type="testFeedback.success ? 'success' : 'error'"
              variant="tonal"
              density="compact"
              class="mt-3 text-caption"
              closable
              @click:close="testFeedback = null"
            >
              {{ testFeedback.message }}
            </v-alert>
          </div>
        </v-card>
      </v-col>

      <!-- Right Column: Personalização & Conta -->
      <v-col cols="12" md="5">
        <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-4 mb-4 fill-height">
          <div class="text-subtitle-1 font-weight-bold text-accent text-uppercase mb-3 d-flex align-center ga-2">
            <v-icon icon="mdi-palette-outline" size="18" />
            Tema & Credenciais Opcionais
          </div>

          <!-- Tema dos Dados -->
          <v-select
            v-model="dddiceService.config.theme"
            :items="themeOptions"
            item-title="name"
            item-value="id"
            label="Tema dos Dados 3D"
            density="comfortable"
            variant="outlined"
            color="accent"
            class="mb-3"
            @update:model-value="saveSettings"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-palette" color="accent" />
            </template>
            <template #append>
              <v-btn
                icon="mdi-refresh"
                variant="text"
                size="small"
                color="grey-lighten-1"
                title="Recarregar temas da conta"
                :loading="isLoadingThemes"
                @click="loadThemes"
              />
            </template>
          </v-select>

          <!-- API Key Opcional -->
          <v-text-field
            v-model="dddiceService.config.apiKey"
            :type="showApiKey ? 'text' : 'password'"
            label="API Key dddice (Opcional)"
            placeholder="Chave de desenvolvedor dddice"
            density="comfortable"
            variant="outlined"
            color="accent"
            class="mb-2"
            clearable
            @update:model-value="saveSettings"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-key" color="accent" />
            </template>
            <template #append-inner>
              <v-btn
                variant="text"
                size="x-small"
                icon
                @click="showApiKey = !showApiKey"
              >
                <v-icon :icon="showApiKey ? 'mdi-eye-off' : 'mdi-eye'" size="16" />
              </v-btn>
            </template>
          </v-text-field>

          <div class="text-caption text-grey-lighten-1 mb-4" style="line-height: 1.4;">
            <v-icon icon="mdi-information-outline" size="14" color="accent" class="mr-1" />
            Deixe em branco para usar uma conexão <strong>Guest Gratuita</strong> automática. Insira sua chave apenas se você comprou temas exclusivos de Mech no dddice e deseja usá-los.
          </div>

          <v-divider class="my-3 border-grey-darken-3" />

          <!-- Como Funciona -->
          <div class="text-caption font-weight-bold text-accent text-uppercase mb-2">
            Como Funciona no Owlbear Rodeo:
          </div>
          <div class="text-caption text-grey-lighten-2" style="line-height: 1.5;">
            <div class="d-flex align-start ga-2 mb-1">
              <span class="text-accent font-weight-bold">1.</span>
              <span>Instale a extensão oficial <strong>dddice</strong> no Owlbear Rodeo.</span>
            </div>
            <div class="d-flex align-start ga-2 mb-1">
              <span class="text-accent font-weight-bold">2.</span>
              <span>Abra a extensão na sala e clique em <strong>Auto-Detectar</strong>.</span>
            </div>
            <div class="d-flex align-start ga-2">
              <span class="text-accent font-weight-bold">3.</span>
              <span>Pronto! Ataques, danos e rolagens do COMP/CON surgirão em 3D na mesa.</span>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.dddice-config-panel {
  color: #fff;
}
</style>
