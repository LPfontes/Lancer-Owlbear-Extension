<template>
  <v-card>
    <div class="heading h2 pa-2">{{ $t('active.quickReference.title') }}</div>
    <v-card-text class="pt-0">
      <fieldset class="px-2 py-1 mb-4">
        <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.perTurn') }}</legend>

        <v-row dense>
          <v-col
            cols="12"
            md=""
          >
            <v-card
              color="action--protocol"
              class="text-center py-1"
            >
              <v-icon
                size="large"
                icon="cc:protocol"
              />
              <div class="heading caption">{{ $t('active.quickReference.protocols') }}</div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="4"
          >
            <v-card
              color="action--full"
              class="text-center py-1"
            >
              <v-icon
                size="large"
                icon="mdi-hexagon-slice-6"
              />
              <v-icon
                size="large"
                class="text-disabled"
              >
                mdi-swap-horizontal
              </v-icon>
              <v-icon
                size="large"
                icon="mdi-hexagon-slice-3"
              />
              <v-icon
                size="large"
                icon="mdi-hexagon-slice-3"
              />
              <div class="heading caption">{{ $t('active.quickReference.fullActionOr2Quick') }}</div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <v-card
              color="action--move"
              class="text-center py-1"
            >
              <v-icon
                size="large"
                icon="mdi-arrow-right-bold-hexagon-outline"
              />
              <div class="heading caption">{{ $t('active.quickReference.movement') }}</div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <v-card
              color="overcharge"
              class="text-center py-1"
            >
              <v-icon
                size="large"
                icon="cc:overcharge"
              />
              <div class="heading caption">{{ $t('active.quickReference.overcharge') }}</div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <v-card
              color="action--free"
              class="text-center py-1"
            >
              <v-icon
                size="large"
                icon="cc:free_action"
              />
              <div class="heading caption">{{ $t('active.quickReference.freeActions') }}</div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <v-card
              color="action--reaction"
              class="text-center py-1"
            >
              <v-icon
                size="large"
                icon="cc:reaction"
              />
              <div class="heading caption">{{ $t('active.quickReference.reactions') }}</div>
            </v-card>
          </v-col>
        </v-row>
        <div class="caption font-italic text-center py-1">
          {{ $t('active.quickReference.perTurnNote') }}
        </div>
      </fieldset>

      <v-row
        class="mb-2"
        dense
      >
        <v-col
          cols="12"
          md=""
        >
          <fieldset
            class="px-3 pt-1 pb-2"
            style="height: 100%"
          >
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.engagement') }}</legend>
            <p class="mb-1" v-html="$t('active.quickReference.engagementDesc1')"></p>
            <p v-html="$t('active.quickReference.engagementDesc2')"></p>
          </fieldset>
        </v-col>
        <v-col
          cols="12"
          md=""
        >
          <fieldset
            class="px-3 pt-1 pb-2"
            style="height: 100%"
          >
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.terrain') }}</legend>
            <div class="mb-1" v-html="$t('active.quickReference.terrainDifficult')"></div>
            <div v-html="$t('active.quickReference.terrainDangerous')"></div>
          </fieldset>
        </v-col>
      </v-row>

<v-row dense>
        <v-col
          cols="12"
          md=""
        >
          <fieldset
            class="px-3 pt-1 pb-2"
            style="height: 100%"
          >
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.rollModifiers') }}
            </legend>
            <p class="mb-1" v-html="$t('active.quickReference.rollModAccuracy')"></p>
            <p class="mb-1" v-html="$t('active.quickReference.rollModDifficulty')"></p>
            <p v-html="$t('active.quickReference.rollModCancel')"></p>
          </fieldset>
        </v-col>
        <v-col
          cols="12"
          md=""
        >
          <fieldset
            class="px-3 pt-1 pb-2"
            style="height: 100%"
          >
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.cover') }}</legend>
            <p class="mb-1" v-html="$t('active.quickReference.softCover')"></p>

            <p class="mb-1" v-html="$t('active.quickReference.hardCover')"></p>

            <p v-html="$t('active.quickReference.coverOneType')"></p>
          </fieldset>
        </v-col>
      </v-row>
      <cc-icon-divider
        icon="cc:weapon"
        class="mt-1"
      />
      <v-row dense>
        <v-col >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.skirmish') }}
              <v-icon
                icon="mdi-hexagon-slice-3"
                color="action--quick"
              />
            </legend>
            <div v-html="$t('active.quickReference.skirmishDesc')"></div>
          </fieldset>
        </v-col>
        <v-col >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.barrage') }}
              <v-icon
                icon="mdi-hexagon-slice-6"
                color="action--full"
              />
            </legend>
            <div v-html="$t('active.quickReference.barrageDesc')"></div>
          </fieldset>
        </v-col>
        <v-col >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.improvisedAttack') }}
              <v-icon
                icon="mdi-hexagon-slice-6"
                color="action--full"
              />
            </legend>
            <div v-html="$t('active.quickReference.improvisedAttackDesc')"></div>
          </fieldset>
        </v-col>
        <v-col >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.ram') }}
              <v-icon
                icon="mdi-hexagon-slice-3"
                color="action--quick"
              />
            </legend>
            <div v-html="$t('active.quickReference.ramDesc')"></div>
          </fieldset>
        </v-col>
        <v-col cols="12">
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.grapple') }}
              <v-icon
                icon="mdi-hexagon-slice-3"
                color="action--quick"
              />
            </legend>
            <div>
              <v-row dense>
                <v-col>
                  <p v-html="$t('active.quickReference.grappleDesc1')"></p>
                  <ul>
                    <li v-html="$t('active.quickReference.grappleEffect1')"></li>
                    <li v-html="$t('active.quickReference.grappleEffect2')"></li>
                    <li v-html="$t('active.quickReference.grappleEffect3')"></li>
                  </ul>
                </v-col>
                <v-col>
                  <p v-html="$t('active.quickReference.grappleEnds')"></p>
                  <br />
                  <ul>
                    <li v-html="$t('active.quickReference.grappleEnd1')"></li>
                    <li v-html="$t('active.quickReference.grappleEnd2')"></li>
                    <li v-html="$t('active.quickReference.grappleEnd3')"></li>
                  </ul>
                </v-col>
              </v-row>
            </div>
          </fieldset>
        </v-col>
      </v-row>

      <v-row dense>
        <v-col
          cols="12"
          md=""
        >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.meleeAttacks') }}
            </legend>
            <div class="text-center">
              <v-chip
                size="small"
                variant="elevated"
                class="mb-1"
                color="action--full"
              >
                <v-icon
                  icon="mdi-dice-d20"
                  start
                  size="x-large"
                />
                {{ $t('active.quickReference.meleeRangedFormula') }}
              </v-chip>
            </div>
            <div class="caption text-center" v-html="$t('active.quickReference.meleeRange')"></div>
          </fieldset>
        </v-col>
        <v-col
          cols="12"
          md=""
        >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.rangedAttacks') }}
            </legend>
            <div class="text-center">
              <v-chip
                size="small"
                variant="elevated"
                class="mb-1"
                color="action--full"
              >
                <v-icon
                  icon="mdi-dice-d20"
                  start
                  size="x-large"
                />
                {{ $t('active.quickReference.meleeRangedFormula') }}
              </v-chip>
            </div>
            <div class="caption text-center" v-html="$t('active.quickReference.rangedRange')"></div>
          </fieldset>
        </v-col>
        <v-col
          cols="12"
          md=""
        >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.techAttacks') }}</legend>
            <div class="text-center">
              <v-chip
                size="small"
                variant="elevated"
                class="mb-1"
                color="action--tech"
              >
                <v-icon
                  icon="mdi-dice-d20"
                  start
                  size="x-large"
                />
                {{ $t('active.quickReference.techFormula') }}
              </v-chip>
            </div>
            <div class="caption text-center" v-html="$t('active.quickReference.techRange')"></div>
          </fieldset>
        </v-col>
      </v-row>

      <fieldset class="px-3 pt-1 pb-2 mt-3">
        <legend class="text-cc-overline text-accent px-2 font-weight-bold">
          {{ $t('active.quickReference.aoePatterns') }}
        </legend>
        <v-row>
          <v-col
            cols="12"
            md=""
          >
            <div class="font-weight-bold text-accent">
              <v-icon
                icon="cc:line"
                size="small"
                class="mt-n1"
              />
              {{ $t('active.quickReference.line') }}
            </div>
            <div>{{ $t('active.quickReference.lineDesc') }}</div>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <div class="font-weight-bold text-accent">
              <v-icon
                icon="cc:cone"
                size="small"
                class="mt-n1"
              />
              {{ $t('active.quickReference.cone') }}
            </div>
            <div>{{ $t('active.quickReference.coneDesc') }}</div>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <div class="font-weight-bold text-accent">
              <v-icon
                icon="cc:blast"
                size="small"
                class="mt-n1"
              />
              {{ $t('active.quickReference.blast') }}
            </div>
            <div>{{ $t('active.quickReference.blastDesc') }}</div>
          </v-col>
          <v-col
            cols="12"
            md=""
          >
            <div class="font-weight-bold text-accent">
              <v-icon
                icon="cc:burst"
                size="small"
                class="mt-n1"
              />
              {{ $t('active.quickReference.burst') }}
            </div>
            <div>{{ $t('active.quickReference.burstDesc') }}</div>
          </v-col>
        </v-row>
        <v-divider class="my-1" />
        <div class="caption font-italic text-center py-1">
          {{ $t('active.quickReference.aoeNote') }}
        </div>
      </fieldset>

      <v-row
        dense
        class="mt-3"
      >
        <v-col
          cols="12"
          md=""
        >
          <fieldset class="px-3 pt-1 pb-2">
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.damageTypes') }}</legend>
            <div>
              <v-row dense>
                <v-col
                  cols="12"
                  md=""
                >
                  <div>
                    <v-icon
                      icon="cc:kinetic"
                      size="small"
                      class="mt-n1"
                      color="damage--kinetic"
                    />
                    <b>{{ $t('active.quickReference.kinetic') }}</b>
                  </div>
                  <div>
                    <v-icon
                      icon="cc:energy"
                      size="small"
                      class="mt-n1"
                      color="damage--energy"
                    />
                    <b>{{ $t('active.quickReference.energy') }}</b>
                  </div>
                  <div>
                    <v-icon
                      icon="cc:explosive"
                      size="small"
                      class="mt-n1"
                      color="damage--explosive"
                    />
                    <b>{{ $t('active.quickReference.explosive') }}</b>
                  </div>
                  <div>
                    <v-icon
                      icon="cc:heat"
                      size="small"
                      class="mt-n1"
                      color="damage--heat"
                    />
                    <b>{{ $t('active.quickReference.heat') }}</b>
                  </div>
                </v-col>
                <v-col
                  cols="12"
                  md=""
                >
                  <div>
                    <v-icon
                      icon="cc:burn"
                      size="small"
                      class="mt-n1"
                      color="damage--burn"
                    />
                    <b v-html="$t('active.quickReference.burn')"></b>
                    <div class="pl-5" v-html="$t('active.quickReference.burnDesc')"></div>
                  </div>
                </v-col>
              </v-row>
            </div>
          </fieldset>
        </v-col>
        <v-col
          cols="12"
          md=""
        >
          <fieldset
            class="px-3 pt-1 pb-2"
            style="height: 100%"
          >
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.bonusDamage') }}</legend>
            <div v-html="$t('active.quickReference.bonusDamageDesc')"></div>
          </fieldset>
        </v-col>
        <v-col
          cols="12"
          md=""
        >
          <fieldset
            class="px-3 pt-1 pb-2"
            style="height: 100%"
          >
            <legend class="text-cc-overline text-accent px-2 font-weight-bold">
              {{ $t('active.quickReference.criticalHits') }}
            </legend>
            <div v-html="$t('active.quickReference.criticalHitsDesc')"></div>
          </fieldset>
        </v-col>
      </v-row>
      <fieldset class="px-3 pt-1 pb-2 mt-3">
        <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.statuses') }}</legend>
        <v-row dense>
          <v-col
            v-for="s in statuses.filter(x => x.StatusType === 'Status')"
            :key="s.ID"
            cols="12"
            md=""
            style="min-width: 14vw"
          >
            <v-card
              class="bg-panel pa-2"
              flat
              height="100%"
            >
              <div class="text-accent font-weight-bold">
                <div
                  v-if="s.Svg"
                  v-html-safe="cleanSvg(s.Svg)"
                  class="d-inline-block"
                  :style="{
                    width: s.IconSize(),
                    height: s.IconSize(),
                    filter: `invert(${$vuetify.theme.current.dark ? 1 : 0})`,
                  }"
                />
                <v-icon
                  v-else
                  :icon="s.Icon"
                  class="mt-n1"
                />
                {{ s.Name.toUpperCase() }}
              </div>
              <v-divider class="my-1" />
              <div v-html-safe="s.Terse" />
            </v-card>
          </v-col>
        </v-row>
      </fieldset>

      <fieldset class="px-3 pt-1 pb-2 mt-3">
        <legend class="text-cc-overline text-accent px-2 font-weight-bold">{{ $t('active.quickReference.conditions') }}</legend>
        <v-row dense>
          <v-col
            v-for="s in statuses.filter(x => x.StatusType === 'Condition')"
            :key="s.ID"
            cols="12"
            md=""
            style="min-width: 14vw"
          >
            <v-card
              class="bg-panel pa-2"
              flat
              height="100%"
            >
              <div class="text-accent font-weight-bold">
                <v-icon
                  :icon="s.Icon"
                  class="mt-n1"
                />
                {{ s.Name.toUpperCase() }}
              </div>
              <v-divider class="my-1" />
              <div v-html-safe="s.Terse" />
            </v-card>
          </v-col>
        </v-row>
      </fieldset>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { CompendiumStore } from '@/stores'
  import DOMPurify from 'dompurify'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  function cleanSvg(svg: string) {
    return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
  }

  const statuses = computed(() => {
    return CompendiumStore().Statuses
  })
</script>
