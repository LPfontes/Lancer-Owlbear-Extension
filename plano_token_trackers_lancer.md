# Plano — Token Trackers LANCER (PV, Blindagem, Calor, Movimento, Estrutura, Estresse)

> Serviço nativo do projeto principal (`ow`, Vue 3 + Vuetify + Pinia + OBR SDK 2.3) que
> desenha, **no mapa**, os stats de combate do mecha/NPC **lidos da ficha COMP/CON vinculada
> ao token**.

---

## 1. Objetivo e escopo

Para todo token com vínculo a ficha (`com.compcon.activemode`), desenhar um painel de trackers
abaixo (ou acima) do token:

| # | Widget | Forma no mapa | Origem do valor |
|---|--------|---------------|-----------------|
| 1 | **PV** | barra (atual/máx), ocupa a largura do token | `hp` |
| 1b | **Blindagem** | numérico colado à direita da barra de PV | `overshield` |
| 2 | **Calor** | barra (atual/capacidade) | `heat` / `heatcap` |
| 3 | **Movimento** | numérico (restante/cap do turno) | `speed` + `BoostBonus` — **dinâmico**, ver §13 |
| 4 | **Estrutura** | N quadrados, preenchidos conforme o número | `structure` |
| 5 | **Estresse** | N quadrados, preenchidos conforme o número | `stress` |

O painel é **por token**, mas a janela pode acompanhar **vários tokens ao mesmo tempo** por uma
lista local (watchlist, §7.4).

Quem vê o quê é decidido pelo GM (§7.5): o jogador vê os **aliados** por padrão e os **inimigos**
só quando o GM libera; o GM vê tudo. Como a política precisa valer para tokens cuja ficha o
jogador não tem, o valor desenhado sai de um **resumo compacto gravado no metadata do token**
(§7.6) — o único dado derivado que cruza a mesa, e só os 6 números.

Regras de ouro herdadas do `AGENTS.md`:

- **Nenhum dado de ficha vai para o metadata do token.** O token guarda o link
  (`sheetType`/`sheetId`/`mechId`/`combatantId`) — como já faz `obrBridge.bindTokenToSheet` — e,
  quando os trackers estão ligados, **um resumo dos 6 valores dos trackers** (§7.6). Nada de
  nome, retrato, tags, itens, condições ou qualquer outra parte da ficha. O resumo é uma
  projeção derivada e pública por desenho, não uma cópia da ficha.
- **Nada de rede em watcher de estado.** Aqui não há HTTP nenhum; o desenho é feito com o SDK
  do Owlbear (itens locais da cena).
- i18n para todo texto de UI/rótulo novo.
- `.spec.ts` ao lado do código.

---

## 2. Análise: o que já existe

### 2.1 `owl-trackers/` (o fork do plugin de terceiros, em React)

É um motor **genérico** de trackers, não específico de LANCER:

- Modelo: `Tracker = { id, color, name?, showOnMap?, inlineMath? }` + variantes
  `value` (bolha numérica), `value-max` (barra), `checkbox` (✓/◯), `counter` (bolha ±1).
  Máximo de **12 trackers** por token (`MAX_TRACKER_COUNT`).
- Persistência: array de trackers no **metadata do token** (`com.owl-trackers/trackers`)
  e defaults de cena em `com.owl-trackers/trackers` no metadata da cena.
- Renderização: script de background que reconstrói itens anexados a cada mudança
  (`OBR.scene.local.addItems/deleteItems`) — barras (`buildCurve` com retângulo arredondado),
  bolhas (`buildShape` CIRCLE + `buildText`). Itens identificados por id determinístico
  (`<itemId>-<index>-bar-fill` etc.) e apagados/recriados em bloco.
- UI: embed no menu de contexto (`trackerMenu`) + editor (`editor`/`sceneEditor`).
- **Não tem** variante de quadrados e **não conhece** ficha, sistema ou stats.

Relação com o nosso objetivo: é uma **referência de implementação** (geometria, IDs, diffs),
mas não é o lugar onde a feature vai morar (decisão do usuário). Também é GPLv3 e o README
proíbe reusar nome/logo na store — daí a recomendação de **não copiar código literalmente**
para o `ow`; reimplementar nativo em TS/Vue, com o mesmo vocabulário visual.

### 2.2 `ow` — o que já dá suporte à feature

| Peça | Situação | Uso no plano |
|------|----------|--------------|
| `obrBridge.bindTokenToSheet/unbindToken/getTokenBinding` | pronto | token → ficha (só IDs) |
| `COMPCON_METADATA_KEY` (`com.compcon.activemode`) | pronto | descobrir tokens vinculados |
| `statusMarkerService` | pronto, **padrão a copiar** | itens anexados no mapa, fila por token contra corrida, `cleanupLegacy*`, `clearToken*` |
| `obrBridge.updateTokenVisuals` / `updateTokensForCombatant` | **existem mas ninguém chama** | gancho morto; pode ser reaproveitado/estendido |
| `MechCombatState` (`src/types/compcon-obr.ts`) | sem produtor no código | não tem `speed`/`heatcap`; o plano cria um tipo próprio |
| evento `compcon-combatant-statuses-changed` → `syncCombatantStatusMarkers` | pronto | **padrão de gatilho** estado→token |
| `trackerSyncService` / `trackerSyncPayload` | pronto | é o tracker de **iniciativa** (GM→jogadores). **Não confundir** e não tocar |
| `StatController.getCurrent(key)` / `getMax(key)` | pronto | leitura de todos os 6 valores |
| `StatKey` (`Stats.ts`) | pronto | `hp`, **`overshield` (Blindagem)**, `heat`, `heatcap`, `speed`, `structure`, `stress` |
| i18n (`src/i18n/locales/*.json`, 12 locales) | pronto | rótulos: `PV`, `Calor`, `Estrutura`, `Estresse` já existem |
| `OBR.scene.local` (SDK 2.3) | confirmado em `lib/api/scene/SceneLocalApi.d.ts` | render **por cliente**, sem publicar nada |
| `buildShape(...).shapeType('RECTANGLE')` | confirmado (sem `cornerRadius` no SDK 2.3) | quadrados de Estrutura/Estresse |

### 2.3 Armadilhas encontradas na análise

1. **`mech.CurrentHP` não existe.** O handler `handleReceivedPilotUpdate` do `obrBridge` lê
   `mech.CurrentHP/CurrentHeat/CurrentStructure/CurrentStress` — todos `undefined` (protegidos
   por `!== undefined`, então o código é inerte). O caminho correto é
   `actor.CombatController.StatController`.
2. **"Blindagem" = `overshield` neste fork** (confirmado pelo usuário). O `pt.json` já
   traduz `overshield` como "Blindagem" (linha 156) e `armor` como "Armadura" (linha 1374)
   — é convenção do projeto, não colisão a corrigir. Não usar `armor` como fonte da
   Blindagem; reaproveitar a chave de i18n existente.
3. **`updateTokenVisuals` só sincroniza ícones de status** — não é um tracker de stats;
   reaproveitar o nome para outra coisa gera confusão.
4. **Prewarm iframe**: `obrBridge.init()` roda também no documento de pré-aquecimento
   (`isActiveModePrewarm()`), que não pode mexer em nada visível. O serviço novo precisa do
   mesmo guarda.
5. **Iframe do chat standalone** (`/table-chat`) também inicializa o bridge: decidir se
   desenha lá também (proposta: sim, é só leitura + itens locais).

---

## 3. Decisões

Confirmadas com o usuário:

- **Onde:** dentro do projeto principal `ow` (Vue), não no `owl-trackers`.
- **Fonte dos valores:** automática, da ficha COMP/CON vinculada ao token.
- **Quadrados:** novo *variant* `squares` no motor de trackers (value/max → N quadrados).
- **Quadrado preenchido = valor ATUAL (restante).** `structure.current` de `max` quadrados
  preenchidos; os vazios são o que já foi perdido. `invertSquares` continua existindo como
  opção (marcar dano), mas **desligado por padrão**.
- **Blindagem = Overshield**, numérico **puro** (sem barra): `getCurrent('overshield')`.
  Oculto quando zerado, por padrão (`showBlindagemWhenZero: false`), para não poluir o mapa
  de tokens sem escudo ativo. O mecha nasce com `overshield: 0` e `max: 0`, então é um valor
  só-corrente: mostra `current` e usa `current/max` apenas quando `max > 0`.
- **Rótulos:** `PV`, `Blindagem`, `Calor`, `Movimento`, `Estrutura`, `Estresse`. Reaproveitar
  as chaves de i18n existentes (`stats.overshield` já é "Blindagem", `stats.hp` = "PV" etc.);
  criar chaves novas em `active.tokenTrackers.*` só onde não houver equivalente.
- **Visibilidade para jogadores (confirmada, decidida pelo GM):** por padrão o jogador vê os
  trackers dos **aliados**; os **inimigos** só aparecem se o GM liberar. O GM vê tudo. Detalhes
  em §7.5.
- **Visibilidade (confirmada):** render **local por cliente** (`OBR.scene.local`): os itens de
  desenho são criados em cada janela, não compartilhados. Os valores saem da ficha local quando
  ela existe e do **resumo do token** (§7.6) quando não existe — nunca de um broadcast de stats.
  > As fichas **já** cruzam a mesa (`obrBridge` sincroniza pilotos e NPCs por
  > broadcast/roster), então "resolver localmente" costuma dar certo para aliado **e** inimigo.
  > É justamente por isso que a regra de quem pode ver **não pode** ser derivada da
  > disponibilidade do dado: ela é uma decisão do GM (§7.5). A indisponibilidade vira apenas
  > degradação graciosa ("sem dados aqui").
- **Multi-token desde o desenho (objetivo do usuário):** a unidade de render **não é "o token
  do jogador"**, e sim uma **lista de tokens por janela** (`watchlist`). A lista nasce
  automática (tudo o que for resolvível **e** permitido pela política) e o usuário pode
  **adicionar/remover tokens** nela — o que permite "ver mais de um token". Detalhes em §7.4.
- **Resumo dos trackers no metadata do token (autorizado pelo usuário):** a regra "nenhum dado
  de ficha no token" continua valendo, mas **é permitido** gravar um objeto resumido com os
  valores dos trackers. Ele é o que faz a política de aliados/inimigos funcionar para tokens
  cuja ficha o jogador não tem, **sem** criar canal de broadcast novo. Formato, quem escreve e
  limites em §7.6.

---

## 4. Modelo de dados

Arquivo novo: `src/types/token-tracker.ts`

```ts
/** Formas que o serviço sabe desenhar. */
export type TokenTrackerKind = 'bar' | 'number' | 'squares'

/** Slot lógico do painel. A ordem da lista = ordem de cima para baixo no mapa. */
export type TokenTrackerSlotId = 'pv' | 'overshield' | 'heat' | 'speed' | 'structure' | 'stress'

export interface TokenTrackerSlot {
  id: TokenTrackerSlotId
  kind: TokenTrackerKind
  /** Chave i18n do rótulo. */
  labelKey: string
  /** Cor do tema (src/ui/style/themes/common.ts), por slot. */
  color: string
  /** Número desenhado ao lado de outra barra (Blindagem ao lado do PV). */
  pairWith?: TokenTrackerSlotId
}

export interface TokenTrackerValue {
  current: number
  max: number
}

export type TokenTrackerValues = Partial<Record<TokenTrackerSlotId, TokenTrackerValue>>

/**
 * Resumo dos trackers gravado no metadata do TOKEN (§7.6).
 *
 * É a única coisa derivada de ficha que cruza a mesa além do vínculo. Contém SÓ os 6
 * números — nada de nome, retrato, tags, itens ou condições. Chaves curtas e valores
 * inteiros para o payload ficar na casa das centenas de bytes.
 */
export interface TokenTrackerSummary {
  /** Versão do formato; leitura ignora/rejeita o que não bate. */
  v: 1
  /** PV: [atual, máximo]. */
  pv: [number, number]
  /** Blindagem (overshield): valor atual. */
  ov: number
  /** Calor: [atual, capacidade]. */
  he: [number, number]
  /** Movimento: [atual, máximo]. */
  sp: [number, number]
  /** Estrutura: [atual, máximo]. */
  st: [number, number]
  /** Estresse: [atual, máximo]. */
  ss: [number, number]
  /** Quem gravou por último: 'gm' | id curto do jogador. Resolve corrida entre escritores. */
  w: string
  /** Timestamp da gravação (informativo e desempate). */
  t: number
}

/** Lado do combatente — mesma taxonomia já usada pelo tracker de iniciativa. */
export type TokenTrackerSide = 'ally' | 'enemy' | 'neutral'

/**
 * Política da MESA: o que um jogador pode ver. Decidida pelo GM, gravada no metadata da
 * sala (poucos bytes). Apenas a REGRA cruza a mesa — nunca os valores dos stats.
 */
export interface TokenTrackerPlayerVisibility {
  /** Jogadores veem trackers de aliados. Padrão: true. */
  allies: boolean
  /** Jogadores veem trackers de inimigos. Padrão: false — é o GM que libera. */
  enemies: boolean
  /** Jogadores veem trackers de neutros/doodads. Padrão: true. */
  neutral: boolean
  /**
   * Combatentes ocultos para os jogadores (o Fog of War do GM, hoje `hiddenFromPlayers`
   * no encontro). Nunca aparecem em janela de jogador, seja qual for o lado.
   * Lista limitada (ex.: 120 ids) para o payload continuar pequeno.
   */
  hiddenCombatantIds: string[]
}

/** Configuração (pequena) gravada por sala — só em ação do usuário, nunca em estado de combate. */
export interface TokenTrackerConfig {
  enabled: boolean
  showLabels: boolean
  /** false (padrão) = quadrados preenchidos são o valor ATUAL/restante; true = marcar dano. */
  invertSquares: boolean
  /** Trava de segurança: nunca desenhar mais que isso em cada trilha de quadrados. */
  maxSquares: number
  /** Esconde o número da Blindagem quando o escudo está zerado. */
  showBlindagemWhenZero: boolean
  /** Slot→ligado/desligado, permite ao GM enxugar o painel. */
  slots: Partial<Record<TokenTrackerSlotId, boolean>>
  /** O que os jogadores podem ver (§7.5). Ignorado na janela do GM. */
  playerVisibility: TokenTrackerPlayerVisibility
}

export const DEFAULT_TOKEN_TRACKER_CONFIG: TokenTrackerConfig = {
  enabled: true,
  showLabels: true,
  invertSquares: false,
  maxSquares: 12,
  showBlindagemWhenZero: false,
  slots: {},
  playerVisibility: {
    allies: true,
    enemies: false,
    neutral: true,
    hiddenCombatantIds: [],
  },
}

/**
 * Preferências LOCAIS da janela (não vão para metadata nenhum).
 *
 * A watchlist é a lista de tokens que ESTA janela desenha. Ela começa implícita
 * (todo token permitido pela política com valores disponíveis) e cresce/encolhe por ação
 * do usuário.
 * Persistida com `SetItem('token_tracker_prefs', { id, watchlist })` — a chave `id`
 * é obrigatória (`src/io/Storage.ts`).
 */
export interface TokenTrackerLocalPrefs {
  id: 'token_tracker_prefs'
  /** tokenIds explicitamente adicionados pelo usuário. */
  watchlist: string[]
  /** tokenIds que o usuário removeu da lista automática. */
  muted: string[]
}
```

Slot preset (a "receita LANCER") fica no modelo puro, não na UI:

```ts
export const LANCER_TOKEN_TRACKER_SLOTS: TokenTrackerSlot[] = [
  { id: 'pv',         kind: 'bar',     labelKey: 'stats.hp',          color: '#3f8f5f' },
  { id: 'overshield', kind: 'number',  labelKey: 'stats.overshield',  color: '#82B1FF', pairWith: 'pv' },
  { id: 'heat',       kind: 'bar',     labelKey: 'stats.heat',        color: '#c85217' },
  { id: 'speed',      kind: 'number',  labelKey: 'stats.speed',        color: '#5092a3' },
  { id: 'structure',  kind: 'squares', labelKey: 'stats.structure',    color: '#443fff' },
  { id: 'stress',     kind: 'squares', labelKey: 'stats.stress',       color: '#ab2022' },
]
```

O slot `speed` é o único **dinâmico** do conjunto: o `current` deixa de ser um número fixo lido da
ficha e passa a ser o **movimento restante do turno**, alimentado pelo arrasto do token no mapa.
Os tipos do movimento ficam em `src/types/token-movement.ts` e o desenho no §13.

---

## 5. Leitura do estado (ficha → valores)

Arquivo novo: `src/services/tokenTrackerModel.ts` (**puro**, sem OBR — testável no projeto
Vitest `domain`).

**Ordem de resolução** (a primeira que responder vence):

| # | Fonte | Quando | Observação |
|---|-------|--------|------------|
| 1 | **Ficha local** (StatController do ator) | a janela tem a ficha no seu armazenamento | sempre a mais fresca; é a fonte que o GM usa |
| 2 | **Resumo no metadata do token** (§7.6) | ficha local ausente/incompleta | permite o jogador ver aliado **e** o que o GM liberar, sem canal novo |
| 3 | nada | nenhuma das duas | token fica "sem dados aqui" na lista; nada no mapa |

Declarar a origem junto do valor (`source: 'sheet' | 'token'`) é útil na UI: o painel do GM pode
mostrar que aquele número veio do resumo (dado possivelmente mais velho) em vez da ficha.

Leitura única por chave, independente de Piloto/Meia/NPC/Doodad/Eidolon:

```ts
// combatant.actor → Pilot (usa ActiveMech) | Unit | Doodad | Eidolon
// todos expõem CombatController.StatController
const cc = actor?.CombatController               // dono do StatController, do BoostedSpeed e do Boost
const sc = resolveStatController(actor)          // cc?.StatController
const values: TokenTrackerValues = {
  pv:         { current: sc.getCurrent('hp'),         max: sc.getMax('hp') },
  overshield: { current: sc.getCurrent('overshield'), max: sc.getMax('overshield') }, // Blindagem
  heat:       { current: sc.getCurrent('heatcap'),    max: sc.getMax('heatcap') },
  speed:      { current: sc.getCurrent('speed'),      max: cc.BoostedSpeed },         // RESTANTE / cap do turno (§13)
  structure:  { current: sc.getCurrent('structure'),  max: sc.getMax('structure') },
  stress:     { current: sc.getCurrent('stress'),     max: sc.getMax('stress') },
}
```

- **Blindagem = `overshield`** (`StatKey.OVERSHIELD`). O mecha nasce com `overshield: 0` e
  `max` também 0 (`MechStatProvider`); o valor só sobe quando alguma regra concede escudo.
  Por isso o widget é **numérico puro**, mostra `current`, e por padrão **some quando vale 0**
  (`showBlindagemWhenZero: false`). Se `max > 0`, mostra `current/max`.
- Para `heat`, o `current` pode exceder o cap: a barra enche e recebe tratamento de aviso
  (cor de erro) em vez de estourar a largura.
- **Movimento (§13) é o único slot dinâmico.** `current` é o movimento **restante** — o motor já o
  debita em `CombatController.SpendMovement` — e `max` é o **cap do turno** =
  `CombatController.BoostedSpeed` (`getMax('speed') + BoostBonus`), **não** `getMax('speed')`.
  Antes do primeiro Boost os dois coincidem; depois, não (um Boost de 5 num mecha speed 5 deixa
  `10/10`, não `5/5`). Enquanto nada no mapa escrever no motor, este slot é somente leitura.
- `resolveStatController` resolve, nesta ordem: `actor.CombatController` → `actor` é `Pilot`
  (usa `actor.ActiveMech`) → busca por id em `PilotStore()`/`NpcStore()` quando só o vínculo
  está disponível (`mechId`/`sheetId`).
- Valores são **coagidos**: `Number.isFinite` → `Math.trunc`, `max ≥ 0`, `current` preso em
  `[0, max]` — com as duas exceções acima (Blindagem pode não ter máximo; calor pode passar
  do cap).
- Função pura `buildTrackerSignature(values, config)` → string; usada para não redesenhar o
  que não mudou.

---

## 6. Layout e renderização

### 6.1 Geometria (pura) — `src/services/tokenTrackerLayout.ts`

Entrada: `{ width, height }` do token em unidades de cena, `values`, `config`, `dpi`.
Saída: lista de *draw commands* neutros (sem OBR), prontos para o render:

```ts
type DrawCommand =
  | { kind: 'rect';  id: string; x: number; y: number; w: number; h: number; fill: string; opacity: number }
  | { kind: 'text';  id: string; x: number; y: number; w: number; h: number; text: string; size: number; color: string }
  | { kind: 'square';id: string; x: number; y: number; size: number; filled: boolean; color: string }
```

Regras de layout:

- Origem: abaixo do token (`bounds.max.y`) ou acima, conforme opção da cena (offset igual ao
  que o `owl-trackers` já expõe: `verticalOffset`).
- Largura de referência = largura do token, mínimo/máximo (`clamp`) para tokens muito
  pequenos/grandes.
- Altura de linha: barra 20, número 18, quadrados 12 (com `gap` 4). Escala global `scale`.
- **Linha 1:** a barra de PV perde `numberWidth` (≈ 0,28 × largura) à direita; o número da
  **Blindagem (`overshield`)** ocupa esse espaço → é literalmente "PV (barra) do lado
  Blindagem (numérico)". Sem escudo ativo (e com `showBlindagemWhenZero: false`), o slot é
  omitido e a barra de PV volta a usar a largura cheia.
- **Linhas 4 e 5:** `max` quadrados do mesmo tamanho; **`current` deles preenchidos** (padrão
  confirmado) e o resto vazio — os vazios são a estrutura/estresse já perdidos. Rótulo à
  esquerda quando `showLabels`. Com `invertSquares: true`, inverte (preenchido = perdido).
- `max` acima de `config.maxSquares` → desenha `maxSquares` e anexa `+N` no rótulo.
- **Slot de Movimento (§13):** imprime `restante/cap` e ganha dois estados além dos já previstos
  (o estouro de calor): **Boost concedido** (`BoostBonus > 0` → cor de destaque) e **estouro
  pendente** (o gesto passou do cap e aguarda Boost/Desfazer → cor de erro). A cor do slot deixa de
  ser fixa e passa a vir do estado, como já acontece no calor. Opcionalmente aceita `kind: 'bar'`
  para o jogador enxergar a fração em vez do número.

### 6.2 Render (OBR) — `src/services/tokenTrackerRender.ts`

Converte `DrawCommand[]` em itens do SDK:

- `rect` → `buildShape().shapeType('RECTANGLE')` para fundo (preto, opacidade 0,7) e
  `buildCurve()` com retângulo arredondado para o preenchimento parcial (o SDK 2.3 não tem
  `cornerRadius` em `Shape`; `buildCurve` é o caminho já usado pelo `owl-trackers`).
- `square` → `buildShape().shapeType('RECTANGLE')` (quadrado puro, 1 item por quadrado;
  sem cantos arredondados disponíveis no SDK). Preenchido: `fillOpacity 1` + cor do slot;
  vazio: `fillOpacity 0.12` + `strokeOpacity 0.6`.
- `text` → `buildText()` (`textType('PLAIN')`, `Roboto, sans-serif`), com
  `strokeColor #000` / `strokeWidth 2` para legibilidade sobre qualquer mapa (mesma técnica do
  `statusMarkerService`).

Todos os itens:

```ts
.id(`cc_tt_${tokenId}_${slot}_${part}`)   // determinístico → update em vez de recriar
.layer('ATTACHMENT')
.attachedTo(tokenId)
.locked(true)
.disableHit(true)
.disableAttachmentBehavior(['ROTATION', 'SCALE', 'VISIBLE', 'COPY'])
.visible(token.visible)
.metadata({ [TOKEN_TRACKER_METADATA_KEY]: true, [TOKEN_TRACKER_SLOT_KEY]: slot })
```

Contagem por token (Estrutura 4, Estresse 4): PV 3 + Blindagem 2 + Calor 3 + Movimento 1 +
4 quadrados + 4 quadrados + rótulos ≈ **20 itens locais**. Aceitável; a barra de 12 quadrados
(limite do `maxSquares`) leva a ~35 — daí a trava.

### 6.3 Reconcilição — `src/services/tokenTrackerService.ts`

Mesmo esqueleto do `statusMarkerService` (que já resolveu a corrida de dois syncs para o mesmo
token):

```ts
class TokenTrackerService {
  private queues = new Map<string, Promise<void>>()   // fila por token
  refreshToken(tokenId: string): Promise<void>        // enfileira
  refreshTokensForActor(sheetId: string): Promise<void>
  refreshAll(): Promise<void>
  clearToken(tokenId: string): Promise<void>
  clearAllLegacy(): Promise<void>                     // limpa sobras de sessões antigas

  // watchlist (§7.4)
  addToWatchlist(tokenId: string): Promise<void>
  removeFromWatchlist(tokenId: string): Promise<void>
  getWatchlist(): string[]                            // inclui os resolvíveis automáticos

  // resumo no token (§7.6)
  writeSummary(tokenId: string, values: TokenTrackerValues): Promise<void>  // coalescido
  clearSummary(tokenId: string): Promise<void>                              // remove a chave
}
export const tokenTrackerService = new TokenTrackerService()
```

`applyTokenTrackers(tokenId)`:

1. `OBR.scene.items.getItems([tokenId])` → precisa de `metadata[COMPCON_METADATA_KEY]`.
2. **Sou o escritor do resumo deste token?** (§7.6) Se sim e houver valores novos → enfileira a
   gravação (`writeSummary`), coalescida.
3. **Pode desenhar nesta janela?** = `canRenderToken({ role, side, hidden, isTracked })` (§7.5).
   Se não → `clearToken` e sai.
4. **Está na watchlist desta janela?** (`isTracked(tokenId)` — automáticos + adicionados −
   mutados). Se não → `clearToken` e sai.
5. Resolve `values` (§5): ficha local → resumo do token (`sanitizeTokenTrackerSummary`) → nada.
   Sem nenhuma das duas → `clearToken` (e marca "sem dados aqui" na UI, §7.4).
6. Calcula `drawCommands` (§6.1) e a assinatura.
7. Lê itens existentes marcados com `TOKEN_TRACKER_METADATA_KEY` via
   `OBR.scene.local.getItemAttachments([tokenId])`.
8. Diff: comandos cujo id já existe e cujo conteúdo mudou → `OBR.scene.local.updateItems`;
   ids novos → `OBR.scene.local.addItems`; ids órfãos → `OBR.scene.local.deleteItems`.
9. Assinatura igual à última → no-op (evita churn).

Gatilhos (todos coalescidos, nenhum por clique):

| Evento | Ação |
|--------|------|
| `OBR.scene.onReadyChange(true)` | `refreshAll()` + `clearAllLegacy()` |
| `OBR.scene.items.onChange` | filtra itens com `COMPCON_METADATA_KEY` cujo `position`/`scale`/`visible`/**metadata de vínculo ou resumo** mudou → `refreshToken`; ignora `layer` `ATTACHMENT`/`TEXT` (não realimenta o próprio desenho) e ignora resumo idêntico ao último aplicado (evita laço entre janelas) |
| `OBR.player.onChange` (mudança de papel) | `refreshAll()` |
| evento de janela `compcon-token-trackers-changed` (`{ sheetId?, combatantId? }`) | `refreshTokensForActor` / `refreshAll` |
| mudança da config por sala | `refreshAll()` |
| mudança da política de visibilidade (§7.5) | `refreshAll()` |
| watchlist alterada pela UI | `refreshAll()` |

Debounce de **200 ms** em um `pendingRefresh` (mesmo padrão de `trackerSyncService.publish`),
mais guarda `isActiveModePrewarm()` e `OBR.isAvailable`.

---

## 7. Integração no projeto

### 7.1 `src/services/obrBridge.ts`

- Novos métodos públicos finos, delegando ao serviço:
  `refreshTokenTrackers(tokenId)`, `refreshTokenTrackersForActor(sheetId)`,
  `clearTokenTrackers(tokenId)`, `cleanupLegacyTokenTrackers()`,
  `getTokenTrackerSummary(tokenId)` / `writeTokenTrackerSummary(tokenId, summary)` (§7.6).
- `bindTokenToSheet` → depois do update, `refreshTokenTrackers(tokenId)`.
- `unbindToken` → `clearTokenTrackers(tokenId)` **e** `clearSummary(tokenId)` (não deixar resumo
  órfão que passaria a mentir).
- Em `init()` (bloco `!isStandaloneChat` / `!isPrewarmDocument`): listener do evento
  `compcon-token-trackers-changed` (espelhando o listener de
  `compcon-combatant-statuses-changed`, linhas 157–165) e `cleanupLegacyTokenTrackers()`.
- **Não** mexer em `updateTokenVisuals`/`updateTokensForCombatant` (status) nem no
  `trackerSync` de iniciativa.

### 7.2 Quem dispara o evento de mudança

Composable novo: `src/composables/useTokenTrackerBridge.ts`

- Montado em `src/features/active_mode/index.vue` (e no chat da mesa, se a decisão for desenhar
  lá também).
- `watch` (debounce 200 ms) sobre o estado de combate relevante da janela:
  - GM: `encounterInstance.Combatants` → por combatente,
    `actor.CombatController.StatController.CurrentStats/MaxStats` para as 6 chaves.
  - Jogador dono do token: o mech do piloto ativo (`pilot.ActiveMech.StatController`).
- Ao detectar mudança, `window.dispatchEvent(new CustomEvent('compcon-token-trackers-changed',
  { detail: { sheetId, combatantId } }))`.
- É este mesmo watch que alimenta a **gravação do resumo** (§7.6) na janela eleita como
  escritora — sem caminho de código paralelo.
- Continua valendo a regra do `AGENTS.md`: nenhum I/O de rede aqui — é só leitura reativa
  local + evento de janela.

### 7.3 Gestão (criar/ligar/desligar/configurar)

- **Criação:** automática no vínculo do token (§7.1). Não há passo de "adicionar tracker".
- **Config por sala:** `com.compcon.activemode/token_trackers` no metadata da **sala**
  (payload pequeno, ~200 B), lido/escrito por uma função em `obrBridge`
  (`getRoomTokenTrackerConfig` / `saveRoomTokenTrackerConfig`) e aplicado só quando o usuário
  muda algo na UI — **nunca** dentro de `onMetadataChange` de estado de combate.
- **UI (Vue + Vuetify), F3:**
  - `src/ui/components/TokenTrackers/TokenTrackerSettings.vue` — toggles: ligar/desligar,
    mostrar rótulos, inverter quadrados, um chip por slot (PV, Blindagem, Calor, Movimento,
    Estrutura, Estresse) e a **política de visibilidade para jogadores** (§7.5).
  - Entrada: uma seção em `TableActionDrawer` (junto do `CombatTrackerTab`) **ou** um item no
    `GmToolPalette`. Recomendação: seção no `TableActionDrawer`, ao lado das opções do
    Owlbear, porque já é onde o GM configura a mesa.
  - Menu de contexto (`compcon-bind-token` já existe): item
    **"Trackers: mostrar neste token"** (adiciona à watchlist) — ver §7.4. O filtro do menu
    hoje é `max: 1`; para marcar vários tokens de uma vez, usar o diálogo, não o menu.
- **i18n:** reaproveitar as chaves existentes (`stats.hp`, `stats.overshield`, `stats.heat`,
  `stats.speed`, `stats.structure`, `stats.stress`); criar chaves novas em
  `active.tokenTrackers.*` só para a UI de configuração, nos 12 locales
  (`src/i18n/locales/*.json`), com fallback em pt/en. Convenção adotada (já valendo no
  `pt.json`): **Blindagem = `overshield`**, não `armor`.

### 7.4 Multi-token: a watchlist desta janela

É o ponto que viabiliza "ver mais de um token" sem furar a doutrina (nada de ficha no token,
nada publicado para a mesa). O render é **por janela**, então a lista de tokens desenhados
também é.

**Composição da lista** (`isTracked(tokenId)`):

```
watchlist efetiva = (autoResolviveis ∪ watchlist explicitamente adicionada) − muted
```

- `autoResolviveis`: tokens no mapa cujo vínculo
  (`sheetType`/`sheetId`/`mechId`/`combatantId`) a janela consegue resolver no seu
  armazenamento local — GM: combatentes do encontro ativo; jogador: o próprio mecha e NPCs
  que ele tenha.
- `watchlist`: tokenIds **adicionados à mão** nesta janela (persistidos localmente).
- `muted`: tokenIds que o usuário tirou da lista mesmo sendo resolvíveis (para não desenhar
  aquele NPC específico, por exemplo).

**Persistência:** `SetItem('token_tracker_prefs', { id: 'token_tracker_prefs', watchlist, muted })`
(IndexedDB via `src/io/Storage.ts`, com o `id` obrigatório). **Não** vai para metadata de sala
nem de token: é preferência de janela, por design — cada jogador vê o que quer, e ninguém
descobre a ficha de ninguém por causa disso.

**UI (F4):** novo `src/ui/components/TokenTrackers/TokenTrackerList.vue`

- Lista dos tokens do mapa que têm vínculo de ficha, com: miniatura/nome, chip de estado
  (`dados locais` / `sem dados nesta janela`), checkbox de "desenhar trackers" e botão de
  fixar no topo.
- A lista faz o **toggle direto** de vários tokens (é o caso de uso "quero acompanhar 3
  tokens"), sem depender do menu de contexto do Owlbear — que é single-selection.
- Tokens marcados mas **não resolvíveis** nesta janela ficam na lista com o estado
  "sem dados aqui" e **não desenham nada** (não inventamos placeholder no mapa). Hoje esse caso
  só acontece quando nem a ficha local nem o resumo do token existem (§5, §7.6).

**Robustez:**

- Token apagado da cena ou desvinculado → poda a entrada da watchlist no próximo
  `refreshAll()` (evita lista crescendo com lixo entre sessões).
- Sempre revalidar o vínculo a cada refresh; a watchlist guarda só `tokenId`, nunca valores.
- Ordem de desenho/empilhamento não muda: cada token tem seus próprios itens locais.

### 7.5 Política de visibilidade: aliados por padrão, inimigos a critério do GM

**Regra de negócio:** o jogador vê os trackers dos aliados (padrão); inimigos só se o GM
liberar. O GM vê tudo, sempre.

**O que cruza a mesa:** a **regra** — o metadata da sala leva
`playerVisibility: { allies, enemies, neutral, hiddenCombatantIds }`, alguns booleanos e uma
lista de ids, ~100–300 B. Nenhum valor de stat é **transmitido por broadcast**: os números que
uma janela não consegue tirar da própria ficha vêm do resumo já gravado no token (§7.6). Quem
escreve a política é o GM (ação de UI, nunca estado de combate).

**Por que a regra não pode ser derivada da disponibilidade do dado:** as fichas de pilotos e
NPCs já são sincronizadas para toda a sala pelo `obrBridge` (broadcast de piloto/NPC, rosters na
sala). Ou seja, a janela do jogador normalmente *consegue* ler o PV do inimigo — o dado está lá.
Sem uma política explícita, "inimigo" e "aliado" seriam indistinguíveis e o jogador veria tudo.
A política existe justamente para separar *disponibilidade* de *permissão de exibição*.

**Decisão por token** — função pura em `tokenTrackerModel.ts` (testável sem OBR):

```ts
export interface RenderDecisionInput {
  role: 'GM' | 'PLAYER'
  side: TokenTrackerSide | 'unknown'
  /** Combatente oculto para os jogadores (ex.: `hiddenFromPlayers` do encontro). */
  hiddenFromPlayers: boolean
  /** Está na watchlist efetiva desta janela? (§7.4) */
  isTracked: boolean
  /** Há valor desenhável para este token nesta janela? (ficha local ou resumo do token) */
  hasValues: boolean
  config: TokenTrackerConfig
}

export function canRenderToken(input: RenderDecisionInput): boolean
```

Regras, em ordem:

| # | Condição | Resultado |
|---|----------|-----------|
| 1 | `config.enabled === false` | não desenha (ninguém) |
| 2 | `isTracked === false` (mutado ou fora da watchlist) | não desenha **nesta janela** |
| 3 | `role === 'GM'` | desenha (o GM vê tudo o que está no mapa) |
| 4 | `hiddenFromPlayers === true` | **não** desenha para jogador, mesmo aliado |
| 5 | `side === 'ally'` | desenha se `playerVisibility.allies` |
| 6 | `side === 'enemy'` | desenha se `playerVisibility.enemies` (padrão: **não**) |
| 7 | `side === 'neutral'` ou `'unknown'` | desenha se `playerVisibility.neutral` |
| 8 | sem valor em lugar nenhum (ficha nem resumo) | nada no mapa; o token aparece na lista como "sem dados aqui" |

> Sobre `unknown`: token vinculado a uma ficha que não está em nenhum encontro do GM (ex.: um
> doodad do cenário, ou um token vinculado pelo próprio jogador) não tem lado. Cai no balde
> `neutral`, que é visível por padrão. Se preferir o conservador, é só virar
> `playerVisibility.neutral` para `false` — a função já cobre os dois casos.

**De onde vem o `side` de cada token:**

| Janela | Fonte |
|--------|-------|
| GM | `combatant.side` do encontro ativo (o GM tem o encontro inteiro) |
| Jogador | `SyncedTrackerCard.side` do snapshot de iniciativa que ele **já recebe** (`trackerSyncService`) — casando `combatantId` do vínculo do token com o card |
| Fallback | `'unknown'` → tratado como `neutral` |

Nada novo precisa ser transmitido para o lado: a taxonomia `ally | enemy | neutral` e o
`combatantId` já viajam no snapshot de iniciativa, e o token já carrega `combatantId`.

**Fog of War (`hiddenCombatantIds`):** reusa o conceito que já existe no projeto
(`combatant.hiddenFromPlayers`, que o `trackerSyncPayload` respeita omitindo cards). O GM
publica a lista junto da política; a janela do jogador consulta por `combatantId`. Limite de
ids com truncamento + aviso, no espírito de `fitSnapshotToBudget`.

**UI (F4)** — na `TokenTrackerSettings.vue`:
"Jogadores podem ver trackers de:" `[x] Aliados` `[ ] Inimigos` `[x] Neutros`.
Na `TokenTrackerList.vue`, cada token ganha um olho de "ocultar dos jogadores" (grava o id na
lista de ocultos) e um chip do lado resolvido (`Aliado` / `Inimigo` / `Neutro` / `Sem lado`),
para o GM enxergar o efeito da política antes de aplicar.

**Casos de borda:**

- GM fecha a janela: a política já gravada no metadata da sala continua valendo.
- GM muda o lado de um combatente no meio do combate → `refreshAll()` (o snapshot de iniciativa
  já republica por mudança de estrutura do encontro).
- Jogador tenta adicionar à watchlist um inimigo com `enemies: false` → a política é o teto: o
  item entra na lista, mas fica marcado "bloqueado pelo mestre" e não desenha.
- **A política é um portão de exibição, não um cofre.** Item metadata do Owlbear é legível por
  qualquer cliente da sala — o resumo (§7.6) está lá para quem quiser ler. O portão impede o
  vazamento *acidental* na UI (o que é o caso de uso real: não estragar a surpresa da mesa),
  não um cliente adulterado. Está registrado em §11.

### 7.6 Resumo dos trackers no metadata do token

**O que é:** um objeto pequeno (`TokenTrackerSummary`, §4) com os 6 valores, gravado no metadata
do próprio token sob uma chave própria:

```ts
export const TOKEN_TRACKER_SUMMARY_KEY = 'com.compcon.activemode/trackers'
```

> Chave **distinta** do vínculo (`COMPCON_METADATA_KEY = 'com.compcon.activemode'`) e
> independente de `com.owl-trackers/trackers` (o array do plugin de terceiros). Segue o mesmo
> padrão de sufixo já usado por `.../pilot_roster`, `.../npc_roster` e `.../tracker_sync`.

**Por que existe:** é o que permite aplicar a política da §7.5 a tokens cuja ficha a janela não
tem. Sem ele, "jogador vê aliado" só funcionaria quando a ficha do aliado já estivesse no
armazenamento local — e "GM libera inimigo" não funcionaria de forma confiável. Com ele, **não
é preciso canal novo**: item metadata já é compartilhado pela sala. Isso **elimina** a antiga
fase F6 (broadcast de valores).

**O que NUNCA entra:** nome, retrato, tags, itens, condições, HP máximo de componentes, ficha
serializada, histórico. Só os 6 números + `v`/`w`/`t`. O objeto inteiro fica na casa das
centenas de bytes.

**Quem escreve (eleição de escritor, evita briga entre clientes):**

| Janela | Escreve o resumo de… |
|--------|----------------------|
| GM presente na sala | **todos** os tokens com trackers habilitados e vínculo resolvível |
| Jogador | **apenas** os tokens cujo `sheetId`/`mechId` é o piloto ativo dele (fallback para quando não há GM na sala) |
| Qualquer um | nunca escreve se `config.enabled === false` |

- O campo `w` (`'gm'` ou id curto do jogador) e `t` (timestamp) ficam no objeto: o leitor usa
  o mais recente em caso de corrida, e a janela do jogador só sobrescreve se ninguém escreveu
  nos últimos segundos (senão o GM, que tem a visão completa, manda).
- **Igual ao `obrBridge` fazer de conta que a ficha é a fonte da verdade:** o resumo é
  *espelho derivado*. A ficha nunca é atualizada a partir dele.

**Escrita coalescida e barata (regra de ouro do `AGENTS.md` respeitada):**

- Só dispara por **mudança de valor** (assinatura), nunca a cada render/clique.
- Debounce de 200 ms + throttle mínimo de ~1 s por token.
- Gravação em lote: um único `OBR.scene.items.updateItems([...ids], draft => …)` por rodada,
  como o `statusMarkerService` já faz.
- Ao desabilitar os trackers, desvincular o token ou apagar a ficha: **remover a chave** do
  metadata (não deixar resumo órfão, que envelheceria mentindo).
- Token apagado leva o metadata junto (nada a limpar). Sobras de sessões antigas entram no
  `cleanupLegacyTokenTrackers()`.

**Leitura defensiva (o metadata é dado de fora desta janela):**

- `sanitizeTokenTrackerSummary(value)`: rejeita se `v !== 1`, se não houver as 6 chaves, ou se
  algum número não for finito. Coage para inteiro, aplica `clamp` (`current` em `[0, max]`,
  exceto calor), usa o formato para reconstruir `TokenTrackerValues`.
- Resumo velho (`t` antigo) **não é usado** para o token quando a janela tem a ficha local: a
  ficha ganha (§5).
- `w`/`t` desconhecidos não quebram nada — só desempatam.

**Efeito colateral a tratar:** gravar no metadata do token dispara `OBR.scene.items.onChange`
em **todas** as janelas, inclusive na que escreveu. Como a assinatura já corta regravações
idênticas, não há laço; mas o handler de `onChange` precisa:
(i) tratar mudança de metadata de token como gatilho de refresh;
(ii) ignorar eventos cujo resumo é igual ao último aplicado.

---

## 8. Arquivos tocados

| Arquivo | Ação |
|---------|------|
| `src/types/token-tracker.ts` | **novo** — tipos, preset LANCER, config default |
| `src/services/tokenTrackerModel.ts` | **novo** — resolver de ficha, valores, sanitização, assinatura (puro) |
| `src/services/tokenTrackerLayout.ts` | **novo** — geometria → `DrawCommand[]` (puro) |
| `src/services/tokenTrackerRender.ts` | **novo** — `DrawCommand[]` → itens OBR |
| `src/services/tokenTrackerService.ts` | **novo** — fila, diff, eventos, limpeza |
| `src/composables/useTokenTrackerBridge.ts` | **novo** — watch reativo → evento de janela |
| `src/services/obrBridge.ts` | editar — métodos finos, hooks em bind/unbind, listener, cleanup, leitura/escrita da política da sala; constantes de metadata |
| `src/features/active_mode/index.vue` | editar — montar o composable |
| `src/ui/components/TokenTrackers/TokenTrackerSettings.vue` | **novo** (F4) — config da sala |
| `src/ui/components/TokenTrackers/TokenTrackerList.vue` | **novo** (F4) — watchlist multi-token (§7.4) + olho de ocultar dos jogadores e chip de lado (§7.5) |
| `src/ui/components/TableActionDrawer/*` | editar — ponto de entrada da config (F4) |
| `src/i18n/locales/*.json` (12) | editar — chaves novas |
| `src/services/tokenTrackerWatchlist.ts` | **novo** — composição/persistência local da watchlist (§7.4, puro + `Storage`) |
| `src/services/tokenTrackerSummary.ts` | **novo** — formato do resumo, sanitização, eleição de escritor, throttle (§7.6, puro + OBR isolado) |
| `src/services/tokenTrackerPolicy.ts` | **novo** — política por lado + sanitização do payload da sala (§7.5, puro) |
| `src/types/token-movement.ts` | **novo** (§13) — tipos do movimento, config default |
| `src/services/tokenMovement.ts` | **novo** (§13) — custo, classificação, decisão de cap/boost (**puro**) |
| `src/services/tokenMovementCapture.ts` | **novo** (§13) — snapshot de posição, settle, `getDistance`, `SpendMovement` |
| `src/ui/components/TokenTrackers/TokenTrackerPanel.vue` | editar (§13) — controles de movimento (livre armado, reverter) |
| `src/services/*.spec.ts` | **novos** — model, layout, render, watchlist, movimento (§13) |

Nada em `owl-trackers/` é alterado.

---

## 9. Fases

> **Progresso:** F0 ✅, F1 ✅, F2 ✅, F3 ✅, F4 ✅ e F5 ✅ (parte automatizada) —
> suíte completa **2012 passando** (151 arquivos, zero falhas), `npm run typecheck` limpo e
> `npm run build` ok (`✓ built in 20.11s`).
> **Movimento dinâmico (§13):** M0 ✅ (tipos + `decideMovement` + `classifyMode`/`classifyMovementKind`),
> V0 ✅ (identificadores confirmados pelo usuário), M1 ✅ (captura + gasto + diff puro + cores de
> estado); M2/M3 pendentes. O máximo do slot `speed` já lê `BoostedSpeed` (§5).
> Arquivos: `src/types/token-tracker.ts`, `src/services/tokenTracker{Model,Policy,Summary,Layout,Render,Watchlist,Service}.ts`
> (+ `.spec.ts`), `src/composables/useTokenTrackerBridge.ts`, `src/ui/components/TokenTrackers/*`,
> integração em `src/services/obrBridge.ts`, `src/App.vue` e `src/features/active_mode/TableChatView.vue`,
> i18n em `pt.json`/`en.json`.
> **Pendente (humano, em sala real):** executar `docs/roteiro-token-trackers.md`. Nada do
> comportamento no canvas (âncora dos itens, corrida entre janelas no resumo, política vista por
> dois clientes) pode ser validado fora de uma sala do Owlbear.
>
> **Diagnóstico:** `src/services/tokenTrackerDebug.ts`, **ligado por padrão** em nível `summary`.
> `__ccTokenTracker.{level,summary,verbose,off,dump}()` no console da janela da extensão. O nível
> `summary` responde "por que não debitou / não atualizou" (fonte escolhida, token sem valor,
> resumo gravado e **todo gesto de movimento**); `verbose` responde "por que não aparece" (cada
> rodada de refresh, cada add/update/delete de item, slots descartados com motivo). O roteiro em
> `docs/roteiro-token-trackers.md` tem as tabelas de leitura. Foi este diagnóstico que entregou o
> `heat` lido da chave errada, o mecha do Hangar vencendo a ficha ativa, a cópia do encontro com o
> calor de verdade e o `slotsDesligados` do Estresse.
>
> **Correções de robustez que saíram daí:** (1) o serviço agora sobe também na janela de
> chat/ações — antes ele ficava fora do bloco `!isStandaloneChat`, e é justamente nessa janela
> que fica o painel; (2) os rosters locais (`PilotStore`/`NpcStore`) são carregados pelo serviço
> quando vazios, senão uma janela que nunca abriu o Hangar não encontrava ficha nenhuma;
> (3) piloto sem `ActiveMech` nesta janela cai no primeiro mecha dele.
>
> **Falha pré-existente (não é desta feature):** `src/__tests__/rules/coverage.spec.ts` acusava
> `T-MARKER-order-01..04` sem regra correspondente; já resolvida no repositório — a suíte está
> inteiramente verde.
>
> **Nota de ambiente:** o `vite build` falha ao remover o temporário do esbuild no `%TEMP%` padrão
> (`Access is denied`). Rodando com `TEMP`/`TMP` dentro do workspace, o build passa.
>
> **Movimento dinâmico (§13):** fases próprias **M0–M3** mais o spike **V0**, ainda **não
> iniciadas**. A numeração é separada de F0–F5 de propósito — aquele bloco está concluído, e a
> única coisa que o movimento compartilha com ele é o slot `speed`.

**F0 — Contratos ✅ (concluída).** Tipos, preset LANCER, config default, resolver de ficha,
`canRenderToken` (§7.5) e o formato do resumo (§7.6) com sanitização e eleição de escritor.
*Entregue:* `src/types/token-tracker.ts`, `tokenTrackerModel.ts`, `tokenTrackerPolicy.ts`,
`tokenTrackerSummary.ts` + specs.
*Critério atendido:* `structure = 0`, Blindagem lida de `overshield` (não de `armor`), matriz da
§7.5 coberta linha a linha, resumo rejeitando versão/chave/número inválidos.

**F1 — Geometria + render puro ✅ (concluída).** `tokenTrackerLayout.ts` (comandos de desenho
neutros) + `tokenTrackerRender.ts` (itens do SDK) + `roundedBarPoints`.
*Critério atendido:* token pequeno/grande/degenerado, `max = 0`, `current > max` (calor
estourando), Blindagem zerada (some e devolve a largura à barra de PV) e com valor (bolha à
direita da barra), `maxSquares` excedido com `+N`, `invertSquares` ligado/desligado, empilhamento
sem sobreposição, ids determinísticos e camadas.
*Nota:* os builders do SDK exigem o `playerId` do message bus, então a spec do render mocka o
SDK com um proxy **estrito** (método desconhecido estoura) — valida quais métodos chamamos sem
inventar API.

**F2 — Serviço e resumo ✅ (concluída).** `tokenTrackerService` (fila por token, assinatura para
cortar redesenho, diff add/update/delete nos itens locais), resumo no metadata do token com
eleição de escritor e throttle, watchlist local, e integração no `obrBridge` (get/save da config
da sala, delegados, hooks em `bindTokenToSheet`/`unbindToken`, limpeza no boot).
*Critério (verificação em sala real pendente na F5):* painel aparece para o GM ao vincular;
desvincular apaga painel **e** resumo; sem laço de `onChange`.

**F3 — Gatilhos reativos ✅ (concluída).** `src/composables/useTokenTrackerBridge.ts` montado no
`App.vue`: assinatura reativa de tudo que o painel desenha (combatentes do encontro no GM +
ficha própria no jogador) → evento de janela coalescido (200 ms) → `refreshAll`. Também registra
o **encontro ativo** como fonte do serviço (lado e Fog of War) e carrega os encontros ativos
quando o handshake do Owlbear confirma que a janela é GM.

**F4 — Gestão, watchlist, política e i18n ✅ (concluída).** Aba **"Trackers do Token"** na janela
Ações da Mesa & Chat (`TokenTrackerPanel.vue`), com `TokenTrackerSettings.vue` (config da sala:
ligar/desligar, rótulos, quadrados invertidos, teto de quadrados, chips por slot e a política
Aliados/Inimigos/Neutros) e `TokenTrackerList.vue` (watchlist multi-token, chip de lado, motivo do
desenho e olho de ocultar dos jogadores). Chaves `active.tokenTrackers.*` no `pt.json` e `en.json`
(30 chaves cada; os outros locales caem no fallback `en`).

**F5 — Verificação ✅ (automatizada).** `npm run typecheck` limpo, **1949 testes** passando (a
única falha é a pré-existente de regras de marcador) e `npm run build` ok.
*Pendente (humano):* roteiro em `docs/roteiro-token-trackers.md`, que cobre painel, desenho,
tempo real, **política vista por dois clientes**, multi-token, inspeção do resumo no metadata,
limpeza e ausência de laço.

**Nota (ex-F6) — broadcast de valores: descartado.** A ideia original (publicar os valores para
a mesa) deixou de ser necessária: o **resumo no metadata do token** (§7.6) cumpre o papel usando
um canal que já é compartilhado, sem protocolo novo, sem throttle de sala e sem sanitização de
mensagem de rede. Se um dia aparecer necessidade de dado **em tempo real** mais fino que o
throttle de ~1 s, aí sim se reabre a discussão de broadcast — não antes.

---

## 10. Testes

- **Unitários (projeto `domain`, `src/services/**/*.spec.ts`):**
  `tokenTrackerModel.spec.ts` (leitura por tipo de ator, coerção, clamp, assinatura, **matriz de
  `canRenderToken` da §7.5**),
  `tokenTrackerLayout.spec.ts` (geometria, linhas, larguras, quadrados, labels),
  `tokenTrackerRender.spec.ts` (ids determinísticos, metadata, camadas, cores por estado),
  `tokenTrackerWatchlist.spec.ts` (§7.4: automáticos ∪ adicionados − mutados, poda de token
  inexistente/desvinculado, persistência com `id`),
  `tokenTrackerSummary.spec.ts` (§7.6: sanity do formato, rejeição de `v` errado/número não
  finito, round-trip `values ↔ summary`, eleição de escritor — GM escreve tudo, jogador escreve
  só o próprio, ninguém escreve com trackers desligados), e
  `tokenTrackerPolicy.spec.ts` (sanitização do `playerVisibility` vindo da sala: tipos
  coagidos, `hiddenCombatantIds` limitado e deduplicado, default seguro quando o metadata está
  corrompido), e
  `tokenMovement.spec.ts` (§13.4: matriz de `decideMovement` — voluntário/livre/involuntário,
  imobilizado, dentro do cap, estouro com e sem Boost legal, `spaces = 0`, classificação de `mode`
  na fronteira do move padrão, e o caso "`remaining` já é 0").
  Nada de OBR nesses testes → funções puras obrigatórias.
- **Componente (projeto `component`):** só se a UI de config/lista ganhar lógica própria
  (mapeamento de chips → config, montagem da watchlist, estado "bloqueado pelo mestre").
- **Manual (roteiro em `docs/`):** GM com 3 tokens (mecha PC aliado, unit inimigo, doodad
  neutro) + 1 jogador; vincular/desvincular; **conferir o resumo no metadata do token pelo
  inspetor do Owlbear: só os 6 números, e a chave some ao desvincular**; conferir a política
  default (jogador vê aliado e neutro, não vê inimigo), depois virar "Inimigos" e ver aparecer
  na janela do jogador; **o jogador vê o aliado mesmo sem ter a ficha dele** (valor vindo do
  resumo); ocultar um aliado e conferir que só a janela do jogador perde o painel; marcar 2–3
  tokens na lista e conferir que os 3 desenham; mudar PV e calor; estourar calor; conceder e
  consumir **Blindagem (overshield)** conferindo que o número aparece e some no zero; levar dano
  de estrutura até 0; trocar tema claro/escuro; reload da sala; sair e voltar da cena.

---

## 11. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Churn de itens (recriar tudo a cada tick) | ids determinísticos + diff + assinatura; debounce 200 ms |
| Loop de `items.onChange` (o desenho dispara o próprio handler) | filtrar itens com `COMPCON_METADATA_KEY` e ignorar camadas `ATTACHMENT`/`TEXT` (padrão do `owl-trackers`) |
| Corrida de dois syncs no mesmo token | fila por token (padrão `statusMarkerService`) |
| Itens órfãos (token apagado, extensão recarregada) | anexos caem junto com o token; `clearAllLegacy()` no `onReadyChange` |
| Jogador não vê os outros tokens | o padrão agora é ver **aliados** e neutros (política do GM, §7.5); a watchlist (§7.4) permite escolher **quais** tokens acompanhar; os valores vêm do resumo do token (§7.6) quando a ficha não está na janela |
| Watchlist apontando para token inexistente/desvinculado | poda no `refreshAll()`; guardar só `tokenId`, nunca valores |
| Token marcado sem dados locais | estado explícito na lista ("sem dados aqui") e nada desenhado no mapa; sem placeholder enganoso |
| **Jogador ver o inimigo por engano** (fichas já cruzam a mesa, então o dado está lá) | a exibição é decidida **só** pela política do GM (§7.5), nunca pela disponibilidade do dado; default `enemies: false`; `canRenderToken` é o único ponto de decisão, coberto por spec |
| **Política é portão de UI, não cofre** (o resumo fica no item metadata, legível por qualquer cliente) | aceito e documentado: protege contra vazamento acidental na mesa, não contra cliente adulterado — o Owlbear nunca foi fronteira de confiança |
| Política da sala corrompida/ausente | sanitização pura com default seguro (`allies: true`, `enemies: false`, `neutral: true`, lista vazia); nada de confiar no metadata de fora |
| Resumo no token divergir da ficha | resumo é espelho derivado e nunca escreve de volta na ficha; quando a janela tem a ficha local, **ela ganha** (§5); removido ao desvincular/desligar; `t`/`w` desempatam corrida entre escritores |
| Resumo envelhecer (GM fecha a janela no meio do combate) | a última gravação continua válida; ao reabrir, o GM regrava por mudança de assinatura. Se a mesa exigir frescor absoluto, é o gatilho para reabrir a discussão de broadcast (F6) |
| Laço de gravação entre janelas (metadata → onChange → grava de novo) | assinatura por token + filtro de "resumo igual ao último aplicado" + throttle de 1 s; gravação em lote único |
| Resumo órfão de token apagado/desvinculado | token apagado leva o metadata; desvincular/desligar chama `clearSummary`; `cleanupLegacyTokenTrackers()` varre sobras |
| Payload da política crescer (muitos ocultos) | `hiddenCombatantIds` com limite + dedupe e truncamento; a regra é de UI, então nunca entra em estado de combate |
| Duplicidade com o `owl-trackers` instalado | desenhar em offset/layer distintos (ATTACHMENT vs camadas do plugin) e avisar na doc: não usar os dois no mesmo token |
| i18n: 12 locales | adicionar só em pt/en e deixar fallback; rodar checagem de chaves |
| Performance com muitos tokens | a watchlist limita o que é desenhado; `maxSquares` e assinatura limitam o custo por token |
| **Gasto de movimento debitado duas vezes** (a mesma janela processa o gesto duas vezes, ou duas janelas se acham donas) | atribuição única por `Item.lastModifiedUserId`; só a janela que moveu debita; na dúvida **não** debita (§13.3); o débito é idempotente por gesto (marca o `gestureKey` já aplicado) |
| `items.onChange` disparando dezenas de vezes por segundo durante o arrasto | debounce de *settle* de 250 ms por token antes de fechar o gesto (§13.3); nunca debitar por frame |
| Distância em linha reta subestimar quem contorna obstáculo | limitação aceita e documentada (§13.9); o número é o da métrica da grade, não o do caminho |
| Cena em `EUCLIDEAN` devolver distância fracionária | arredondar para cima e avisar uma vez; o alvo do LANCER é `CHEBYSHEV` (1 célula = 1 espaço) |
| `SpendMovement` clampando em 0 e perdendo o excedente | decidir **antes** de gastar: `decideMovement` roda primeiro e o cartão de estouro usa o valor original (§13.4) |
| Reverter um movimento que só coube por Boost | o Boost não é desfeito (já consumiu o quick e está no log); o diálogo diz isso explicitamente (§13.6) |
| Empurrão do GM cobrado como movimento do jogador | movimento cuja atribuição não é desta janela é involuntário e não debita (§13.3) |
| Token sem ficha/ator no mapa | sem `CombatController` não há cap nem débito; o slot fica sem dados, como o resto do painel (§5) |

---

## 12. Fora de escopo (v1)

- Editar os valores pelo mapa (clicar no tracker para alterar) — a fonte é a ficha.
- Trackers para pilotos a pé (sem mecha), itens, ou qualquer stat além dos 6.
- Qualquer dado no resumo além dos 6 números: nome, retrato, tags, itens, condições, ficha
  serializada ou histórico de combate.
- Política por jogador individual: a visibilidade é **por lado e por sala** (aliados/inimigos/
  neutros), não "o jogador X não vê o aliado Y" — para isso já existe o olho de ocultar por
  token (§7.5).
- Broadcast de valores em tempo real (< 1 s): o resumo no token cobre o caso; reabrir só se
  aparecer necessidade real (ver a nota no §9).
- **Terreno, elevação e caminho (§13.9):** custo de terreno difícil, THT/elevação e o traçado do
  caminho andado. O Owlbear não expõe nada disso; `getDistance` é a menor distância pela métrica da
  grade.
- **Interceptar o arrasto antes dele acontecer (§13.10):** exige uma ferramenta customizada
  (`ToolMode`). O v1 corrige **depois** que o movimento assentou.
- **Retraçar o caminho ao reverter:** o v1 devolve o token à posição inicial do gesto em linha
  reta, não pelo caminho que ele andou.
- Alterar/remover `owl-trackers/` do repositório.

---

## 13. Movimento dinâmico: ligar o arrasto do token ao gasto de movimento

> Escopo: transformar o slot `speed` (§1, hoje um número estático lido da ficha) em um tracker
> **vivo** — o movimento restante do turno, que cai quando o token é arrastado no mapa, aceita
> Boost quando estoura o cap e volta ao normal no fim do turno.
>
> **Isto não é um porte do Lancer Automations (Foundry).** Lá o tracker reconstrói um modelo de
> bandas do zero porque o Foundry não tem regra de LANCER nenhuma. Aqui o motor de regras **já
> existe** (§13.1) — o trabalho é de fiação, não de reimplementação. O que o Foundry entrega e o
> Owlbear não entrega está em §13.9 e fica fora do v1.

### 13.1 O que o motor já resolve

| Peça | Onde | O que dá |
|---|---|---|
| `StatController` `SPEED` | ficha do ator | `current` = movimento **restante**, `max` = speed |
| `CombatController.BoostedSpeed` | `CombatController.ts` | `getMax(speed) + BoostBonus` = **cap do turno** |
| `CombatController.Boost()` | `BaseActions.boost` | `BoostBonus += speed` **e** `bumpCurrentStat(SPEED, +speed)`; consome quick |
| `CombatController.SpendMovement(n, mode)` | `CombatController.ts` | debita o restante e registra `move` no log de combate |
| `CanActivate('boost')` | `ActionPoolController` | legalidade — `slow` e `immobilized` negam boost; `stunned`/`jammed`/`downandout` negam tudo |
| `StatusRules` | `StatusRules.ts` | `immobilized: denies ['move','boost']`, `slow: denies ['boost']`, `prone ⇒ slow` |
| `OverchargeApplies` | `ActionPoolController` | segundo Boost |
| `standUp()` | `BaseActions.ts` | levantar consome o move padrão inteiro |

Consequência de projeto: **não há bandas para calcular nem cap a derivar.** O cap é `BoostedSpeed`,
o gasto do turno é `BoostedSpeed - getCurrent(SPEED)`, e conceder Boost é uma chamada de engine.
O que o LA chama de legs (`standard`/`boost`/`over-boost`) aqui já é o par
(`SPEED` corrente, `BoostBonus`).

### 13.2 O gap real

1. Arrastar um token no Owlbear **não toca no motor**: o número na tela nunca cai sozinho.
2. O slot imprime `getMax('speed')`, mas depois de um Boost o cap é `BoostedSpeed` (§5, corrigido).
3. Não há sinal de estouro de cap nem oferta de Boost.
4. Nada distingue movimento **voluntário** de **involuntário** (empurrão do GM).
5. Não há reverter.

### 13.3 Captura: `items.onChange` + snapshot

O SDK não tem gancho de "antes/depois do movimento": o único sinal é
`OBR.scene.items.onChange`, que entrega a **lista inteira** a cada mudança, **sem diff**. A captura
é, portanto, um diff nosso.

Arquivo novo: `src/services/tokenMovementCapture.ts`

```ts
// O snapshot guarda o CENTRO do token, não o canto: `position` cru erra diagonal em
// token de tamanho ímpar.
const lastSeen = new Map<string, Vector2>()
const gestureStart = new Map<string, { center: Vector2; corner: Vector2 }>()
const settleTimers = new Map<string, ReturnType<typeof setTimeout>>()

const SETTLE_MS = 250
```

Fluxo:

1. `onChange(items)` → para cada item de token (`layer === 'CHARACTER'`), compara a posição com o
   snapshot.
2. Primeira divergência → grava o gesto (canto + centro, via `getItemBounds`) e liga o timer de
   *settle*.
3. Cada divergência seguinte apenas reinicia o timer.
4. `SETTLE_MS` sem mexer → o gesto **assentou**: fecha o movimento e decide o gasto (§13.4).
5. O ponto final vira o novo `lastSeen`.

**Distância** — o centro, não o canto (`OBR.scene.items.getItemBounds([id])` devolve `center`):

```ts
const spaces = await OBR.scene.grid.getDistance(startCenter, endCenter)
```

`getDistance` devolve **células** pela métrica da cena (a doc oficial é explícita: "an integer of how
many grid cells were traversed"; só em `EUCLIDEAN` é fracionário). Em LANCER 1 célula = 1 espaço,
então o valor **já é o gasto em espaços** — desde que a cena esteja em `CHEBYSHEV` (diagonal = 1).
Cena em `EUCLIDEAN` devolve fracionário: arredondar para cima e avisar uma vez.

**Atribuição — quem debita.** `Item.lastModifiedUserId` diz qual cliente mexeu no item por último.
Se for **esta** janela, o movimento é voluntário e é **esta janela que debita no motor**; se for
outra, é involuntário e ninguém debita.

| Situação | Classificação | Debita? |
|---|---|---|
| `lastModifiedUserId` = esta janela | **voluntário** | sim, `mode` conforme §13.4 |
| esta janela + movimento livre armado (§13.7) | **livre** | não |
| `lastModifiedUserId` = outra janela | **involuntário** (empurrão/teleporte do GM) | não |
| ator com `immobilized` | **bloqueado** | não (e o v1 devolve o token, §13.5) |
| token sem `CombatController` (sem ficha) | **sem dados** | não |

> **Verificar no spike V0:** se `Item.lastModifiedUserId` e `OBR.player.id` são o mesmo espaço de
> identificadores. Se não forem, a comparação precisa ser com `getConnectionId()`. O fallback
> (na dúvida, **não** debitar) continua correto nos dois casos: melhor sobrar movimento do que
> cobrar duas vezes.

### 13.4 Gasto e cap

Arquivo novo: `src/services/tokenMovement.ts` (**puro**, testável no projeto `domain`).

```ts
export interface MovementInput {
  /** Espaços do gesto (getDistance, já em células = espaços). */
  spaces: number
  /** Movimento restante agora (getCurrent(SPEED)). */
  remaining: number
  /** BoostBonus corrente. */
  boostBonus: number
  /** getMax(SPEED) — o move padrão. */
  maxSpeed: number
  /** CanActivate('boost'). */
  canBoost: boolean
  /** Atribuição do gesto (§13.3). */
  kind: 'voluntary' | 'involuntary' | 'free'
  immobilized: boolean
}

export interface MovementDecision {
  action: 'spend' | 'offer-boost' | 'reject'
  spend: number
  mode: 'move' | 'boost'
  reason?: 'free' | 'involuntary' | 'immobilized' | 'over-cap-no-boost'
}

export function decideMovement(input: MovementInput): MovementDecision
```

Regras, em ordem:

1. `kind === 'involuntary'` → `reject` (`reason: 'involuntary'`).
2. `kind === 'free'` → `reject` (`reason: 'free'`).
3. `immobilized` → `reject`.
4. `spaces <= remaining` → `spend`.
   `mode` = `'boost'` quando `boostBonus > 0` **e** o gasto passa do move padrão
   (`(BoostedSpeed - remaining) + spaces > maxSpeed`), senão `'move'`. É a mesma classificação de
   leg que o cartão de combate já usa.
5. `spaces > remaining` e `canBoost` → `offer-boost` (§13.5).
6. `spaces > remaining` e **não** `canBoost` → `reject` (`reason: 'over-cap-no-boost'`).

**Ordem obrigatória: decidir antes de gastar.** `SpendMovement` faz
`Math.max(0, from - spent)` — ele **clampa em 0** e joga fora o excedente. Um gasto de 9 com 5
restantes viraria "5" silenciosamente e não haveria como oferecer Boost depois.

```ts
// decideMovement já garantiu spaces <= remaining
cc.SpendMovement(decision.spend, decision.mode)
```

O `Record('move', …)` que o próprio `SpendMovement` faz é o log de combate — **não** registrar de
novo.

### 13.5 Estouro de cap e Boost

Sem ferramenta customizada (§13.10), o v1 corrige **depois** que o gesto assentou. O token já andou
no mapa; a escolha é do jogador:

```
MOVIMENTO ACIMA DO CAP — 9/5
Este movimento excede o movimento restante (5) sem Boost.
[ Boost (+5) ]   [ Desfazer ]
```

- **Boost:** `cc.CanActivate('boost')` → `cc.Boost()`. O `boost()` do motor já soma
  `BoostBonus += speed` **e** `bumpCurrentStat(SPEED, +speed)`, ou seja, depois dele o restante é
  suficiente por construção. Em seguida `SpendMovement(spaces, 'boost')`.
- **Sem Boost legal** (`slow`, `immobilized`, sem quick, `stunned`): o cartão mostra só **Desfazer**
  mais o motivo. Reusar o vocabulário de motivo que o log de combate já tem
  (`Record('blocked', { reason })`).
- **Desfazer:** `updateItems` de volta para o canto do gesto (§13.6), sem debitar nada.
- **Imobilizado:** nem cartão de Boost — o token volta e o motivo é `immobilized`.

O segundo Boost (`OverchargeApplies` → `InOvercharge`) entra pela mesma porta: se `CanActivate`
responder que sim, o cartão volta a oferecer Boost em vez de Desfazer.

### 13.6 Reverter

Dois pontos de entrada, **um** caminho:

| Entrada | Onde |
|---|---|
| Item de menu de contexto | `src/services/obrBridge.ts` (ao lado do `compcon-bind-token`) |
| Botão no painel | `TokenTrackerPanel.vue` |

Implementação:

```ts
await OBR.scene.items.updateItems([tokenId], draft => { draft.position = gestureStart.corner })
// se o gesto foi debitado, devolver o movimento:
sc.setCurrentStat(StatKey.SPEED, remaining + spend, { silent: true })
```

**Limites honestos:** devolve em **linha reta** para a posição inicial do gesto, não pelo caminho
andado — o Owlbear não expõe o traçado (§13.9). E reverter um movimento que só coube por causa do
Boost **não** desfaz o Boost: ele já consumiu o quick e está no log. O diálogo diz isso.

### 13.7 Movimento livre

O LA usa **tecla segurada** (`V`). O Owlbear não tem listener global de teclado — `onKeyDown` só
existe dentro de um `ToolMode` ativo (§13.10). Então o v1 usa **estado armado**, não modificador:

- Toggle no painel: "próximo movimento é livre" — arma para o próximo gesto e desarma sozinho.
- Persistência **local da janela** (`Storage`, como a watchlist do §7.4). É estado de UI: não vai
  para metadata de token nem de sala, e armar "livre" nesta janela não afeta o que os outros veem.

### 13.8 Reset por turno

O reset **já é responsabilidade do motor**: o fluxo de fim de turno zera `BoostBonus`, e
`ClearBoost()` existe exatamente para isso. O tracker **não reimplementa reset** — apenas
**redesenha** no mesmo evento que já vira o turno.

Gatilho: o snapshot de iniciativa que a janela já recebe (`trackerSyncService`, o mesmo de onde o
§7.5 tira o `combatant.side`). Na troca de `inTurnId`, `refreshAll()` e limpeza do `gestureStart`
local.

> Se um dia o reset precisar ser dirigido pelo mapa (ex.: "limpar o movimento de quem não está em
> combate"), aí sim entra lógica nova — não antes.

### 13.9 O que o Owlbear não entrega (limites do v1)

**Atualizado pela sessão:** o app roda em **iframes separados** — o modo ativo (ficha viva) vive na
janela persistente (`windowType=floating`, `isSheetWindowContext()`) e o arrasto acontece na janela
do mapa. O `StatController` **vivo** só existe no primeiro, então o débito não pode ser feito onde o
arrasto acontece. Implementado: a janela do mapa envia o **gesto** por broadcast
(`MOVEMENT_SPEND`) e a janela da ficha decide com os números frescos e responde
(`MOVEMENT_SPENT`), aplicando `SpendMovement` no controlador vivo. Sem esse relay, debitar a cópia
deserializada da janela do mapa seria perdido (a ficha salva por cima) ou cobrado em dobro.

Registrado aqui para não virar promessa em outro lugar:

| Sem análogo no Owlbear | Consequência |
|---|---|
| **Caminho percorrido / waypoints** | `getDistance(from, to)` é a **menor distância** pela métrica da grade, não o custo do que foi andado. Contornar uma parede custa o mesmo que atravessá-la. |
| **Terreno difícil** | não existe no modelo de cena; sem penalidade de custo. |
| **Elevação / THT** | não existe; sem custo de subida e sem leitura de altura. |
| **Intercepção antes do movimento** | `items.onChange` só avisa **depois**. O v1 corrige post-hoc (§13.5). |
| **Histórico nativo por token** | `OBR.scene.history` é undo **global** do usuário, não do token. Reverter é implementação nossa (§13.6). |
| **Teclas seguradas globais** | sem `V`/`B`; modificadores só existem com um `ToolMode` ativo. Daí o toggle armado (§13.7). |

### 13.10 Fase opcional: ferramenta customizada (M3)

`OBR.tool.createMode` aceita `onToolDragStart` / `onToolDragMove` / `onToolDragEnd` /
`onToolDragCancel`, mais um filtro `preventDrag` cuja documentação diz que, ao casar, "the default
drag operation will be used which mimics the Move tool" — que é exatamente o que a intercepção
precisa.

O exemplo oficial registra um mode com `icons[].filter.activeTools: ["rodeo.owlbear.tools/pointer"]`,
o que sugere que dá para ancorar um mode numa ferramenta **nativa**. **Isso não está confirmado
pela documentação** — a redação de `preventDrag` é ambígua. Por isso M3 começa pelo spike V0, e o
v1 **não depende** dele.

Se V0 der positivo, M3 troca o post-hoc por: cartão **durante** o arrasto, cancelamento antes de
aplicar, e modificadores reais (`shiftKey`/`ctrlKey`/`altKey` vêm no `ToolEvent`).

### 13.11 Fases do movimento

**V0 — Spike (0,5–1 dia), bloqueia apenas M3.**
Confirmar: (a) `Item.lastModifiedUserId` ↔ `OBR.player.id`; (b) se um `ToolMode` pode ser ancorado
na ferramenta nativa de mover e o que `preventDrag` faz de fato.

**M0 — Contratos e lógica pura (1–2 dias). ✅ FEITO.**
`src/types/token-movement.ts` (`MovementKind`, `MovementMode`, `MovementInput`, `MovementDecision`)
+ `src/services/tokenMovement.ts` (`decideMovement`, `classifyMode`, `classifyMovementKind`,
`normalizeSpaces`, `remainingAfterBoost`, `remainingAfterSpend`) + 21 specs.
*Critério cumprido:* nenhuma linha de OBR nos specs.

Decisões que a implementação fixou (e que os specs pinam):

- `spaces` é arredondado **para cima** e nunca negativo (`normalizeSpaces`);
- `remaining` corrompido (`NaN`) vira **0**, não `NaN` — `Math.max(0, NaN)` devolve `NaN`, e um
  `NaN` faria `spaces <= remaining` virar `false`, mandando um gesto comum para o caminho de Boost;
- o `mode` é `boost` só quando já houve Boost **e** o total do turno passa do padrão
  (`alreadySpent + spaces > maxSpeed`), a mesma conta do cartão de combate;
- a precedência da rejeição é `involuntary` → `free` → `immobilized` → estouro sem Boost, e há
  spec para cada degrau.

**§5 antecipado junto com a M0:** o `max` do slot `speed` já lê `CombatController.BoostedSpeed`
(via `getBoostedSpeed()` opcional no leitor), com `getMax('speed')` como fallback para leitores
simples. Antes só o padrão era lido — depois de um Boost apareceria `5/5` em vez de `10/10`.

**M1 — Captura e gasto (2–3 dias). ✅ FEITO (falta o teste em sala).**
`src/services/tokenMovementCapture.ts` (snapshot, settle, `getItemBounds` → `getDistance` →
`decideMovement` → `SpendMovement`) + `src/services/tokenMovementGesture.ts` (**puro**: diff de
posição, coberto por 13 specs) + cores de estado no badge (§6.1).
*Critério cumprido na parte automatizada; o de sala segue pendente.*

Decisões que a implementação fixou:

- **Diff no canto, medição no centro.** O diff entre `onChange`s compara `position` (barato, roda
  a cada mudança); o centro só é buscado pelo `getItemBounds` **uma vez por gesto** (guardado como
  promessa, para não correr com o settle). Medir canto→centro somaria meio token ao gasto.
- **Item do painel não é token.** O `collectTokenPositions` só aceita `layer === 'CHARACTER'`:
  os itens do painel são anexados, e sem esse filtro o desenho realimentaria a captura.
- **Token novo não custa movimento** — `changedTokenIds` ignora id sem retrato anterior.
- **Sem o centro do fim, não cobra** (`spaces: 0`): na dúvida, sobra movimento em vez de cobrar
  errado, o mesmo princípio do §13.3.
- **O Desfazer atualiza o retrato ANTES de mover o token**, senão o nosso próprio `updateItems`
  entraria no diff como um gesto novo e seria debitado de novo.
- **Estouro não é debitado.** Fica em `pendingOverflows` (lido por `getPendingOverflow`) e o badge
  pinta de erro. Só depois da escolha do jogador (M2) é que sai o `SpendMovement` — é isso que
  preserva a chance do Boost, já que `SpendMovement` clampa em zero.
- **`SpendMovement` já registra `Record('move', …)`**: a captura não registra de novo.
- O estado do movimento entra na **assinatura de redesenho**, senão um Boost concedido não
  repintaria o badge.

**V0 — Spike. ✅ RESPONDIDO pelo usuário:** `Item.lastModifiedUserId` e `OBR.player.id` são o
mesmo espaço de identificadores, então a comparação é direta (sem `getConnectionId()`). Falta só
a parte (b): se um `ToolMode` pode ser ancorado na ferramenta nativa de mover — irrelevante para
M1/M2, bloqueia apenas M3.

**M2 — Estouro, Boost e reverter (2–3 dias).** Cartão de estouro, `cc.Boost()`, reverter pelo menu
de contexto e pelo painel, movimento livre armado.
*Critério:* estouro oferece Boost quando é legal e só Desfazer quando não é; reverter devolve a
posição **e** o movimento.

**M3 — Intercepção no arrasto (3–5 dias, opcional).** Ferramenta customizada com ciclo de drag.
*Critério:* o cartão aparece **durante** o arrasto e o movimento acima do cap nunca chega a ser
aplicado.
