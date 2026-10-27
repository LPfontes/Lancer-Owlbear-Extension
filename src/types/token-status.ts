/**
 * Tipagens e constantes para os Status Diretos do Token no Owlbear Rodeo.
 */

export const COMPCON_TOKEN_STATUSES_KEY = 'com.compcon.token_statuses'
export const TOKEN_STATUS_SCHEMA_VERSION = 1

export type TokenStatusPriorityMode = 'override' | 'merge_priority'

export interface TokenDirectStatusPayload {
  v: number
  /** Lista de IDs de status ativos no token (ex: ['lockon', 'impaired', 'softcover', 'custom:MeuStatus']) */
  statuses: string[]
  /** Timestamp da última alteração direta (ms) */
  updatedAt: number
  /** Identificador do jogador ou papel que atualizou */
  updatedBy: string
  /** Modo de prioridade: 'override' (padrão) substitui a ficha no mapa; 'merge_priority' mescla */
  priorityMode: TokenStatusPriorityMode
}
