/**
 * Identity of this browsing context (window, tab or iframe).
 *
 * The OBR bridge and the stores share it so a context can recognise — and
 * ignore — the cross-window notifications it sent itself. Without it, a local
 * mutation that notifies the other windows also notifies its own, which
 * re-enters the store it just mutated.
 */
export const TAB_ID = 'tab_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now()
