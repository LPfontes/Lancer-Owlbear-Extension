<template>
  <v-row
    dense
    align="center"
  >
    <v-col
      v-if="!actionOnly"
      cols="auto"
    >
      <v-tooltip
        location="top"
        :text="$t('active.actions.equipmentDeployableInstance')"
      >
        <template #activator="{ props }">
          <v-icon
            v-bind="props"
            icon="cc:drone"
          />
        </template>
      </v-tooltip>

      <combat-action-indicator
        :icon="deployable.DeployAction.Icon"
        :activation="deployable.DeployAction.Activation"
        :can-activate="canActivate"
        :custom-disabled-text="customDisabledText"
        span-class="ml-1 mr-n1"
      >
        <template #reason>
          <div>
            {{ $t('active.combatAction.insufficient') }}
            <v-chip
              :color="deployable.DeployAction.Color"
              size="small"
              variant="elevated"
              :prepend-icon="deployable.DeployAction.Icon || ''"
            >
              {{ $enum('activationType', deployable.DeployAction.Activation) }}
            </v-chip>
            {{ $t('active.combatAction.actionsRemaining') }}
          </div>
        </template>
      </combat-action-indicator>
    </v-col>
    <v-col>
      <v-row
        no-gutters
        align="center"
      >
        <v-col
          v-if="!actionOnly"
          cols="auto"
          style="margin-right: 2px"
        >
          <cc-deployable-info :deployable="deployable" />
        </v-col>
        <v-col :cols="actionOnly ? '' : 'auto'">
          <div class="d-flex align-center w-100">
            <v-menu
              v-model="menu"
              :close-on-content-click="false"
              offset-y
            >
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  flat
                  tile
                  :block="actionOnly"
                  :class="actionOnly ? 'flex-grow-1' : 'ml-n1'"
                  size="small"
                  :color="canActivate ? deployable.DeployAction.Color : 'panel'"
                  :height="actionOnly ? '28' : '26px'"
                  :prepend-icon="deployable.DeployAction.Icon"
                >
                  {{
                    actionOnly
                      ? $t('active.deploy.deployNamed', { name: deployable.Name })
                      : $t('ui.widget.deploy')
                  }}
                </v-btn>
              </template>
              <v-card border>
                <v-toolbar
                  class="heading h3 px-3"
                  dense
                  height="40px"
                  flat
                  :color="deployable.DeployAction.Color"
                >
                  <v-icon
                    :icon="deployable.DeployAction.Icon"
                    start
                  />
                  {{ $t('active.deploy.deployNamed', { name: deployable.Name }) }}
                  <v-spacer />
                  <v-btn
                    icon
                    tile
                    variant="text"
                    density="compact"
                    title="Enviar para o chat"
                    @click="broadcastAction"
                  >
                    <v-icon
                      icon="mdi-message-text"
                      size="small"
                    />
                  </v-btn>
                </v-toolbar>
                <v-divider />
                <v-card-text class="pa-3">
                  <div class="mb-2">
                    <i18n-t
                      keypath="active.deploy.generateInstance"
                      tag="span"
                      scope="global"
                    >
                      <template #name>
                        <strong>{{ deployable.Name }}</strong>
                      </template>
                      <template #actor>
                        <strong>{{ actor.CombatController.CombatName }}</strong>
                      </template>
                      <template #action>
                        <v-chip
                          :color="deployable.DeployAction.Color"
                          :prepend-icon="deployable.DeployAction.Icon"
                          size="small"
                          variant="elevated"
                          flat
                        >
                          {{
                            $t('active.combatAction.activationAction', {
                              n: $enum('activationType', deployable.DeployAction.Activation),
                            })
                          }}
                        </v-chip>
                      </template>
                    </i18n-t>
                  </div>
                  <v-row class="mt-2">
                    <v-btn
                      size="small"
                      text
                      @click="menu = false"
                    >
                      {{ $t('common.cancel') }}
                    </v-btn>
                    <v-spacer />
                    <v-btn
                      size="small"
                      flat
                      tile
                      variant="elevated"
                      color="primary"
                      @click="deploy"
                    >
                      {{ $t('ui.widget.deploy') }}
                    </v-btn>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-menu>

            <v-btn
              v-if="actionOnly"
              icon
              tile
              variant="text"
              :color="canActivate ? deployable.DeployAction.Color : 'disabled'"
              size="small"
              height="28"
              width="28"
              style="opacity: 0.7;"
              class="ml-1"
              title="Enviar para o chat"
              @click.stop="broadcastAction"
            >
              <v-icon
                icon="mdi-message-text"
                size="small"
              />
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import type { ICombatant } from '@/classes/components/combat/ICombatant'
  import type { Deployable } from '@/classes/components/feature/deployable/Deployable'
  import { ref, computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useTableActionStore } from '@/stores/tableActionStore'
  import { notify } from '@/util/notify'
  import CombatActionIndicator from '@/ui/components/chips/_CombatActionIndicator.vue'

  const { t } = useI18n()

  const props = withDefaults(
    defineProps<{
      deployable: Deployable
      actor: ICombatant
      disabled?: boolean
      customDisabledText?: string
      actionOnly?: boolean
    }>(),
    {
      disabled: false,
      customDisabledText: '',
      actionOnly: false,
    }
  )

  const emit = defineEmits<{ deploy: [deployable: Deployable] }>()

  const menu = ref(false)

  const canActivate = computed(
    () =>
      !props.disabled &&
      props.actor.CombatController.ActiveActor.CombatController.CanActivate(
        props.deployable.DeployAction.Activation
      )
  )

  function broadcastAction() {
    const actorName =
      (props.actor as any)?.Callsign ||
      (props.actor as any)?.Name ||
      props.actor?.CombatController?.CombatName ||
      (props.actor as any)?.CombatController?.ActiveActor?.CombatName ||
      'Piloto'
    const activation = (props.deployable.DeployAction?.Activation || 'Quick').toLowerCase()
    const cat =
      activation === 'full'
        ? 'full_action'
        : activation === 'protocol'
          ? 'protocol'
          : 'quick_action'

    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: t('active.deploy.deployNamed', { name: props.deployable.Name }),
      actionType: cat,
      detail: props.deployable.Detail || (props.deployable as any)?.Description,
    })
  }

  function deploy() {
    const actorName =
      (props.actor as any)?.Callsign ||
      (props.actor as any)?.Name ||
      props.actor?.CombatController?.CombatName ||
      (props.actor as any)?.CombatController?.ActiveActor?.CombatName ||
      'Piloto'
    const activation = (props.deployable.DeployAction?.Activation || 'Quick').toLowerCase()
    const cat =
      activation === 'full'
        ? 'full_action'
        : activation === 'protocol'
          ? 'protocol'
          : 'quick_action'

    void useTableActionStore().broadcastCombatAction({
      actorName,
      actionName: t('active.deploy.deployNamed', { name: props.deployable.Name }),
      actionType: cat,
      detail: `Implantou ${props.deployable.Name}`,
    })

    notify({
      title: props.deployable.Name,
      text: t('active.deploy.deployNamed', { name: props.deployable.Name }),
      type: 'success',
    })

    emit('deploy', props.deployable)
    menu.value = false
  }
</script>
