<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { dddiceService } from '@/services/dddiceService'
import { dicePlusService, type DicePlusRollTarget } from '@/services/dicePlusService'

const showApiKey = ref(false)
const isDetecting = ref(false)
const isTesting = ref(false)
const isLoadingThemes = ref(false)
const testFeedback = ref<{ success: boolean; message: string } | null>(null)

const statusText = computed(() => {
  if (!dddiceService.config.enabled || dddiceService.config.provider === 'none') return 'Desativado'
  if (dddiceService.config.provider === 'dice-plus') {
    return dicePlusService.isReady.value ? 'Conectado' : 'Aguardando Extensão'
  }
  if (!dddiceService.config.roomSlug) return 'Aguardando Sala'
  return 'Conectado'
})

const statusColor = computed(() => {
  if (!dddiceService.config.enabled || dddiceService.config.provider === 'none') return 'grey'
  if (dddiceService.config.provider === 'dice-plus') {
    return dicePlusService.isReady.value ? 'success' : 'warning'
  }
  if (!dddiceService.config.roomSlug) return 'warning'
  return 'success'
})

const themeOptions = computed(() => {
  return dddiceService.availableThemes.value
})

const rollTargetOptions = [
  { value: 'everyone', title: 'Todos na Mesa', desc: 'Todos os jogadores veem a animação 3D e o resultado' },
  { value: 'self', title: 'Apenas Eu', desc: 'Rolagem privada, visível somente na sua tela' },
  { value: 'dm', title: 'Mestre e Eu', desc: 'Você e o Mestre da mesa veem o arremesso e o resultado' },
  { value: 'gm_only', title: 'Apenas o Mestre', desc: 'O dado rola secretamente na tela do Mestre' },
]

function saveSettings() {
  dddiceService.saveConfig()
  dicePlusService.saveConfig()
}

function onSlugChange(val: string | null) {
  if (val) {
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

async function checkDicePlusConnection() {
  testFeedback.value = null
  const ready = await dicePlusService.checkReady(2000)
  if (ready) {
    testFeedback.value = {
      success: true,
      message: 'Extensão Dice+ conectada e pronta para rolagens!',
    }
  } else {
    testFeedback.value = {
      success: false,
      message: 'A extensão Dice+ não respondeu. Verifique se ela está instalada e aberta na sala do Owlbear Rodeo.',
    }
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
  dicePlusService.init()
  if (dddiceService.config.provider === 'dddice') {
    if (dddiceService.config.apiKey) {
      void loadThemes()
    }
    if (dddiceService.config.roomSlug) {
      void dddiceService.joinRoom(dddiceService.config.roomSlug)
    }
  } else if (dddiceService.config.provider === 'dice-plus') {
    void dicePlusService.checkReady()
  }
})
</script>

<template>
  <div class="dddice-config-panel pa-2 pa-sm-4">
    <!-- Seletor de Provedor de Dados 3D -->
    <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-4 mb-4">
      <div class="text-caption font-weight-bold text-accent text-uppercase mb-2 d-flex align-center ga-2">
        <v-icon icon="mdi-dice-multiple" size="16" />
        Escolha o Provedor de Dados 3D
      </div>
      <v-btn-toggle
        v-model="dddiceService.config.provider"
        mandatory
        color="accent"
        variant="outlined"
        density="comfortable"
        class="w-100 d-flex flex-wrap ga-1"
        @update:model-value="saveSettings"
      >
        <v-btn
          value="dice-plus"
          class="flex-grow-1 font-weight-bold"
          prepend-icon="mdi-dice-d20-outline"
        >
          Dice+ (Nativo Owlbear)
        </v-btn>
        <v-btn
          value="dddice"
          class="flex-grow-1 font-weight-bold"
          prepend-icon="mdi-cube-outline"
        >
          dddice (Web 3D)
        </v-btn>
        <v-btn
          value="none"
          class="flex-grow-1 font-weight-bold"
          prepend-icon="mdi-close-circle-outline"
        >
          Desativado
        </v-btn>
      </v-btn-toggle>
    </v-card>

    <!-- CASO 1: DICE+ NATIVO -->
    <template v-if="dddiceService.config.provider === 'dice-plus'">
      <!-- Header Hero Banner Dice+ -->
      <v-card
        variant="outlined"
        class="border-accent bg-grey-darken-4 mb-4 pa-4 position-relative overflow-hidden"
      >
        <div class="d-flex align-center justify-space-between flex-wrap ga-3">
          <div class="d-flex align-center ga-3">
            <v-avatar size="44" color="accent" class="rounded-0 elevation-3">
              <v-icon icon="mdi-dice-d20-outline" size="28" color="black" />
            </v-avatar>
            <div>
              <div class="d-flex align-center ga-2">
                <span class="text-h6 font-weight-bold text-accent text-uppercase" style="letter-spacing: 1px;">
                  Dice+
                </span>
                <v-chip
                  size="x-small"
                  :color="statusColor"
                  variant="flat"
                  class="font-weight-bold text-uppercase"
                >
                  <v-icon
                    :icon="dicePlusService.isReady.value ? 'mdi-check-circle' : 'mdi-alert-circle'"
                    size="12"
                    class="mr-1"
                  />
                  {{ statusText }}
                </v-chip>
              </div>
              <div class="text-caption text-grey-lighten-1">
                Extensão 3D oficial do Owlbear Rodeo com física determinística
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
        <!-- Left Column: Status e Preferências de Exibição -->
        <v-col cols="12" md="7">
          <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-4 mb-4">
            <div class="text-subtitle-1 font-weight-bold text-accent text-uppercase mb-3 d-flex align-center ga-2">
              <v-icon icon="mdi-lan-connect" size="18" />
              Conexão com a Extensão Dice+
            </div>

            <div class="text-caption text-grey-lighten-1 mb-3" style="line-height: 1.5;">
              O <strong>Dice+</strong> roda nativamente no seu Owlbear Rodeo através de canais de broadcast. Não exige cadastro, chaves de API nem sala externa.
            </div>

            <!-- Alerta de Conectividade -->
            <v-alert
              v-if="dicePlusService.isReady.value"
              type="success"
              variant="tonal"
              density="compact"
              class="mb-3 text-caption"
            >
              Extensão Dice+ detectada e pronta para rolagens nesta sala do Owlbear Rodeo!
            </v-alert>
            <v-alert
              v-else
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3 text-caption"
            >
              A extensão Dice+ não respondeu na sala atual. Certifique-se de que o Dice+ está instalado no Owlbear Rodeo e aberto na barra de ferramentas.
            </v-alert>

            <div class="d-flex flex-wrap ga-2 mb-3">
              <v-btn
                color="accent"
                variant="outlined"
                size="small"
                prepend-icon="mdi-refresh"
                :loading="dicePlusService.isChecking.value"
                @click="checkDicePlusConnection"
              >
                Verificar Conexão
              </v-btn>
              <v-btn
                variant="text"
                size="small"
                color="grey-lighten-1"
                prepend-icon="mdi-open-in-new"
                href="https://extensions.owlbear.rodeo/dice-plus"
                target="_blank"
              >
                Instalar / Ver Dice+
              </v-btn>
            </div>

            <v-divider class="my-3 border-grey-darken-3" />

            <!-- Opções Visuais e Comportamento -->
            <div class="text-subtitle-2 font-weight-bold text-accent text-uppercase mb-2">
              Comportamento do Dice+
            </div>

            <v-checkbox
              v-model="dicePlusService.config.showResults"
              color="accent"
              density="compact"
              hide-details
              label="Exibir popup nativo de resultado do Dice+ na mesa"
              @update:model-value="saveSettings"
            />

            <v-checkbox
              v-model="dicePlusService.config.showNotification"
              color="accent"
              density="compact"
              hide-details
              class="mt-2"
              label="Exibir notificação flutuante no Owlbear quando rolar dados"
              @update:model-value="saveSettings"
            />

            <v-checkbox
              v-model="dicePlusService.config.minimizeOnRoll"
              color="accent"
              density="compact"
              hide-details
              class="mt-2"
              label="Minimizar janela COMP/CON durante o arremesso (exibe o mapa e dados 3D)"
              @update:model-value="saveSettings"
            />

            <div v-if="dicePlusService.config.minimizeOnRoll" class="ml-7 mt-1 d-flex align-center ga-3">
              <span class="text-caption text-grey">Tempo minimizado:</span>
              <v-btn-toggle
                v-model="dicePlusService.config.minimizeDuration"
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
          </v-card>
        </v-col>

        <!-- Right Column: Alvo da Rolagem & Teste -->
        <v-col cols="12" md="5">
          <!-- Alvo da Rolagem -->
          <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-4 mb-4">
            <div class="text-subtitle-1 font-weight-bold text-accent text-uppercase mb-3 d-flex align-center ga-2">
              <v-icon icon="mdi-account-group" size="18" />
              Visibilidade (Alvo da Rolagem)
            </div>

            <div class="text-caption text-grey-lighten-1 mb-3">
              Define quem verá o arremesso físico 3D e o resultado dos seus dados:
            </div>

            <v-radio-group
              v-model="dicePlusService.config.rollTarget"
              color="accent"
              density="compact"
              hide-details
              @update:model-value="saveSettings"
            >
              <v-radio
                v-for="target in rollTargetOptions"
                :key="target.value"
                :value="target.value"
                class="mb-2"
              >
                <template #label>
                  <div>
                    <div class="text-caption font-weight-bold text-white">{{ target.title }}</div>
                    <div class="text-caption text-grey" style="font-size: 11px;">{{ target.desc }}</div>
                  </div>
                </template>
              </v-radio>
            </v-radio-group>
          </v-card>

          <!-- Teste de Rolagem Dice+ -->
          <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-4">
            <div class="text-subtitle-1 font-weight-bold text-accent text-uppercase mb-2 d-flex align-center ga-2">
              <v-icon icon="mdi-dice-5" size="18" />
              Testar Conexão com Dice+
            </div>
            <div class="text-caption text-grey mb-3">
              Dispara uma rolagem de teste (1d20 + 1d6) via canal de broadcast do Dice+.
            </div>

            <v-btn
              color="secondary"
              variant="flat"
              size="small"
              prepend-icon="mdi-play"
              :loading="isTesting"
              class="font-weight-bold w-100"
              @click="runTestRoll"
            >
              Testar Rolagem no Dice+
            </v-btn>

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
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- CASO 2: DDDICE -->
    <template v-else-if="dddiceService.config.provider === 'dddice'">
      <!-- Header Hero Banner dddice -->
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
              <div class="text-caption text-grey-lighten-1">
                Serviço 3D online com suporte a salas compartilhadas e temas personalizados
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
                <v-icon icon="mdi-door" color="accent" />
              </template>
              <template #append>
                <v-btn
                  color="accent"
                  variant="flat"
                  size="small"
                  prepend-icon="mdi-radar"
                  class="font-weight-bold"
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
              type="password"
              label="Senha da Sala (Se houver)"
              placeholder="Apenas se a sala dddice exigir senha"
              density="comfortable"
              variant="outlined"
              color="accent"
              class="mb-3"
              clearable
              @update:model-value="saveSettings"
            >
              <template #prepend-inner>
                <v-icon icon="mdi-lock" color="accent" />
              </template>
            </v-text-field>

            <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
              <v-checkbox
                v-model="dddiceService.config.autoDetectRoom"
                color="accent"
                density="compact"
                hide-details
                label="Tentar autodetectar sala do Owlbear automaticamente ao iniciar"
                @update:model-value="saveSettings"
              />

              <v-btn
                v-if="dddiceService.config.roomSlug"
                :href="`https://dddice.com/rooms/${dddiceService.config.roomSlug}`"
                target="_blank"
                variant="text"
                size="x-small"
                color="grey-lighten-1"
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
    </template>

    <!-- CASO 3: DESATIVADO -->
    <template v-else>
      <v-card variant="outlined" class="border-grey-darken-3 bg-grey-darken-4 pa-6 text-center">
        <v-avatar size="56" color="grey-darken-3" class="mb-3">
          <v-icon icon="mdi-dice-multiple-outline" size="32" color="grey" />
        </v-avatar>
        <div class="text-h6 font-weight-bold text-white mb-2">
          Rolagem de Dados 3D Desativada
        </div>
        <div class="text-body-2 text-grey-lighten-1 mb-4" style="max-width: 500px; margin: 0 auto;">
          As rolagens serão processadas internamente pelo COMP/CON e publicadas apenas nas mensagens de ação e chat da mesa.
        </div>
        <div class="d-flex justify-center ga-3">
          <v-btn
            color="accent"
            variant="flat"
            prepend-icon="mdi-dice-d20-outline"
            class="font-weight-bold"
            @click="dddiceService.config.provider = 'dice-plus'; saveSettings()"
          >
            Usar Dice+ (Owlbear)
          </v-btn>
          <v-btn
            variant="outlined"
            color="grey-lighten-1"
            prepend-icon="mdi-cube-outline"
            @click="dddiceService.config.provider = 'dddice'; saveSettings()"
          >
            Usar dddice
          </v-btn>
        </div>
      </v-card>
    </template>
  </div>
</template>

<style scoped>
.dddice-config-panel {
  color: #fff;
}
</style>
