# Plano de Implementação: Sincronização em Tempo Real com Go e Encontro Contínuo

Este documento consolida a arquitetura completa para a nova camada de comunicação da mesa no fork do **COMP/CON Active Mode** para o **Owlbear Rodeo**.

---

## 1. Visão Geral da Arquitetura

O sistema substitui o mecanismo legado (baseado em `OBR.broadcast` com cotas de `RateLimitHit` e fatiamento manual de fichas comprimidas em chunks de 12 kB na cena) por uma conexão persistente **WebSocket de alto desempenho escrita em Go**, acoplada ao conceito de **Encontro Contínuo da Mesa** na Janela do Mestre (GM).

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OWLBEAR RODEO (VTT)                                  │
│   - Mapa e Posicionamento de Tokens                                                    │
│   - Metadados de vínculo leve (item.metadata[COMPCON_METADATA_KEY] = { sheetId })      │
│   - Identificadores de Sessão: OBR.room.getId(), OBR.player.getId(), OBR.player.getRole()│
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │                                           │
                   ▼                                           ▼
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│       IFRAME JOGADOR (Vue 3/Pinia)   │    │        IFRAME GM (Vue 3/Pinia)       │
│ - PilotSheetStore / ActiveMech       │    │ - EncounterStore (ENCONTRO CONTÍNUO) │
│ - Disparo único: PILOT_JOIN_COMBAT   │    │ - Injeção automática em Combatants   │
│ - Mutações leves: PATCH_FIELD deltas │    │ - Difusão de Iniciativa: TRACKER_SYNC│
│ - tableSyncSocket (Singleton WS)     │    │ - tableSyncSocket (Singleton WS)     │
└──────────────────┬───────────────────┘    └──────────────────┬───────────────────┘
                   │                                           │
                   │ WebSocket (Bidirecional, JSON Envelope)   │
                   ▼                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND GO (server/sync-server)                            │
│ - RoomManager (sync.RWMutex concorrente)                                               │
│ - RoomHub isolado por roomId (Goroutine de despacho por canal)                         │
│ - Memória volátil de alta velocidade (map[characterId]*SheetState)                     │
│ - Persistência Debounced em SQLite WAL puro (modernc.org/sqlite, sem CGO)             │
│ - Filtro de eco (broadcast exclui senderId)                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Princípios Fundamentais de Operação

### 2.1. O Encontro Contínuo da Mesa (Always Active Encounter)
1. **Never-Null:** A janela do GM **sempre** possui um `EncounterInstance` ativo. Se o GM abrir a mesa pela primeira vez ou não houver nada gravado em `active_encounters`, o `EncounterStore` auto-instancia um encontro contínuo padrão ("Operação em Andamento").
2. **Carregamento como Atualização:** Quando o GM carrega um cenário, missão ou template da biblioteca (`Encounter`), isso **não recria nem destrói a sessão**:
   * Atualiza nome, notas de GM, sitrep e ambiente.
   * Remove inimigos antigos derrotados.
   * Adiciona novos NPCs do template.
   * **Preserva 100% dos Pilotos (PCs) conectados e ativos.**
3. **Resolução Contínua:** Ao arquivar/encerrar uma cena, gera os relatórios nos logbooks dos pilotos, remove NPCs derrotados, reseta a rodada para 1 e mantém o encontro contínuo vivo.

### 2.2. A Regra de Ouro do Envio de Fichas
1. **Envio Único da Ficha Completa (`PILOT_JOIN_COMBAT`):**
   * Acontece **apenas no momento em que o jogador inicia a ficha ativa** (em `NewSheet.vue` ou ao abrir `pilot-runner/:id`).
   * A ficha completa é serializada (`Pilot.Serialize(pilot)`), salva no IndexedDB local (`pilots` e `pilot_sheets`) e despachada para o WebSocket.
2. **Injeção Automática no GM:**
   * A janela do GM recebe `PILOT_JOIN_COMBAT`, salva o piloto localmente e o insere de imediato no `activeEnc.Combatants`.
   * O GM salva a instância e regenera o tracker público (`TRACKER_SYNC`).
3. **Mutações Subsequentes Estritamente em Deltas (`PATCH_FIELD`):**
   * Qualquer alteração de combate (PV, Calor, Estrutura, Estresse, Overshield, Condições) trafega **exclusivamente como delta granular**.
   * Nenhuma ficha inteira volta a ser re-serializada ou transmitida durante o combate.
4. **Exceção: modo leitura (`pilot-runner/:id?readonly=1`):**
   * O Mestre abre a ficha de um jogador (botão no card da iniciativa) sem entrar no fluxo acima: o runner monta uma **cópia efêmera** do piloto (`PilotSheet.FromPilot(..., { preserveCombatState: true })`, que não zera PV/calor), não cria/ativa ficha em `pilot_sheets`, não cria token, não anuncia `PILOT_JOIN_COMBAT`, não envia deltas, não salva e nem escuta `PATCH_FIELD`/`SYNC_FULL_SHEET` (a visão é um retrato do momento em que abriu). Os controles das abas ficam sem ponteiro (`pointer-events: none` só nos controles, para a rolagem continuar funcionando).
   * Cinto de segurança para os serviços compartilhados da janela: enquanto a sessão de leitura está ativa (`services/sheetReadOnlySession`), `obrBridge.createTokenForSheet`, `obrBridge.syncCombatantStatusMarkers`, `statusMarkerService.syncTokenTrackers…/clear…` e o desenho dos token trackers não escrevem nada no mapa — os painéis do runner são os mesmos do modo ativo e alguns escrevem no token quando veem o estado mudar.

---

## 3. Especificação do Protocolo WebSocket

### 3.1. Envelope Padrão

```typescript
export type MessageType =
  | 'INIT_SYNC'          // Servidor -> Cliente (snapshot completo da sala ao conectar)
  | 'PILOT_JOIN_COMBAT'  // Cliente -> Servidor -> Demais (entrada em combate com ficha completa)
  | 'PATCH_FIELD'        // Bidirecional (mutação granular com dot-notation)
  | 'SYNC_FULL_SHEET'    // Bidirecional (atualização estrutural de hangar/importação)
  | 'REMOVE_SHEET'       // Bidirecional (remoção de ficha da mesa/roster)
  | 'TABLE_ACTION'       // Bidirecional (rolagens 3D dddice, chat, logs de combate)
  | 'TRACKER_SYNC'       // GM -> Servidor -> Jogadores (snapshot de iniciativa)
  | 'TRACKER_CLEAR'      // GM -> Servidor -> Jogadores (limpeza do tracker)
  | 'PING' | 'PONG';     // Keepalive no nível da aplicação

export interface SyncEnvelope<T = any> {
  type: MessageType;
  roomId: string;
  senderId: string;
  timestamp: number;
  payload: T;
}
```

### 3.2. Payloads Específicos

#### `PILOT_JOIN_COMBAT`
```typescript
export interface PilotJoinCombatPayload {
  pilotId: string;
  pilotData: any;         // JSON completo retornado por Pilot.Serialize(pilot)
  activeMechId: string;
  sheetId: string;
  version: number;
}
```

#### `PATCH_FIELD` (Mutação Granular com Dot-Notation)
```typescript
export interface PatchFieldPayload {
  characterId: string;
  characterType: 'pilot' | 'npc';
  field: string;          // Ex: "mechs.0.combat_data.stats.current.hp" ou "stats.current.heat"
  value: any;
  version: number;        // Contador monotônico sequencial da ficha para resolução de conflitos
}
```

#### `INIT_SYNC` (Snapshot da Sala entregue na Conexão)
```typescript
export interface InitSyncPayload {
  roomId: string;
  sheets: Record<string, {
    characterId: string;
    characterType: 'pilot' | 'npc';
    data: any;
    version: number;
    updatedAt: number;
    ownerId?: string;      // playerId que anunciou a ficha (posse da ficha ativa)
    sheetId?: string;      // id do container da ficha (rota `pilot-runner/:id`)
  }>;
  activeTracker?: any;    // Último SyncedTrackerSnapshot emitido pelo GM
}
```

O `activeTracker` é o **encontro salvo da mesa**: o `obrBridge.sendTrackerSync` publica o snapshot
tanto no broadcast da sala quanto no servidor (`tableSyncSocket.sendTrackerSync`), e o `INIT_SYNC`
o entrega para quem abre a janela depois (o Combat Tracker hidrata daí — `roomSyncedTracker` — e
o metadata da sala do Owlbear virou apenas ponte legada, sem gravação).

No **Mestre**, a janela que tem o Combat Tracker **troca automaticamente** o encontro local pelo
combate publicado quando os dois divergem (`roomEncounterDiffers` compara só a iniciativa —
rodada, turno e cards — porque cada janela guarda o encontro com ID próprio): o
`EncounterStore.adoptRoomEncounter` reconstrói os combatentes a partir dos cards + fichas
sincronizadas (pilotos e NPCs por `npcType`) e a troca é uma **substituição**, não uma mescla.
Ela é idempotente — o par (assinatura da sala, assinatura local) já tentado não é reprocessado, e
um card cuja ficha não chegou mantém o encontro local em vez de virar combate vazio. O jogador
continua apenas visualizando a iniciativa.

O `sheetId` é o container da ficha do Modo Ativo. A sala guarda o **dado do piloto**, não o
container: sem esse campo, uma janela que só conhece o id da rota (`pilot-runner/:id` — o caso do
erro "No pilot sheet found with ID … (0 carregadas)") não conseguia pedir a cópia certa. Com ele,
`tableSyncSocket.requestSheet(id)` aceita id do piloto, do container ou o id de dentro do dado,
resolve a cópia em `roomSyncedSheets` e a materializa nos stores locais — o runner usa isso antes de
desistir, criando o container com `preserveCombatState` (o estado vivo do combate não é zerado).
```

### 3.3. Resolução de Conflitos (LWW por Campo)
* Cada ficha no Hub em Go possui um mapa de `field_timestamps map[string]int64` e um número sequencial `version: int64`.
* O servidor aceita mutações com `version >= current.version` ou timestamp de campo mais recente.
* Atualiza a memória e difunde aos outros clientes, suprimindo o remetente original (`client.id == senderId`).

---

## 4. Estrutura do Backend em Go (`server/sync-server`)

O servidor será construído em `server/sync-server/` utilizando Go 1.26 (já disponível localmente):

```text
server/sync-server/
├── cmd/
│   └── server/
│       └── main.go              # Inicialização HTTP/WS, flags e graceful shutdown
├── internal/
│   ├── config/
│   │   └── config.go            # Porta (default 8080), caminhos de storage, timeouts
│   ├── hub/
│   │   ├── client.go            # Leitura (readPump), escrita (writePump) e heartbeat
│   │   ├── room.go              # Loop da sala (goroutine isolada), canais e debounce
│   │   └── room_manager.go      # Gerenciador de instâncias de salas com sync.RWMutex
│   ├── models/
│   │   ├── envelope.go          # Structs Go do envelope JSON
│   │   └── sheet.go             # Representação em memória da ficha e estado de combate
│   └── storage/
│       ├── store.go             # Interface de persistência
│       └── sqlite_store.go      # Driver SQLite puro (modernc.org/sqlite, sem CGO, WAL mode)
├── go.mod
├── go.sum
└── Dockerfile
```

### 4.1. Características Técnicas do Servidor
* **Sem CGO:** Uso de `modernc.org/sqlite` permitindo compilar binários estáticos no Windows e Linux sem dependência de GCC externo.
* **Isolamento Concorrente:** Cada `roomId` roda sua própria Goroutine independente. Se uma sala tiver alta atividade de combate, as demais salas não sofrem contenção.
* **Debounce de Persistência:** Canal `dirtySignal chan struct{}` com timer de 3 segundos. Múltiplas rolagens e ajustes de dano seguidos acumulam na memória e só disparam uma única escrita no disco.
* **Heartbeat Rigoroso:** `pingPeriod = 50s`, `pongWait = 60s`, `readLimit = 512KB`.

---

## 5. Integração no Frontend (Iframe da Extensão)

### 5.1. Controlador Singleton: `src/services/tableSyncSocket.ts`
Desacoplado da UI e centralizando toda a comunicação:
* **Conexão Contextual Automática:**
  ```typescript
  const roomId = await OBR.room.getId()
  const playerId = await OBR.player.getId()
  const role = await OBR.player.getRole()
  socket.connect(`${WS_URL}/ws?roomId=${roomId}&playerId=${playerId}&role=${role}`)
  ```
* **Offline Queue:** Se a conexão cair momentaneamente, patches são acumulados em `offlineQueue` e despachados em ordem na reconexão.
* **Reconexão com Jitter:** Backoff exponencial ($2^n \times 1000\text{ms}$) com variação aleatória de até 1000ms.
* **Indicador Visual de Status:** Emite evento `compcon-ws-status` (conectado, reconectando, desconectado) para visualização na UI.

### 5.2. Encontro Contínuo no `EncounterStore` (`src/features/gm/store/encounter_store.ts`)
* Adição de `ensureContinuousEncounter()`:
  Garante que sempre exista uma instância ativa de `EncounterInstance`.
* Listener do evento `PILOT_JOIN_COMBAT` (Quando GM está online):
  ```typescript
  async function handlePilotJoinCombat(payload: PilotJoinCombatPayload) {
    const enc = await encounterStore.ensureContinuousEncounter()
    if (!enc.Combatants.some(c => c.actor.ID === payload.pilotId)) {
      const pc = Pilot.Deserialize(payload.pilotData)
      pc.SetStats()
      pc.FeatureController.BonusController.applyToStats(pc.CombatController.StatController, enc)
      pc.CombatController.ResetForEncounter()
      enc.Combatants.push(makeCombatant(pc, 'pilot', { id: pc.ID, index: -1, number: -1, side: 'ally' }))
      await enc.Save()
      window.dispatchEvent(new CustomEvent('compcon-encounter-updated'))
    }
  }
  ```

#### 5.2.1. Salvaguarda: E se o GM NÃO estiver conectado na hora?
Se o jogador entrar em combate antes do GM abrir a mesa ou durante uma reconexão do GM, a integração é garantida por uma **estratégia em 3 camadas**:

1. **Camada 1 — Servidor Go como Retentor de Estado (`RoomHub.sheets`):**
   * O servidor Go recebe e armazena o `PILOT_JOIN_COMBAT` no mapa em memória da sala e no SQLite debounced, marcando a ficha com `in_combat: true` e a versão atual.
   * Não depende da presença síncrona do GM para validar o registro.
2. **Camada 2 — Reconciliação Automática no GM ao Conectar (`INIT_SYNC`):**
   * Assim que o GM abre a extensão ou se reconecta, ele recebe o snapshot `INIT_SYNC` contendo todas as fichas da sala.
   * O GM executa `reconcileContinuousEncounter(initSync.sheets)`:
     ```typescript
     async function reconcileContinuousEncounter(sheets: Record<string, SheetState>) {
       const enc = await encounterStore.ensureContinuousEncounter()
       let changed = false
       for (const [id, sheet] of Object.entries(sheets)) {
         if (sheet.characterType === 'pilot' && sheet.inCombat) {
           if (!enc.Combatants.some(c => c.actor.ID === id)) {
             const pc = Pilot.Deserialize(sheet.data)
             pc.SetStats()
             pc.FeatureController.BonusController.applyToStats(pc.CombatController.StatController, enc)
             pc.CombatController.ResetForEncounter()
             enc.Combatants.push(makeCombatant(pc, 'pilot', { id: pc.ID, index: -1, number: -1, side: 'ally' }))
             changed = true
           }
         }
       }
       if (changed) {
         await enc.Save()
         window.dispatchEvent(new CustomEvent('compcon-encounter-updated'))
       }
     }
     ```
3. **Camada 3 — Re-anúncio por Presença de GM (`GM_ONLINE`):**
   * O servidor Go notifica a sala quando um cliente com `role: 'GM'` se conecta (`type: 'GM_ONLINE'`).
   * Se o jogador estiver na tela do runner e ainda não tiver recebido confirmação/tracker do GM, re-envia de forma idempotente o `PILOT_JOIN_COMBAT`.

4. **Camada 4 — Ficha ativa devolvida ao dono na (re)conexão (`SYNC_FULL_SHEET` dirigido):**
   * O `PILOT_JOIN_COMBAT`, único momento em que um cliente declara qual ficha está jogando, grava a posse da ficha (`SheetStateEntry.ownerId = senderId`).
   * Ao registrar um cliente, o `RoomHub` envia o `INIT_SYNC` e, em seguida, um `SYNC_FULL_SHEET` **dirigido** (sem broadcast) com a ficha de piloto ativa dele (`ownerId == playerId` e `inCombat = true`, a mais recente). Se ele não tiver ficha ativa na sala, nada é enviado.
   * O cliente já trata esse tipo: registra o piloto no store local e dispara `compcon-pilot-synced`. Um `SYNC_FULL_SHEET` reenviado por outra janela (o GM sincroniza o roster inteiro) **não** rouba a posse; só o `PILOT_JOIN_COMBAT` do próprio jogador a assume.
   * A entrega dirigida vai para **todas as janelas do dono** (popover da ficha + painel de ações/chat): o mesmo jogador pode ter mais de uma conexão, e entregar só para a primeira do `map` tornava a entrega uma loteria entre as janelas.

5. **Painel de ações/chat (`/table-chat`) em somente-leitura:**
   * É a única janela que monta o diálogo "Adicionar à Iniciativa" (`CombatTrackerTab`), cuja lista de "Pilotos da Mesa" mescla o hangar local com `roomSyncedSheets`. Sem socket nesta janela, a parte da sala vinha sempre vazia.
   * `tableSyncSocket.init({ readOnly: true })` faz essa janela **receber** o estado da sala (fichas, NPCs, tracker) sem escrever **ficha** nele: anúncio/patch/ficha completa/remoção não são enviados nem aplicados nos stores locais, e a reconciliação do encontro contínuo é pulada — o encontro ativo continua vivendo só nas janelas de jogo.
   * Exceções que continuam passando (`READ_ONLY_ALLOWED_TYPES`): `TABLE_ACTION` (o chat da janela) e `TRACKER_SYNC`/`TRACKER_CLEAR` — o Combat Tracker do painel é quem cria/carrega o encontro e publica a iniciativa, então bloquear ali fazia o Mestre criar o combate e ele nunca chegar aos jogadores.
   * Pelo mesmo motivo, **a reconciliação do encontro contínuo roda também nessa janela** (`PILOT_JOIN_COMBAT`/`INIT_SYNC`): o encontro dela é a fonte da iniciativa publicada, e sem os pilotos o painel mandava um `TRACKER_SYNC` vazio — a mesa inteira via "Encontro Vazio". Como todos os iframes do mesmo navegador compartilham `active_encounters`, reconciliar é idempotente com a janela de jogo (o que continua barrado é o *patch* de ficha e a escrita de `pilots`/`pilot_sheets`).
   * E um `TRACKER_SYNC` sem combatentes **não é publicado** quando a sala já tem combate (`shouldPublishTrackerSnapshot`): uma janela recém-aberta está só desatualizada, e o snapshot vazio apagava a iniciativa para todos.

### 5.3. Roteamento de `PATCH_FIELD` para os Controladores do LANCER
As alterações de combate no runner do jogador são agrupadas por um dispatcher com debounce
(`src/services/coalescedDispatcher.ts`): uma rajada de 1–4 alterações de PV/calor/estrutura/
estresse/sobreescudo vira um único `PATCH_FIELD` com o valor final e um único save. A janela de
silêncio é de 600 ms, com teto de 2 s para rajadas contínuas; sair/desmontar a janela descarrega
o que estiver pendente.

Ao receber `PATCH_FIELD`, aplica-se a mutação pontual sem remontar o objeto ou desmontar componentes Vue:
* Para pilotos: localiza o combatente no `ActiveMech.CombatController.StatController` e chama `setCurrentStat(stat, value, { silent: true })`.
* Para NPCs: localiza na lista de combatentes do encontro contínuo e atualiza diretamente o `CombatController`.

**Caminhos do delta** (`src/services/sheetSyncPaths.ts` e `src/services/sheetEquipmentPaths.ts`):
o estado de combate vive no **mech** do JSON do piloto, não na raiz — patchear a raiz gravava PV/calor
no nó do piloto e a ficha voltava ao estado do join no reload. Os caminhos usados são:

| Estado | Caminho |
| --- | --- |
| Stats (PV, calor, estrutura, estresse, sobreescudo, movimento) | `mechs.<m>.stats.current.<stat>` |
| Ações de combate / condições | `mechs.<m>.combatActions`, `mechs.<m>.statuses` |
| Poder de núcleo gasto / núcleo ativo | `mechs.<m>.corePower`, `mechs.<m>.coreActive` |
| Arma destruída | `mechs.<m>.loadouts.<l>.mounts.<mount>.{slots\|extra}.<slot>.weapon.destroyed` |
| Sistema destruído | `mechs.<m>.loadouts.<l>.systems.<s>.destroyed` |
| Arma/sistema integrado | `mechs.<m>.loadouts.<l>.integratedMounts.<mount>.weapon.destroyed`, `.integratedSystems.<s>.destroyed` |

Arma e sistema destruídos usam caminho posicional de propósito: o JSON é o que a sala guarda e o que
o `Pilot.Deserialize` lê de volta, então o estado volta sozinho na hidratação. `Destroyed` e
`CorePower` não têm `CombatLogVersion` próprio, por isso também entram em
`combatantCombatVersion` (`_shared/combatVersion.ts`) — sem isso nem o autosave nem o delta notavam
a mudança.

---

## 6. Cronograma de Execução Faseado

### Fase 1: Backend em Go — Hub WebSocket & Protocolo
- [x] Inicializar o módulo Go em `server/sync-server` (`go.mod`).
- [x] Implementar modelos de dados e structs de envelope em Go (`internal/models`).
- [x] Implementar `Client`, `RoomHub` e `RoomManager` com heartbeat e canais (`internal/hub`).
- [x] Implementar endpoint HTTP `/ws` com upgrade de WebSocket em `cmd/server/main.go`.
- [x] Testes unitários do Hub em Go (concorrência, broadcast sem eco, canais).

### Fase 2: Backend em Go — Persistência SQLite Debounced
- [x] Integrar driver `modernc.org/sqlite` com pragmas WAL e `busy_timeout`.
- [x] Implementar canal `dirtySignal` e timer de debounce de 3 segundos em `internal/hub/room.go`.
- [x] Implementar persistência e recuperação do estado da sala na inicialização (`internal/storage`).
- [x] Criar script de execução local (`npm run server:sync` ou `go run`) e Dockerfile.

### Fase 3: Frontend — Encontro Contínuo no GM
- [x] Adicionar `ensureContinuousEncounter()` em `src/features/gm/store/encounter_store.ts`.
- [x] Implementar método de merge de templates de encontro (carregar NPCs sem remover PCs conectados).
- [x] Ajustar `GMEncounterRunner.vue` para garantir ligação permanente com o encontro contínuo.
- [x] Testes de especificação do `EncounterStore` com garantia de never-null.

### Fase 4: Frontend — Cliente WebSocket (`tableSyncSocket.ts`)
- [x] Criar `src/types/sync-protocol.ts` com as interfaces de envelope e payloads.
- [x] Criar `src/services/tableSyncSocket.ts` com reconexão com jitter, offline queue e handshake OBR.
- [x] Adicionar indicador visual de status de conexão no rodapé ou cabeçalho da extensão.
- [x] Testes de conexão e fila offline.

### Fase 5: Integração Ponta a Ponta & Desativação do Tráfego Legado
- [x] Conectar inicialização de ficha ativa (`NewSheet.vue` / `PilotRunner.vue`) ao disparo único de `PILOT_JOIN_COMBAT`.
- [x] Conectar listener no GM para injeção automática em `activeEnc.Combatants`.
- [x] Conectar alterações de combate (`StatController`) ao envio de `PATCH_FIELD`.
- [x] Desativar o envio de chunks de cena pesados no `obrBridge.ts`.
- [x] Devolver ao dono os dados da ficha ativa dele (`SYNC_FULL_SHEET` dirigido) quando ele conecta ao `TableSyncSocket`.
- [x] Validação E2E com testes unitários automatizados cobrindo integração Go e Frontend.

