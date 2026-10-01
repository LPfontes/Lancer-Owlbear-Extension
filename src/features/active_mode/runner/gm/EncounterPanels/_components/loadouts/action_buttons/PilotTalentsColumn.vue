<template>
  <div class="hud-section h-100 pa-2">
    <div class="section-label d-flex align-center ga-1 mb-2">
      <v-icon
        icon="mdi-medal-outline"
        size="18"
      />
      <span>{{ $t('hud.talents', { name: pilotName }) }}</span>
    </div>

    <div class="talent-list">
      <div
        v-for="t in talents"
        :key="t.id"
        class="talent-card pa-2 mb-2"
      >
        <!-- Talent Header with Tooltip -->
        <div class="d-flex align-center justify-space-between mb-1">
          <v-tooltip
            location="top"
            max-width="460"
            open-delay="150"
          >
            <template #activator="{ props: tipProps }">
              <div
                v-bind="tipProps"
                class="d-flex align-center cursor-pointer talent-title-hover"
              >
                <span class="font-weight-bold text-subtitle-1">{{ t.name }}</span>
                <v-chip
                  size="x-small"
                  color="accent"
                  class="ml-2"
                >
                  {{ $t('hud.rankN', { rank: t.rank }) }}
                </v-chip>
                <v-icon
                  icon="mdi-help-circle-outline"
                  size="16"
                  class="ml-1 text-disabled"
                />
              </div>
            </template>
            <div class="talent-tooltip-body pa-2">
              <div class="text-h6 font-weight-bold text-primary mb-2 border-b pb-1">
                {{ t.name }}
              </div>
              <div
                v-for="rk in t.ranks"
                :key="rk.rankNum"
                class="mb-3"
              >
                <div class="text-subtitle-2 font-weight-bold text-accent mb-1">
                  {{ $t('hud.rankN', { rank: rk.rankNum }) }}{{ rk.name ? ` — ${rk.name}` : '' }}
                </div>
                <div
                  v-if="rk.description"
                  v-html-safe="rk.description"
                  class="text-body-2 talent-desc-html"
                />
              </div>
            </div>
          </v-tooltip>
        </div>

        <!-- +P / -D Controls -->
        <div class="d-flex align-center justify-end ga-3">
          <!-- +P Control -->
          <div class="d-flex align-center ga-1">
            <span class="text-success font-weight-bold">+P</span>
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="t.acc <= 0"
              @click="t.acc--"
            >
              <v-icon icon="mdi-minus" />
            </v-btn>
            <span class="font-weight-bold font-mono">+{{ t.acc }}</span>
            <v-btn
              icon
              size="small"
              variant="text"
              @click="t.acc++"
            >
              <v-icon icon="mdi-plus" />
            </v-btn>
          </div>

          <!-- -D Control -->
          <div class="d-flex align-center ga-1">
            <span class="text-error font-weight-bold">-D</span>
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="t.diff <= 0"
              @click="t.diff--"
            >
              <v-icon icon="mdi-minus" />
            </v-btn>
            <span class="font-weight-bold font-mono">-{{ t.diff }}</span>
            <v-btn
              icon
              size="small"
              variant="text"
              @click="t.diff++"
            >
              <v-icon icon="mdi-plus" />
            </v-btn>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  interface TalentRankInfo {
    rankNum: number
    name: string
    description: string
  }

  interface TalentModifier {
    id: string
    name: string
    rank: number
    acc: number
    diff: number
    ranks?: TalentRankInfo[]
  }

  defineProps<{
    talents: TalentModifier[]
    pilotName: string
  }>()
</script>

<style scoped>
  .hud-section {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.15);
  }
  .section-label {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
  }
  .talent-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
  }
  .font-mono {
    font-family: monospace;
  }
  .cursor-pointer {
    cursor: pointer;
  }
  .talent-title-hover:hover .text-subtitle-1 {
    color: rgb(var(--v-theme-primary));
  }
  .talent-tooltip-body {
    max-height: 400px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.5;
  }
  .talent-desc-html {
    font-size: 13.5px;
    line-height: 1.5;
  }
  .talent-desc-html :deep(p) {
    margin-bottom: 4px;
  }
  .talent-desc-html :deep(ul) {
    padding-left: 16px;
    margin-bottom: 4px;
  }
</style>
