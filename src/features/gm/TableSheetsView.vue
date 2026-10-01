<template>
  <div class="table-sheets-view fill-height d-flex flex-column bg-grey-darken-4 text-white">
    <!-- Window Header -->
    <div class="window-header d-flex align-center justify-space-between py-2 px-4 bg-primary text-white border-b border-accent">
      <div class="d-flex align-center ga-3">
        <v-avatar size="32" color="accent" class="rounded-0">
          <v-icon icon="mdi-shield-crown-outline" size="20" color="black" />
        </v-avatar>
        <div>
          <div class="text-subtitle-1 font-weight-bold text-uppercase" style="letter-spacing: 1.5px; line-height: 1.2;">
            Gerenciador de Fichas da Mesa
          </div>
          <div class="text-caption text-grey-lighten-2" style="font-size: 0.72rem !important;">
            Controle de fichas e tokens compartilhados na sala do Owlbear Rodeo
          </div>
        </div>
      </div>

      <div class="d-flex align-center ga-2">
        <!-- Status Chips -->
        <v-chip
          size="small"
          :color="isGM ? 'accent' : 'grey-lighten-1'"
          variant="flat"
          class="font-weight-bold text-black"
        >
          <v-icon :icon="isGM ? 'mdi-crown' : 'mdi-account'" start size="14" />
          {{ isGM ? 'MESTRE (GM)' : 'JOGADOR' }}
        </v-chip>

        <v-chip
          size="small"
          :color="isObrConnected ? 'success' : 'grey-darken-2'"
          variant="tonal"
          class="font-weight-bold"
        >
          <v-icon :icon="isObrConnected ? 'mdi-wifi' : 'mdi-wifi-off'" start size="14" />
          {{ isObrConnected ? 'Owlbear Ativo' : 'Offline' }}
        </v-chip>

        <v-btn
          icon="mdi-cloud-sync"
          variant="tonal"
          color="accent"
          size="small"
          density="comfortable"
          :loading="isRefreshing"
          title="Sincronizar Mesa Agora (Solicitar fichas a todos os jogadores)"
          @click="syncTableNow"
        />

        <v-btn
          icon="mdi-open-in-new"
          variant="text"
          size="small"
          density="comfortable"
          title="Destacar em nova janela do navegador"
          @click="detachWindow"
        />

        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          density="comfortable"
          title="Fechar Janela"
          @click="closeWindow"
        />
      </div>
    </div>

    <!-- Navigation Bar & Search Filters -->
    <div class="px-4 pt-3 pb-2 bg-grey-darken-4 border-b border-grey-darken-3">
      <div class="d-flex flex-wrap align-center justify-space-between ga-2">
        <v-tabs
          v-model="activeTab"
          density="compact"
          color="accent"
          align-tabs="start"
          class="border-b-0"
        >
          <v-tab value="pilots" prepend-icon="cc:pilot" class="font-weight-bold">
            Pilotos da Mesa ({{ pilotsList.length }})
          </v-tab>
          <v-tab value="npcs" prepend-icon="cc:npc" class="font-weight-bold">
            NPCs da Mesa ({{ npcsList.length }})
          </v-tab>
          <v-tab value="add" prepend-icon="mdi-plus-circle-outline" class="font-weight-bold text-accent">
            Adicionar Ficha
          </v-tab>
        </v-tabs>

        <!-- Search Bar -->
        <div v-if="activeTab !== 'add'" style="min-width: 260px; max-width: 340px;">
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            placeholder="Buscar por nome, callsign ou mech..."
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
          />
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="content-scroll flex-grow-1 pa-4" style="overflow-y: auto;">
      <!-- TAB 1: PILOTOS DA MESA -->
      <div v-if="activeTab === 'pilots'">
        <div v-if="filteredPilots.length === 0" class="text-center py-12 text-grey">
          <v-icon icon="mdi-account-off" size="56" class="mb-3 opacity-60" />
          <div class="text-h6 text-grey-lighten-1">Nenhum piloto na mesa</div>
          <div class="text-caption text-grey">
            {{ searchQuery ? 'Nenhum piloto coincide com a busca.' : 'Peça aos jogadores para salvarem suas fichas ou use a aba "Adicionar Ficha" acima.' }}
          </div>
          <v-btn
            color="accent"
            variant="outlined"
            size="small"
            class="mt-4"
            prepend-icon="mdi-plus"
            @click="activeTab = 'add'"
          >
            Adicionar Piloto à Mesa
          </v-btn>
        </div>

        <div v-else class="d-flex flex-column ga-3">
          <v-card
            v-for="pilot in filteredPilots"
            :key="pilot.ID"
            variant="outlined"
            class="sheet-card pa-3 border-grey-darken-3 bg-grey-darken-3"
          >
            <div class="d-flex flex-wrap align-center justify-space-between ga-3">
              <!-- Pilot Identity -->
              <div class="d-flex align-center ga-3" style="min-width: 240px; flex: 1;">
                <v-avatar size="44" color="primary" class="rounded-0 border-accent">
                  <v-icon icon="cc:pilot" size="24" color="white" />
                </v-avatar>
                <div>
                  <div class="d-flex align-center ga-2">
                    <span class="text-subtitle-1 font-weight-bold text-accent text-uppercase">
                      {{ pilot.Callsign || pilot.Name }}
                    </span>
                    <v-chip size="x-small" color="accent" variant="tonal" class="font-weight-bold">
                      LL {{ pilot.Level ?? 0 }}
                    </v-chip>
                  </div>
                  <div class="text-caption text-grey-lighten-1">
                    {{ pilot.Name }}
                  </div>
                  <div v-if="pilot.ActiveMech" class="text-caption text-white font-weight-medium">
                    <v-icon icon="mdi-robot-vacuum" size="14" class="mr-1 text-accent" />
                    {{ pilot.ActiveMech.Name }}
                    <span class="text-grey">({{ pilot.ActiveMech.Frame?.Name || 'Mech' }})</span>
                  </div>
                </div>
              </div>

              <!-- Combat Stats Preview -->
              <div v-if="pilot.ActiveMech" class="d-flex align-center ga-3 px-3 py-1 bg-grey-darken-4 border border-grey-darken-3 rounded" style="min-width: 200px;">
                <div class="stat-box text-center" title="Pontos de Vida">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">PV</div>
                  <div class="text-body-2 font-weight-bold text-green-accent-3">
                    {{ (pilot.ActiveMech as any).CurrentHP ?? (pilot.ActiveMech as any).HP ?? 0 }}/{{ (pilot.ActiveMech as any).MaxHP ?? (pilot.ActiveMech as any).MaxHp ?? 0 }}
                  </div>
                </div>
                <v-divider vertical class="border-grey-darken-3" />
                <div class="stat-box text-center" title="Calor">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">CALOR</div>
                  <div class="text-body-2 font-weight-bold text-orange-accent-3">
                    {{ (pilot.ActiveMech as any).CurrentHeat ?? 0 }}/{{ (pilot.ActiveMech as any).MaxHeat ?? (pilot.ActiveMech as any).HeatCap ?? 0 }}
                  </div>
                </div>
                <v-divider vertical class="border-grey-darken-3" />
                <div class="stat-box text-center" title="Estrutura">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">ESTR</div>
                  <div class="text-body-2 font-weight-bold text-blue-accent-2">
                    {{ (pilot.ActiveMech as any).CurrentStructure ?? 4 }}
                  </div>
                </div>
                <v-divider vertical class="border-grey-darken-3" />
                <div class="stat-box text-center" title="Estresse do Reator">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">ESTRESSE</div>
                  <div class="text-body-2 font-weight-bold text-red-accent-2">
                    {{ (pilot.ActiveMech as any).CurrentStress ?? 4 }}
                  </div>
                </div>
              </div>

              <!-- Token Binding Status -->
              <div class="d-flex align-center ga-2" style="min-width: 160px;">
                <v-chip
                  v-if="getTokenBindingFor(pilot.ID)"
                  size="small"
                  color="success"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon icon="mdi-link" start size="14" />
                  {{ getTokenBindingFor(pilot.ID)?.tokenName }}
                </v-chip>
                <v-chip
                  v-else
                  size="small"
                  color="grey"
                  variant="outlined"
                  class="font-weight-medium"
                >
                  <v-icon icon="mdi-link-off" start size="14" />
                  Sem Token
                </v-chip>
              </div>

              <!-- Action Buttons -->
              <div class="d-flex align-center ga-1">
                <v-btn
                  icon="mdi-broadcast"
                  variant="text"
                  color="grey-lighten-2"
                  size="small"
                  title="Reenviar ficha para todos os jogadores na mesa"
                  @click="rebroadcastPilot(pilot)"
                />

                <v-btn
                  icon="mdi-link-variant"
                  variant="text"
                  color="accent"
                  size="small"
                  title="Vincular a um Token do Owlbear Rodeo"
                  @click="requestBindToken(pilot.ID, 'pilot')"
                />

                <!-- Delete Menu -->
                <v-menu location="bottom end">
                  <template #activator="{ props: menuProps }">
                    <v-btn
                      v-bind="menuProps"
                      icon="mdi-delete-outline"
                      variant="text"
                      color="error"
                      size="small"
                      title="Remover ou Excluir Ficha"
                    />
                  </template>
                  <v-list density="compact" class="bg-grey-darken-4 border-error pa-1">
                    <v-list-subheader class="text-cc-overline text-error">Opções de Exclusão</v-list-subheader>
                    <v-list-item
                      prepend-icon="mdi-cloud-off-outline"
                      title="Remover da Mesa"
                      subtitle="Retira da sala Owlbear, mas mantém cópia local"
                      class="my-1 rounded-0"
                      @click="confirmRemoveFromRoom('pilot', pilot.ID, pilot.Callsign || pilot.Name)"
                    />
                    <v-list-item
                      prepend-icon="mdi-trash-can-outline"
                      title="Excluir Definitivamente"
                      subtitle="Apaga da mesa e do armazenamento do COMP/CON"
                      class="my-1 rounded-0 text-error font-weight-bold"
                      @click="confirmDeletePermanent('pilot', pilot.ID, pilot.Callsign || pilot.Name)"
                    />
                  </v-list>
                </v-menu>
              </div>
            </div>
          </v-card>
        </div>
      </div>

      <!-- TAB 2: NPCS DA MESA -->
      <div v-else-if="activeTab === 'npcs'">
        <div v-if="filteredNpcs.length === 0" class="text-center py-12 text-grey">
          <v-icon icon="mdi-robot-off" size="56" class="mb-3 opacity-60" />
          <div class="text-h6 text-grey-lighten-1">Nenhum NPC na mesa</div>
          <div class="text-caption text-grey">
            {{ searchQuery ? 'Nenhum NPC coincide com a busca.' : 'Adicione NPCs à mesa para compartilhar com a sala.' }}
          </div>
          <v-btn
            color="accent"
            variant="outlined"
            size="small"
            class="mt-4"
            prepend-icon="mdi-plus"
            @click="activeTab = 'add'"
          >
            Adicionar NPC à Mesa
          </v-btn>
        </div>

        <div v-else class="d-flex flex-column ga-3">
          <v-card
            v-for="npc in filteredNpcs"
            :key="npc.ID"
            variant="outlined"
            class="sheet-card pa-3 border-grey-darken-3 bg-grey-darken-3"
          >
            <div class="d-flex flex-wrap align-center justify-space-between ga-3">
              <!-- NPC Identity -->
              <div class="d-flex align-center ga-3" style="min-width: 240px; flex: 1;">
                <v-avatar size="44" color="secondary" class="rounded-0 border-accent">
                  <v-icon icon="cc:npc" size="24" color="white" />
                </v-avatar>
                <div>
                  <div class="d-flex align-center ga-2">
                    <span class="text-subtitle-1 font-weight-bold text-white text-uppercase">
                      {{ npc.Name }}
                    </span>
                    <v-chip size="x-small" color="secondary" variant="flat" class="font-weight-bold">
                      {{ (npc as any).Class || 'NPC' }}
                    </v-chip>
                    <v-chip v-if="(npc as any).Tier" size="x-small" color="accent" variant="tonal" class="font-weight-bold">
                      T{{ (npc as any).Tier }}
                    </v-chip>
                  </div>
                  <div class="text-caption text-grey-lighten-1">
                    {{ (npc as any).npcType ? (npc as any).npcType.toUpperCase() : 'UNIT' }} • {{ (npc as any).Flavor || 'Lancer Combatant' }}
                  </div>
                </div>
              </div>

              <!-- NPC Stats Preview -->
              <div class="d-flex align-center ga-3 px-3 py-1 bg-grey-darken-4 border border-grey-darken-3 rounded" style="min-width: 180px;">
                <div class="stat-box text-center" title="Pontos de Vida">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">PV</div>
                  <div class="text-body-2 font-weight-bold text-green-accent-3">
                    {{ (npc as any).CurrentHP ?? (npc as any).MaxHP ?? 0 }}/{{ (npc as any).MaxHP ?? 0 }}
                  </div>
                </div>
                <v-divider vertical class="border-grey-darken-3" />
                <div class="stat-box text-center" title="Calor">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">CALOR</div>
                  <div class="text-body-2 font-weight-bold text-orange-accent-3">
                    {{ (npc as any).CurrentHeat ?? 0 }}/{{ (npc as any).MaxHeat ?? 0 }}
                  </div>
                </div>
                <v-divider vertical class="border-grey-darken-3" />
                <div class="stat-box text-center" title="Estrutura">
                  <div class="text-caption text-grey" style="font-size: 0.65rem !important;">ESTR</div>
                  <div class="text-body-2 font-weight-bold text-blue-accent-2">
                    {{ (npc as any).CurrentStructure ?? (npc as any).MaxStructure ?? 1 }}
                  </div>
                </div>
              </div>

              <!-- Token Binding Status -->
              <div class="d-flex align-center ga-2" style="min-width: 160px;">
                <v-chip
                  v-if="getTokenBindingFor(npc.ID)"
                  size="small"
                  color="success"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  <v-icon icon="mdi-link" start size="14" />
                  {{ getTokenBindingFor(npc.ID)?.tokenName }}
                </v-chip>
                <v-chip
                  v-else
                  size="small"
                  color="grey"
                  variant="outlined"
                  class="font-weight-medium"
                >
                  <v-icon icon="mdi-link-off" start size="14" />
                  Sem Token
                </v-chip>
              </div>

              <!-- Action Buttons -->
              <div class="d-flex align-center ga-1">
                <v-btn
                  icon="mdi-broadcast"
                  variant="text"
                  color="grey-lighten-2"
                  size="small"
                  title="Reenviar NPC para todos na mesa"
                  @click="rebroadcastNpc(npc)"
                />

                <v-btn
                  icon="mdi-link-variant"
                  variant="text"
                  color="accent"
                  size="small"
                  title="Vincular a um Token do Owlbear Rodeo"
                  @click="requestBindToken(npc.ID, 'npc')"
                />

                <!-- Delete Menu -->
                <v-menu location="bottom end">
                  <template #activator="{ props: menuProps }">
                    <v-btn
                      v-bind="menuProps"
                      icon="mdi-delete-outline"
                      variant="text"
                      color="error"
                      size="small"
                      title="Remover ou Excluir NPC"
                    />
                  </template>
                  <v-list density="compact" class="bg-grey-darken-4 border-error pa-1">
                    <v-list-subheader class="text-cc-overline text-error">Opções de Exclusão</v-list-subheader>
                    <v-list-item
                      prepend-icon="mdi-cloud-off-outline"
                      title="Remover da Mesa"
                      subtitle="Retira da sala Owlbear, mas mantém cópia local"
                      class="my-1 rounded-0"
                      @click="confirmRemoveFromRoom('npc', npc.ID, npc.Name)"
                    />
                    <v-list-item
                      prepend-icon="mdi-trash-can-outline"
                      title="Excluir Definitivamente"
                      subtitle="Apaga da mesa e do armazenamento do COMP/CON"
                      class="my-1 rounded-0 text-error font-weight-bold"
                      @click="confirmDeletePermanent('npc', npc.ID, npc.Name)"
                    />
                  </v-list>
                </v-menu>
              </div>
            </div>
          </v-card>
        </div>
      </div>

      <!-- TAB 3: ADICIONAR FICHA À MESA -->
      <div v-else-if="activeTab === 'add'">
        <v-row>
          <!-- Publicar Piloto Local -->
          <v-col cols="12" md="6">
            <v-card class="bg-grey-darken-3 border border-grey-darken-2 pa-4 fill-height d-flex flex-column">
              <div class="d-flex align-center ga-2 mb-2 text-accent">
                <v-icon icon="cc:pilot" size="20" />
                <span class="text-subtitle-1 font-weight-bold text-uppercase">Publicar Piloto na Mesa</span>
              </div>
              <div class="text-caption text-grey mb-4">
                Selecione um piloto salvo localmente no seu COMP/CON para transmitir a todos os jogadores e disponibilizar na mesa.
              </div>

              <v-select
                v-model="selectedLocalPilotId"
                :items="localPilotsOptions"
                item-title="title"
                item-value="id"
                label="Selecionar Piloto Local"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="cc:pilot"
                clearable
                class="mb-3"
              />

              <v-btn
                color="accent"
                block
                size="large"
                prepend-icon="mdi-cloud-upload"
                :disabled="!selectedLocalPilotId"
                :loading="isPublishingPilot"
                class="mt-auto font-weight-bold"
                @click="publishSelectedPilot"
              >
                Publicar Piloto na Mesa
              </v-btn>
            </v-card>
          </v-col>

          <!-- Publicar NPC Local -->
          <v-col cols="12" md="6">
            <v-card class="bg-grey-darken-3 border border-grey-darken-2 pa-4 fill-height d-flex flex-column">
              <div class="d-flex align-center ga-2 mb-2 text-secondary">
                <v-icon icon="cc:npc" size="20" />
                <span class="text-subtitle-1 font-weight-bold text-uppercase">Publicar NPC na Mesa</span>
              </div>
              <div class="text-caption text-grey mb-4">
                Selecione um NPC da sua biblioteca para salvar na sala do Owlbear e permitir vinculação a tokens.
              </div>

              <v-select
                v-model="selectedLocalNpcId"
                :items="localNpcsOptions"
                item-title="title"
                item-value="id"
                label="Selecionar NPC Local"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="cc:npc"
                clearable
                class="mb-3"
              />

              <v-btn
                color="secondary"
                block
                size="large"
                prepend-icon="mdi-cloud-upload"
                :disabled="!selectedLocalNpcId"
                :loading="isPublishingNpc"
                class="mt-auto font-weight-bold"
                @click="publishSelectedNpc"
              >
                Publicar NPC na Mesa
              </v-btn>
            </v-card>
          </v-col>

          <!-- Criar ou Importar Opções -->
          <v-col cols="12">
            <v-card class="bg-grey-darken-3 border-accent pa-4">
              <div class="d-flex align-center ga-2 mb-3 text-white">
                <v-icon icon="mdi-creation" color="accent" size="20" />
                <span class="text-subtitle-1 font-weight-bold text-uppercase">Criar ou Importar Nova Ficha</span>
              </div>

              <div class="d-flex flex-wrap ga-3">
                <v-btn
                  color="accent"
                  variant="tonal"
                  prepend-icon="mdi-file-import-outline"
                  class="flex-grow-1"
                  @click="triggerImportDialog"
                >
                  Importar por Share Code / JSON
                </v-btn>

                <v-btn
                  color="accent"
                  variant="outlined"
                  prepend-icon="mdi-account-plus"
                  class="flex-grow-1"
                  @click="navigateToCreatePilot"
                >
                  Criar Novo Piloto
                </v-btn>

                <v-btn
                  color="secondary"
                  variant="outlined"
                  prepend-icon="cc:npc"
                  class="flex-grow-1"
                  @click="navigateToCreateNpc"
                >
                  Gerenciar Biblioteca de NPCs
                </v-btn>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </div>

    <!-- Window Footer -->
    <div class="window-footer px-4 py-2 bg-grey-darken-4 border-t border-grey-darken-3 d-flex justify-space-between align-center">
      <div class="text-caption text-grey">
        Total na Mesa: <span class="text-white font-weight-bold">{{ pilotsList.length }} Piloto(s)</span> • <span class="text-white font-weight-bold">{{ npcsList.length }} NPC(s)</span>
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn
          variant="tonal"
          color="accent"
          size="small"
          prepend-icon="mdi-cloud-sync"
          :loading="isRefreshing"
          @click="syncTableNow"
        >
          Sincronizar Mesa
        </v-btn>
        <v-btn
          variant="tonal"
          color="grey-lighten-2"
          size="small"
          @click="closeWindow"
        >
          Fechar
        </v-btn>
      </div>
    </div>

    <!-- Dialog de Confirmação de Exclusão -->
    <v-dialog v-model="showConfirmDialog" max-width="480px">
      <v-card class="bg-grey-darken-4 border-error">
        <v-card-title class="d-flex align-center ga-2 text-h6 text-error pa-4 border-b border-grey-darken-3">
          <v-icon icon="mdi-alert-circle" color="error" />
          <span>{{ confirmTitle }}</span>
        </v-card-title>
        <v-card-text class="pa-4 text-body-1 text-grey-lighten-1">
          {{ confirmMessage }}
        </v-card-text>
        <v-card-actions class="pa-4 border-t border-grey-darken-3 d-flex justify-end ga-2">
          <v-btn variant="text" color="grey" @click="showConfirmDialog = false">
            Cancelar
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="isDeleting"
            @click="executeConfirmedAction"
          >
            Confirmar Exclusão
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog de Importação por ShareCode / JSON -->
    <ImportDialog
      v-model="showImportModal"
      :redirect="false"
      @imported="handleSheetImported"
    />

    <!-- Dialog para Selecionar e Vincular Token da Mesa -->
    <v-dialog v-model="showTokenPickerModal" max-width="640px" scrollable>
      <v-card class="bg-grey-darken-4 border-accent" elevation="16">
        <!-- Header -->
        <v-card-title class="d-flex align-center justify-space-between py-3 px-4 bg-primary text-white border-b border-accent">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-link-variant" color="accent" size="22" />
            <div>
              <div class="text-subtitle-1 font-weight-bold text-uppercase" style="letter-spacing: 1px; line-height: 1.2;">
                Vincular Token da Mesa
              </div>
              <div class="text-caption text-grey-lighten-2">
                Ficha selecionada: <strong class="text-accent">{{ bindTargetSheet?.name }}</strong> ({{ bindTargetSheet?.type === 'pilot' ? 'Piloto' : 'NPC' }})
              </div>
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showTokenPickerModal = false" />
        </v-card-title>

        <!-- Filtro e Recarregar -->
        <div class="px-4 pt-3 pb-2 bg-grey-darken-3 border-b border-grey-darken-2 d-flex align-center ga-2">
          <v-text-field
            v-model="tokenFilter"
            density="compact"
            variant="outlined"
            placeholder="Filtrar tokens da mesa por nome..."
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            class="flex-grow-1"
          />
          <v-btn
            icon="mdi-refresh"
            variant="tonal"
            color="accent"
            size="small"
            title="Recarregar tokens da cena"
            :loading="isLoadingTokens"
            @click="loadSceneTokens"
          />
        </div>

        <v-card-text class="pa-4" style="max-height: 440px;">
          <!-- Carregando -->
          <div v-if="isLoadingTokens" class="text-center py-8">
            <v-progress-circular indeterminate color="accent" size="32" class="mb-2" />
            <div class="text-caption text-grey">Consultando biblioteca de tokens da cena...</div>
          </div>

          <!-- Cena Vazia / Sem Tokens -->
          <div v-else-if="filteredSceneTokens.length === 0" class="text-center py-8 px-4 text-grey">
            <v-icon icon="mdi-image-off-outline" size="48" color="grey" class="mb-2" />
            <div class="text-subtitle-2 text-white mb-1">Nenhum token encontrado na cena</div>
            <div class="text-caption text-grey-lighten-1" style="max-width: 420px; margin: 0 auto;">
              Arraste tokens ou personagens da biblioteca do Owlbear Rodeo para o mapa para vinculá-los a esta ficha.
            </div>
          </div>

          <!-- Lista de Tokens Encontrados -->
          <div v-else class="d-flex flex-column ga-2">
            <v-card
              v-for="tok in filteredSceneTokens"
              :key="tok.id"
              variant="outlined"
              class="pa-3 bg-grey-darken-3 border-grey-darken-2 d-flex align-center justify-space-between flex-wrap ga-2"
              :class="{ 'border-accent bg-grey-darken-4': tok.binding?.sheetId === bindTargetSheet?.id }"
            >
              <div class="d-flex align-center ga-3">
                <v-avatar size="44" rounded="0" color="grey-darken-4" class="border border-grey-darken-2">
                  <v-img v-if="tok.imageUrl" :src="tok.imageUrl" cover />
                  <v-icon v-else icon="mdi-circle-slice-8" color="accent" size="24" />
                </v-avatar>
                <div>
                  <div class="font-weight-bold text-white text-body-2">
                    {{ tok.name }}
                  </div>
                  <div class="d-flex align-center ga-2 mt-1">
                    <v-chip size="x-small" variant="tonal" color="grey-lighten-1">
                      {{ tok.layer || 'TOKEN' }}
                    </v-chip>
                    <v-chip
                      v-if="tok.binding?.sheetId === bindTargetSheet?.id"
                      size="x-small"
                      color="success"
                      variant="flat"
                    >
                      Vinculado a esta ficha
                    </v-chip>
                    <v-chip
                      v-else-if="tok.binding?.name"
                      size="x-small"
                      color="warning"
                      variant="tonal"
                    >
                      Vinculado: {{ tok.binding.name }}
                    </v-chip>
                    <v-chip
                      v-else
                      size="x-small"
                      color="grey"
                      variant="tonal"
                    >
                      Disponível
                    </v-chip>
                  </div>
                </div>
              </div>

              <!-- Ações do Token -->
              <div class="d-flex align-center ga-2">
                <v-btn
                  v-if="tok.binding?.sheetId === bindTargetSheet?.id"
                  color="error"
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-link-off"
                  :loading="isBindingToken"
                  @click="unbindSceneToken(tok.id)"
                >
                  Desvincular
                </v-btn>
                <v-btn
                  v-else
                  color="accent"
                  variant="flat"
                  size="small"
                  prepend-icon="mdi-link-variant"
                  :loading="isBindingToken"
                  @click="bindSceneToken(tok)"
                >
                  {{ tok.binding ? 'Substituir Vínculo' : 'Vincular' }}
                </v-btn>
              </div>
            </v-card>
          </div>
        </v-card-text>

        <v-card-actions class="pa-3 bg-grey-darken-4 border-t border-grey-darken-3 d-flex justify-end">
          <v-btn variant="text" color="grey" @click="showTokenPickerModal = false">
            Fechar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { PilotStore } from '@/features/pilot_management/store'
import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
import { NpcStore } from '@/features/gm/store/npc_store'
import { PilotGroupStore } from '@/features/pilot_management/store/PilotGroupStore'
import { obrBridge } from '@/services/obrBridge'
import { closeTableSheetsWindow, openTableSheetsWindow, openStandardWindow } from '@/services/tableSheetsWindow'
import ImportDialog from '@/features/active_mode/_components/ImportDialog.vue'
import OBR from '@owlbear-rodeo/sdk'

const router = useRouter()

const activeTab = ref<'pilots' | 'npcs' | 'add'>('pilots')
const searchQuery = ref('')
const showImportModal = ref(false)
const isRefreshing = ref(false)
const isPublishingPilot = ref(false)
const isPublishingNpc = ref(false)
const isDeleting = ref(false)

const selectedLocalPilotId = ref<string | null>(null)
const selectedLocalNpcId = ref<string | null>(null)

// Confirmação de exclusão
const showConfirmDialog = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let confirmActionCallback: (() => Promise<void>) | null = null

// Roster da mesa e vínculos de tokens
const boundTokens = ref<Array<{ tokenId: string; tokenName: string; binding: any }>>([])
const tablePilotRoster = ref<Record<string, any>>({})
const tableNpcRoster = ref<Record<string, any>>({})

const isObrConnected = computed(() => obrBridge.getIsReady())
const isGM = computed(() => obrBridge.getRole() === 'GM')

function isSheetInRoster(sheet: any, roster: Record<string, any>): boolean {
  if (!sheet || !roster) return false
  const id = sheet.ID || sheet.id
  if (!id) return false
  if (roster[id]) return true
  const lower = id.toLowerCase()
  return Object.keys(roster).some(k => 
    k.toLowerCase() === lower || 
    roster[k]?.id?.toLowerCase() === lower || 
    roster[k]?.ID?.toLowerCase() === lower
  )
}

const pilotsList = computed(() => {
  const allPilots = PilotStore().Pilots || []
  if (!isObrConnected.value) {
    return allPilots
  }
  return allPilots.filter((p: any) => isSheetInRoster(p, tablePilotRoster.value))
})

const npcsList = computed(() => {
  const allNpcs = NpcStore().Npcs || []
  if (!isObrConnected.value) {
    return allNpcs
  }
  return allNpcs.filter((n: any) => isSheetInRoster(n, tableNpcRoster.value))
})

const filteredPilots = computed(() => {
  const query = searchQuery.value?.trim().toLowerCase()
  if (!query) return pilotsList.value
  return pilotsList.value.filter((p: any) => {
    const nameMatch = p.Name?.toLowerCase().includes(query)
    const callsignMatch = p.Callsign?.toLowerCase().includes(query)
    const mechMatch = p.ActiveMech?.Name?.toLowerCase().includes(query)
    const frameMatch = p.ActiveMech?.Frame?.Name?.toLowerCase().includes(query)
    return nameMatch || callsignMatch || mechMatch || frameMatch
  })
})

const filteredNpcs = computed(() => {
  const query = searchQuery.value?.trim().toLowerCase()
  if (!query) return npcsList.value
  return npcsList.value.filter((n: any) => {
    const nameMatch = n.Name?.toLowerCase().includes(query)
    const classMatch = n.Class?.toLowerCase().includes(query)
    return nameMatch || classMatch
  })
})

const localPilotsOptions = computed(() => {
  return (PilotStore().Pilots || []).map((p: any) => ({
    id: p.ID || p.id,
    title: `${p.Callsign || p.Name} (${p.ActiveMech ? p.ActiveMech.Name : 'Sem Mech'}) - LL ${p.Level ?? 0}`,
  }))
})

const localNpcsOptions = computed(() => {
  return (NpcStore().Npcs || []).map((n: any) => ({
    id: n.ID || n.id,
    title: `${n.Name} (${n.Class || 'NPC'}) ${n.Tier ? '- Tier ' + n.Tier : ''}`,
  }))
})

function getTokenBindingFor(sheetId: string) {
  return boundTokens.value.find(t => t.binding?.sheetId === sheetId || t.binding?.mechId === sheetId)
}

async function refreshTableData() {
  try {
    boundTokens.value = await obrBridge.getSceneTokensWithBindings()
    tablePilotRoster.value = await obrBridge.getTablePilotRoster()
    tableNpcRoster.value = await obrBridge.getTableNpcRoster()

    // Se o roster da sala tiver fichas não carregadas no store local, sincroniza da sala
    const localPilotIds = new Set((PilotStore().Pilots || []).map((p: any) => (p.ID || p.id)?.toLowerCase()))
    const hasMissingPilots = Object.keys(tablePilotRoster.value).some(id => !localPilotIds.has(id.toLowerCase()))
    const localNpcIds = new Set((NpcStore().Npcs || []).map((n: any) => (n.ID || n.id)?.toLowerCase()))
    const hasMissingNpcs = Object.keys(tableNpcRoster.value).some(id => !localNpcIds.has(id.toLowerCase()))
    if (hasMissingPilots || hasMissingNpcs) {
      await obrBridge.syncFromRoom().catch(() => {})
    }
  } catch (err) {
    console.warn('[TableSheetsView] Erro ao atualizar lista de tokens/roster:', err)
  }
}

async function syncTableNow() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await obrBridge.requestSyncFromRoom()
    await obrBridge.pushAllLocalPilotsToRoom()
    await obrBridge.pushAllLocalNpcsToRoom()
    await obrBridge.syncFromRoom()
    await refreshTableData()
    if (OBR.isAvailable) {
      await OBR.notification.show('Mesa sincronizada com sucesso com todos os jogadores.')
    }
  } catch (e) {
    console.error('[TableSheetsView] Erro na sincronização:', e)
  } finally {
    isRefreshing.value = false
  }
}

async function openPilotSheet(pilotId: string) {
  try {
    const pilotSheetStore = PilotSheetStore()
    const pilotStore = PilotStore()

    let targetSheet: any = pilotSheetStore.PilotSheets.find(
      (s: any) => s.ID === pilotId || s.PilotId === pilotId
    )

    if (!targetSheet) {
      let pilot = pilotStore.Pilots.find((p: any) => p.ID === pilotId)
      if (!pilot) {
        await pilotStore.LoadPilots()
        pilot = pilotStore.Pilots.find((p: any) => p.ID === pilotId)
      }
      if (pilot) {
        if (!pilot.ActiveMech && pilot.Mechs?.length) {
          pilot.ActiveMech = pilot.Mechs[0]
        }
        await pilotSheetStore.AddPilotSheet(pilot as any)
        targetSheet = pilotSheetStore.GetSheet(pilotSheetStore.CurrentActiveID) as any
      }
    }

    const sheetId = targetSheet ? targetSheet.ID : pilotId
    const targetUrl = `/#/active-mode/pilot-runner/${sheetId}`

    // 1. Abre a janela padrão flutuante do Owlbear Rodeo
    await openStandardWindow(targetUrl)

    // 2. Notifica a janela padrão via broadcast caso já esteja aberta
    await obrBridge.sendBroadcastMessage({
      type: 'OPEN_SHEET_REQUESTED',
      sheetType: 'pilot',
      sheetId,
    })

    // 3. Dispara evento local
    window.dispatchEvent(
      new CustomEvent('compcon-open-sheet-requested', {
        detail: { sheetType: 'pilot', sheetId },
      })
    )
  } catch (err) {
    console.error('[TableSheetsView] Erro ao abrir piloto na janela padrão:', err)
    await openStandardWindow(`/#/active-mode/pilot-runner/${pilotId}`)
  }
}

async function openNpcSheet(npcId: string) {
  try {
    const targetUrl = `/#/active-mode/npcs/${npcId}`
    await openStandardWindow(targetUrl)
    await obrBridge.sendBroadcastMessage({
      type: 'OPEN_SHEET_REQUESTED',
      sheetType: 'npc',
      sheetId: npcId,
    })
    window.dispatchEvent(
      new CustomEvent('compcon-open-sheet-requested', {
        detail: { sheetType: 'npc', sheetId: npcId },
      })
    )
  } catch (err) {
    console.error('[TableSheetsView] Erro ao abrir NPC na janela padrão:', err)
    await openStandardWindow(`/#/active-mode/npcs/${npcId}`)
  }
}

async function rebroadcastPilot(pilot: any) {
  try {
    await obrBridge.broadcastSinglePilot(pilot)
    await obrBridge.savePilotToRoom(pilot)
    if (OBR.isAvailable) {
      await OBR.notification.show(`Ficha de ${pilot.Callsign || pilot.Name} reenviada à mesa.`)
    }
  } catch (e) {
    console.error('[TableSheetsView] Erro ao reenviar piloto:', e)
  }
}

async function rebroadcastNpc(npc: any) {
  try {
    await obrBridge.broadcastSingleNpc(npc)
    await obrBridge.saveNpcToRoom(npc)
    if (OBR.isAvailable) {
      await OBR.notification.show(`NPC ${npc.Name} reenviado à mesa.`)
    }
  } catch (e) {
    console.error('[TableSheetsView] Erro ao reenviar NPC:', e)
  }
}

const showTokenPickerModal = ref(false)
const isLoadingTokens = ref(false)
const isBindingToken = ref(false)
const tokenFilter = ref('')
const sceneTokensList = ref<Array<{
  id: string
  name: string
  layer: string
  imageUrl: string
  binding: any
}>>([])

const bindTargetSheet = ref<{
  id: string
  type: 'pilot' | 'npc'
  name: string
  raw: any
} | null>(null)

const filteredSceneTokens = computed(() => {
  if (!tokenFilter.value.trim()) return sceneTokensList.value
  const q = tokenFilter.value.toLowerCase()
  return sceneTokensList.value.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      (t.binding?.name && t.binding.name.toLowerCase().includes(q))
  )
})

async function loadSceneTokens() {
  isLoadingTokens.value = true
  try {
    sceneTokensList.value = await obrBridge.getSceneTokens()
  } catch (err) {
    console.error('[TableSheetsView] Erro ao carregar tokens da cena:', err)
  } finally {
    isLoadingTokens.value = false
  }
}

async function requestBindToken(sheetId: string, sheetType: 'pilot' | 'npc') {
  let targetName = 'Ficha'
  let raw: any = null

  if (sheetType === 'pilot') {
    const p = pilotsList.value.find((item: any) => item.ID === sheetId) || PilotStore().Pilots.find((p: any) => p.ID === sheetId)
    targetName = p?.Callsign || p?.Name || 'Piloto'
    raw = p
  } else {
    const n = npcsList.value.find((item: any) => item.ID === sheetId) || NpcStore().Npcs.find((n: any) => n.ID === sheetId)
    targetName = n?.Name || 'NPC'
    raw = n
  }

  bindTargetSheet.value = {
    id: sheetId,
    type: sheetType,
    name: targetName,
    raw,
  }

  showTokenPickerModal.value = true
  await loadSceneTokens()
}

async function bindSceneToken(token: any) {
  if (!bindTargetSheet.value) return
  isBindingToken.value = true
  try {
    const { id: sheetId, type: sheetType, name, raw } = bindTargetSheet.value

    let hp = { current: 10, max: 10 }
    let heat = { current: 0, max: 6 }
    let structure = { current: 4, max: 4 }
    let stress = { current: 4, max: 4 }
    let mechId = undefined

    if (sheetType === 'pilot' && raw) {
      mechId = raw.ActiveMech?.ID
      const currentHP = raw.ActiveMech?.CurrentHP ?? raw.ActiveMech?.MaxHP ?? 10
      const maxHP = raw.ActiveMech?.MaxHP ?? currentHP ?? 10
      hp = { current: currentHP, max: maxHP }

      const currentHeat = raw.ActiveMech?.CurrentHeat ?? 0
      const maxHeat = raw.ActiveMech?.HeatCap ?? 6
      heat = { current: currentHeat, max: maxHeat }

      const currentStruct = raw.ActiveMech?.CurrentStructure ?? 4
      const maxStruct = raw.ActiveMech?.MaxStructure ?? 4
      structure = { current: currentStruct, max: maxStruct }

      const currentStress = raw.ActiveMech?.CurrentStress ?? 4
      const maxStress = raw.ActiveMech?.MaxStress ?? 4
      stress = { current: currentStress, max: maxStress }
    } else if (sheetType === 'npc' && raw) {
      const maxHP = raw.Stats?.HP ?? 10
      const currentHP = raw.CurrentHP ?? maxHP
      hp = { current: currentHP, max: maxHP }

      const maxHeat = raw.Stats?.HeatCap ?? 0
      const currentHeat = raw.CurrentHeat ?? 0
      heat = { current: currentHeat, max: maxHeat }

      const maxStruct = raw.Stats?.Structure ?? 1
      const currentStruct = raw.CurrentStructure ?? maxStruct
      structure = { current: currentStruct, max: maxStruct }

      const maxStress = raw.Stats?.Stress ?? 1
      const currentStress = raw.CurrentStress ?? maxStress
      stress = { current: currentStress, max: maxStress }
    }

    const activeStatuses = (raw.CombatController?.Statuses || []).map((s: any) => s.status.ID)

    await obrBridge.bindTokenToSheet(token.id, {
      sheetType,
      sheetId,
      mechId,
      name,
      hp,
      heat,
      structure,
      stress,
      statuses: activeStatuses,
    })

    if (OBR.isAvailable) {
      await OBR.notification.show(`Token "${token.name}" vinculado a ${name}!`)
    }

    await loadSceneTokens()
    await refreshTableData()
  } catch (err) {
    console.error('[TableSheetsView] Erro ao vincular token:', err)
  } finally {
    isBindingToken.value = false
  }
}

async function unbindSceneToken(tokenId: string) {
  isBindingToken.value = true
  try {
    await obrBridge.unbindToken(tokenId)
    await loadSceneTokens()
    await refreshTableData()
  } catch (err) {
    console.error('[TableSheetsView] Erro ao desvincular token:', err)
  } finally {
    isBindingToken.value = false
  }
}

async function publishSelectedPilot() {
  if (!selectedLocalPilotId.value) return
  const pilot = PilotStore().Pilots.find((p: any) => (p.ID || p.id) === selectedLocalPilotId.value)
  if (!pilot) return

  isPublishingPilot.value = true
  try {
    await obrBridge.savePilotToRoom(pilot, true)
    await refreshTableData()
    activeTab.value = 'pilots'
    selectedLocalPilotId.value = null
    if (OBR.isAvailable) {
      await OBR.notification.show(`Piloto ${pilot.Callsign || pilot.Name} publicado na mesa!`)
    }
  } catch (e) {
    console.error('[TableSheetsView] Erro ao publicar piloto:', e)
  } finally {
    isPublishingPilot.value = false
  }
}

async function publishSelectedNpc() {
  if (!selectedLocalNpcId.value) return
  const npc = NpcStore().Npcs.find((n: any) => (n.ID || n.id) === selectedLocalNpcId.value)
  if (!npc) return

  isPublishingNpc.value = true
  try {
    await obrBridge.saveNpcToRoom(npc, true)
    await refreshTableData()
    activeTab.value = 'npcs'
    selectedLocalNpcId.value = null
    if (OBR.isAvailable) {
      await OBR.notification.show(`NPC ${npc.Name} publicado na mesa!`)
    }
  } catch (e) {
    console.error('[TableSheetsView] Erro ao publicar NPC:', e)
  } finally {
    isPublishingNpc.value = false
  }
}

function confirmRemoveFromRoom(type: 'pilot' | 'npc', id: string, name: string) {
  confirmTitle.value = `Remover ${type === 'pilot' ? 'Piloto' : 'NPC'} da Mesa?`
  confirmMessage.value = `Deseja remover "${name}" da sala do Owlbear? A ficha não será mais transmitida aos outros jogadores, mas continuará salva no seu COMP/CON.`
  confirmActionCallback = async () => {
    if (type === 'pilot') {
      const nextRoster = { ...tablePilotRoster.value }
      delete nextRoster[id]
      tablePilotRoster.value = nextRoster
      await obrBridge.removePilotFromRoom(id)
    } else {
      const nextRoster = { ...tableNpcRoster.value }
      delete nextRoster[id]
      tableNpcRoster.value = nextRoster
      await obrBridge.removeNpcFromRoom(id)
    }
    await refreshTableData()
    if (OBR.isAvailable) {
      await OBR.notification.show(`"${name}" removido da mesa.`)
    }
  }
  showConfirmDialog.value = true
}

function confirmDeletePermanent(type: 'pilot' | 'npc', id: string, name: string) {
  confirmTitle.value = `Excluir Definitivamente "${name}"?`
  confirmMessage.value = `Atenção: Esta ação removerá a ficha da mesa E excluirá permanentemente os dados do seu COMP/CON local. Esta operação não pode ser desfeita.`
  confirmActionCallback = async () => {
    if (type === 'pilot') {
      const nextRoster = { ...tablePilotRoster.value }
      delete nextRoster[id]
      tablePilotRoster.value = nextRoster
      await obrBridge.removePilotFromRoom(id)
      const pilot = PilotStore().Pilots.find((p: any) => p.ID === id)
      if (pilot) {
        await PilotStore().DeletePilotPermanent(pilot as any)
        await PilotGroupStore().ImportUngroupedPilots()
        await PilotGroupStore().SaveGroupData()
      }
    } else {
      const nextRoster = { ...tableNpcRoster.value }
      delete nextRoster[id]
      tableNpcRoster.value = nextRoster
      await obrBridge.removeNpcFromRoom(id)
      const npc = NpcStore().Npcs.find((n: any) => n.ID === id)
      if (npc) {
        await NpcStore().DeleteNpcPermanent(npc as any)
      }
    }
    await refreshTableData()
    if (OBR.isAvailable) {
      await OBR.notification.show(`"${name}" excluído definitivamente.`)
    }
  }
  showConfirmDialog.value = true
}

async function executeConfirmedAction() {
  if (!confirmActionCallback) return
  isDeleting.value = true
  try {
    await confirmActionCallback()
  } catch (e) {
    console.error('[TableSheetsView] Erro na exclusão:', e)
  } finally {
    isDeleting.value = false
    showConfirmDialog.value = false
    confirmActionCallback = null
  }
}

function triggerImportDialog() {
  showImportModal.value = true
}

async function handleSheetImported(payload: { type: 'pilot' | 'npc' | 'encounter'; id: string; sheetId?: string }) {
  try {
    if (payload.type === 'pilot') {
      let pilot: any = PilotStore().Pilots.find((p: any) => (p.ID || p.id) === payload.id)
      if (!pilot && payload.sheetId) {
        const sheet = PilotSheetStore().PilotSheets.find((s: any) => s.ID === payload.sheetId)
        if (sheet?.Combatant?.actor) {
          pilot = sheet.Combatant.actor
        }
      }
      if (!pilot) {
        const sheet = PilotSheetStore().PilotSheets.find((s: any) => s.ID === payload.id)
        if (sheet?.Combatant?.actor) {
          pilot = sheet.Combatant.actor
        }
      }
      if (!pilot && PilotStore().Pilots.length > 0) {
        pilot = PilotStore().Pilots[PilotStore().Pilots.length - 1]
      }
      if (pilot) {
        await obrBridge.savePilotToRoom(pilot, true)
        if (OBR.isAvailable) {
          await OBR.notification.show(`Piloto ${pilot.Callsign || pilot.Name} importado e publicado na mesa!`)
        }
      }
    } else if (payload.type === 'npc') {
      let npc: any = NpcStore().Npcs.find((n: any) => (n.ID || n.id) === payload.id)
      if (!npc && NpcStore().Npcs.length > 0) {
        npc = NpcStore().Npcs[NpcStore().Npcs.length - 1]
      }
      if (npc) {
        await obrBridge.saveNpcToRoom(npc, true)
        if (OBR.isAvailable) {
          await OBR.notification.show(`NPC ${npc.Name} importado e publicado na mesa!`)
        }
      }
    }
    await refreshTableData()
    activeTab.value = payload.type === 'npc' ? 'npcs' : 'pilots'
  } catch (err) {
    console.error('[TableSheetsView] Erro ao sincronizar item importado:', err)
  }
}

function navigateToCreatePilot() {
  router.push('/new/no_group')
}

function navigateToCreateNpc() {
  router.push('/active-mode/npcs')
}

function detachWindow() {
  if (typeof window !== 'undefined') {
    const screenW = window.screen?.availWidth || 1920
    const screenH = window.screen?.availHeight || 1080
    const width = 1000
    const height = 700
    const left = Math.max(0, Math.round((screenW - width) / 2))
    const top = Math.max(0, Math.round((screenH - height) / 2))
    window.open(
      '/#/table-sheets',
      'TableSheetsManager',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )
  }
}

async function closeWindow() {
  await closeTableSheetsWindow()
}

onMounted(async () => {
  window.addEventListener('compcon-pilot-synced', refreshTableData)
  window.addEventListener('compcon-npc-synced', refreshTableData)
  window.addEventListener('compcon-pilot-removed', refreshTableData)
  window.addEventListener('compcon-npc-removed', refreshTableData)
  await obrBridge.syncFromRoom().catch(() => {})
  await refreshTableData()
})

onUnmounted(() => {
  window.removeEventListener('compcon-pilot-synced', refreshTableData)
  window.removeEventListener('compcon-npc-synced', refreshTableData)
  window.removeEventListener('compcon-pilot-removed', refreshTableData)
  window.removeEventListener('compcon-npc-removed', refreshTableData)
})
</script>

<style scoped>
.table-sheets-view {
  min-height: 100vh;
  box-sizing: border-box;
}

.window-header {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}

.sheet-card {
  transition: all 0.2s ease;
  position: relative;
}

.sheet-card:hover {
  border-color: rgba(var(--v-theme-accent), 0.6) !important;
  box-shadow: 0 2px 12px rgba(var(--v-theme-accent), 0.15) !important;
}

.stat-box {
  min-width: 38px;
}
</style>
