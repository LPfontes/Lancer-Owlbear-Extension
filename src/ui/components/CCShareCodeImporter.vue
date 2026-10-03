<template>
  <cc-dialog
    ref="modal"
    :title="$t('active.titles.addFromShareCode').toLowerCase()"
    icon="mdi-code-block-brackets"
    :close-on-click="false"
    major
    max-width="90vw"
  >
    <template #activator="{ open }">
      <cc-button
        :color="color"
        :size="size"
        :block="blockBtn"
        :icon="mobile && !fullWidth ? 'mdi-code-block-brackets' : undefined"
        prepend-icon="mdi-code-block-brackets"
        @click="open"
      >
        {{ title }}
        <template
          v-if="subtitle"
          #subtitle
        >
          <span class="text-cc-overline">{{ subtitle }}</span>
        </template>
      </cc-button>
    </template>

    <div class="pa-2">
      <!-- Tabs: ShareCode / URL vs JSON -->
      <v-tabs
        v-model="activeTab"
        color="primary"
        grow
        class="mb-4 border-b border-grey-darken-3"
      >
        <v-tab value="sharecode" prepend-icon="mdi-link-variant">
          {{ $t('ui.shareImport.itemShareCode') || 'ShareCode / Link' }}
        </v-tab>
        <v-tab value="json" prepend-icon="mdi-code-json">
          JSON (Texto ou Arquivo)
        </v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- Tab 1: ShareCode ou Link COMP/CON -->
        <v-window-item value="sharecode">
          <div class="px-2">
            <div class="text-caption text-grey mb-2">
              Cole abaixo o ShareCode gerado pelo COMP/CON ou o link completo do piloto/NPC:
            </div>
            <v-text-field
              v-model="shareCodeInput"
              label="ShareCode ou Link do COMP/CON"
              placeholder="ex: QT2P1NEWL4NN ou https://compcon.app/#/link/pilot/..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-cloud-download-outline"
              clearable
              :error-messages="badCode ? $t('ui.shareImport.noItemFound', { code: badCode }) : ''"
              @keyup.enter="handleShareCodeSubmit"
            />
            <v-row no-gutters justify="center" class="my-2 ga-2">
              <v-col cols="auto" class="flex-grow-1">
                <cc-button
                  color="primary"
                  block
                  size="large"
                  :disabled="!shareCodeInput?.trim()"
                  :loading="loading"
                  prepend-icon="mdi-download"
                  @click="handleShareCodeSubmit"
                >
                  {{ $t('ui.shareImport.findItem') }}
                </cc-button>
              </v-col>
              <v-col cols="auto">
                <v-btn
                  size="44"
                  icon
                  tile
                  flat
                  color="panel"
                  title="Limpar busca"
                  @click="reset"
                >
                  <v-icon icon="mdi-close" />
                </v-btn>
              </v-col>
            </v-row>
          </div>
        </v-window-item>

        <!-- Tab 2: JSON Texto ou Arquivo -->
        <v-window-item value="json">
          <div class="px-2">
            <div class="text-caption text-grey mb-2">
              Selecione um arquivo <code>.json</code> exportado do COMP/CON ou cole o conteúdo JSON diretamente abaixo:
            </div>
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
              rows="5"
              variant="outlined"
              density="compact"
              placeholder='{ "callsign": "SPECTER", ... }'
              clearable
            />
            <v-row no-gutters justify="center" class="my-2 ga-2">
              <v-col cols="auto" class="flex-grow-1">
                <cc-button
                  color="primary"
                  block
                  size="large"
                  :disabled="!jsonTextInput?.trim() && !fileInput"
                  :loading="loading"
                  prepend-icon="mdi-file-document-check-outline"
                  @click="handleJsonSubmit"
                >
                  Processar Ficha JSON
                </cc-button>
              </v-col>
              <v-col cols="auto">
                <v-btn
                  size="44"
                  icon
                  tile
                  flat
                  color="panel"
                  title="Limpar formulário"
                  @click="reset"
                >
                  <v-icon icon="mdi-close" />
                </v-btn>
              </v-col>
            </v-row>
          </div>
        </v-window-item>
      </v-window>
    </div>

    <v-card-text>
      <v-scroll-y-reverse-transition>
        <div v-if="badCode && !queryResult">
          <v-divider class="my-4" />
          <div class="text-center">
            <cc-alert
              type="error"
              prominent
              density="compact"
              icon="mdi-information-outline"
              title="error"
            >
              {{ $t('ui.shareImport.noItemFound', { code: badCode }) }}
            </cc-alert>
          </div>
        </div>
      </v-scroll-y-reverse-transition>
      <v-scroll-y-reverse-transition>
        <div v-if="queryResult">
          <v-divider class="my-4" />
          <span class="flavor-text">
            {{ $t('ui.shareImport.dataFound', { type: (queryResult.itemType || importType).toUpperCase() }) }}
          </span>
          <slot name="result">
            <share-code-result :query-result="queryResult" />
          </slot>
          <cc-alert
            v-if="isUserOwned || remoteItemExists"
            color="error"
            variant="tonal"
            prominent
            density="compact"
            class="my-2"
            icon="mdi-information-outline"
            title="error"
          >
            <span v-if="isUserOwned">
              {{ $t('ui.shareImport.userOwned') }}
            </span>
            <span v-else>{{ $t('ui.shareImport.alreadyAdded') }}</span>
          </cc-alert>
          <cc-alert
            v-if="wrongType"
            color="error"
            variant="tonal"
            prominent
            density="compact"
            class="my-2"
            icon="mdi-information-outline"
            title="warning"
          >
            <i18n-t
              keypath="ui.shareImport.qrTypeHelp"
              tag="span"
              scope="global"
            >
              <template #qr>{{ qrImportType }}</template>
              <template #type>{{ importType }}</template>
            </i18n-t>
          </cc-alert>
          <div class="text-right mt-3">
            <slot name="actions">
              <cc-button
                color="primary"
                :loading="directImportLoading"
                prepend-icon="mdi-plus-circle"
                @click="importDirectly"
              >
                Adicionar Ficha
              </cc-button>
            </slot>
          </div>
        </div>
      </v-scroll-y-reverse-transition>
    </v-card-text>
  </cc-dialog>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { downloadFromS3, GetFromCode } from '@/io/apis/account'
  import logger from '@/user/logger'
  import ShareCodeResult from '@/shared/ShareCodeResult.vue'
  import { useI18n } from 'vue-i18n'
  import { PilotStore, PilotSheetStore, NpcStore } from '@/stores'
  import { Pilot } from '@/classes/pilot/Pilot'
  import { Unit } from '@/classes/npc/unit/Unit'
  import PilotSheet from '@/features/pilot_management/store/PilotSheet'
  import { notify } from '@/util/notify.js'
  import { obrBridge } from '@/services/obrBridge'
  import { isV2Npc, transformV2Npc } from '@/io/V2Importer'
  import OBR from '@owlbear-rodeo/sdk'

  const { t } = useI18n()
  const { smAndDown: mobile } = useDisplay()

  const props = withDefaults(
    defineProps<{
      importType: string
      title?: string
      blockBtn?: boolean
      color?: string
      fullWidth?: boolean
      subtitle?: string
      size?: string
      userId?: string
      remoteItems?: string[]
    }>(),
    {
      title: 'Add from Share Code',
      color: 'primary',
      fullWidth: false,
      subtitle: '',
      size: 'small',
      remoteItems: () => [],
    }
  )

  const emit = defineEmits<{
    'set-query-result': [result: unknown]
    'set-data': [data: unknown]
    'set-share-code': [code: string]
  }>()

  const activeTab = ref('sharecode')
  const shareCodeInput = ref('')
  const jsonTextInput = ref('')
  const fileInput = ref<File | null>(null)
  const queryResult = ref<any>(null)
  const badCode = ref('')
  const loading = ref(false)
  const directImportLoading = ref(false)
  const modal = ref<any>(null)

  const qrImportType = computed(() => {
    if (!queryResult.value?.sortkey) return null
    const qr = queryResult.value.sortkey.split('_')[1].toLowerCase()
    return qr === 'pilotgroup' ? 'Pilot Group' : qr
  })

  const isUserOwned = computed(
    () =>
      !!(queryResult.value?.user_id && props.userId && queryResult.value.user_id === props.userId)
  )

  const remoteItemExists = computed(
    () =>
      !!(
        queryResult.value &&
        props.remoteItems?.some(
          (ri: string) => ri === queryResult.value.code || ri === shareCodeInput.value
        )
      )
  )

  const wrongType = computed(() => {
    const skipTypes = ['item', 'campaign', 'collection']
    if (skipTypes.includes(props.importType)) return false
    const npcTypes = ['npc', 'unit', 'eidolon', 'doodad']
    if (props.importType === 'npc' && npcTypes.includes(qrImportType.value ?? '')) return false
    const narrativeTypes = ['narrative', 'character', 'location', 'faction']
    if (props.importType === 'narrative' && narrativeTypes.includes(qrImportType.value ?? ''))
      return false
    return queryResult.value && qrImportType.value !== props.importType
  })

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

  async function handleShareCodeSubmit() {
    if (!shareCodeInput.value.trim()) return
    loading.value = true
    badCode.value = ''
    queryResult.value = null

    let codeStr = shareCodeInput.value.trim()
    if (codeStr.includes('/link/pilot/')) {
      codeStr = codeStr.split('/link/pilot/')[1].split('/')[0]
    }
    codeStr = codeStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

    try {
      let result: any = null

      // 1. Consulta via proxy /api/share (sem restrições de CORS e com fallback do COMP/CON)
      try {
        const proxyRes = await fetch(`/api/share/${encodeURIComponent(codeStr)}`)
        if (proxyRes.ok) {
          const payload = await proxyRes.json()
          if (payload && (payload.callsign || payload.pilot || payload.mechs || payload.id || payload.ID || payload.name || payload.npcClass || payload.features || payload.class || isV2Npc(payload))) {
            const isNpc = !!(payload.npcClass || payload.features || payload.NpcClass || payload.npcType || payload.class || isV2Npc(payload))
            const itemType = isNpc ? 'npc' : 'pilot'
            result = {
              code: codeStr,
              name: payload.name || payload.callsign || payload.Callsign || codeStr,
              author: payload.author || payload.Author || 'COMP/CON Cloud',
              sortkey: `item_${itemType}`,
              itemType,
              created: payload.created || Date.now(),
              description: payload.description || '',
              uri: payload.uri || '',
              _payload: payload,
            }
          }
        }
      } catch (err) {
        console.warn('[CCShareCodeImporter] Proxy query error:', err)
      }

      // 2. Se não veio do proxy, consulta a API oficial do COMP/CON
      if (!result) {
        result = await GetFromCode(codeStr)
      }

      if (props.importType === 'campaign' && result?.uri) {
        const campaign = await downloadFromS3(result.uri)
        emit('set-data', campaign)
      }

      queryResult.value = result
      emit('set-query-result', result)
      emit('set-share-code', codeStr)
      if (result._payload) {
        emit('set-data', result._payload)
      }
    } catch (err: any) {
      badCode.value = codeStr
      queryResult.value = null
      logger.error(`Error getting code: ${err}`, null, err)
    } finally {
      loading.value = false
    }
  }

  async function handleJsonSubmit() {
    if (!jsonTextInput.value.trim()) return
    loading.value = true
    badCode.value = ''
    queryResult.value = null

    try {
      const parsed = JSON.parse(jsonTextInput.value.trim())
      const data = parsed.data || parsed.payload || parsed

      const isNpc = !!(data.npcClass || data.features || data.NpcClass || data.npcType || (typeof data.class === 'string' && data.class.startsWith('npc_')) || isV2Npc(data))
      const itemType = isNpc ? 'npc' : 'pilot'
      const name = data.name || data.callsign || data.Callsign || data.Name || 'Item Importado'
      const codeStr = 'JSON-IMPORT'

      const result = {
        code: codeStr,
        name,
        author: data.author || 'Importação Direta',
        sortkey: `item_${itemType}`,
        itemType,
        created: Date.now(),
        description: data.description || '',
        uri: '',
        _payload: data,
      }

      queryResult.value = result
      emit('set-query-result', result)
      emit('set-share-code', codeStr)
      emit('set-data', data)
    } catch (err: any) {
      badCode.value = 'Formato JSON inválido'
      queryResult.value = null
      logger.error('Erro ao processar JSON:', null, err)
    } finally {
      loading.value = false
    }
  }

  async function importDirectly() {
    if (!queryResult.value?._payload) return
    directImportLoading.value = true
    const payload = queryResult.value._payload
    try {
      // 1. PilotSheet
      if (payload.combatant && (payload.combatant.actor || payload.combatant.id)) {
        const sheet = PilotSheet.Deserialize(payload)
        await PilotSheetStore().ImportPilotSheet(sheet)
        const actor: any = sheet.Combatant?.actor
        if (actor) {
          const pilotStore = PilotStore()
          const targetId = actor.ID || actor.id || sheet.ID
          const existingIdx = pilotStore.Pilots.findIndex((p: any) => (p.ID || p.id) === targetId)
          if (existingIdx === -1 && actor.Callsign) {
            await pilotStore.AddPilot(actor as Pilot)
          }
          await obrBridge.savePilotToRoom(actor, true)
        }
        notify({ type: 'success', text: `Ficha ${sheet.Name} importada com sucesso!` })
      }
      // 2. NPC / Unidade
      else if (payload.npcClass || payload.features || payload.NpcClass || payload.npcType || payload.class || isV2Npc(payload)) {
        const npcData = isV2Npc(payload) ? (transformV2Npc(payload) as any) : payload
        const unit = Unit.Deserialize(npcData)
        await NpcStore().AddNpc(unit)
        await obrBridge.saveNpcToRoom(unit, true)
        notify({ type: 'success', text: `NPC ${unit.Name} importado com sucesso!` })
      }
      // 3. Piloto
      else if (payload.callsign || payload.mechs || payload.pilot || payload.itemType === 'pilot' || payload.ID || payload.id) {
        const pilot = Pilot.Deserialize(payload)
        if (pilot.Mechs && pilot.Mechs.length > 0 && !pilot.ActiveMech) {
          pilot.ActiveMech = pilot.FavoriteMech || pilot.Mechs[0]
        }
        await PilotStore().AddPilot(pilot)
        await PilotSheetStore().AddPilotSheet(pilot)
        await obrBridge.savePilotToRoom(pilot, true)
        notify({ type: 'success', text: `Piloto ${pilot.Callsign || pilot.Name} importado com sucesso!` })
      }

      reset()
      modal.value?.close?.()
    } catch (err: any) {
      console.error('Erro ao importar diretamente:', err)
      notify({ type: 'error', text: 'Erro ao salvar ficha importada.' })
    } finally {
      directImportLoading.value = false
    }
  }

  function reset() {
    shareCodeInput.value = ''
    jsonTextInput.value = ''
    fileInput.value = null
    queryResult.value = null
    badCode.value = ''
  }

  defineExpose({ reset, close: () => modal.value?.close?.() })
</script>

<style scoped>
</style>
