<template>
  <div class="lancer-foundry-hud">
    <!-- Red Header Ribbon: LL{level} — {name} -->
    <div class="lancer-hud-ribbon">
      <div class="ribbon-text">
        LL{{ licenseLevel }} &mdash; {{ actorName }}
      </div>
    </div>

    <!-- Main Tactical HUD Area -->
    <div class="lancer-hud-body">
      <!-- Tactical Blueprint Grid Texture -->
      <div class="tactical-grid-bg" />

      <!-- Top Section: Combat Stats on left, Avatar in center, HASE on right -->
      <div class="avatar-hase-section">
        <!-- Left Side: Combat Stats Column (ARM, EVA, DEFESA-E) -->
        <div class="combat-stats-col">
          <!-- ARM -->
          <v-tooltip
            location="right"
            content-class="lancer-tooltip"
            :open-on-hover="false"
            open-on-click
          >
            <template #activator="{ props: tooltipProps }">
              <div
                v-bind="tooltipProps"
                class="stat-col"
              >
                <v-icon
                  icon="cc:role_defender"
                  class="stat-icon"
                />
                <div class="stat-meta">
                  <span class="stat-number">{{ armorVal }}</span>
                  <div class="stat-red-line" />
                  <span class="stat-label">ARMADURA</span>
                </div>
              </div>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">ARMADURA {{ armorVal }}</div>
              <div class="tooltip-body">
                Armadura reduz todo o dano recebido aos PVs de uma única fonte por um valor igual à sua classificação, a menos que seja dito o contrário (como Queimadura e PA).<br><br>
                Armadura pode reduzir o dano a 0, tem um limite de 4, e é resolvida após o status Exposto e antes da Resistência.
              </div>
            </div>
          </v-tooltip>

          <!-- EVA -->
          <v-tooltip
            location="right"
            content-class="lancer-tooltip"
            :open-on-hover="false"
            open-on-click
          >
            <template #activator="{ props: tooltipProps }">
              <div
                v-bind="tooltipProps"
                class="stat-col"
              >
                <v-icon
                  icon="cc:evasion"
                  class="stat-icon"
                />
                <div class="stat-meta">
                  <span class="stat-number">{{ evasionVal }}</span>
                  <div class="stat-red-line" />
                  <span class="stat-label">EVASÃO</span>
                </div>
              </div>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">EVASÃO {{ evasionVal }}</div>
              <div class="tooltip-body">
                Evasão determina o limiar necessário para atingir um alvo com um ataque à distância ou corpo a corpo.
              </div>
            </div>
          </v-tooltip>

          <!-- DEFESA-E -->
          <v-tooltip
            location="right"
            content-class="lancer-tooltip"
            :open-on-hover="false"
            open-on-click
          >
            <template #activator="{ props: tooltipProps }">
              <div
                v-bind="tooltipProps"
                class="stat-col"
              >
                <v-icon
                  icon="cc:e_def"
                  class="stat-icon"
                />
                <div class="stat-meta">
                  <span class="stat-number">{{ edefVal }}</span>
                  <div class="stat-red-line" />
                  <span class="stat-label">DEFESA-E</span>
                </div>
              </div>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">DEFESA ELETRÔNICA {{ edefVal }}</div>
              <div class="tooltip-body">
                Defesa-E determina o limiar necessário para atingir um alvo com um Ataque Tecnológico e outros sistemas guiados eletronicamente (como Teleguiado).
              </div>
            </div>
          </v-tooltip>

          <!-- TESTE -->
          <v-tooltip
            location="right"
            content-class="lancer-tooltip"
            :open-on-hover="false"
            open-on-click
          >
            <template #activator="{ props: tooltipProps }">
              <span
                v-bind="tooltipProps"
                class="stat-col"
              >
                <v-icon
                  icon="cc:save"
                  class="stat-icon"
                />
                <div class="stat-meta">
                  <span class="stat-number">{{ saveTargetVal }}</span>
                  <div class="stat-red-line" />
                  <span class="stat-label">TESTE</span>
                </div>
              </span>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">SALVAGUARDA (TESTE) {{ saveTargetVal }}</div>
              <div class="tooltip-body">
                Meta de Salvaguarda necessária para resistir a efeitos e condições hostis.
              </div>
            </div>
          </v-tooltip>

          <!-- SENSORES -->
          <v-tooltip
            location="right"
            content-class="lancer-tooltip"
            :open-on-hover="false"
            open-on-click
          >
            <template #activator="{ props: tooltipProps }">
              <div
                v-bind="tooltipProps"
                class="stat-col"
              >
                <i class="v-icon notranslate v-theme--gms_dark stat-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="-11.5 780.5 24 24"
                    class="v-icon__svg"
                  >
                    <path d="M0.37,783.4c2.14-0.03,4.29,0.62,6.1,1.97c2.85,2.12,4.3,5.54,3.99,8.95H8.64c0.32-2.84-0.87-5.71-3.26-7.48
	c-2.97-2.2-7.03-2.15-9.93,0.13c-2.28,1.79-3.39,4.59-3.08,7.35h-1.83c-0.3-3.31,1.06-6.65,3.78-8.78
	C-3.91,784.14-1.77,783.43,0.37,783.4L0.37,783.4z M0.46,787.04c1.37-0.01,2.75,0.42,3.9,1.29c1.87,1.42,2.75,3.73,2.42,5.98H4.95
	c0.35-1.69-0.28-3.46-1.7-4.53c-1.65-1.25-3.92-1.23-5.56,0.04c-1.38,1.08-1.99,2.83-1.65,4.49h-1.83c-0.32-2.22,0.53-4.5,2.36-5.93
	C-2.28,787.5-0.91,787.05,0.46,787.04L0.46,787.04z M3.23,793.41c0,1.19-0.78,2.25-1.92,2.6v2.86l1.92,1.82v0.91h-5.46v-0.91
	l1.92-1.82v-2.85c-1.14-0.36-1.92-1.41-1.92-2.61c0-1.51,1.22-2.73,2.73-2.73C2.01,790.68,3.23,791.9,3.23,793.41z" />
                  </svg>
                </i>
                <div class="stat-meta">
                  <span class="stat-number">{{ sensorVal }}</span>
                  <div class="stat-red-line" />
                  <span class="stat-label">SENSORES</span>
                </div>
              </div>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">SENSORES {{ sensorVal }}</div>
              <div class="tooltip-body">
                O alcance dos sensores deste personagem. Alvos dentro deste alcance podem ser travados, e sistemas e armas com Teleguiado podem ser usados contra eles.
              </div>
            </div>
          </v-tooltip>
        </div>

        <!-- Avatar Wrapper with Badges -->
        <div class="avatar-wrapper">
          <!-- Top-Left Badges: Size and Speed -->
          <div class="badges-top-left">
            <!-- Size Badge -->
            <v-tooltip
              location="right"
              content-class="lancer-tooltip"
              :open-on-hover="false"
              open-on-click
            >
              <template #activator="{ props: tooltipProps }">
                <div
                  v-bind="tooltipProps"
                  class="badge-size-hex"
                >
                  <svg
                    viewBox="0 0 54 60"
                    class="badge-svg"
                  >
                    <polygon
                      points="27,2 52,16 52,44 27,58 2,44 2,16"
                      class="badge-poly"
                    />
                  </svg>
                  <div class="badge-size-content">
                    <span class="badge-size-label">SIZE</span>
                    <span class="badge-size-val">{{ sizeDisplay }}</span>
                  </div>
                </div>
              </template>
              <div class="tooltip-box">
                <div class="tooltip-header">TAMANHO {{ sizeDisplay }}</div>
                <div class="tooltip-body">
                  O tamanho efetivo deste personagem, incluindo sua área de controle.<br><br>
                  Personagens podem se mover através de espaços ocupados por obstruções de tamanho menor que eles, personagens aliados nunca são obstruções, e mechas não são obstruídos por orgânicos do mesmo tamanho.
                </div>
              </div>
            </v-tooltip>

            <!-- Speed Badge -->
            <v-tooltip
              location="right"
              content-class="lancer-tooltip"
              :open-on-hover="false"
              open-on-click
            >
              <template #activator="{ props: tooltipProps }">
                <div
                  v-bind="tooltipProps"
                  class="badge-speed-row"
                >
                  <v-icon
                    icon="mdi-arrow-right-bold-hexagon-outline"
                    class="badge-speed-icon"
                  />
                  <span class="badge-speed-val">{{ speedVal }}</span>
                </div>
              </template>
              <div class="tooltip-box">
                <div class="tooltip-header">VELOCIDADE {{ speedVal }}</div>
                <div class="tooltip-body">
                  A quantidade de espaço que este personagem pode cobrir em um movimento padrão ou quando eles Impulsionam.<br><br>
                  O movimento pode ser dividido entre ações.
                </div>
              </div>
            </v-tooltip>
          </div>

          <!-- Token Hexagon Frame (Flat Top & Bottom, Pointy Left & Right) -->
          <div class="token-hex-container">
            <div class="token-hex-outer">
              <div class="token-hex-inner">
                <img
                  :src="portraitUrl"
                  class="token-img"
                  :alt="actorName"
                  @error="handleImgError"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Right Side HASE Hexagon Group with Absolute Position -->
        <div class="hase-cluster">
          <!-- BRIO (Grit) -->
          <v-tooltip
            location="left"
            content-class="lancer-tooltip"
          >
            <template #activator="{ props: tooltipProps }">
              <button
                type="button"
                v-bind="tooltipProps"
                class="hase-hex-btn hase-grit"
                @click="handleHaseClick($event, 'grit', Number(gritVal) || 0)"
              >
                <svg
                  viewBox="0 0 54 62"
                  class="hase-svg"
                >
                  <polygon
                    points="27,2 52,16 52,46 27,60 2,46 2,16"
                    class="hase-poly"
                  />
                </svg>
                <div class="hase-content">
                  <span class="hase-label">BRIO</span>
                  
                  <span class="hase-val">{{ gritVal }}</span>
                </div>
              </button>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">BRIO (+{{ gritVal }})</div>
              <div class="tooltip-body">
                Clique para rolar teste de Brio<br>
                <span class="text-caption text-grey-lighten-2" style="font-size: 10px;">(Shift+Clique: rola direto)</span>
              </div>
            </div>
          </v-tooltip>

          <!-- CAS (Hull) -->
          <v-tooltip
            location="left"
            content-class="lancer-tooltip"
          >
            <template #activator="{ props: tooltipProps }">
              <button
                type="button"
                v-bind="tooltipProps"
                class="hase-hex-btn hase-hull"
                @click="handleHaseClick($event, 'hull', Number(hullVal) || 0)"
              >
                <svg
                  viewBox="0 0 46 54"
                  class="hase-svg"
                >
                  <polygon
                    points="23,2 44,14 44,40 23,52 2,40 2,14"
                    class="hase-poly"
                  />
                </svg>
                <div class="hase-content">
                  <span class="hase-label">CAS</span>
                  
                  <span class="hase-val">{{ hullVal }}</span>
                </div>
              </button>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">CASCO (+{{ hullVal }})</div>
              <div class="tooltip-body">
                Clique para rolar teste de Casco<br>
                <span class="text-caption text-grey-lighten-2" style="font-size: 10px;">(Shift+Clique: rola direto)</span>
              </div>
            </div>
          </v-tooltip>

          <!-- AGI (Agility) -->
          <v-tooltip
            location="left"
            content-class="lancer-tooltip"
          >
            <template #activator="{ props: tooltipProps }">
              <button
                type="button"
                v-bind="tooltipProps"
                class="hase-hex-btn hase-agi"
                @click="handleHaseClick($event, 'agility', Number(agiVal) || 0)"
              >
                <svg
                  viewBox="0 0 46 54"
                  class="hase-svg"
                >
                  <polygon
                    points="23,2 44,14 44,40 23,52 2,40 2,14"
                    class="hase-poly"
                  />
                </svg>
                <div class="hase-content">
                  <span class="hase-label">AGI</span>
                  
                  <span class="hase-val">{{ agiVal }}</span>
                </div>
              </button>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">AGILIDADE (+{{ agiVal }})</div>
              <div class="tooltip-body">
                Clique para rolar teste de Agilidade<br>
                <span class="text-caption text-grey-lighten-2" style="font-size: 10px;">(Shift+Clique: rola direto)</span>
              </div>
            </div>
          </v-tooltip>

          <!-- SIS (Systems) -->
          <v-tooltip
            location="left"
            content-class="lancer-tooltip"
          >
            <template #activator="{ props: tooltipProps }">
              <button
                type="button"
                v-bind="tooltipProps"
                class="hase-hex-btn hase-sys"
                @click="handleHaseClick($event, 'systems', Number(sysVal) || 0)"
              >
                <svg
                  viewBox="0 0 46 54"
                  class="hase-svg"
                >
                  <polygon
                    points="23,2 44,14 44,40 23,52 2,40 2,14"
                    class="hase-poly"
                  />
                </svg>
                <div class="hase-content">
                  <span class="hase-label">SIS</span>
                  
                  <span class="hase-val">{{ sysVal }}</span>
                </div>
              </button>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">SISTEMAS (+{{ sysVal }})</div>
              <div class="tooltip-body">
                Clique para rolar teste de Sistemas<br>
                <span class="text-caption text-grey-lighten-2" style="font-size: 10px;">(Shift+Clique: rola direto)</span>
              </div>
            </div>
          </v-tooltip>

          <!-- ENG (Engineering) -->
          <v-tooltip
            location="left"
            content-class="lancer-tooltip"
          >
            <template #activator="{ props: tooltipProps }">
              <button
                type="button"
                v-bind="tooltipProps"
                class="hase-hex-btn hase-eng"
                @click="handleHaseClick($event, 'engineering', Number(engVal) || 0)"
              >
                <svg
                  viewBox="0 0 46 54"
                  class="hase-svg"
                >
                  <polygon
                    points="23,2 44,14 44,40 23,52 2,40 2,14"
                    class="hase-poly"
                  />
                </svg>
                <div class="hase-content">
                  <span class="hase-label">ENG</span>
                  
                  <span class="hase-val">{{ engVal }}</span>
                </div>
              </button>
            </template>
            <div class="tooltip-box">
              <div class="tooltip-header">ENGENHARIA (+{{ engVal }})</div>
              <div class="tooltip-body">
                Clique para rolar teste de Engenharia<br>
                <span class="text-caption text-grey-lighten-2" style="font-size: 10px;">(Shift+Clique: rola direto)</span>
              </div>
            </div>
          </v-tooltip>
        </div>
      </div>

      <!-- Damage & Health Bars Row: PV, BLI, QMD -->
      <div class="damage-bars-row">
        <!-- PV Bar with Slanted Ends -->
        <v-tooltip
          location="top"
          content-class="lancer-tooltip"
          :open-on-hover="false"
          open-on-click
        >
          <template #activator="{ props: tooltipProps }">
            <div
              v-bind="tooltipProps"
              class="pv-bar-group"
            >
              <span class="pv-header-label">PV</span>
              <div class="slanted-bar-track">
                <!-- Green progress fill -->
                <div
                  class="slanted-bar-fill"
                  :style="{ width: `${hpPercent}%` }"
                />
                <!-- Centered HP text with direct input -->
                <div
                  class="bar-text-overlay"
                  @click.stop
                >
                  <input
                    v-model.number="currentHp"
                    type="number"
                    min="0"
                    :max="maxHp"
                    class="bar-value-input"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                  <span class="bar-divider">/</span>
                  <span class="bar-max-val">{{ maxHp }}</span>
                </div>
              </div>
            </div>
          </template>
          <div class="tooltip-box">
            <div class="tooltip-header">PONTOS DE VIDA ({{ currentHp }}/{{ maxHp }})</div>
            <div class="tooltip-body">
              Pontos de Vida são a quantidade de dano que um piloto pode sofrer antes de ter que rolar 1d6 para determinar as consequências de seus ferimentos.<br><br>
              Clique para alterar diretamente o valor de PV.
            </div>
          </div>
        </v-tooltip>

        <!-- BLI (Blindagem / Overshield) Box -->
        <v-tooltip
          location="top"
          content-class="lancer-tooltip"
          :open-on-hover="false"
          open-on-click
        >
          <template #activator="{ props: tooltipProps }">
            <div
              v-bind="tooltipProps"
              class="stat-mini-box bli-box"
            >
              <input
                v-model.number="overshieldVal"
                type="number"
                min="0"
                class="mini-box-input"
                @click.stop
              />
              <span class="mini-box-label">BLI</span>
            </div>
          </template>
          <div class="tooltip-box">
            <div class="tooltip-header">BLINDAGEM</div>
            <div class="tooltip-body">
              Blindagem fornece Pontos de Vida que desaparecem no final da cena ou conforme determinado pela fonte.<br><br>
              Quando o dano é recebido, a Blindagem é reduzida antes dos PVs.
            </div>
          </div>
        </v-tooltip>

        <!-- QMD (Burn / Queimadura) Box -->
        <v-tooltip
          location="top"
          content-class="lancer-tooltip"
          :open-on-hover="false"
          open-on-click
        >
          <template #activator="{ props: tooltipProps }">
            <div
              v-bind="tooltipProps"
              class="stat-mini-box qmd-box"
            >
              <input
                v-model.number="burnVal"
                type="number"
                min="0"
                class="mini-box-input"
                @click.stop
              />
              <span class="mini-box-label">QMD</span>
            </div>
          </template>
          <div class="tooltip-box">
            <div class="tooltip-header">QUEIMADURA</div>
            <div class="tooltip-body">
              Queimadura é um dano especial que ignora blindagem, mas pode ser resistido.<br><br>
              No final de seu turno, os personagens rolam um teste de Engenharia para limpar a Queimadura acumulada.
            </div>
          </div>
        </v-tooltip>
      </div>

      <!-- Structure Roll Alert Button (When PV reaches 0 or Pending Structure Check) -->
      <div
        v-if="!structureRollCompleted && (currentHp <= 0 || activePendingStructureCheck) && maxStructure"
        class="structure-alert-banner"
      >
        <button
          type="button"
          class="alert-close-btn"
          title="Fechar aviso"
          @click.stop="dismissStructureAlert"
        >
          <v-icon
            icon="mdi-close"
            size="14"
          />
        </button>
        <button
          type="button"
          class="structure-roll-action-btn"
          @click="handleStructureRoll"
        >
          <div class="alert-pulse-icon">
            <v-icon
              icon="mdi-alert-octagon"
              color="#fbbf24"
              size="24"
            />
          </div>
          <div class="alert-text-group">
            <span class="alert-title">DANO ESTRUTURAL</span>
            <span class="alert-sub">CLIQUE PARA ABRIR E ROLAR</span>
          </div>
          <div class="alert-dice-action">
            <v-icon
              icon="mdi-dice-d6"
              size="18"
              class="mr-1"
            />
            <span>ROLAR ESTRUTURA</span>
          </div>
        </button>
      </div>

      <!-- Stress Roll Alert Button (When heat overflows or Pending Stress Check) -->
      <div
        v-if="!stressRollCompleted && (currentHeat >= maxHeat || activePendingStressCheck) && maxStress"
        class="structure-alert-banner stress-alert-banner"
      >
        <button
          type="button"
          class="alert-close-btn"
          title="Fechar aviso"
          @click.stop="dismissStressAlert"
        >
          <v-icon
            icon="mdi-close"
            size="14"
          />
        </button>
        <button
          type="button"
          class="structure-roll-action-btn stress-roll-action-btn"
          @click="handleStressRoll"
        >
          <div class="alert-pulse-icon">
            <v-icon
              icon="mdi-alert-octagon"
              color="#f87171"
              size="24"
            />
          </div>
          <div class="alert-text-group">
            <span class="alert-title stress-title">DANO DE ESTRESSE</span>
            <span class="alert-sub">CLIQUE PARA ABRIR E ROLAR</span>
          </div>
          <div class="alert-dice-action stress-action">
            <v-icon
              icon="mdi-dice-d6"
              size="18"
              class="mr-1"
            />
            <span>ROLAR ESTRESSE</span>
          </div>
        </button>
      </div>

      <!-- Mech Extra Bars: Calor, Reparos, Estrutura e Estresse (if Mech) -->
      <div
        v-if="hasStructureOrHeat"
        class="mech-bars-container mt-2"
      >
        <!-- Heat Bar & Repairs Box -->
        <div
          v-if="maxHeat || maxRepairs"
          class="damage-bars-row mb-2"
        >
          <div
            v-if="maxHeat"
            class="pv-bar-group"
          >
            <span class="pv-header-label">CAL</span>
            <div class="slanted-bar-track heat-track">
              <div
                class="slanted-bar-fill heat-fill"
                :style="{ width: `${heatPercent}%` }"
              />
              <div
                class="bar-text-overlay"
                @click.stop
              >
                <input
                  v-model.number="currentHeat"
                  type="number"
                  min="0"
                  :max="maxHeat"
                  class="bar-value-input"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <span class="bar-divider">/</span>
                <span class="bar-max-val">{{ maxHeat }}</span>
              </div>
            </div>
          </div>

          <!-- Repairs Box -->
          <div
            v-if="maxRepairs"
            class="stat-mini-box rep-box"
          >
            <input
              v-model.number="repairsVal"
              type="number"
              min="0"
              class="mini-box-input"
            />
            <span class="mini-box-label">REP</span>
          </div>
        </div>

        <!-- Vital Pips: Estrutura -->
        <div
          v-if="maxStructure"
          class="vital-pips-container"
        >
          <span class="vital-pips-label">ESTRUTURA:</span>
          <div class="pips-row">
            <button
              v-for="n in (maxStructure || 4)"
              :key="`structure-pip-${n}`"
              type="button"
              class="pip pip-structure pip-interactive"
              :class="{ active: n <= currentStructure }"
              data-vital-pip="structure"
              :data-val="n"
              :title="`Definir Estrutura para ${n}`"
              @click="setStructure(n)"
            />
          </div>
        </div>

        <!-- Vital Pips: Estresse de Reator -->
        <div
          v-if="maxStress"
          class="vital-pips-container"
        >
          <span class="vital-pips-label">ESTRESSE DE REATOR:</span>
          <div class="pips-row">
            <button
              v-for="n in (maxStress || 4)"
              :key="`stress-pip-${n}`"
              type="button"
              class="pip pip-stress pip-interactive"
              :class="{ active: n <= currentStress }"
              data-vital-pip="stress"
              :data-val="n"
              :title="`Definir Estresse para ${n}`"
              @click="setStress(n)"
            />
          </div>
        </div>
      </div>

      <!-- Bottom Controls: Damage Menu Button -->
      <div class="hud-controls-row mt-3">
        <div class="w-100">
          <slot name="dmg" />
        </div>
      </div>

      <!-- Core Power Toggle (if Mech) -->
      <div
        v-if="item.CombatController.StatController.MaxStats['core_energy'] !== undefined"
        class="core-power-row mt-2"
      >
        <button
          type="button"
          class="core-power-btn"
          :class="{ active: item.CombatController.StatController.CurrentStats['core_energy'] > 0 }"
          @click="toggleCorePower"
        >
          <v-icon
            icon="mdi-battery-high"
            class="mr-1"
          />
          {{ item.CombatController.StatController.CurrentStats['core_energy'] > 0 ? 'PODER DE NÚCLEO PRONTO' : 'PODER DE NÚCLEO GASTO' }}
        </button>
      </div>

      <!-- Structure Check Modal Dialog (uses dddice dice) -->
      <CCStructureCheckModal
        v-if="currentPendingCheck"
        v-model="structureModalOpen"
        :cc="item.CombatController"
        :pending="currentPendingCheck"
        @rolled="onStructureRolled"
        @resolved="onStructureResolved"
      />

      <!-- Stress Check Modal Dialog -->
      <CCStructureCheckModal
        v-if="currentStressPendingCheck"
        v-model="stressModalOpen"
        :cc="item.CombatController"
        :pending="currentStressPendingCheck"
        @rolled="onStressRolled"
        @resolved="onStressResolved"
      />

      <!-- HASE & Grit Check Modal Dialog -->
      <HaseCheckModal
        v-model="haseModalOpen"
        :cc="item.CombatController"
        :initial-stat="selectedHaseStat"
        :actor-name="actorName"
        :stats="haseStatsObject"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ICombatant } from '@/classes/components/combat/ICombatant'
  import { useEncounterContext } from '../encounterContext'
  import CCStructureCheckModal from '@/ui/components/CCStructureCheckModal.vue'
  import HaseCheckModal from './HaseCheckModal.vue'
  import { DiceRoller, D20RollResult } from '@/classes/dice/DiceRoller'
  import { dddiceService } from '@/services/dddiceService'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import type { IPendingCheck } from '@/classes/components/combat/StructureCheck'

  const props = defineProps<{
    item: ICombatant
  }>()

  let encounterInstanceRef: any = null
  try {
    const ctx = useEncounterContext()
    encounterInstanceRef = ctx.encounterInstance
  } catch (e) {
    // Outside encounter runner fallback
  }

  // State
  const imgFallback = ref(false)

  // License Level
  const licenseLevel = computed(() => {
    return (props.item as any).Level ?? (props.item as any).Pilot?.Level ?? 0
  })

  // Callsign / Name
  const actorName = computed(() => {
    return (
      props.item.Callsign ||
      props.item.Name ||
      (props.item as any).Pilot?.Callsign ||
      (props.item as any).Pilot?.Name ||
      'DESCONHECIDO'
    )
  })

  // Portrait Token URL
  const portraitUrl = computed(() => {
    if (imgFallback.value) return '/img/pilot/nodata.webp'
    const p =
      props.item.Portrait ||
      (props.item as any).Image ||
      (props.item as any).Pilot?.Portrait ||
      (props.item as any).Pilot?.Image ||
      ''
    return p || '/img/pilot/nodata.webp'
  })

  function handleImgError() {
    imgFallback.value = true
  }

  // Size
  const sizeVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('size') ?? sc.getMax('size') ?? 0.5
  })

  const sizeDisplay = computed(() => {
    const s = sizeVal.value
    if (s === 0.5) return '1/2'
    return String(s)
  })

  // Speed
  const speedVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('speed') ?? sc.getMax('speed') ?? 4
  })

  // HASE
  const gritVal = computed(() => {
    return (
      (props.item as any).Grit ??
      (props.item as any).Pilot?.Grit ??
      (props.item as any).Parent?.Grit ??
      0
    )
  })

  const hullVal = computed(() => {
    const pilot = (props.item as any).Pilot || props.item
    return (
      pilot.MechSkillsController?.MechSkills?.Hull ??
      pilot.Hull ??
      (props.item as any).Hull ??
      0
    )
  })

  const agiVal = computed(() => {
    const pilot = (props.item as any).Pilot || props.item
    return (
      pilot.MechSkillsController?.MechSkills?.Agi ??
      pilot.Agi ??
      (props.item as any).Agi ??
      0
    )
  })

  const sysVal = computed(() => {
    const pilot = (props.item as any).Pilot || props.item
    return (
      pilot.MechSkillsController?.MechSkills?.Sys ??
      pilot.Sys ??
      (props.item as any).Sys ??
      0
    )
  })

  const engVal = computed(() => {
    const pilot = (props.item as any).Pilot || props.item
    return (
      pilot.MechSkillsController?.MechSkills?.Eng ??
      pilot.Eng ??
      (props.item as any).Eng ??
      0
    )
  })

  // Combat Stats
  const armorVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('armor') ?? sc.getMax('armor') ?? 0
  })

  const evasionVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('evasion') ?? sc.getMax('evasion') ?? 8
  })

  const edefVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('edef') ?? sc.getMax('edef') ?? 8
  })

  // HP
  const currentHp = computed({
    get: () => props.item.CombatController.StatController.CurrentStats['hp'] ?? 0,
    set: (v: number) => {
      props.item.CombatController.StatController.CurrentStats['hp'] = Math.max(0, Number(v) || 0)
    },
  })

  const maxHp = computed({
    get: () => props.item.CombatController.StatController.MaxStats['hp'] ?? 9,
    set: (v: number) => {
      props.item.CombatController.StatController.MaxStats['hp'] = Math.max(1, Number(v) || 1)
    },
  })

  const hpPercent = computed(() => {
    if (!maxHp.value) return 0
    return Math.min(100, Math.max(0, (currentHp.value / maxHp.value) * 100))
  })

  // Overshield (BLI)
  const overshieldVal = computed({
    get: () => props.item.CombatController.StatController.CurrentStats['overshield'] ?? 0,
    set: (v: number) => {
      props.item.CombatController.StatController.CurrentStats['overshield'] = Math.max(0, Number(v) || 0)
    },
  })

  // Burn (QMD)
  const burnVal = computed({
    get: () => props.item.CombatController.StatController.CurrentStats['burn'] ?? 0,
    set: (v: number) => {
      props.item.CombatController.StatController.CurrentStats['burn'] = Math.max(0, Number(v) || 0)
    },
  })

  // Save Target (TESTE)
  const saveTargetVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('save') ?? sc.getMax('save') ?? (10 + Number(gritVal.value || 0))
  })

  // Sensor Range (SENSORES)
  const sensorVal = computed(() => {
    const sc = props.item.CombatController.StatController
    return sc.getCurrent('sensor_range') ?? sc.getMax('sensor_range') ?? 10
  })

  // Mech Stats
  const maxStructure = computed(() => props.item.CombatController.StatController.MaxStats['structure'])
  const currentStructure = computed(() => props.item.CombatController.StatController.CurrentStats['structure'] ?? 0)
  const structurePercent = computed(() => {
    if (!maxStructure.value) return 0
    return Math.min(100, Math.max(0, (currentStructure.value / maxStructure.value) * 100))
  })

  const maxHeat = computed({
    get: () => props.item.CombatController.StatController.MaxStats['heatcap'],
    set: (v: number) => {
      props.item.CombatController.StatController.MaxStats['heatcap'] = Math.max(1, Number(v) || 1)
    },
  })
  const currentHeat = computed({
    get: () => props.item.CombatController.StatController.CurrentStats['heatcap'] ?? 0,
    set: (v: number) => {
      props.item.CombatController.StatController.CurrentStats['heatcap'] = Math.max(0, Number(v) || 0)
    },
  })
  const heatPercent = computed(() => {
    if (!maxHeat.value) return 0
    return Math.min(100, Math.max(0, (currentHeat.value / maxHeat.value) * 100))
  })

  const maxStress = computed(() => props.item.CombatController.StatController.MaxStats['stress'])
  const currentStress = computed(() => props.item.CombatController.StatController.CurrentStats['stress'] ?? 0)
  const stressVal = computed({
    get: () => props.item.CombatController.StatController.CurrentStats['stress'] ?? 0,
    set: (v: number) => {
      props.item.CombatController.StatController.CurrentStats['stress'] = Math.max(0, Number(v) || 0)
    },
  })

  const maxRepairs = computed(() => props.item.CombatController.StatController.MaxStats['repairs'])
  const repairsVal = computed({
    get: () => props.item.CombatController.StatController.CurrentStats['repairs'] ?? 0,
    set: (v: number) => {
      props.item.CombatController.StatController.CurrentStats['repairs'] = Math.max(0, Number(v) || 0)
    },
  })

  const hasStructureOrHeat = computed(() => {
    return Boolean(maxStructure.value || maxHeat.value || maxStress.value || maxRepairs.value)
  })

  function setStructure(val: number) {
    const cur = props.item.CombatController.StatController.CurrentStats['structure'] ?? 0
    props.item.CombatController.StatController.CurrentStats['structure'] = cur === val ? val - 1 : val
  }

  function setStress(val: number) {
    const cur = props.item.CombatController.StatController.CurrentStats['stress'] ?? 0
    props.item.CombatController.StatController.CurrentStats['stress'] = cur === val ? val - 1 : val
  }

  function toggleCorePower() {
    const sc = props.item.CombatController.StatController
    const curr = sc.CurrentStats['core_energy'] || 0
    sc.CurrentStats['core_energy'] = curr > 0 ? 0 : 1
  }

  // Structure Roll Trigger with dddice-powered modal dialog
  const structureModalOpen = ref(false)
  const structureRollCompleted = ref(false)
  const fallbackPending = ref<IPendingCheck | null>(null)

  const activePendingStructureCheck = computed(() => {
    return props.item.CombatController.PendingChecks.find(p => p.kind === 'structure')
  })

  const currentPendingCheck = computed(() => {
    return activePendingStructureCheck.value || fallbackPending.value
  })

  watch(structureModalOpen, newVal => {
    if (!newVal) {
      fallbackPending.value = null
    }
  })

  // Permite uma nova rolagem se o PV foi recuperado (> 0) e depois caiu a 0 novamente
  watch(currentHp, (newVal, oldVal) => {
    if (oldVal !== undefined && oldVal > 0 && newVal <= 0) {
      structureRollCompleted.value = false
    }
  })

  function onStructureRolled() {
    structureRollCompleted.value = true
  }

  function onStructureResolved() {
    structureRollCompleted.value = true
    structureModalOpen.value = false
    if (fallbackPending.value) {
      props.item.CombatController.RemovePendingCheck(fallbackPending.value.id)
      fallbackPending.value = null
    }
    const check = props.item.CombatController.PendingChecks.find(p => p.kind === 'structure')
    if (check) {
      props.item.CombatController.RemovePendingCheck(check.id)
    }
  }

  function handleStructureRoll() {
    structureRollCompleted.value = false
    const sc = props.item.CombatController.StatController
    const maxStruct = maxStructure.value || 4
    const curStruct = sc.getCurrent('structure') ?? maxStruct

    // 1. Reduz 1 ponto de estrutura se ainda houver estrutura
    if (currentHp.value <= 0) {
      if (curStruct > 0) {
        sc.bumpCurrentStat('structure', -1)
        currentHp.value = maxHp.value
      }
    }

    // 2. Garante que a checagem pendente existe
    let check = props.item.CombatController.PendingChecks.find(p => p.kind === 'structure')
    if (!check) {
      props.item.CombatController.PendingCheckController.Add('structure')
      check = props.item.CombatController.PendingChecks.find(p => p.kind === 'structure')
    }
    if (!check) {
      check = { id: crypto.randomUUID(), kind: 'structure' }
    }
    fallbackPending.value = check

    // 3. Abre o diálogo de rolagem
    structureModalOpen.value = true
  }

  // Stress Roll Trigger
  const stressModalOpen = ref(false)
  const stressRollCompleted = ref(false)
  const fallbackStressPending = ref<IPendingCheck | null>(null)

  const activePendingStressCheck = computed(() => {
    return props.item.CombatController.PendingChecks.find(p => p.kind === 'stress')
  })

  const currentStressPendingCheck = computed(() => {
    return activePendingStressCheck.value || fallbackStressPending.value
  })

  watch(stressModalOpen, newVal => {
    if (!newVal) {
      fallbackStressPending.value = null
    }
  })

  // Permite nova rolagem se o calor baixou e voltou a encher
  watch(currentHeat, (newVal, oldVal) => {
    if (maxHeat.value && oldVal !== undefined && oldVal < maxHeat.value && newVal >= maxHeat.value) {
      stressRollCompleted.value = false
    }
  })

  function onStressRolled() {
    stressRollCompleted.value = true
  }

  function onStressResolved() {
    stressRollCompleted.value = true
    stressModalOpen.value = false
    if (fallbackStressPending.value) {
      props.item.CombatController.RemovePendingCheck(fallbackStressPending.value.id)
      fallbackStressPending.value = null
    }
    const check = props.item.CombatController.PendingChecks.find(p => p.kind === 'stress')
    if (check) {
      props.item.CombatController.RemovePendingCheck(check.id)
    }
  }

  function handleStressRoll() {
    stressRollCompleted.value = false
    const sc = props.item.CombatController.StatController
    const maxStr = maxStress.value || 4
    const curStr = sc.getCurrent('stress') ?? maxStr

    // 1. Reduz 1 ponto de estresse e reseta o calor
    if (maxHeat.value && currentHeat.value >= maxHeat.value) {
      if (curStr > 0) {
        sc.bumpCurrentStat('stress', -1)
        currentHeat.value = 0
      }
    }

    // 2. Garante que a checagem pendente existe
    let check = props.item.CombatController.PendingChecks.find(p => p.kind === 'stress')
    if (!check) {
      props.item.CombatController.PendingCheckController.Add('stress')
      check = props.item.CombatController.PendingChecks.find(p => p.kind === 'stress')
    }
    if (!check) {
      check = { id: crypto.randomUUID(), kind: 'stress' }
    }
    fallbackStressPending.value = check

    // 3. Abre o diálogo de rolagem
    stressModalOpen.value = true
  }

  function dismissStructureAlert() {
    structureRollCompleted.value = true
    if (fallbackPending.value) {
      props.item.CombatController.RemovePendingCheck(fallbackPending.value.id)
      fallbackPending.value = null
    }
    const check = props.item.CombatController.PendingChecks.find(p => p.kind === 'structure')
    if (check) {
      props.item.CombatController.RemovePendingCheck(check.id)
    }
  }

  function dismissStressAlert() {
    stressRollCompleted.value = true
    if (fallbackStressPending.value) {
      props.item.CombatController.RemovePendingCheck(fallbackStressPending.value.id)
      fallbackStressPending.value = null
    }
    const check = props.item.CombatController.PendingChecks.find(p => p.kind === 'stress')
    if (check) {
      props.item.CombatController.RemovePendingCheck(check.id)
    }
  }

  // HASE & Grit Roll Modal State & Handlers
  const haseModalOpen = ref(false)
  const selectedHaseStat = ref('grit')

  const haseStatsObject = computed(() => ({
    grit: Number(gritVal.value) || 0,
    hull: Number(hullVal.value) || 0,
    agility: Number(agiVal.value) || 0,
    systems: Number(sysVal.value) || 0,
    engineering: Number(engVal.value) || 0,
  }))

  function handleHaseClick(e: MouseEvent, statKey: string, bonusVal: number) {
    if (e.shiftKey) {
      void executeQuickHaseRoll(statKey, bonusVal)
    } else {
      selectedHaseStat.value = statKey
      haseModalOpen.value = true
    }
  }

  async function executeQuickHaseRoll(statKey: string, bonusVal: number) {
    const statLabels: Record<string, string> = {
      grit: 'BRIO',
      hull: 'CASCO',
      agility: 'AGILIDADE',
      systems: 'SISTEMAS',
      engineering: 'ENGENHARIA',
    }
    const statLabel = statLabels[statKey] || statKey.toUpperCase()
    const rollerName = actorName.value || 'Piloto'
    let rollResult: D20RollResult | null = null

    if (dddiceService.config.enabled) {
      try {
        const rollRes = await dddiceService.rollDice({
          diceString: '1d20',
          flatBonus: bonusVal,
          label: `Teste de ${statLabel} [${rollerName}]`,
          external_id: rollerName,
        })
        if (rollRes && rollRes.values && rollRes.values.length > 0) {
          const foundD20 = rollRes.values.find((v: any) => v.type === 'd20' || v.type === '20')
          const rawD20 = foundD20 && typeof foundD20.value !== 'undefined' ? Number(foundD20.value) : DiceRoller.rollDie(20)
          rollResult = new D20RollResult(rawD20 + bonusVal, rawD20, bonusVal, 0, [], 0)
        }
      } catch (err) {
        console.warn('[HASE QuickRoll] Erro ao rolar com dddice:', err)
      }
    }

    if (!rollResult) {
      rollResult = DiceRoller.rollSkillCheck(bonusVal, 0)
    }

    const isCrit = Number(rollResult.total) >= 20 || Number(rollResult.rawDieRoll) === 20
    const isSuccess = Number(rollResult.total) >= 10
    const formulaStr = `1d20${bonusVal >= 0 ? '+' : ''}${bonusVal}`

    void useTableActionStore().postAction({
      senderName: rollerName,
      category: 'roll',
      title: `Teste de ${statLabel}`,
      detail: rollResult.toString(),
      roll: {
        total: Number(rollResult.total) || 0,
        formula: formulaStr,
        isCrit,
      },
      tags: [statLabel, isSuccess ? 'Sucesso' : 'Falha', ...(isCrit ? ['CRÍTICO'] : [])],
    })
  }
</script>

<style scoped>
.lancer-foundry-hud {
  position: relative;
  width: 100%;
  color: #ffffff;
  user-select: none;
}

/* Red Ribbon Header */
.lancer-hud-ribbon {
  background: #9b1828;
  padding: 8px 16px;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
  margin-bottom: 6px;
}

.ribbon-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #ffffff;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tactical Body */
.lancer-hud-body {
  position: relative;
  background: #0b1322;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px 14px 12px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.tactical-grid-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.18) 1px, transparent 1px);
  background-size: 16px 16px;
  pointer-events: none;
  opacity: 0.25;
}

/* Avatar + HASE Section */
.avatar-hase-section {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 235px;
}

/* Avatar Wrapper */
.avatar-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  left: 58px;
}

/* Top-Left Badges */
.badges-top-left {
  position: absolute;
  top: -10px;
  left: -35px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  
}

.badge-size-hex {
  position: relative;
  width: 50px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.8));
}

.badge-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.badge-poly {
  fill: #0a0f19;
  stroke: #ffffff;
  stroke-width: 2.5;
  transition: all 0.2s ease;
}

.badge-size-hex:hover .badge-poly {
  stroke: #38bdf8;
}

.badge-size-content {
  position: relative;
  z-index: 2;
  padding-top: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.badge-size-label {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #ffffff;
}

.badge-size-val {
  font-size: 14px;
  font-weight: 900;
  color: #ffffff;
}

.badge-speed-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.9));
}

.badge-speed-icon {
  font-size: 22px !important;
  color: #ffffff !important;
}

.badge-speed-val {
  font-size: 30px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1;
}

/* Center Token Hexagon: Flat Top & Bottom, Pointy Left & Right */
.token-hex-container {
  position: relative;
  height: 200px;
  filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.8));
}

.token-hex-outer {
  width: 100%;
  height: 100%;
  background: #000000;
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.token-hex-inner {
  width: 100%;
  height: 100%;
  background: #0f172a;
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.token-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}

/* HASE Hexagon Group - ABSOLUTE POSITIONED BUTTONS */
.hase-cluster {
  position: absolute;
  right: 6px;
  top: 4px;
  width: 106px;
  height: 185px;
  z-index: 5;
}

.hase-hex-btn {
  position: absolute !important;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.7));
  transition: transform 0.15s ease, filter 0.15s ease;
}



/* Honeycomb Exact Positions */
.hase-grit {
  width: 60px;
  height: 68px;
  top: 0px;
  left: 22px;
}

.hase-hull {
  width: 60px;
  height: 68px;
  top: 52px;
  left: -8px;
}

.hase-agi {
  width: 60px;
  height: 68px;
  top: 52px;
  left: 52px;
}

.hase-sys {
  width: 60px;
  height: 68px;
  top: 104px;
  left: 22px;
}

.hase-eng {
  width: 60px;
  height: 68px;
  top: 156px;
  left: 52px;
}

.hase-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.hase-poly {
  fill: #1a4885;
  stroke: #2563eb;
  stroke-width: 2;
  transition: fill 0.2s, stroke 0.2s;
}

.hase-hex-btn:hover .hase-poly {
  fill: #2563eb;
  stroke: #60a5fa;
}

.hase-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.hase-label {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #e2e8f0;
}

.hase-divider {
  width: 60%;
  height: 1.5px;
  background: #ffffff;
  margin: 1px 0;
}

.hase-val {
  font-size: 16px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1;
}

.hase-grit .hase-val {
  font-size: 20px;
}

/* Combat Stats: 1 column of icons, 1 column of texts */
.combat-stats-col {
  position: absolute;
  left: 0px;
  top: 0px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  z-index: 5;
}

.stat-col {
  display: grid;
  grid-template-columns: 28px auto;
  align-items: center;
  column-gap: 8px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s ease, filter 0.1s ease;
}

.stat-col:active {
  transform: scale(0.92);
  filter: brightness(1.25);
}

.stat-icon {
  font-size: 26px !important;
  color: #ffffff !important;
  justify-self: center;
}

.stat-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 68px;
}

.stat-number {
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
  color: #ffffff;
}

.stat-red-line {
  width: 100%;
  min-width: 24px;
  height: 2px;
  background: #b31b34;
  margin: 2px 0 1px 0;
}

.stat-label {
  font-size: 12px;
  letter-spacing: 1px;
  color: #ffffff;
}

/* Damage & Health Bars Row */
.damage-bars-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.pv-bar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  cursor: pointer;
}

.pv-header-label {
  font-size: 13px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 1px;
  min-width: 20px;
  text-align: right;
}

.slanted-bar-track {
  position: relative;
  flex: 1;
  height: 26px;
  background: #161b22;
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  overflow: hidden;
  display: flex;
  align-items: center;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.slanted-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(90deg, #4d7c0f 0%, #65a30d 100%);
  transition: width 0.3s ease;
}

.structure-track .structure-fill {
  background: linear-gradient(90deg, #b45309 0%, #f59e0b 100%);
}

.heat-track .heat-fill {
  background: linear-gradient(90deg, #b91c1c 0%, #ef4444 100%);
}

.bar-text-overlay {
  position: relative;
  z-index: 2;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 900;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  letter-spacing: 1px;
}

.bar-value-input {
  font-family: inherit;
  width: 36px;
  text-align: right;
  font-size: 13px;
  font-weight: 900;
  color: #ffffff;
  background: transparent;
  border: none;
  outline: none;
  padding: 0 2px;
  margin: 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  cursor: text;
  transition: background 0.15s ease;
}

.bar-value-input:hover,
.bar-value-input:focus {
  background: rgba(0, 0, 0, 0.45);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.bar-value-input::-webkit-outer-spin-button,
.bar-value-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.bar-divider {
  margin: 0 2px;
  opacity: 0.9;
}

.bar-max-val {
  min-width: 24px;
  text-align: left;
}

/* BLI & QMD Mini Boxes */
.stat-mini-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 38px;
  background: rgba(15, 23, 42, 0.8);
  border-radius: 2px;
  padding: 2px 0;
}

.bli-box {
  border: 1.5px solid #0288d1;
}

.qmd-box {
  border: 1.5px solid #d32f2f;
}

.rep-box {
  border: 1.5px solid #10b981;
}

.mini-box-input {
  width: 100%;
  text-align: center;
  font-size: 15px;
  font-weight: 900;
  color: #ffffff;
  background: transparent;
  border: none;
  outline: none;
  line-height: 1;
  padding: 0;
}

.mini-box-input::-webkit-outer-spin-button,
.mini-box-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.mini-box-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #94a3b8;
  line-height: 1;
  margin-top: 1px;
}

.bli-box .mini-box-label {
  color: #38bdf8;
}

.qmd-box .mini-box-label {
  color: #f87171;
}

.rep-box .mini-box-label {
  color: #34d399;
}

.stress-box .mini-box-label {
  color: #c084fc;
}

/* Controls */
.hud-controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Core Power */
.core-power-row {
  display: flex;
  justify-content: center;
}

.core-power-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 5px 14px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.core-power-btn.active {
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
}

.core-power-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Tooltip Styles */
:deep(.lancer-tooltip) {
  background: #0b1320 !important;
  border: 1px solid #1e293b !important;
  padding: 0 !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8) !important;
  max-width: 320px;
}

.tooltip-box {
  padding: 8px 12px;
}

.tooltip-header {
  background: #9b1828;
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  padding: 4px 8px;
  margin: -8px -12px 6px -12px;
  text-transform: uppercase;
}

.tooltip-body {
  font-size: 11px;
  line-height: 1.4;
  color: #cbd5e1;
}

/* Vital Pips: Estrutura & Estresse */
.vital-pips-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  margin-top: 4px;
}

.vital-pips-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #cbd5e1;
  text-transform: uppercase;
}

.pips-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pip {
  width: 24px;
  height: 14px;
  transform: skewX(-15deg);
  border-radius: 1px;
  background: rgba(15, 23, 42, 0.8);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
}

.pip:hover {
  transform: skewX(-15deg) scale(1.1);
  filter: brightness(1.2);
}

/* Structure Pips (Amber) */
.pip-structure.active {
  background: #f59e0b;
  border-color: #fbbf24;
}

.pip-structure:not(.active) {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
  opacity: 0.4;
}

/* Stress Pips (Red) */
.pip-stress.active {
  background: #ef4444;
  border-color: #f87171;
}

.pip-stress:not(.active) {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  opacity: 0.4;
}

/* Structure Roll Alert Banner */
.structure-alert-banner {
  margin: 10px 0;
  width: 100%;
  position: relative;
}

.alert-close-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 10, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.alert-close-btn:hover {
  background: rgba(239, 68, 68, 0.9);
  border-color: #ef4444;
  color: #ffffff;
  transform: scale(1.1);
}

.structure-roll-action-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: linear-gradient(90deg, rgba(180, 9, 9, 0.35) 0%, rgba(245, 11, 11, 0.2) 50%, rgba(180, 9, 9, 0.35) 100%);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 0 10px rgba(245, 11, 11, 0.3), inset 0 0 10px rgba(245, 11, 11, 0.15);
  animation: pulse-border 2s infinite ease-in-out;
}

@keyframes pulse-border {
  0%, 100% {
    box-shadow: 0 0 8px rgba(245, 11, 11, 0.3), inset 0 0 8px rgba(245, 11, 11, 0.1);
    border-color: #f50b0b8f;
  }
  50% {
    box-shadow: 0 0 18px rgba(245, 11, 11, 0.7), inset 0 0 14px rgba(245, 11, 11, 0.3);
    border-color: #f84848;
  }
}

.structure-roll-action-btn:hover {
  background: linear-gradient(90deg, rgba(180, 83, 9, 0.5) 0%, rgba(245, 158, 11, 0.35) 50%, rgba(180, 83, 9, 0.5) 100%);
  border-color: #fbbf24;
  transform: translateY(-1px);
}

.stress-roll-action-btn {
  background: linear-gradient(90deg, rgba(185, 28, 28, 0.4) 0%, rgba(220, 38, 38, 0.25) 50%, rgba(185, 28, 28, 0.4) 100%);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3), inset 0 0 10px rgba(239, 68, 68, 0.15);
}

.stress-roll-action-btn:hover {
  background: linear-gradient(90deg, rgba(185, 28, 28, 0.55) 0%, rgba(239, 68, 68, 0.4) 50%, rgba(185, 28, 28, 0.55) 100%);
  border-color: #f87171;
}

.alert-pulse-icon {
  display: flex;
  align-items: center;
}

.alert-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 12px;
  flex: 1;
}

.alert-title {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px;
  font-weight: 900;
  color: #fbbf24;
  letter-spacing: 1px;
}

.alert-title.stress-title {
  color: #f87171;
}

.alert-sub {
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  opacity: 0.85;
  letter-spacing: 0.5px;
}

.alert-dice-action {
  display: flex;
  align-items: center;
  padding: 5px 12px;
  background: #f59e0b;
  color: #0b131e;
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
  border-radius: 2px;
  transition: all 0.15s ease;
}

.alert-dice-action.stress-action {
  background: #ef4444;
  color: #ffffff;
}

.structure-roll-action-btn:hover .alert-dice-action {
  background: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.85);
}

.stress-roll-action-btn:hover .alert-dice-action.stress-action {
  background: #f87171;
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.85);
}
</style>
