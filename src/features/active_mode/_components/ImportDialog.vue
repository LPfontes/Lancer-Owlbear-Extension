<template>
  <v-dialog v-model="isOpen" max-width="650px" persistent>
    <v-card class="bg-grey-darken-4 border-accent">
      <v-card-title class="d-flex justify-space-between align-center text-h6 text-accent pa-4 border-b border-grey-darken-3">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-file-import-outline" color="accent" />
          <span>Importar Piloto ou NPC para o Active Mode</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-card-text class="pa-4">
        <v-tabs v-model="activeTab" color="accent" grow class="mb-4">
          <v-tab value="sharecode" prepend-icon="mdi-link-variant">ShareCode</v-tab>
          <v-tab value="json" prepend-icon="mdi-code-json">JSON (Texto ou Arquivo)</v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <!-- ShareCode Tab -->
          <v-window-item value="sharecode">
            <div class="text-caption text-grey mb-3">
              Cole abaixo o ShareCode gerado pelo COMP/CON (ex: <code>a1b2-c3d4-e5f6</code>) ou o link completo do piloto/NPC:
            </div>
            <v-text-field
              v-model="shareCodeInput"
              label="ShareCode ou URL do COMP/CON"
              placeholder="ex: 1234-abcd-5678"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-cloud-download-outline"
              clearable
              :error-messages="errorMessage"
              @keyup.enter="handleShareCodeImport"
            />
            <v-btn
              color="accent"
              block
              size="large"
              :loading="isLoading"
              :disabled="!shareCodeInput?.trim()"
              prepend-icon="mdi-download"
              class="mt-2"
              @click="handleShareCodeImport"
            >
              Baixar e Importar via ShareCode
            </v-btn>
          </v-window-item>

          <!-- JSON Tab -->
          <v-window-item value="json">
            <div class="text-caption text-grey mb-3">
              Selecione um arquivo <code>.json</code> exportado do COMP/CON ou cole o conteúdo JSON diretamente abaixo:
            </div>

            <!-- File Upload -->
            <v-file-input
              v-model="fileInput"
              label="Selecionar Arquivo .json"
              accept=".json,application/json"
              variant="outlined"
              density="compact"
              prepend-icon="mdi-paperclip"
              show-size
              clearable
              class="mb-3"
              @change="handleFileUpload"
            />

            <div class="text-caption text-grey mb-1">Ou cole o JSON aqui:</div>
            <v-textarea
              v-model="jsonTextInput"
              rows="6"
              variant="outlined"
              density="compact"
              placeholder='{ "callsign": "SPECTER", ... }'
              clearable
              :error-messages="errorMessage"
            />

            <v-btn
              color="accent"
              block
              size="large"
              :loading="isLoading"
              :disabled="!jsonTextInput?.trim() && !fileInput"
              prepend-icon="mdi-file-document-check-outline"
              class="mt-2"
              @click="handleJsonImport"
            >
              Processar e Criar no Active Mode
            </v-btn>
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions class="pa-4 pt-0 justify-end">
        <v-btn color="grey" variant="text" @click="close">Cancelar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PilotStore, PilotSheetStore, NpcStore } from '@/stores'
import { Pilot } from '@/classes/pilot/Pilot'
import { Unit } from '@/classes/npc/unit/Unit'
import PilotSheet from '@/features/pilot_management/store/PilotSheet'
import { notify } from '@/util/notify.js'

const props = withDefaults(defineProps<{
  modelValue: boolean
  redirect?: boolean
}>(), {
  redirect: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'imported', payload: { type: 'pilot' | 'npc' | 'encounter'; id: string }): void
}>()

const router = useRouter()
const isOpen = ref(false)
const activeTab = ref('sharecode')
const shareCodeInput = ref('')
const jsonTextInput = ref('')
const fileInput = ref<File | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

watch(() => props.modelValue, (val) => {
  isOpen.value = val
  if (val) {
    errorMessage.value = ''
    shareCodeInput.value = ''
    jsonTextInput.value = ''
    fileInput.value = null
  }
})

function close() {
  isOpen.value = false
  emit('update:modelValue', false)
}

function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        jsonTextInput.value = event.target.result as string
      }
    }
    reader.readAsText(file)
  }
}

async function handleShareCodeImport() {
  if (!shareCodeInput.value.trim()) return
  isLoading.value = true
  errorMessage.value = ''

  try {
    // Limpa a URL caso o usuário cole o link completo
    let code = shareCodeInput.value.trim()
    if (code.includes('/link/pilot/')) {
      code = code.split('/link/pilot/')[1].split('/')[0]
    }
    code = code.replace(/[^a-zA-Z0-9]/g, '')

    let jsonPayload: any = null

    // Chama o Proxy Backend local/integrado do dev server
    try {
      const response = await fetch(`/api/share/${code}`)
      if (response.ok) {
        const text = await response.text()
        try {
          jsonPayload = JSON.parse(text)
        } catch {
          // Não é JSON
        }
      }
    } catch (fetchErr) {
      console.warn(`Fetch via proxy /api/share/${code} falhou:`, fetchErr)
    }

    if (!jsonPayload || jsonPayload.error) {
      throw new Error(
        jsonPayload?.error ||
        'Não foi possível encontrar este ShareCode na nuvem do COMP/CON. Certifique-se de que o código está correto e sincronizado na nuvem, ou utilize a aba "JSON (Texto ou Arquivo)" ao lado.'
      )
    }

    await processImportPayload(jsonPayload)
  } catch (err: any) {
    console.error('Erro ao importar por ShareCode:', err)
    errorMessage.value = err.message || 'Erro ao consultar ShareCode.'
  } finally {
    isLoading.value = false
  }
}

async function handleJsonImport() {
  if (!jsonTextInput.value.trim()) return
  isLoading.value = true
  errorMessage.value = ''

  try {
    const parsed = JSON.parse(jsonTextInput.value.trim())
    await processImportPayload(parsed)
  } catch (err: any) {
    console.error('Erro ao importar JSON:', err)
    errorMessage.value = 'Formato JSON inválido ou incompatível.'
  } finally {
    isLoading.value = false
  }
}

async function processImportPayload(data: any) {
  // Se os dados vierem encapsulados no payload de nuvem
  const payload = data.data || data.payload || data

  // 1. Tenta tratar como PilotSheet (Ficha exportada do Active Mode)
  if (payload.combatant && (payload.combatant.actor || payload.combatant.id)) {
    try {
      const sheet = PilotSheet.Deserialize(payload)
      await PilotSheetStore().ImportPilotSheet(sheet)
      emit('imported', { type: 'pilot', id: sheet.ID })
      close()
      notify({ type: 'success', text: `Ficha ${sheet.Name || ''} importada com sucesso!` })
      if (props.redirect) {
        router.push(`/active-mode/pilot-runner/${sheet.ID}`)
      }
      return
    } catch (e) {
      console.log('Não é um PilotSheet válido...', e)
    }
  }

  // 2. Tenta tratar como Piloto do COMP/CON
  if (payload.callsign || payload.mechs || payload.ID || payload.id) {
    try {
      const pilot = Pilot.Deserialize(payload)
      if (pilot.Mechs && pilot.Mechs.length > 0 && !pilot.ActiveMech) {
        pilot.ActiveMech = pilot.FavoriteMech || pilot.Mechs[0]
      }
      await PilotStore().AddPilot(pilot)
      await PilotSheetStore().AddPilotSheet(pilot)
      const sheetId = PilotSheetStore().CurrentActiveID
      
      emit('imported', { type: 'pilot', id: sheetId })
      close()
      notify({ type: 'success', text: `Ficha de ${pilot.Callsign || pilot.Name} importada com sucesso!` })
      if (props.redirect) {
        router.push(`/active-mode/pilot-runner/${sheetId}`)
      }
      return
    } catch (e) {
      console.log('Não é um piloto válido, tentando como NPC...', e)
    }
  }

  // 3. Tenta tratar como NPC / Unidade
  if (payload.npcClass || payload.features || payload.NpcClass) {
    try {
      const unit = Unit.Deserialize(payload)
      await NpcStore().AddNpc(unit)
      
      emit('imported', { type: 'npc', id: unit.ID })
      close()
      notify({ type: 'success', text: `NPC ${unit.Name || ''} importado com sucesso!` })
      if (props.redirect) {
        router.push('/active-mode/manage-encounters')
      }
      return
    } catch (e) {
      console.log('Não é um NPC válido...', e)
    }
  }

  throw new Error('O JSON/ShareCode fornecido não contém uma Ficha de Piloto ou NPC válida do COMP/CON.')
}
</script>
