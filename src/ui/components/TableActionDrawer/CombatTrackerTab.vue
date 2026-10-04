<template>
  <div class="combat-tracker-tab fill-height d-flex flex-column text-white">
    <!-- Header do Encontro Ativo e Rodada -->
    <div v-if="encounterInstance" class="tracker-header px-3 py-2 bg-grey-darken-4 border-b border-grey-darken-3 flex-shrink-0">
      <div class="d-flex align-center justify-space-between ga-2 mb-1.5">
        <!-- Título do Encontro e Rodada -->
        <div class="d-flex align-center ga-2 text-truncate">
          <v-chip
            size="small"
            color="accent"
            variant="flat"
            class="font-weight-bold text-black px-2 rounded-0 flex-shrink-0"
            style="height: 22px;"
          >
            RODADA {{ encounterInstance.Round }}
          </v-chip>
          <div class="text-subtitle-2 font-weight-bold text-truncate text-white" :title="encounterInstance.Name">
            {{ encounterInstance.Name }}
          </div>
        </div>

        <div class="d-flex align-center text-caption text-grey-lighten-1 flex-shrink-0" style="font-size: 0.72rem !important;">
          <span class="mr-1">Ativações:</span>
          <b class="text-accent">{{ activatedCount }}/{{ totalCombatantsCount }}</b>
        </div>
      </div>

      <!-- Barra de Ações Rápidas do Mestre -->
      <div v-if="effectiveIsGM" class="d-flex align-center justify-space-between ga-1 pt-1 border-t border-grey-darken-3">
        <div class="d-flex align-center ga-1">
          <!-- Botão Adicionar Combatente -->
          <v-btn
            size="x-small"
            height="26"
            color="accent"
            variant="flat"
            class="font-weight-bold text-black px-2 rounded-0"
            prepend-icon="mdi-account-plus"
            @click="openAddCombatantModal"
          >
            Adicionar
          </v-btn>

          <!-- Próxima Rodada -->
          <v-btn
            size="x-small"
            height="26"
            color="primary"
            variant="flat"
            class="font-weight-bold px-2 rounded-0"
            prepend-icon="mdi-skip-next"
            @click="confirmNextRoundDialog = true"
          >
            Próxima Rodada
          </v-btn>
        </div>

        <!-- Menu de Opções Adicionais do Encontro -->
        <div class="d-flex align-center ga-0.5">
          <v-tooltip text="Restaurar ativações da rodada atual" location="top">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="x-small"
                variant="tonal"
                color="grey-lighten-1"
                icon="mdi-restore"
                style="height: 26px; width: 26px;"
                @click="resetRoundActivations"
              />
            </template>
          </v-tooltip>

          <v-tooltip text="Selecionar outro encontro salvo" location="top">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="x-small"
                variant="tonal"
                color="grey-lighten-1"
                icon="mdi-folder-open-outline"
                style="height: 26px; width: 26px;"
                @click="openSelectEncounterModal"
              />
            </template>
          </v-tooltip>

          <v-tooltip
            v-if="isGM"
            :text="previewAsPlayer ? 'Voltar para Visão do Mestre' : 'Prévia: Ver como Jogador (Fog of War)'"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="x-small"
                :variant="previewAsPlayer ? 'flat' : 'tonal'"
                :color="previewAsPlayer ? 'warning' : 'grey-lighten-1'"
                :icon="previewAsPlayer ? 'mdi-incognito' : 'mdi-incognito-off'"
                style="height: 26px; width: 26px;"
                @click="previewAsPlayer = !previewAsPlayer"
              />
            </template>
          </v-tooltip>

          <v-tooltip text="Encerrar combate ativo" location="top">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="x-small"
                variant="tonal"
                color="error"
                icon="mdi-stop-circle-outline"
                style="height: 26px; width: 26px;"
                @click="confirmEndEncounterDialog = true"
              />
            </template>
          </v-tooltip>
        </div>
      </div>
    </div>

    <!-- Banner de Alerta quando em Modo Prévia de Jogador -->
    <div
      v-if="previewAsPlayer"
      class="bg-warning text-black px-3 py-1 text-caption font-weight-bold d-flex align-center justify-space-between flex-shrink-0"
    >
      <div class="d-flex align-center ga-1">
        <v-icon icon="mdi-incognito" size="16" />
        <span>MODO PRÉVIA: VISÃO DO JOGADOR ATIVA</span>
      </div>
      <v-btn size="x-small" variant="text" class="text-black font-weight-bold px-1" @click="previewAsPlayer = false">
        Sair
      </v-btn>
    </div>

    <!-- Lista de Participantes do Combate -->
    <div
      v-if="encounterInstance && filteredCombatants.length"
      class="combatants-list-container flex-grow-1 px-3 py-2 overflow-y-auto"
    >
      <div
        v-for="c in filteredCombatants"
        :key="c.id"
        :id="'combatant-card-' + c.id"
        class="combatant-card mb-2 pa-2 rounded-0 position-relative"
        :class="{
          'in-turn': activeTurnId === c.id,
          'canvas-selected': selectedFromCanvasCombatantId === c.id,
          'all-spent': getActivations(c).current <= 0,
          'destroyed': isDestroyed(c),
          'hidden-combatant': c.hiddenFromPlayers,
          [`side-${c.side}`]: true,
        }"
      >
        <div class="d-flex align-start justify-space-between ga-2">
          <!-- Avatar + Info Básica -->
          <div class="d-flex align-center ga-2 text-truncate cursor-pointer flex-grow-1" @click="focusCombatant(c)">
            <!-- Miniatura / Avatar -->
            <div class="combatant-avatar position-relative flex-shrink-0">
              <v-img
                v-if="hasPortrait(c)"
                :src="getPortrait(c)"
                width="36"
                height="36"
                cover
                class="rounded-0 border border-grey-darken-2"
              />
              <div
                v-else
                class="d-flex align-center justify-center bg-grey-darken-3 border border-grey-darken-2"
                style="width: 36px; height: 36px;"
              >
                <v-icon
                  :icon="c.actor.Icon || (c.side === 'ally' ? 'cc:pilot' : 'cc:npc')"
                  size="22"
                  :color="activeTurnId === c.id ? 'accent' : 'grey-lighten-1'"
                />
              </div>

              <!-- Indicador de reforço -->
              <span
                v-if="c.reinforcement"
                class="reinforcement-badge"
                title="Reforço ainda não ativado no mapa"
              >
                R
              </span>
            </div>

            <!-- Nomes e Classificação -->
            <div class="text-truncate">
              <div class="d-flex align-center ga-1 text-truncate">
                <span class="font-weight-bold text-subtitle-2 text-truncate" :class="{ 'text-accent': activeTurnId === c.id }">
                  {{ c.actor.Name }}
                </span>
                <span v-if="c.number && c.number > 1" class="text-accent text-caption font-weight-bold">
                  #{{ c.number }}
                </span>
                <v-chip
                  v-if="c.hiddenFromPlayers"
                  size="x-small"
                  density="compact"
                  variant="flat"
                  color="purple-darken-3"
                  class="font-weight-bold px-1 text-uppercase text-caption ml-1"
                  style="font-size: 9px; height: 16px;"
                >
                  <v-icon icon="mdi-eye-off" size="10" class="mr-0.5" />
                  Oculto
                </v-chip>
              </div>

              <div class="text-caption text-grey-lighten-1 text-truncate" style="font-size: 0.7rem !important; line-height: 1.1;">
                <span v-if="c.actor.NpcClassController?.Class">
                  T{{ c.actor.NpcClassController.Tier }} {{ c.actor.NpcClassController.Class.Name }}
                </span>
                <span v-else-if="c.actor.ActiveMech?.Frame">
                  {{ c.actor.ActiveMech.Frame.Name }}
                </span>
                <span v-else-if="c.actor.Callsign">
                  {{ c.actor.Callsign }}
                </span>
                <span v-else>
                  {{ getSideLabel(c.side) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Indicador de Status de Turno & Ativações -->
          <div class="d-flex flex-column align-end flex-shrink-0 ga-1">
            <v-chip
              v-if="activeTurnId === c.id"
              color="accent"
              variant="flat"
              size="x-small"
              class="font-weight-bold text-black pulse-badge px-2"
              style="height: 20px; font-size: 10px;"
            >
              EM TURNO
            </v-chip>
            <v-chip
              v-else-if="getActivations(c).current <= 0"
              color="grey-darken-2"
              variant="flat"
              size="x-small"
              class="text-grey-lighten-1 px-1.5"
              style="height: 18px; font-size: 9.5px;"
            >
              CONCLUÍDO
            </v-chip>

            <!-- Ativações Restantes (Bolinhas) -->
            <div class="d-flex align-center ga-1 mt-0.5" title="Ativações restantes na rodada">
              <v-icon icon="cc:activate" size="13" :color="getActivations(c).current > 0 ? 'accent' : 'grey-darken-1'" />
              <div class="d-flex align-center ga-0.5">
                <div
                  v-for="idx in getActivations(c).max"
                  :key="idx"
                  class="activation-pip"
                  :class="{
                    'filled': idx <= getActivations(c).current,
                    'active-glow': activeTurnId === c.id && idx === getActivations(c).current,
                  }"
                />
              </div>
              <span class="text-caption font-weight-bold ml-0.5" style="font-size: 0.68rem !important;" :class="getActivations(c).current > 0 ? 'text-accent' : 'text-grey'">
                {{ getActivations(c).current }}/{{ getActivations(c).max }}
              </span>
            </div>
          </div>
        </div>

        <!-- Botões de Controle de Turno e Ações Rápidas -->
        <div class="d-flex align-center justify-space-between ga-2 mt-2 pt-1 border-t border-grey-darken-3">
          <!-- Botão Principal: Ativar Turno vs Encerrar Turno -->
          <v-btn
            v-if="activeTurnId === c.id"
            color="success"
            variant="flat"
            size="small"
            class="flex-grow-1 font-weight-bold rounded-0"
            :disabled="!canControlCombatant(c)"
            prepend-icon="mdi-check-circle-outline"
            @click="finishCombatantTurn(c)"
          >
            Encerrar Turno
          </v-btn>

          <v-btn
            v-else
            :color="getActivations(c).current > 0 ? 'accent' : 'grey-darken-2'"
            :variant="getActivations(c).current > 0 ? 'flat' : 'tonal'"
            size="small"
            class="flex-grow-1 font-weight-bold rounded-0"
            :class="{ 'text-black': getActivations(c).current > 0 }"
            :disabled="!canControlCombatant(c) || getActivations(c).current <= 0"
            prepend-icon="mdi-play-circle-outline"
            @click="startCombatantTurn(c)"
          >
            Ativar Turno
          </v-btn>

          <!-- Localizar e Focar no Mapa / Owlbear Rodeo -->
          <v-tooltip text="Localizar e focar token no mapa" location="top">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="small"
                variant="tonal"
                color="accent"
                icon="mdi-crosshairs-gps"
                class="rounded-0 ml-1"
                style="height: 32px; width: 32px;"
                @click="focusCombatant(c)"
              />
            </template>
          </v-tooltip>

          <!-- Abrir Ficha do NPC -->
          <v-tooltip
            v-if="effectiveIsGM && isNpcCombatant(c)"
            text="Abrir ficha do NPC"
            location="top"
          >
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="small"
                variant="tonal"
                color="accent"
                icon="mdi-book-open-variant"
                class="rounded-0 ml-1"
                style="height: 32px; width: 32px;"
                :disabled="!resolveNpcSheet(c)"
                @click.stop="openNpcSheet(c)"
              />
            </template>
          </v-tooltip>

          <!-- Ajuste rápido de ativação (+ / -) -->
          <div class="d-flex align-center ga-0.5">
            <v-tooltip text="Restaurar 1 ativação" location="top">
              <template #activator="{ props: tipProps }">
                <v-btn
                  v-bind="tipProps"
                  size="x-small"
                  variant="text"
                  color="grey-lighten-1"
                  icon="mdi-plus"
                  :disabled="!canControlCombatant(c)"
                  @click="adjustActivation(c, 1)"
                />
              </template>
            </v-tooltip>
            <v-tooltip text="Gastar 1 ativação" location="top">
              <template #activator="{ props: tipProps }">
                <v-btn
                  v-bind="tipProps"
                  size="x-small"
                  variant="text"
                  color="grey-lighten-1"
                  icon="mdi-minus"
                  :disabled="!canControlCombatant(c) || getActivations(c).current <= 0"
                  @click="adjustActivation(c, -1)"
                />
              </template>
            </v-tooltip>
          </div>

          <!-- Remover Combatente (Apenas Mestre) -->
          <v-tooltip v-if="effectiveIsGM" text="Remover combatente deste combate" location="top">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                size="small"
                variant="text"
                color="error"
                icon="mdi-delete-outline"
                class="rounded-0 ml-0.5"
                style="height: 32px; width: 32px;"
                @click.stop="promptRemoveCombatant(c)"
              />
            </template>
          </v-tooltip>
        </div>
      </div>
    </div>

    <!-- Estado Vazio: Encontro Ativo mas sem Combatentes -->
    <div
      v-else-if="encounterInstance && visibleCombatants.length === 0"
      class="empty-state text-center py-10 px-4 my-auto"
    >
      <v-icon icon="mdi-account-multiple-plus" size="52" color="accent" class="mb-3" />
      <div class="text-subtitle-1 font-weight-bold text-white mb-1">
        Encontro Vazio
      </div>
      <div class="text-caption text-grey-lighten-2 mb-4" style="max-width: 280px; margin: 0 auto;">
        Nenhum combatente foi adicionado ainda a este encontro. Adicione os pilotos da mesa ou NPCs para começar.
      </div>
      <v-btn
        v-if="effectiveIsGM"
        color="accent"
        variant="flat"
        size="small"
        class="font-weight-bold text-black rounded-0 px-4"
        prepend-icon="mdi-account-plus"
        @click="openAddCombatantModal"
      >
        Adicionar Combatente
      </v-btn>
    </div>

    <!-- Estado Vazio: Nenhum Combate Ativo -->
    <div v-else-if="!encounterInstance" class="empty-state text-center py-10 px-4 my-auto">
      <v-icon icon="cc:encounter" size="52" color="accent" class="mb-3" />
      <div class="text-subtitle-1 font-weight-bold text-white mb-1">
        Nenhum Combate Ativo
      </div>
      <div class="text-caption text-grey-lighten-2 mb-4" style="max-width: 320px; margin: 0 auto;">
        Inicie um encontro para sincronizar rodadas, turnos e ordem de iniciativa com todos na mesa do Owlbear Rodeo.
      </div>
      <div v-if="effectiveIsGM" class="d-flex flex-column align-center ga-2" style="max-width: 260px; margin: 0 auto;">
        <v-btn
          block
          color="accent"
          variant="flat"
          size="small"
          class="font-weight-bold text-black rounded-0 px-4"
          prepend-icon="mdi-play-circle"
          @click="openNewEncounterModal"
        >
          Iniciar Novo Encontro
        </v-btn>
        <v-btn
          block
          variant="tonal"
          color="grey-lighten-1"
          size="small"
          class="rounded-0 text-caption"
          prepend-icon="mdi-folder-open-outline"
          @click="openSelectEncounterModal"
        >
          Carregar Encontro Salvo
        </v-btn>
        <v-btn
          block
          variant="tonal"
          size="small"
          color="grey-lighten-1"
          class="rounded-0 text-caption"
          @click="loadFromJsonDialog = true; loadJsonInput = ''; loadJsonError = ''"
        >
          Carregar de JSON / Sharecode
        </v-btn>
      </div>
      <div v-else class="text-caption text-grey">
        Aguardando o Mestre iniciar o encontro na mesa.
      </div>
    </div>

    <!-- Estado Vazio com Filtro -->
    <div v-else class="empty-state text-center py-10 px-4 my-auto">
      <v-icon icon="mdi-filter-off-outline" size="44" color="grey-darken-1" class="mb-2" />
      <div class="text-subtitle-2 text-grey-lighten-1">
        Nenhum combatente encontrado com este filtro
      </div>
    </div>

    <!-- DIÁLOGO: Iniciar Novo Encontro -->
    <v-dialog v-model="newEncounterDialog" max-width="440">
      <v-card class="bg-grey-darken-4 border-accent pa-3 rounded-0">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-accent">
            <v-icon icon="mdi-sword-cross" />
            Iniciar Novo Encontro
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" density="compact" @click="newEncounterDialog = false" />
        </div>

        <div class="text-caption text-grey-lighten-2 mb-3">
          Configure o encontro da sessão. Ele será sincronizado imediatamente na mesa para todos os jogadores.
        </div>

        <v-text-field
          v-model="newEncounterName"
          label="Nome do Encontro"
          placeholder="Ex: Combate no Setor 4"
          variant="outlined"
          density="compact"
          color="accent"
          class="mb-2 rounded-0"
          autofocus
        />

        <v-switch
          v-model="newEncounterIncludePilots"
          label="Adicionar pilotos da mesa automaticamente"
          color="accent"
          density="compact"
          hide-details
          class="mb-3"
        />

        <div v-if="newEncounterIncludePilots && availablePilotsCount > 0" class="text-caption text-accent mb-3">
          <v-icon icon="mdi-account-check" size="14" class="mr-1" />
          {{ availablePilotsCount }} piloto(s) serão incluídos na iniciativa como Aliados.
        </div>

        <div class="d-flex align-center justify-end ga-2 pt-2 border-t border-grey-darken-3">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="newEncounterDialog = false">
            Cancelar
          </v-btn>
          <v-btn
            color="accent"
            variant="flat"
            size="small"
            class="font-weight-bold text-black rounded-0"
            :loading="isCreatingEncounter"
            @click="confirmCreateNewEncounter"
          >
            Iniciar Encontro
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- DIÁLOGO: Adicionar Combatente (Pilotos da Mesa ou NPCs) -->
    <v-dialog v-model="addCombatantDialog" max-width="540">
      <v-card class="bg-grey-darken-4 border-accent pa-3 rounded-0" style="max-height: 85vh; display: flex; flex-direction: column;">
        <div class="d-flex align-center justify-space-between mb-2 flex-shrink-0">
          <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-accent">
            <v-icon icon="mdi-account-plus" />
            Adicionar à Iniciativa
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" density="compact" @click="addCombatantDialog = false" />
        </div>

        <!-- Abas: Pilotos vs NPCs -->
        <v-tabs v-model="addCombatantTab" color="accent" density="compact" class="border-b border-grey-darken-3 flex-shrink-0 mb-3">
          <v-tab value="pilots" class="font-weight-bold text-caption">
            <v-icon icon="cc:pilot" size="16" start />
            Pilotos da Mesa ({{ tablePilotsList.length }})
          </v-tab>
          <v-tab value="npcs" class="font-weight-bold text-caption">
            <v-icon icon="cc:npc" size="16" start />
            NPCs do Catálogo ({{ npcsList.length }})
          </v-tab>
        </v-tabs>

        <!-- ABA 1: PILOTOS -->
        <div v-if="addCombatantTab === 'pilots'" class="d-flex flex-column flex-grow-1 overflow-hidden">
          <v-text-field
            v-model="pilotSearchQuery"
            placeholder="Buscar piloto ou mech..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            color="accent"
            hide-details
            clearable
            class="mb-2 flex-shrink-0 rounded-0"
          />

          <div class="flex-grow-1 overflow-y-auto d-flex flex-column ga-1 pr-1" style="max-height: 340px;">
            <div
              v-for="pilot in filteredPilotsList"
              :key="pilot.ID"
              class="d-flex align-center justify-space-between pa-2 bg-grey-darken-3 border border-grey-darken-2"
            >
              <div class="d-flex align-center ga-2 text-truncate">
                <v-avatar size="32" rounded="0" class="border border-grey-darken-2 bg-black flex-shrink-0">
                  <v-img v-if="pilot.Portrait" :src="pilot.Portrait" cover />
                  <v-icon v-else icon="cc:pilot" size="18" color="accent" />
                </v-avatar>
                <div class="text-truncate">
                  <div class="font-weight-bold text-body-2 text-white text-truncate">
                    {{ pilot.Callsign || pilot.Name }}
                  </div>
                  <div class="text-caption text-grey-lighten-1 text-truncate" style="font-size: 0.7rem !important;">
                    {{ pilot.ActiveMech?.Name || (pilot.Mechs?.[0]?.Name) || 'Sem Mech' }}
                    <template v-if="pilot.ActiveMech?.Frame?.Name || pilot.Mechs?.[0]?.Frame?.Name">
                      &bull; {{ pilot.ActiveMech?.Frame?.Name || pilot.Mechs?.[0]?.Frame?.Name }}
                    </template>
                  </div>
                </div>
              </div>

              <div class="flex-shrink-0 ml-2">
                <v-chip
                  v-if="isPilotInCombat(pilot)"
                  size="x-small"
                  color="grey-darken-1"
                  variant="flat"
                  class="font-weight-bold text-grey-lighten-2"
                >
                  No Combate
                </v-chip>
                <v-btn
                  v-else
                  size="x-small"
                  color="accent"
                  variant="flat"
                  class="font-weight-bold text-black rounded-0"
                  prepend-icon="mdi-plus"
                  @click="addPilotToEncounter(pilot)"
                >
                  Adicionar
                </v-btn>
              </div>
            </div>

            <div v-if="filteredPilotsList.length === 0" class="text-center py-6 text-grey">
              <v-icon icon="mdi-alert-circle-outline" size="24" class="mb-1" />
              <div class="text-caption">Nenhum piloto encontrado.</div>
            </div>
          </div>
        </div>

        <!-- ABA 2: NPCs -->
        <div v-if="addCombatantTab === 'npcs'" class="d-flex flex-column flex-grow-1 overflow-hidden">
          <div class="d-flex align-center ga-2 mb-2 flex-shrink-0">
            <v-text-field
              v-model="npcSearchQuery"
              placeholder="Buscar NPC por nome ou classe..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              color="accent"
              hide-details
              clearable
              class="flex-grow-1 rounded-0"
            />

            <!-- Seletor de Lado -->
            <v-btn-toggle
              v-model="npcSelectedSide"
              mandatory
              density="compact"
              class="flex-shrink-0 rounded-0"
              style="height: 38px;"
            >
              <v-btn value="enemy" size="x-small" color="error" class="font-weight-bold text-caption px-2">
                Inimigo
              </v-btn>
              <v-btn value="ally" size="x-small" color="success" class="font-weight-bold text-caption px-2">
                Aliado
              </v-btn>
              <v-btn value="neutral" size="x-small" color="warning" class="font-weight-bold text-caption px-2">
                Neutro
              </v-btn>
            </v-btn-toggle>
          </div>

          <div class="flex-grow-1 overflow-y-auto d-flex flex-column ga-1 pr-1" style="max-height: 340px;">
            <div
              v-for="npc in filteredNpcsList"
              :key="npc.ID"
              class="d-flex align-center justify-space-between pa-2 bg-grey-darken-3 border border-grey-darken-2"
            >
              <div class="d-flex align-center ga-2 text-truncate">
                <v-avatar size="32" rounded="0" class="border border-grey-darken-2 bg-black flex-shrink-0">
                  <v-img v-if="npc.Portrait" :src="npc.Portrait" cover />
                  <v-icon v-else icon="cc:npc" size="18" color="accent" />
                </v-avatar>
                <div class="text-truncate">
                  <div class="font-weight-bold text-body-2 text-white text-truncate">
                    {{ npc.Name }}
                  </div>
                  <div class="text-caption text-grey-lighten-1 text-truncate" style="font-size: 0.7rem !important;">
                    T{{ npcTier(npc) }} &bull; {{ npcClassLabel(npc) }}
                  </div>
                </div>
              </div>

              <div class="flex-shrink-0 ml-2">
                <v-btn
                  size="x-small"
                  color="accent"
                  variant="flat"
                  class="font-weight-bold text-black rounded-0"
                  prepend-icon="mdi-plus"
                  @click="addNpcToEncounter(npc)"
                >
                  Adicionar
                </v-btn>
              </div>
            </div>

            <div v-if="filteredNpcsList.length === 0" class="text-center py-6 text-grey">
              <v-icon icon="mdi-alert-circle-outline" size="24" class="mb-1" />
              <div class="text-caption">Nenhum NPC encontrado no catálogo.</div>
            </div>
          </div>
        </div>

        <div class="d-flex align-center justify-end pt-2 mt-2 border-t border-grey-darken-3 flex-shrink-0">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="addCombatantDialog = false">
            Fechar
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- DIÁLOGO: Confirmar Remoção de Combatente -->
    <v-dialog v-model="confirmRemoveDialog" max-width="380">
      <v-card class="bg-grey-darken-4 border-error pa-3 rounded-0">
        <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-error">
          <v-icon icon="mdi-account-remove" />
          Remover Combatente?
        </div>
        <div class="text-body-2 text-grey-lighten-1 my-3">
          Deseja remover <b>{{ combatantToRemove?.actor?.Name }}</b> deste combate?
          <div class="text-caption text-grey mt-1">
            O combatente será retirado da iniciativa e a alteração será sincronizada na mesa.
          </div>
        </div>
        <div class="d-flex align-center justify-end ga-2">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="confirmRemoveDialog = false">
            Cancelar
          </v-btn>
          <v-btn color="error" variant="flat" size="small" class="font-weight-bold rounded-0" @click="confirmRemoveCombatant">
            Remover
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- DIÁLOGO: Confirmar Encerramento do Encontro -->
    <v-dialog v-model="confirmEndEncounterDialog" max-width="400">
      <v-card class="bg-grey-darken-4 border-error pa-3 rounded-0">
        <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-error">
          <v-icon icon="mdi-stop-circle" />
          Encerrar Combate?
        </div>
        <div class="text-body-2 text-grey-lighten-1 my-3">
          Deseja finalizar o encontro <b>{{ encounterInstance?.Name }}</b>?
          <div class="text-caption text-grey mt-1">
            O combate será encerrado, a iniciativa será limpa e todos os jogadores serão notificados.
          </div>
        </div>
        <div class="d-flex align-center justify-end ga-2">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="confirmEndEncounterDialog = false">
            Cancelar
          </v-btn>
          <v-btn color="error" variant="flat" size="small" class="font-weight-bold rounded-0" @click="confirmEndEncounter">
            Encerrar Combate
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Diálogo de Confirmação para Próxima Rodada -->
    <v-dialog v-model="confirmNextRoundDialog" max-width="360">
      <v-card class="bg-grey-darken-4 border-accent pa-3 rounded-0">
        <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-accent">
          <v-icon icon="mdi-skip-next" />
          Avançar Rodada?
        </div>
        <div class="text-body-2 text-grey-lighten-1 my-3">
          Deseja encerrar a <b>Rodada {{ encounterInstance?.Round }}</b> e iniciar a <b>Rodada {{ (encounterInstance?.Round || 1) + 1 }}</b>?
          <div class="text-caption text-grey mt-2">
            Todas as ativações dos combatentes serão restauradas para a nova rodada.
          </div>
        </div>
        <div class="d-flex align-center justify-end ga-2">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="confirmNextRoundDialog = false">
            Cancelar
          </v-btn>
          <v-btn color="primary" variant="flat" size="small" class="font-weight-bold rounded-0" @click="advanceRound">
            Confirmar
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Diálogo: Selecionar e Sincronizar Encontro Salvo -->
    <v-dialog v-model="selectEncounterDialog" max-width="520">
      <v-card class="bg-grey-darken-4 border-accent pa-3 rounded-0">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-accent">
            <v-icon icon="cc:encounter" />
            Abrir Encontro Salvo
          </div>
          <div class="d-flex align-center ga-1">
            <v-tooltip text="Recarregar lista de encontros" location="top">
              <template #activator="{ props: tipProps }">
                <v-btn
                  v-bind="tipProps"
                  icon="mdi-refresh"
                  variant="text"
                  size="small"
                  density="compact"
                  color="accent"
                  :loading="isLoadingEncounters"
                  @click="refreshEncountersList"
                />
              </template>
            </v-tooltip>
            <v-btn icon="mdi-close" variant="text" size="small" density="compact" @click="selectEncounterDialog = false" />
          </div>
        </div>

        <div class="text-caption text-grey-lighten-2 mb-3">
          Selecione um encontro existente para abrir no tracker.
        </div>

        <!-- Lista de Encontros Ativos em Andamento -->
        <div v-if="activeEncountersList.length > 0" class="mb-3">
          <div class="text-caption text-accent font-weight-bold text-uppercase mb-1 d-flex align-center ga-1">
            <v-icon icon="mdi-play-circle" size="14" />
            Encontros em Andamento
          </div>
          <div class="d-flex flex-column ga-1">
            <div
              v-for="enc in (activeEncountersList as any[])"
              :key="enc.ID || enc.id || enc._id"
              class="d-flex align-center justify-space-between pa-2 bg-grey-darken-3 border border-grey-darken-2"
            >
              <div>
                <div class="font-weight-bold text-subtitle-2 text-white">{{ enc.Name || enc.name || enc._name || 'Encontro Sem Nome' }}</div>
                <div class="text-caption text-grey-lighten-1">
                  Rodada {{ enc.Round || enc.round || 1 }} &bull; {{ (enc.Combatants || enc.combatants || []).length }} combatentes
                </div>
              </div>
              <v-btn
                color="accent"
                size="small"
                variant="flat"
                class="font-weight-bold text-black rounded-0"
                prepend-icon="mdi-play"
                :loading="syncingEncounterId === (enc.ID || enc.id || enc._id)"
                @click="resumeEncounter(enc)"
              >
                Retomar
              </v-btn>
            </div>
          </div>
        </div>

        <!-- Lista de Encontros Preparados -->
        <div v-if="preparedEncountersList.length > 0" class="mb-3">
          <div class="text-caption text-grey-lighten-1 font-weight-bold text-uppercase mb-1 d-flex align-center ga-1">
            <v-icon icon="mdi-folder-outline" size="14" />
            Encontros Preparados ({{ preparedEncountersList.length }})
          </div>
          <div class="d-flex flex-column ga-1" style="max-height: 220px; overflow-y: auto;">
            <div
              v-for="enc in (preparedEncountersList as any[])"
              :key="enc.ID || enc.id || enc._id"
              class="d-flex align-center justify-space-between pa-2 bg-grey-darken-3 border border-grey-darken-2"
            >
              <div>
                <div class="font-weight-bold text-subtitle-2 text-white">{{ enc.Name || enc.name || enc._name || 'Encontro Sem Nome' }}</div>
                <div class="text-caption text-grey-lighten-1">
                  {{ (enc.Combatants || enc.combatants || []).length }} combatentes
                </div>
              </div>
              <v-btn
                color="primary"
                size="small"
                variant="flat"
                class="font-weight-bold text-white rounded-0"
                prepend-icon="mdi-sword-cross"
                :loading="syncingEncounterId === (enc.ID || enc.id || enc._id)"
                @click="launchEncounter(enc)"
              >
                Iniciar
              </v-btn>
            </div>
          </div>
        </div>

        <!-- Se nenhum encontro salvo -->
        <div v-if="activeEncountersList.length === 0 && preparedEncountersList.length === 0" class="text-center py-4 bg-grey-darken-3 mb-3">
          <v-icon icon="mdi-alert-circle-outline" color="grey-lighten-1" size="32" class="mb-1" />
          <div class="text-caption text-grey-lighten-1 mb-2">Nenhum encontro salvo no momento.</div>
          <v-btn
            size="small"
            color="accent"
            variant="flat"
            class="text-black font-weight-bold rounded-0"
            prepend-icon="mdi-play-circle"
            @click="selectEncounterDialog = false; openNewEncounterModal()"
          >
            Criar Encontro Rápido
          </v-btn>
        </div>

        <div class="d-flex align-center justify-end pt-2 border-t border-grey-darken-3">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="selectEncounterDialog = false">
            Fechar
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Diálogo: Carregar de JSON / Sharecode -->
    <v-dialog v-model="loadFromJsonDialog" max-width="520">
      <v-card class="bg-grey-darken-4 border-accent pa-3 rounded-0">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-subtitle-1 font-weight-bold text-uppercase d-flex align-center ga-2 text-accent">
            <v-icon icon="mdi-code-json" />
            Carregar de JSON / Sharecode
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" density="compact" @click="loadFromJsonDialog = false; loadJsonInput = ''; loadJsonError = ''; loadJsonFile = null" />
        </div>

        <div class="text-caption text-grey-lighten-2 mb-3">
          Selecione um arquivo .json exportado do COMP/CON ou cole o JSON/Sharecode abaixo.
        </div>

        <div class="mb-2">
          <label class="v-btn v-btn--block v-theme--gms_dark bg-accent v-btn--density-default rounded-0 v-btn--size-small v-btn--variant-flat font-weight-bold text-black cursor-pointer">
            <span class="v-btn__overlay"></span>
            <span class="v-btn__underlay"></span>
            <span class="v-btn__prepend"><i class="mdi-file-import-outline mdi v-icon notranslate v-theme--gms_dark v-icon--size-default" aria-hidden="true"></i></span>
            <span class="v-btn__content" data-no-activator=""> Selecionar Arquivo JSON </span>
            <input type="file" accept=".json" class="d-none" ref="jsonFileInput" @change="onJsonFileSelected" />
          </label>
          <div v-if="loadJsonFile" class="text-caption text-success mt-1">
            Arquivo selecionado: {{ loadJsonFile.name }} ({{ (loadJsonFile.size / 1024).toFixed(1) }} KB)
          </div>
        </div>

        <div class="text-caption text-grey-lighten-1 mb-2">Sharecode:</div>

        <cc-text-field
          v-model="loadJsonInput"
          :label="$t('active.newEnc.jsonOrSharecode')"
          :placeholder="$t('active.newEnc.jsonOrSharecodePlaceholder')"
          density="compact"
          variant="outlined"
          rows="4"
          auto-grow
          hide-details
          :counter="50000"
          color="accent"
          class="mb-2 rounded-0 flex-column"
        />
        <div v-if="loadJsonError" class="text-error mb-2 text-caption">{{ loadJsonError }}</div>

        <div class="d-flex align-center justify-end ga-2 pt-2 border-t border-grey-darken-3">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="loadFromJsonDialog = false; loadJsonInput = ''; loadJsonError = ''; loadJsonFile = null">
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            class="font-weight-bold rounded-0"
            :loading="loadJsonLoading"
            @click="loadEncounterFromJson"
          >
            Carregar Encontro
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Diálogo: Confirmar Vínculo de Token Selecionado -->
    <v-dialog v-model="bindConfirmDialog" max-width="400">
      <v-card class="bg-grey-darken-4 border-accent pa-3 rounded-0">
        <div class="text-subtitle-2 font-weight-bold text-accent d-flex align-center ga-2">
          <v-icon icon="mdi-link-variant" />
          Vincular Token no Mapa
        </div>
        <div class="text-caption text-grey-lighten-1 my-3">
          Nenhum token foi encontrado no mapa vinculado a <b>{{ pendingBindCombatant?.actor?.Name }}</b>.
          <br /><br />
          Deseja vincular o <b>token atualmente selecionado no Owlbear</b> a este combatente?
        </div>
        <div class="d-flex align-center justify-end ga-2">
          <v-btn variant="text" size="small" color="grey-lighten-1" class="rounded-0" @click="bindConfirmDialog = false">
            Cancelar
          </v-btn>
          <v-btn color="accent" variant="flat" size="small" class="font-weight-bold text-black rounded-0" @click="confirmBindToken">
            Vincular Token
          </v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { CampaignStore, EncounterStore, PilotStore, NpcStore } from '@/stores'
import { useTableActionStore } from '@/stores/tableActionStore'
import { obrBridge } from '@/services/obrBridge'
import { openMainWindow } from '@/services/mainWindow'
import { StatKey } from '@/classes/components/combat/stats/Stats'

const props = withDefaults(
  defineProps<{
    activeFilter?: 'all' | 'enemy' | 'ally' | 'neutral' | 'pending'
  }>(),
  {
    activeFilter: 'all',
  }
)

const emit = defineEmits<{
  (e: 'update:sideFilters', filters: { label: string; value: string; count: number }[]): void
  (e: 'update:activeFilter', filter: 'all' | 'enemy' | 'ally' | 'neutral' | 'pending'): void
}>()

// NpcClassController/Tier/Class are declared on the concrete NPC subclasses
// (Unit, Eidolon) but not on the Npc base type used by these lists, so these
// helpers keep the original fallback chain while typechecking.
function npcTier(npc: any): number {
  return npc?.NpcClassController?.Tier || npc?.Tier || 1
}

function npcClassLabel(npc: any): string {
  return npc?.NpcClassController?.Class?.Name || npc?.Class?.Name || npc?.Class || 'NPC'
}

const tableActionStore = useTableActionStore()
const encounterStore = EncounterStore()
const campaignStore = CampaignStore()
const pilotStore = PilotStore()
const npcStore = NpcStore()

const localActiveFilter = ref<'all' | 'enemy' | 'ally' | 'neutral' | 'pending'>('all')

const currentActiveFilter = computed({
  get: () => props.activeFilter || localActiveFilter.value,
  set: (val: 'all' | 'enemy' | 'ally' | 'neutral' | 'pending') => {
    localActiveFilter.value = val
    emit('update:activeFilter', val)
  },
})

// Estados dos Diálogos
const activeTurnId = ref<string | null>(null)
const confirmNextRoundDialog = ref(false)
const selectEncounterDialog = ref(false)
const bindConfirmDialog = ref(false)
const pendingBindCombatant = ref<any>(null)
const selectedFromCanvasCombatantId = ref<string | null>(null)
const syncingEncounterId = ref<string | null>(null)
const isLoadingEncounters = ref(false)
const forceRefreshKey = ref(0)
let highlightTimeout: any = null

// Carregar de JSON/Sharecode
const loadFromJsonDialog = ref(false)
const loadJsonInput = ref('')
const loadJsonFile = ref<File | null>(null)
const loadJsonLoading = ref(false)
const loadJsonError = ref('')

// Novo Encontro
const newEncounterDialog = ref(false)
const newEncounterName = ref('Combate da Sessão')
const newEncounterIncludePilots = ref(true)
const isCreatingEncounter = ref(false)

// Adicionar Combatente
const addCombatantDialog = ref(false)
const addCombatantTab = ref<'pilots' | 'npcs'>('pilots')
const pilotSearchQuery = ref('')
const npcSearchQuery = ref('')
const npcSelectedSide = ref<'enemy' | 'ally' | 'neutral'>('enemy')
const tablePilotRoster = ref<Record<string, any>>({})

// Remover Combatente
const confirmRemoveDialog = ref(false)
const combatantToRemove = ref<any>(null)

// Encerrar Combate
const confirmEndEncounterDialog = ref(false)

// Permissões e Modo Prévia
// Fails closed: the OBR role is only known once the bridge is ready, so until
// then (and in any context without a room) nobody gets the GM-only controls
// instead of everybody getting them.
const isGM = computed(() => {
  if (!obrBridge.getIsReady()) return false
  return obrBridge.getRole() === 'GM'
})

const previewAsPlayer = ref(false)

const effectiveIsGM = computed(() => {
  if (previewAsPlayer.value) return false
  return isGM.value
})

// Instância do Encontro Ativo
const encounterInstance = computed(() => {
  forceRefreshKey.value
  if (!encounterStore.CurrentActiveID) {
    return null
  }
  const enc = encounterStore.getActiveEncounter(encounterStore.CurrentActiveID)
  return enc || null
})

// Combatentes Visíveis
const visibleCombatants = computed(() => {
  const list = (encounterInstance.value?.Combatants || []) as any[]
  if (!effectiveIsGM.value) {
    return list.filter(c => !c.hiddenFromPlayers && !c.reinforcement)
  }
  return list
})

const totalCombatantsCount = computed(() => visibleCombatants.value.length)

const activatedCount = computed(() => {
  return visibleCombatants.value.filter(c => getActivations(c).current <= 0).length
})

const sideFilters = computed(() => {
  const list = visibleCombatants.value
  return [
    { label: 'Todos', value: 'all', count: list.length },
    { label: 'Inimigos', value: 'enemy', count: list.filter(c => c.side === 'enemy').length },
    { label: 'Aliados', value: 'ally', count: list.filter(c => c.side === 'ally').length },
    { label: 'Pendentes', value: 'pending', count: list.filter(c => getActivations(c).current > 0).length },
  ]
})

watch(
  sideFilters,
  (val) => {
    emit('update:sideFilters', val)
  },
  { immediate: true, deep: true }
)

const filteredCombatants = computed(() => {
  let list = [...visibleCombatants.value]

  // Ordena: Em turno primeiro, depois com ativações pendentes, depois concluídos
  list.sort((a, b) => {
    if (activeTurnId.value === a.id) return -1
    if (activeTurnId.value === b.id) return 1
    const aPending = getActivations(a).current > 0
    const bPending = getActivations(b).current > 0
    if (aPending && !bPending) return -1
    if (!aPending && bPending) return 1
    return (a.index ?? 0) - (b.index ?? 0)
  })

  if (currentActiveFilter.value === 'all') return list
  if (currentActiveFilter.value === 'pending') return list.filter(c => getActivations(c).current > 0)
  return list.filter(c => c.side === currentActiveFilter.value)
})

// Lista de Pilotos da Mesa para o Diálogo de Adição
const tablePilotsList = computed(() => {
  const allPilots = (pilotStore.Pilots || []).filter((p: any) => !p?.SaveController?.IsDeleted)
  return allPilots
})

const availablePilotsCount = computed(() => tablePilotsList.value.length)

const filteredPilotsList = computed(() => {
  const q = pilotSearchQuery.value?.trim().toLowerCase()
  if (!q) return tablePilotsList.value
  return tablePilotsList.value.filter((p: any) => {
    const callsign = (p.Callsign || '').toLowerCase()
    const name = (p.Name || '').toLowerCase()
    const mech = (p.ActiveMech?.Name || p.Mechs?.[0]?.Name || '').toLowerCase()
    const frame = (p.ActiveMech?.Frame?.Name || p.Mechs?.[0]?.Frame?.Name || '').toLowerCase()
    return callsign.includes(q) || name.includes(q) || mech.includes(q) || frame.includes(q)
  })
})

// Lista de NPCs para o Diálogo de Adição
const npcsList = computed(() => {
  return (npcStore.Npcs || []).filter((n: any) => !n?.SaveController?.IsDeleted)
})

const filteredNpcsList = computed(() => {
  const q = npcSearchQuery.value?.trim().toLowerCase()
  if (!q) return npcsList.value
  return npcsList.value.filter((n: any) => {
    const name = (n.Name || '').toLowerCase()
    const cls = (n.NpcClassController?.Class?.Name || n.Class || '').toLowerCase()
    return name.includes(q) || cls.includes(q)
  })
})

function isPilotInCombat(pilot: any): boolean {
  if (!encounterInstance.value?.Combatants) return false
  const pId = (pilot.ID || pilot.id)?.toLowerCase()
  return encounterInstance.value.Combatants.some(
    (c: any) => (c.id?.toLowerCase() === pId || c.actor?.ID?.toLowerCase() === pId)
  )
}

function canControlCombatant(c: any): boolean {
  if (effectiveIsGM.value) return true
  if (c.side === 'ally' || c.isPlayer) return true
  return false
}

function hasPortrait(c: any): boolean {
  return !!(c.actor?.PortraitController?.HasImage && c.actor?.Portrait)
}

function getPortrait(c: any): string {
  return c.actor?.Portrait || ''
}

function isDestroyed(c: any): boolean {
  return !!c.actor?.CombatController?.IsDestroyed
}

function getSideLabel(side: string): string {
  if (side === 'enemy') return 'Inimigo'
  if (side === 'ally') return 'Aliado'
  return 'Neutro'
}

function getActivations(c: any): { current: number; max: number } {
  const stats = c.actor?.CombatController?.StatController?.CurrentStats
  const maxStats = c.actor?.CombatController?.StatController?.MaxStats
  return {
    current: stats?.activations ?? 0,
    max: maxStats?.activations || 1,
  }
}

// Abrir a ficha completa do NPC (mesmo iframe)
const NPC_SHEET_TYPE: Record<string, string> = {
  unit: 'npc',
  doodad: 'doodad',
  eidolon: 'eidolon',
}

function isNpcCombatant(c: any): boolean {
  return ['unit', 'doodad', 'eidolon'].includes(c?.type)
}

function resolveNpcSheet(c: any): { type: string; id: string } | null {
  const type = NPC_SHEET_TYPE[c?.type]
  const id = c?.actor?.OriginId || c?.actor?.ID
  if (!type || !id) return null
  // O NPC pode estar embutido no encontro (sharecode/json) sem existir no roster;
  // nesse caso o npc-runner resolve direto do encontro compartilhado.
  return { type, id }
}

function openNpcSheet(c: any) {
  const target = resolveNpcSheet(c)
  if (!target) return
  // Abre a ficha ativa do NPC na janela principal (iframe da direita), reutilizando
  // o iframe já montado — nunca recriando a janela (isso descartava o estado).
  void openMainWindow({ restoreIfHidden: true, targetRoute: `/active-mode/npc-runner/${target.id}` })
  // local-only: abre só na janela principal do mestre, sem afetar os jogadores
  void obrBridge.sendBroadcastMessage(
    {
      type: 'OPEN_SHEET_REQUESTED',
      sheetType: 'npc',
      sheetId: target.id,
    },
    true
  )
}

// Grava o encontro localmente (active_encounters)
function persistEncounter() {
  if (!encounterInstance.value) return
  void encounterInstance.value.Save?.()
}

// Controles de Turno
function startCombatantTurn(c: any) {
  activeTurnId.value = c.id
  try {
    c.actor?.CombatController?.StartTurn()
    const current = getActivations(c).current
    if (current > 0) {
      c.actor?.CombatController?.StatController?.setCurrentStat(StatKey.ACTIVATIONS, current - 1)
    }
  } catch (e) {
    console.warn('[CombatTracker] Erro ao iniciar turno:', e)
  }

  void tableActionStore.postAction({
    senderName: c.actor?.Name || 'Combat Tracker',
    category: 'full_action',
    title: `Início de Turno — ${c.actor?.Name || 'Combatente'}${c.number && c.number > 1 ? ` #${c.number}` : ''}`,
    detail: `Ativação iniciada na Rodada ${encounterInstance.value?.Round || 1}.`,
  })

  if (encounterInstance.value) {
    persistEncounter()
  }
}

function finishCombatantTurn(c: any) {
  if (activeTurnId.value === c.id) {
    activeTurnId.value = null
  }
  try {
    c.actor?.CombatController?.EndTurn(encounterInstance.value)
  } catch (e) {
    console.warn('[CombatTracker] Erro ao encerrar turno:', e)
  }

  void tableActionStore.postAction({
    senderName: c.actor?.Name || 'Combat Tracker',
    category: 'full_action',
    title: `Fim de Turno — ${c.actor?.Name || 'Combatente'}${c.number && c.number > 1 ? ` #${c.number}` : ''}`,
    detail: `Turno concluído.`,
  })

  if (encounterInstance.value) {
    persistEncounter()
  }
}

function adjustActivation(c: any, delta: number) {
  const current = getActivations(c).current
  const max = getActivations(c).max
  const next = Math.max(0, Math.min(max, current + delta))
  c.actor?.CombatController?.StatController?.setCurrentStat(StatKey.ACTIVATIONS, next)
  if (encounterInstance.value) {
    persistEncounter()
  }
}

function resetRoundActivations() {
  if (!encounterInstance.value?.Combatants) return
  for (const c of encounterInstance.value.Combatants) {
    const max = getActivations(c).max
    c.actor?.CombatController?.StatController?.setCurrentStat(StatKey.ACTIVATIONS, max)
  }
  activeTurnId.value = null
  if (encounterInstance.value) {
    persistEncounter()
  }
}

async function advanceRound() {
  confirmNextRoundDialog.value = false
  if (!encounterInstance.value) return
  const prevRound = encounterInstance.value.Round
  try {
    await encounterInstance.value.EndRound()
  } catch (e) {
    console.warn('[CombatTracker] Erro ao avançar rodada:', e)
  }
  resetRoundActivations()

  void tableActionStore.postAction({
    senderName: 'Combat Tracker',
    category: 'full_action',
    title: `RODADA ${encounterInstance.value.Round} INICIADA`,
    detail: `A Rodada ${prevRound} foi encerrada. Todas as ativações foram reiniciadas.`,
  })

  if (encounterInstance.value) {
    persistEncounter()
  }
}

function toggleCombatantVisibility(c: any) {
  c.hiddenFromPlayers = !c.hiddenFromPlayers
  if (encounterInstance.value) {
    persistEncounter()
  }
  forceRefreshKey.value++

  void tableActionStore.postAction({
    senderName: 'Combat Tracker',
    category: 'full_action',
    title: c.hiddenFromPlayers
      ? `Combatente Ocultado: ${c.actor?.Name || 'Inimigo'}`
      : `Combatente Revelado: ${c.actor?.Name || 'Inimigo'}`,
    detail: c.hiddenFromPlayers
      ? `O combatente foi ocultado da visão dos jogadores (Fog of War).`
      : `O combatente foi revelado e agora está visível no tracker dos jogadores.`,
  })
}

// INICIAR NOVO ENCONTRO
function openNewEncounterModal() {
  newEncounterName.value = 'Combate da Sessão'
  newEncounterIncludePilots.value = true
  newEncounterDialog.value = true
}

async function confirmCreateNewEncounter() {
  isCreatingEncounter.value = true
  try {
    const { Encounter } = await import('@/classes/encounter/Encounter')
    const { EncounterInstance } = await import('@/classes/encounter/EncounterInstance')

    const baseEncounter = new Encounter()
    baseEncounter.Name = newEncounterName.value.trim() || 'Combate da Sessão'

    let pilotsToAdd: any[] = []
    if (newEncounterIncludePilots.value) {
      pilotsToAdd = (pilotStore.Pilots || []).filter((p: any) => !p?.SaveController?.IsDeleted && p.Mechs?.length > 0)
    }

    const instance = new EncounterInstance(
      undefined,
      baseEncounter,
      pilotsToAdd,
      []
    )

    instance.Combatants.forEach((c: any) => {
      c.actor?.CombatController?.ResetForEncounter()
      c.actor?.CombatController?.StartEncounter()
    })
    instance.RecordEncounterStart()

    await encounterStore.AddEncounterInstance(instance)
    await encounterStore.SetActiveEncounter(instance.ID)

    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `Combate Iniciado — ${instance.Name}`,
      detail: `O Mestre iniciou um novo combate com ${instance.Combatants.length} combatentes. Rodada 1.`,
    })

    newEncounterDialog.value = false
    forceRefreshKey.value++
  } catch (err) {
    console.error('[CombatTracker] Erro ao criar novo encontro:', err)
  } finally {
    isCreatingEncounter.value = false
  }
}

// ADICIONAR COMBATENTE (PILOTO OU NPC)
async function openAddCombatantModal() {
  await pilotStore.LoadPilots().catch(() => {})
  await npcStore.LoadNpcs().catch(() => {})
  try {
    tablePilotRoster.value = await obrBridge.getTablePilotRoster()
  } catch (_) {}
  pilotSearchQuery.value = ''
  npcSearchQuery.value = ''
  addCombatantDialog.value = true
}

async function addPilotToEncounter(pilotItem: any) {
  if (!encounterInstance.value) return
  if (isPilotInCombat(pilotItem)) return

  try {
    const { Pilot } = await import('@/classes/pilot/Pilot')
    const { makeCombatant } = await import('@/classes/encounter/Encounter')

    const pc = Pilot.Deserialize(JSON.parse(JSON.stringify(Pilot.Serialize(pilotItem))))
    if (!pc.ActiveMech && pc.Mechs?.length) {
      pc.ActiveMech = pc.Mechs[0]
    }
    pc.SetStats()
    pc.FeatureController?.BonusController?.applyToStats?.(
      pc.CombatController.StatController,
      encounterInstance.value
    )
    pc.CombatController?.ResetForEncounter?.()
    pc.CombatController?.StatController?.resetCurrentStats?.()

    const combatant = makeCombatant(pc, 'pilot', {
      id: pc.ID,
      index: encounterInstance.value.Combatants.length,
      number: -1,
      side: 'ally',
      status: undefined,
      pilotStatus: undefined,
      mechStatus: undefined,
    })

    encounterInstance.value.Combatants.push(combatant)
    await encounterInstance.value.Save?.().catch(() => {})

    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `Piloto Adicionado: ${pc.Callsign || pc.Name}`,
      detail: `${pc.Callsign || pc.Name} (${pc.ActiveMech?.Name || 'Mech'}) entrou na iniciativa.`,
    })

    forceRefreshKey.value++
  } catch (err) {
    console.error('[CombatTracker] Erro ao adicionar piloto:', err)
  }
}

async function addNpcToEncounter(npcItem: any) {
  if (!encounterInstance.value) return

  try {
    const { makeCombatant } = await import('@/classes/encounter/Encounter')
    const npc = npcItem.Clone(false)
    // Preserva o vínculo com o item do roster para permitir abrir a ficha
    npc.OriginId = npcItem.OriginId || npcItem.ID
    const sameNameCount = encounterInstance.value.Combatants.filter(
      (c: any) => c.actor.Name === npc.Name
    ).length
    const number = sameNameCount + 1

    npc.CombatController?.StatController?.applyRegisteredCustomStats?.()
    npc.FeatureController?.BonusController?.applyToStats?.(
      npc.CombatController.StatController,
      encounterInstance.value
    )
    npc.CombatController?.ResetForEncounter?.()
    npc.CombatController?.StatController?.resetCurrentStats?.()

    const combatant = makeCombatant(npc, 'unit', {
      id: crypto.randomUUID(),
      index: encounterInstance.value.Combatants.length,
      number,
      side: npcSelectedSide.value,
    })

    encounterInstance.value.Combatants.push(combatant)
    await encounterInstance.value.Save?.().catch(() => {})

    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `NPC Adicionado: ${npc.Name}${number > 1 ? ` #${number}` : ''}`,
      detail: `${npc.Name} adicionado à iniciativa como ${getSideLabel(npcSelectedSide.value)}.`,
    })

    forceRefreshKey.value++
  } catch (err) {
    console.error('[CombatTracker] Erro ao adicionar NPC:', err)
  }
}

// REMOVER COMBATENTE
function promptRemoveCombatant(c: any) {
  combatantToRemove.value = c
  confirmRemoveDialog.value = true
}

async function confirmRemoveCombatant() {
  if (!combatantToRemove.value || !encounterInstance.value) return
  const target = combatantToRemove.value
  const targetName = target.actor?.Name || 'Combatente'
  const idx = encounterInstance.value.Combatants.findIndex((c: any) => c.id === target.id)

  if (idx !== -1) {
    encounterInstance.value.Combatants.splice(idx, 1)
    if (activeTurnId.value === target.id) {
      activeTurnId.value = null
    }
    encounterInstance.value.Combatants.forEach((c: any, i: number) => {
      c.index = i
    })
    await encounterInstance.value.Save?.().catch(() => {})

    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `Combatente Removido: ${targetName}`,
      detail: `${targetName} foi removido da iniciativa.`,
    })
  }

  confirmRemoveDialog.value = false
  combatantToRemove.value = null
  forceRefreshKey.value++
}

// ENCERRAR COMBATE
async function confirmEndEncounter() {
  confirmEndEncounterDialog.value = false
  if (!encounterInstance.value) return
  const current = encounterInstance.value
  const encName = current.Name || 'Combate'
  const encId = current.ID || (current as any)._id

  try {
    current.EndEncounter()
    await current.Save?.().catch(() => {})
  } catch (e) {
    console.warn('[CombatTracker] Erro ao finalizar combate:', e)
  }

  // Remove da lista de instâncias ativas no store e storage
  await encounterStore.RemoveEncounterInstance(current).catch(() => {})
  encounterStore.ActiveEncounters = (encounterStore.ActiveEncounters || []).filter(
    (x: any) => (x.ID || x.id || x._id) !== encId
  )
  encounterStore.CurrentActiveID = ''
  encounterStore.SaveActiveEncounterData?.()

  activeTurnId.value = null

  void tableActionStore.postAction({
    senderName: 'Combat Tracker',
    category: 'full_action',
    title: `Combate Encerrado: ${encName}`,
    detail: `O combate foi finalizado pelo Mestre. O tracker está livre.`,
  })

  forceRefreshKey.value++
}

// VINCULAR E FOCAR TOKEN NO OWLBEAR
async function focusCombatant(c: any) {
  const found = await obrBridge.focusAndSelectCombatant(c)
  if (!found) {
    pendingBindCombatant.value = c
    bindConfirmDialog.value = true
  }
}

async function confirmBindToken() {
  if (!pendingBindCombatant.value) return
  const target = pendingBindCombatant.value
  const success = await obrBridge.bindSelectedTokenToCombatant(target)
  bindConfirmDialog.value = false
  if (success) {
    await obrBridge.focusAndSelectCombatant(target)
  }
}

// ENCONTROS PREPARADOS E SALVOS
const activeEncountersList = computed(() => {
  forceRefreshKey.value
  return (encounterStore.ActiveEncounters || []).filter(e => !e?.SaveController?.IsDeleted)
})

const preparedEncountersList = computed(() => {
  forceRefreshKey.value
  const list: any[] = (encounterStore.Encounters || []).filter(e => !e?.SaveController?.IsDeleted)
  const seenIds = new Set(list.map(e => e.ID || (e as any)._id))

  try {
    for (const camp of campaignStore.Campaigns || []) {
      if (camp?.SaveController?.IsDeleted) continue
      const campEncounters = (camp.AllContent || [])
        .flatMap((x: any) => x.Content || [])
        .filter((x: any) => x.ContentType === 'encounter')
        .map((x: any) => x.Content?.Data)
        .filter((enc: any) => enc && !enc.SaveController?.IsDeleted)

      for (const enc of campEncounters) {
        const id = enc.ID || enc._id
        if (id && !seenIds.has(id)) {
          seenIds.add(id)
          list.push(enc)
        }
      }
    }
  } catch (err) {
    console.warn('[CombatTrackerTab] Erro ao buscar encontros em campanhas:', err)
  }

  return list
})

async function refreshEncountersList() {
  isLoadingEncounters.value = true
  try {
    await encounterStore.LoadEncounters()
    await campaignStore.LoadCampaigns().catch(() => {})
    await pilotStore.LoadPilots().catch(() => {})
    await npcStore.LoadNpcs().catch(() => {})
    forceRefreshKey.value++
  } catch (e) {
    console.warn('[CombatTrackerTab] Erro ao carregar encontros:', e)
  } finally {
    isLoadingEncounters.value = false
  }
}

async function openSelectEncounterModal() {
  selectEncounterDialog.value = true
  await refreshEncountersList()
}

async function resumeEncounter(enc: any) {
  const encId = enc.ID || enc.id || enc._id
  syncingEncounterId.value = encId
  try {
    await encounterStore.AssignActiveEncounter(enc)
    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `Combate Iniciado — ${enc.Name || enc.name || enc._name || 'Encontro'}`,
      detail: `O encontro foi aberto na Rodada ${enc.Round || enc.round || 1}.`,
    })
    selectEncounterDialog.value = false
    forceRefreshKey.value++
  } finally {
    syncingEncounterId.value = null
  }
}

async function launchEncounter(enc: any) {
  const encId = enc.ID || enc.id || enc._id
  syncingEncounterId.value = encId
  try {
    const { Encounter } = await import('@/classes/encounter/Encounter')
    const { EncounterInstance } = await import('@/classes/encounter/EncounterInstance')
    const pilots = (pilotStore.Pilots || []).filter((p: any) => !p?.SaveController?.IsDeleted) as any[]

    const encObj = (enc instanceof Encounter) ? enc : Encounter.Deserialize(enc)

    const instance = new EncounterInstance(
      undefined,
      encObj,
      pilots,
      []
    )
    instance.Combatants.forEach((c: any) => {
      c.actor?.CombatController?.ResetForEncounter()
      c.actor?.CombatController?.StartEncounter()
    })
    instance.RecordEncounterStart()
    await encounterStore.AddEncounterInstance(instance)
    await encounterStore.SetActiveEncounter(instance.ID)

    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `Combate Iniciado — ${instance.Name}`,
      detail: `O encontro foi iniciado. Rodada 1.`,
    })
    selectEncounterDialog.value = false
    forceRefreshKey.value++
  } catch (e) {
    console.error('[CombatTracker] Erro ao iniciar encontro preparado:', e)
  } finally {
    syncingEncounterId.value = null
  }
}

function onJsonFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    loadJsonFile.value = target.files[0]
    loadJsonError.value = ''
  }
}

async function loadEncounterFromJson() {
  const hasInput = loadJsonInput.value.trim()
  const hasFile = loadJsonFile.value

  if (!hasInput && !hasFile) {
    loadJsonError.value = 'Selecione um arquivo JSON ou insira um JSON/ShareCode.'
    return
  }

  loadJsonLoading.value = true
  loadJsonError.value = ''

  try {
    const { loadEncounterFromJsonOrSharecode, loadEncounterFromFile } = await import('@/util/encounterLoader')

    let instance: any
    if (hasFile && loadJsonFile.value) {
      const result = await loadEncounterFromFile(loadJsonFile.value)
      instance = result.instance
    } else {
      const result = await loadEncounterFromJsonOrSharecode(loadJsonInput.value.trim(), {
        pilots: (pilotStore.Pilots || []).filter((p: any) => !p?.SaveController?.IsDeleted) as any[],
        placeholders: [],
        navigate: false,
      })
      instance = result.instance
    }

    loadFromJsonDialog.value = false
    loadJsonInput.value = ''
loadJsonFile.value = null
      loadJsonError.value = ''
      const fileInput = document.getElementById('jsonFileInput') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
      forceRefreshKey.value++

    void tableActionStore.postAction({
      senderName: 'Combat Tracker',
      category: 'full_action',
      title: `Combate Carregado — ${instance.Name}`,
      detail: `Encontro carregado de JSON/Sharecode e sincronizado para a mesa. Rodada ${instance.Round}.`,
    })
  } catch (err) {
    loadJsonError.value = err instanceof Error ? err.message : 'Erro ao carregar encontro.'
  } finally {
    loadJsonLoading.value = false
  }
}

function onTokenSelected(e: any) {
  const { sheetId, mechId, combatantId, tokenName } = e.detail || {}
  if (!encounterInstance.value?.Combatants) return
  const match = encounterInstance.value.Combatants.find(
    (c: any) =>
      (combatantId && c.id === combatantId) ||
      (sheetId && (c.actor?.ID === sheetId || c.actor?.ActiveMech?.ID === sheetId)) ||
      (mechId && (c.actor?.ActiveMech?.ID === mechId || c.actor?.ID === mechId)) ||
      (tokenName && c.actor?.Name?.trim().toLowerCase() === tokenName.trim().toLowerCase()) ||
      (tokenName && c.actor?.CombatController?.CombatName?.trim().toLowerCase() === tokenName.trim().toLowerCase())
  )
  if (match) {
    selectedFromCanvasCombatantId.value = match.id
    const el = document.getElementById(`combatant-card-${match.id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    clearTimeout(highlightTimeout)
    highlightTimeout = setTimeout(() => {
      if (selectedFromCanvasCombatantId.value === match.id) {
        selectedFromCanvasCombatantId.value = null
      }
    }, 4000)
  }
}

onMounted(async () => {
  await refreshEncountersList()
  if (typeof window !== 'undefined') {
    window.addEventListener('compcon-token-selected', onTokenSelected)
    window.addEventListener('compcon-encounters-reloaded', refreshEncountersList)
    window.addEventListener('focus', () => {
      void refreshEncountersList()
    })
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('compcon-token-selected', onTokenSelected)
    window.removeEventListener('compcon-encounters-reloaded', refreshEncountersList)
    window.removeEventListener('focus', refreshEncountersList)
  }
  clearTimeout(highlightTimeout)
})
</script>

<style scoped>
.combat-tracker-tab {
  background-color: #1a1a1a;
}

.combatant-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  transition: all 0.15s ease-in-out;
}

.combatant-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.18);
}

.combatant-card.in-turn {
  background: rgba(var(--v-theme-accent), 0.12) !important;
  border-color: rgb(var(--v-theme-accent)) !important;
  border-left-width: 4px !important;
  box-shadow: 0 0 10px rgba(var(--v-theme-accent), 0.25);
}

.combatant-card.canvas-selected {
  border-color: rgb(var(--v-theme-accent)) !important;
  border-left-width: 4px !important;
  background: rgba(var(--v-theme-accent), 0.18) !important;
  animation: pulseCardHighlight 1.5s ease-in-out infinite alternate;
}

.combatant-card.hidden-combatant {
  border: 1px dashed rgba(171, 71, 188, 0.6) !important;
  border-left: 4px solid #ab47bc !important;
  background: rgba(106, 27, 154, 0.08) !important;
}

@keyframes pulseCardHighlight {
  from {
    box-shadow: 0 0 6px rgba(var(--v-theme-accent), 0.4);
  }
  to {
    box-shadow: 0 0 16px rgba(var(--v-theme-accent), 0.9);
  }
}

.combatant-card.all-spent {
  opacity: 0.65;
}

.combatant-card.destroyed {
  opacity: 0.35;
  filter: grayscale(100%);
}

.side-enemy {
  border-left-color: rgb(var(--v-theme-error)) !important;
}

.side-ally {
  border-left-color: rgb(var(--v-theme-success)) !important;
}

.side-neutral {
  border-left-color: rgb(var(--v-theme-warning)) !important;
}

.reinforcement-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  background: rgb(var(--v-theme-warning));
  color: black;
  font-size: 8px;
  font-weight: bold;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.activation-pip {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background-color: transparent;
  transition: all 0.2s ease;
}

.activation-pip.filled {
  background-color: rgb(var(--v-theme-accent));
  border-color: rgb(var(--v-theme-accent));
}

.activation-pip.active-glow {
  box-shadow: 0 0 4px rgb(var(--v-theme-accent));
}

.pulse-badge {
  animation: pulse-glow 1.5s infinite alternate;
}

@keyframes pulse-glow {
  from {
    box-shadow: 0 0 4px rgba(var(--v-theme-accent), 0.5);
  }
  to {
    box-shadow: 0 0 10px rgba(var(--v-theme-accent), 1);
  }
}
</style>
