import { ref } from 'vue'

/**
 * Espelho REATIVO do estado do bridge do Owlbear (prontidão e papel do jogador).
 *
 * Por que existe: `obrBridge` é uma classe simples e `getIsReady()`/`getRole()` são
 * campos comuns. Um `computed` que os leia **não tem nenhuma dependência reativa**, então
 * o Vue o avalia uma única vez e congela o resultado — e a janela monta ANTES de
 * `obrBridge.init()` resolver o handshake (`void obrBridge.init()` seguido de `mount` em
 * `main.ts`). Resultado prático: qualquer tela que decidisse "sou Mestre?" por ali
 * ficava travada em `false` para sempre.
 *
 * Aqui o mesmo estado vive em refs, escritas pelo bridge quando o SDK responde.
 *
 * Fail closed: `ready` começa em `false` e `role` em `'PLAYER'`. Nada que dependa de
 * "ser Mestre" libera controle antes do SDK confirmar o papel.
 */

/** `true` quando o handshake do Owlbear Rodeo terminou. */
export const obrReady = ref(false)

/** Papel do jogador na sala, confirmado pelo SDK. */
export const obrRole = ref<'GM' | 'PLAYER'>('PLAYER')

/** ID do jogador na sala (vazio até o handshake). */
export const obrPlayerId = ref('')

/**
 * Esta janela é o Mestre? Reativo: use dentro de `computed`/`watch` e a UI passa a
 * reagir quando o handshake termina.
 */
export function isGmClient(): boolean {
  return obrReady.value && obrRole.value === 'GM'
}

/** Volta ao estado inicial (testes). */
export function resetObrRuntime(): void {
  obrReady.value = false
  obrRole.value = 'PLAYER'
  obrPlayerId.value = ''
}
