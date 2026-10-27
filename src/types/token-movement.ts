/**
 * Tipos do tracker de movimento dinâmico (plano §13).
 *
 * O slot `speed` é o único **vivo** do conjunto: o `current` é o movimento
 * *restante* do turno (o motor já o debita em `CombatController.SpendMovement`) e o
 * gasto vem do arrasto do token no mapa.
 *
 * Este arquivo é puro: nada de OBR, store ou Vue. A decisão de gasto mora em
 * `services/tokenMovement.ts`; a captura do arrasto, em `tokenMovementCapture.ts`.
 */

/** Como o gesto foi classificado (§13.3). */
export type MovementKind =
  /** Arrastado por ESTA janela: debita no motor. */
  | 'voluntary'
  /** Arrastado por outra janela (empurrão/teleporte do GM): não debita. */
  | 'involuntary'
  /** Esta janela com "próximo movimento é livre" armado (§13.7): não debita. */
  | 'free'

/** Classificação de leg que o cartão de combate já usa. */
export type MovementMode = 'move' | 'boost'

export interface MovementInput {
  /** Espaços do gesto (`getDistance`, já em células = espaços). */
  spaces: number
  /** Movimento restante agora (`sc.getCurrent(SPEED)`). */
  remaining: number
  /** `CombatController.BoostBonus` corrente. */
  boostBonus: number
  /** `sc.getMax(SPEED)` — o movimento padrão da ficha, sem Boost. */
  maxSpeed: number
  /** `CanActivate('boost')` — legalidade do Boost (§13.1). */
  canBoost: boolean
  /** Atribuição do gesto (§13.3). */
  kind: MovementKind
  /** Status `immobilized` (nega `move` e `boost` em `StatusRules`). */
  immobilized: boolean
}

export type MovementRejectReason = 'involuntary' | 'free' | 'immobilized' | 'over-cap-no-boost'

export type MovementDecision =
  | { action: 'reject'; spend: 0; reason: MovementRejectReason }
  | { action: 'spend'; spend: number; mode: MovementMode }
  | { action: 'offer-boost'; spend: number; overBy: number }

/** Motivo pelo qual o Boost não pode ser oferecido (para o cartão explicar). */
export type MovementBoostBlockReason = 'not-legal' | 'immobilized'

/** Identificador do gesto, para casar pedido e resposta entre iframes. */
export interface MovementGestureId {
  requestId: string
  tokenId: string
}

/**
 * Pedido de débito enviado ao iframe que tem o controlador VIVO (plano §13.9).
 *
 * O app roda em iframes separados: a ficha do modo ativo vive na janela persistente
 * (`windowType=floating`), e o arrasto acontece na janela do mapa. O
 * `StatController` vivo só existe no primeiro, então é ele que decide e debita —
 * este pedido carrega o **gesto**, não a decisão: quem decide tem os números frescos.
 */
export interface MovementSpendRequest extends MovementGestureId {
  /** Ficha/mecha do vínculo do token, para o dono reconhecer o pedido como seu. */
  sheetId: string
  mechId?: string
  /** Espaços andados no gesto. */
  spaces: number
  /** Atribuição do gesto (§13.3), decidida na janela que arrastou. */
  kind: MovementKind
}

/** Resposta do dono do controlador: o que ele fez (ou por que não fez). */
export interface MovementSpendReply extends MovementGestureId {
  applied: boolean
  /** O que foi debitado de fato (0 quando não debitou). */
  spent: number
  /** Resultado da decisão tomada com os números FRESCOS do dono. */
  action: 'spend' | 'offer-boost' | 'reject'
  reason?: MovementRejectReason
  /** Restante depois do débito, para a janela que arrastou conferir. */
  remainingAfter: number
}
