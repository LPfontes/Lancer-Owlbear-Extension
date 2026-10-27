# Plano — Aplicação de dano pelo Combat Tracker (iframe) e sincronização com a mesa

> Objetivo: uma função única que aplica dano a um integrante do encontro seguindo as regras
> de LANCER (tipo de dano, ARMOR, resistência/imunidade, dano perfurante/AP, queimadura e
> calor), executada **no iframe do Combat Tracker**, aplicando na ficha sincronizada pelo
> `TableSyncSocket` e distribuindo o resultado para os jogadores.

## 1. O que já existe (não reinventar)

| Peça | Onde | Serve para |
| --- | --- | --- |
| `CalculateDamage(type, value, ap, irreducible, direct)` | `src/classes/components/combat/CombatController.ts:1209` | Prévia do dano (ARMOR, resistência, imunidade, total) |
| `TakeDamage(type, value, ap, irreducible, direct)` | idem `:1219` | Aplica o dano de verdade (com `Record(...)` no combat log) |
| `DamageCalculationFlow` / `DamageApplicationFlow` / `HeatFlow` / `ResolveBurn` | `src/classes/components/combat/DamageController.ts:28-156` | Fluxos de regra: `armorReduction`, resist/imunidade/vulnerável, overshield, HP, estrutura/estresse, meltdown, deployables |
| `DamageType` | `src/classes/enums.ts:151` | `Kinetic`, `Energy`, `Explosive`, `Heat`, `Burn`, `AppliedBurn`, `Variable`, `AoE` |
| `StatKey` | `src/classes/components/combat/stats/Stats.ts` | `hp`, `heat`, `heatcap`, `armor`, `structure`, `stress`, `overshield`, `burn` |
| `DamageMenu.vue` | `.../EncounterPanels/_components/DamageMenu.vue` | UI de referência: valor, tipo, meia, AP, irredutível, status do defensor, total, aplicar |
| `sendPatchField(characterId, characterType, field, value, version)` | `src/services/tableSyncSocket.ts` | Envia o delta (`PATCH_FIELD`); o servidor aplica por `setRecursive` e guarda a versão |
| `applyReceivedPatch` / `applySerializedCurrentStats` | idem / `src/services/sheetSyncPaths.ts` | Aplicam o delta recebido no ator (e protegem o estado atual na hidratação) |
| `mechStatsPath(i, key)` / `activeMechIndex()` | `src/services/sheetSyncPaths.ts` | Caminhos posicionais do JSON da ficha (`mechs.0.stats.current.hp`) |
| `roomSyncedSheets` / `roomSyncedTracker` | `src/services/tableSyncSocket.ts` | Cópia viva da sala nesta janela (fonte do alvo e da versão) |

Conclusão: **as regras já estão implementadas e testadas**. O trabalho novo é (a) expor isso
como uma função de domínio reutilizável, (b) transformar o resultado em deltas para a mesa e
(c) dar UI no tracker para o Mestre aplicar.

## 2. Decisões de arquitetura

1. **O cálculo fica no cliente (tracker), não no servidor.** O Go continua sendo a fonte da
   verdade do *estado* (guarda o JSON e a versão), mas não reimplementa LANCER. Menos
   divergência de regras e nenhuma migração de esquema.
2. **Dano é um EVENTO com id próprio** (`eventId: uuid`): permite deduplicar em janelas que
   recebem o patch por dois caminhos (socket + broadcast local) e registrar no log da mesa.
3. **Um `PATCH_FIELD` por stat alterado**, nunca a ficha inteira (room metadata tem ~16 kB e o
   patch é o mecanismo que já existe e é idempotente por versão).
4. **Ordem dos patches**: `hp` → `overshield` → `heat` → `stress` → `structure` → `burn`/statuses.
   Assim uma janela que aplica no meio da sequência nunca fica num estado impossível (ex.: HP
   zerado sem o estresse correspondente já publicado).
5. **Somente-leitura do painel ganha um allowlist de dano** (não liberar `PATCH_FIELD` inteiro):
   só passam caminhos de stat do alvo — `mechs.<i>.stats.current.{hp|heat|overshield|structure|stress|burn}`
   e o equivalente do piloto desmontado. Qualquer outro caminho continua bloqueado naquela janela.
6. **Quem pode aplicar**: o Mestre, pelo tracker. O jogador continua aplicando no próprio fluxo
   de ataque existente (`ApplyButton`/`DamageMenu`), que já roda na janela dona da ficha.

## 3. API proposta

```ts
// src/services/damageApplication.ts

export interface DamageInput {
  type: DamageType
  value: number          // valor JÁ rolado (o tracker resolve dados com DiceRoller)
  ap?: boolean           // perfurante: ignora ARMOR
  irreducible?: boolean  // ignora ARMOR e resistência
  half?: boolean         // "metade do dano" antes da ARMOR
  direct?: boolean       // dano direto (resolveTarget sem cobertura/escudo)
  burn?: number          // pilha de BURN a somar (status), além do dano imediato
  source?: string        // arma/sistema que causou (vai para o log)
  eventId?: string
}

export interface DamageDelta {
  field: string                      // caminho posicional p/ PATCH_FIELD
  value: number | boolean | string
  previous?: number | boolean | string
}

export interface DamageReport {
  eventId: string
  characterId: string
  sheetId?: string
  type: DamageType
  incoming: number
  armorReduced: number
  resisted: number
  condition: 'nominal' | 'resistance' | 'immunity' | 'vulnerable'
  final: number
  taken: number
  destroyed: boolean
  meltdown: boolean
  deltas: DamageDelta[]              // pronto para publicar
}

/** Prévia para a UI (sem aplicar nada). */
export function previewDamage(combatant: CombatantData, input: DamageInput): DamageReport

/** Aplica no ator (cópia da sala) e devolve o relatório com os deltas. */
export function applyDamageToCombatant(
  combatant: CombatantData,
  input: DamageInput
): DamageReport

/** Publica os deltas na mesa (PATCH_FIELD) + registra a ação no log. */
export function publishDamageReport(report: DamageReport): Promise<void>
```

`applyDamageToCombatant` é síncrona (as regras são síncronas); `publishDamageReport` é a única
parte assíncrona — o que mantém a função testável sem servidor.

## 4. Pipeline de aplicação (ordem exata)

1. **Resolver o alvo**: `CombatController.resolveTarget(direct)` decide se o dano vai no mech
   (montado) ou no piloto (desmontado — sem ARMOR). `activeMechIndex()` dá o índice do caminho.
2. **Tipo efetivo**: `Heat` sem `heatcap` vira `Energy` (comportamento já existente em
   `DamageController._takeDamage:97`); `Variable`/`AoE` exigem escolha na UI antes de aplicar.
3. **Prévia** com `CalculateDamage` → `armorReduction`, `resist`, `condition`, `total`,
   `tookDamage`. É o que a UI mostra (“12 → 8, ARMOR 2, resistência a Kinetic”).
4. **Aplicar** com `TakeDamage(...)`: imunidade → resistência → ARMOR (salvo `ap`/irredutível) →
   overshield → HP → **estouro** (estrutura/estresse) → destruição/meltdown, já com
   `Record('damage', {...})` no combat log do ator.
5. **Calor**: `TakeDamage(DamageType.Heat, n)`. Ao passar do `heatcap`, o `HeatFlow` aplica
   estresse (e meltdown quando for o caso) — o relatório precisa carregar `heat`, `stress` e
   `meltdown` como deltas.
6. **Queimadura**: dois usos distintos, os dois na UI —
   - **dano de queimadura imediato**: `TakeDamage(DamageType.AppliedBurn, n)` (não incrementa a pilha);
   - **pilha de BURN**: soma o status `burn` (`StatKey.BURN`), que o fim de turno resolve com
     `ResolveBurn(save, rolled)` (o save pode reduzir/negar).
7. **Deltas**: diff de `StatController.CurrentStats` antes/depois (só o que mudou) + statuses e
   flags (`destroyed`, `meltdown`). Nada de publicar stat inalterado (evita ruído e versão desnecessária).

## 5. Publicação e sincronização

```
Tracker (GM)                    Servidor Go                     Janelas dos jogadores
applyDamageToCombatant()
   └─ deltas
        └─ PATCH_FIELD (v = roomSyncedSheets[id].version + 1)
                                 ├─ setRecursive(JSON) + version
                                 └─ broadcast (sem eco p/ o remetente)
                                                                 └─ applyReceivedPatch()
                                                                    └─ StatController + UI
        └─ TABLE_ACTION ("Dano aplicado — 8 (Kinetic) em ROOK")
```

- **Versão**: cada patch sai com `version + 1` lida de `roomSyncedSheets[id]`; o servidor descarta
  patch com versão menor, então um patch atrasado não “desfaz” o dano.
- **Deduplicação**: janelas guardam os últimos `eventId` aplicados (LRU pequeno) e ignoram repetição.
- **Local-first no tracker**: aplicar no ator da cópia da sala antes de publicar, para o próprio
  tracker mostrar o resultado mesmo se o socket estiver offline (a fila offline do socket já
  reenvia o `PATCH_FIELD` ao reconectar).
- **Somente-leitura**: `TableSyncSocket.send()` passa a permitir `PATCH_FIELD` cujo caminho seja
  de dano (`isDamagePatchPath(field)`), mantendo bloqueado o resto — o painel é quem conduz a
  iniciativa, mas não pode virar um editor de ficha arbitrário.

## 6. UI no Combat Tracker

- Botão **“Aplicar dano”** no card do combatente (só para o Mestre), abrindo
  `DamageApplicationDialog.vue` — extraído do `DamageMenu.vue` para reuso (o menu atual continua
  funcionando na ficha do encontro).
- Campos: valor **ou** dados (`2d6+3`, resolvido por `DiceRoller`), tipo (K/E/X/Calor/Queimadura),
  meia, **AP**, irredutível, crítico (dano dobrado), pilha de BURN, alvo (mech/piloto quando montado).
- Prévia viva: `incoming → final`, com ARMOR reduzida, condição (resistência/imunidade/vulnerável)
  e aviso de estouro (“vai destruir / vai causar estresse”).
- Depois de aplicar: linha de resultado no card (`−8 HP · ARMOR −2 · resistência`) e `TABLE_ACTION`
  no log da mesa.

## 7. Testes

**Unitários (`src/services/damageApplication.spec.ts`, com `CombatController` real e as fábricas):**
- ARMOR reduz o total; **AP ignora ARMOR**; `irreducible` ignora ARMOR e resistência.
- Resistência = metade (conferir o arredondamento em `armorReduction`); imunidade = 0.
- Overshield absorve antes do HP; dano não deixa HP negativo (vira estouro de estrutura).
- Calor: entra em `heat`; passando do `heatcap` gera estresse; sem `heatcap` vira Energy.
- Queimadura: `AppliedBurn` não incrementa a pilha; pilha de BURN soma e é resolvida no fim do turno.
- Deltas: exatamente os stats alterados, com os caminhos de `mechStatsPath`.
- `eventId` repetido não é reaplicado.

**Sincronização:**
- `isDamagePatchPath` (allowlist) — dano passa, patch arbitrário não.
- `tableSyncSocket.spec.ts`: painel somente-leitura envia o patch de dano; versão incrementada.
- Go (`internal/hub`): `PATCH_FIELD` de dano aplica no JSON da sala e incrementa a versão.

**Regressão:** `DamageMenu.vue` continua funcionando depois da extração do diálogo.

## 8. Fases

> **Status**: fases 1, 2 e 4 implementadas (`src/services/damageApplication.ts`,
> `isDamagePatchPath` + allowlist no socket, botão/diálogo no card do tracker com prévia e
> `TABLE_ACTION` de log). O diálogo é um componente próprio
> (`DamageApplicationDialog.vue`) em vez de extração do `DamageMenu` — mesma lógica de
> regras via serviço, sem risco de regressão no menu da ficha. Falta a fase 5
> (integração ponta a ponta com o servidor Go e atualização do §5.3 do plano de sync).

1. `src/services/damageApplication.ts` (prévia + aplicação + deltas) e testes unitários.
2. `isDamagePatchPath` + allowlist no `send()` + `publishDamageReport` + testes de sincronização.
3. Extrair `DamageApplicationDialog.vue` do `DamageMenu.vue` e reusar no tracker.
4. Botão no card do tracker + `TABLE_ACTION` de log + `DamageReport` na UI.
5. Integração ponta a ponta (Go + duas janelas) e atualização do
   `plano_sincronizacao_websocket_go.md` (§5.3, tabela de caminhos de delta).

## 9. Riscos e decisões abertas

- **Duas janelas do Mestre** aplicando dano ao mesmo tempo: versão + `eventId` resolvem (a maior
  versão vence); vale a pena logar quando um patch for descartado por versão.
- **`SaveLock`** (durante save em andamento) faz `_takeDamage` sair sem aplicar — documentar no
  relatório (“não aplicado: ficha em salvamento”).
- **Deployables** e dano em área: já têm fluxo; decidir se o tracker permite escolher vários alvos
  (fase 5, opcional).
- **Desfazer**: fora do escopo — o log da mesa registra o evento e a ficha pode ser corrigida à mão.
- **Confirmar com o usuário**: (a) só o Mestre aplica pelo tracker? (b) queimadura no tracker deve
  só empilhar o status (sem tick imediato)? (c) overshield entra no dano de piloto desmontado?
