/**
 * Contexto de pré-aquecimento silencioso do Modo Ativo.
 *
 * O `index.html` cria um iframe oculto apontando para `?ccPrewarm=1#/active-mode` para
 * deixar o app do Modo Ativo carregado em segundo plano. Isso significa que o
 * documento de pré-aquecimento é uma **segunda instância do app** no mesmo navegador —
 * mesmo bridge, mesmos stores, mesmos listeners de janela — e todo efeito colateral
 * que o usuário perceberia precisa ficar de fora dele:
 *
 * - **Menu de contexto do Owlbear**: os ids (`compcon-bind-token`, `compcon-open-sheet`)
 *   são fixos. Como o handler dispara um evento `window` que só existe no documento que
 *   registrou o menu, um segundo registro faria o clique do usuário cair no iframe
 *   oculto — a ação pareceria não fazer nada.
 * - **Geometria/popover da ficha**: `windowManager` pode abrir/reposicionar o popover da
 *   ficha e fechar o action dock (`OBR.action.close()`), o que a partir do iframe oculto
 *   mexeria na janela real do usuário.
 * - **Garantia da janela da ficha**: `ensureSheetWindowOnRoomJoin()` não deve ser
 *   disparado por um iframe que o usuário não vê.
 * - **Integrações externas**: dados 3D não precisam de uma segunda conexão por aba.
 *
 * O que permanece ligado — e é o motivo do pré-aquecimento: stores, compêndio, fichas e a
 * sincronização da sala, que é o que precisa estar quente.
 */
export const PREWARM_QUERY_FLAG = 'ccPrewarm'

/** URL (search + hash) pertence ao iframe de pré-aquecimento? Pura, para testar. */
export function isPrewarmUrl(url: string): boolean {
  return String(url || '').includes(`${PREWARM_QUERY_FLAG}=`)
}

/**
 * Este documento é o iframe oculto de pré-aquecimento do Modo Ativo?
 * Ver o `<script>` no fim do `index.html`, que é quem cria o iframe.
 */
export function isActiveModePrewarm(): boolean {
  if (typeof window === 'undefined') return false
  return isPrewarmUrl(`${window.location.search}${window.location.hash}`)
}
