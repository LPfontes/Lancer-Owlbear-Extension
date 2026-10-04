import { computed, onScopeDispose, watch } from 'vue'
import { EncounterStore } from '@/stores'
import { PilotSheetStore } from '@/features/pilot_management/store/PilotSheetStore'
import { isGmClient, obrReady } from '@/services/obrRuntime'
import { TOKEN_TRACKER_STATE_EVENT, tokenTrackerService } from '@/services/tokenTrackerService'

/**
 * Ponte entre o estado de combate desta janela e o serviço de token trackers
 * (plano §7.2).
 *
 * O render é LOCAL, então cada janela precisa avisar o serviço quando o estado
 * que ela conhece muda. Aqui não há I/O de rede: é leitura reativa do Pinia mais
 * um evento de janela — a regra de ouro do `AGENTS.md` continua valendo.
 *
 * Também é aqui que o GM registra a fonte do encontro ativo: sem isso o serviço
 * não sabe o lado (`ally`/`enemy`) nem quem está oculto para os jogadores.
 */

/** Stats que afetam o desenho — se algum mudar, o painel precisa ser refeito. */
const TRACKED_STAT_KEYS = ['hp', 'heat', 'heatcap', 'overshield', 'speed', 'structure', 'stress']

function statSignature(controller: any): string {
  if (!controller || typeof controller.getCurrent !== 'function') return ''
  return TRACKED_STAT_KEYS.map(key => {
    try {
      return `${controller.getCurrent(key) ?? ''}/${controller.getMax(key) ?? ''}`
    } catch {
      return ''
    }
  }).join(':')
}

/** O encontro ativo desta janela (só o GM tem). */
function activeEncounter(): any | null {
  try {
    const store = EncounterStore()
    if (!store.CurrentActiveID) return null
    return store.getActiveEncounter(store.CurrentActiveID) ?? null
  } catch {
    return null
  }
}

/** O `StatController` da ficha própria desta janela (mecha ativo, ou o próprio ator). */
function selfStatController(): any {
  try {
    const sheet: any = PilotSheetStore().GetActiveSheet()
    const actor = sheet?.Combatant?.actor
    return (actor?.ActiveMech ?? actor)?.CombatController?.StatController ?? null
  } catch {
    return null
  }
}

function dispatchChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TOKEN_TRACKER_STATE_EVENT))
}

export function useTokenTrackerBridge(): void {
  tokenTrackerService.setSource(() => {
    const instance = activeEncounter()
    return instance ? { instance } : null
  })

  /**
   * Assinatura de TUDO que o painel desenha nesta janela: os combatentes do
   * encontro ativo (GM) e a ficha própria (jogador). Enquanto ela não muda, não há
   * nada a redesenhar.
   */
  const combatStateKey = computed(() => {
    const parts: string[] = []

    const instance = activeEncounter()
    if (instance?.Combatants) {
      for (const combatant of instance.Combatants as any[]) {
        parts.push(
          `${combatant?.id ?? ''}=${statSignature(combatant?.actor?.CombatController?.StatController)}`
        )
      }
    }

    try {
      parts.push(`self=${statSignature(selfStatController())}`)
    } catch {
      parts.push('self=')
    }

    return parts.join('|')
  })

  watch(combatStateKey, () => {
    dispatchChange()
  })

  // O GM só enxerga o encontro depois de carregar os encontros ativos; o
  // handshake do Owlbear é quem diz quando é seguro perguntar isso.
  const stopReady = watch(
    obrReady,
    async ready => {
      if (!ready || !isGmClient()) return
      try {
        const store = EncounterStore()
        if (!store.ActiveEncounters.length) await store.LoadActiveEncounters()
      } catch (err) {
        console.warn('[TokenTracker] Falha ao carregar os encontros ativos:', err)
      }
      void tokenTrackerService.refreshAll()
    },
    { immediate: true }
  )

  onScopeDispose(() => {
    stopReady()
    tokenTrackerService.setSource(null)
  })
}
