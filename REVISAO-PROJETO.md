# Revisão do projeto — COMP/CON Active Mode (fork Owlbear Rodeo)

**Data:** 2026-02 · **Branch:** `main` · **Working tree:** 100 entradas não commitadas (69 arquivos modificados, +4.125/−1.653 linhas, 3 arquivos deletados, 31 novos)

Revisão de leitura (nenhum arquivo de código foi alterado). O escopo cobre: saúde do build/testes,
arquitetura e aderência ao `AGENTS.md`, o diff não commitado (domínio, UI e serviços), o backend
serverless (`api/`, `server/proxy.mjs`) e o servidor de sincronização em Go (`server/sync-server/`).

---

## 1. Veredito rápido

| Área | Estado |
|---|---|
| Typecheck (`vue-tsc --noEmit`) | ✅ limpo |
| Testes (`vitest run`) | ✅ 170 arquivos / 2.169 testes passando (1 skipped) |
| Build de produção (`vite build`) | ✅ passa (ver ressalva de ambiente na §6) |
| Servidor Go (`go vet`, `go test`) | ✅ limpo, 12 testes passando |
| Cobertura de tradução (`i18n:check`) | ✅ 100% do universo endereçável (4.807 chaves) |
| Dependências (`npm audit`) | ⚠️ 32 vulnerabilidades (1 crítica, 26 altas) |
| Segurança de backend | 🔴 credencial exposta, SSRF, sync sem autenticação |
| Higiene de repositório | ⚠️ diff grande não commitado, binário de 15 MB fora do `.gitignore`, docs desatualizadas |

O **cliente** está em boa forma: a migração para janela única foi feita sem referências órfãs, a
geometria está centralizada e a suíte de testes está verde. Os riscos concentram-se no **backend**
(proxy + servidor Go de sincronização, ambos novos ou pouco revisados) e em alguns pontos
específicos do diff.

---

## 2. Achados — Crítico

### C1. Credencial de API hardcoded, versionada e embarcada no bundle
- `server/proxy.mjs:30` — `x-api-key` literal usado de verdade contra o API Gateway do COMP/CON
  (`server/proxy.mjs:22`).
- `src/io/apis/account.ts:11` — a **mesma** chave como fallback no cliente, portanto inlined pelo
  Vite no JS público.
- Já está em `HEAD` desde o commit `7a3ef05f5` ("feat: MongoDB"), ou seja, **não é introduzida pelo
  diff atual**, mas continua viva e pública.

**Impacto:** qualquer pessoa extrai a chave do bundle e consome a cota do API Gateway (não há rate
limit). O `README.md` afirma "não há segredos de servidor para configurar" — está incorreto.
**Correção:** rotacionar a chave, mover para `process.env.COMPCON_API_KEY` (Vercel) e remover o
fallback do cliente. Se a rota AWS é inerte para o fork, desligá-la explicitamente também resolve.

### C2. SSRF em `/api/image`
`server/proxy.mjs:191,198,225-237`. O bloqueio é uma denylist de *string* sobre o hostname, sem
resolver DNS, sem allowlist e sem tratar redirects:
- `new URL('http://localhost./').hostname === 'localhost.'` não casa `h === 'localhost'` nem
  `endsWith('.localhost')` → passa, e resolve para loopback;
- um domínio público que responda `302` para `169.254.169.254` é seguido (`fetch` default é
  `redirect: 'follow'`), anulando a checagem;
- qualquer host/porta é aceito; não há timeout nem teto de tamanho (`await upstream.arrayBuffer()`).

**Impacto:** SSRF contra loopback, rede interna e endpoints de metadados de nuvem, com `ACAO: *`.
**Correção:** resolver o host e validar **o IP resolvido** (RFC1918/loopback/link-local/ULA,
incluindo IPv4 mapeado), `redirect: 'manual'` revalidando cada salto, allowlist de domínios,
`AbortSignal.timeout(5000)` e limite de resposta.

### C3. Servidor de sincronização sem autenticação/autorização
- `server/sync-server/cmd/server/main.go:120-136`: `roomId`, `playerId` e `role` vêm da query
  string; `role=GM` é autodeclarado pelo cliente (`src/services/tableSyncSocket.ts:122-124`).
- `internal/hub/room.go:242-306`: `PATCH_FIELD`, `SYNC_FULL_SHEET` e `REMOVE_SHEET` são aceitos para
  **qualquer** `characterId`, sem checar dono; `TRACKER_SYNC`/`END_ENCOUNTER` sem checar papel.
- `main.go:56-117`: `POST /api/rooms/end-encounter?roomId=<qualquer>` limpa o tracker e **apaga todos
  os NPCs da sala** (`room.go:429-440`), sem credencial e com CORS `*`.
- `INIT_SYNC` entrega todas as fichas da sala a quem conectar (`room.go:119-151`).

**Impacto:** quem souber/descobrir um `roomId` lê todas as fichas, forja ou apaga estado de combate e
derruba a iniciativa da mesa; o endpoint HTTP permite isso por CSRF de qualquer site.
**Correção:** token de sessão por sala (segredo do OBR ou HMAC) validado no upgrade, papel derivado
do token no servidor, autorização por tipo de mensagem e por dono da ficha; remover o CORS `*` e
exigir credencial no endpoint HTTP.

### C4. DoS remoto não autenticado por alocação/estouro de pilha
`server/sync-server/internal/models/sheet.go:59-61`: `for len(s) <= idx { s = append(s, nil) }`
expande um slice até o índice enviado pelo cliente. Sequência mínima: `SYNC_FULL_SHEET` (cria a
ficha) + `PATCH_FIELD { field: "a.999999999" }` → ~1e9 elementos num patch de <1 KB. A recursão de
`setRecursive` (`sheet.go:18`) também estoura a pilha com `"a.a.a..."` (falha fatal, não recuperável).
Combinado com C3, qualquer pessoa na internet derruba o processo.
**Correção:** limite de profundidade e de índice, allowlist de prefixos de campo e `recover()` nas
goroutines.

---

## 3. Achados — Alto

### A1. Salas e goroutines sem eviction (vazamento de memória)
`internal/hub/room_manager.go:38-60`: `GetOrCreateRoom` nunca remove salas; `CloseAll` só roda no
shutdown. Cada `roomId` novo (inclusive vindo do endpoint HTTP) cria um `RoomHub`, 2 goroutines e um
canal de 1024 posições, além de um `LoadRoomState` no SQLite — com `m.mu` bloqueado durante a leitura.
**Correção:** teto de salas/conexões, eviction por inatividade e rate limit por conexão.

### A2. XSS na origem do app pelo proxy de imagem
`server/proxy.mjs:209-215`: o `Content-Type` do upstream é repassado sem allowlist, com
`Cache-Control: public, max-age=31536000, immutable` e sem `X-Content-Type-Options: nosniff`. Um HTML
ou SVG hostil é servido **na origem que guarda as fichas** e fica em cache por um ano.
**Correção:** allowlist `image/*` (rejeitar `text/html`, `image/svg+xml`), `nosniff` e cache curto.

### A3. Corrida de dados entre sala e persistência
`internal/hub/room.go:120-127` e `:415-423` copiam um `map[string]*SheetStateEntry` (ponteiros) e
serializam **fora** do lock, enquanto a goroutine da sala escreve `sheet.Data`/`Version`
(`room.go:257-262`). O padrão correto já existe no mesmo arquivo (`room.go:184-188`, `snapshot = *active`).
**Impacto:** leitura rasgada e persistência inconsistente; `go test -race` acusaria.

### A4. `disconnect()` não desconecta
`src/services/tableSyncSocket.ts:1124-1135` fecha o socket, mas o `onclose` (`:176-180`) continua
ligado e chama `scheduleReconnect()`. Latente hoje (só os testes chamam `disconnect()`), mas impede
qualquer "modo offline" futuro e gera churn de conexões.

---

## 4. Achados — Médio

### M1. Prévia de dano lê o campo errado (verificado)
`src/services/damageApplication.ts:140-141`:
```ts
resisted: Number(calc?.resist) || 0,
condition: calc?.condition || 'nominal',
```
O domínio devolve `{ total, resist: string[], condition: string[], tookDamage }`
(`DamageFlow.ts:9-12`, `CombatController.ts:1215`). Consequências reais:
- `Number(['immunity'])` → `NaN` → `resisted` é **sempre 0** (campo morto);
- resistência/imunidade/vulnerabilidade vivem em `resist`, não em `condition`, então
  `DamageApplicationDialog.vue:292-296` nunca mostra "Resistência/Imunidade/Vulnerável" — sempre cai
  no rótulo genérico (`condition.other`), e arrays com 2+ itens produzem chave inexistente.

O `vue-tsc` não pega isso porque `combatant` é `any` (`damageApplication.ts:104-105`).

### M2. `computed` não-reativo sobre a sessão somente-leitura (verificado)
`src/services/sheetReadOnlySession.ts` guarda `let active = false` (módulo, sem reatividade), mas três
componentes fazem `computed(() => isSheetReadOnlySession())`:
`_PanelBase.vue:445`, `_skillCheckBase.vue:158`, `ApplyButton.vue:183`. O computed é avaliado uma vez
e nunca invalida; como os painéis são reutilizados com `:key="panel"`, sair de uma ficha em modo
leitura para uma ficha normal na mesma janela mantém a UI de leitura (ações escondidas).
**Correção:** exportar um `ref` reativo.

### M3. Chamada ao SDK do Owlbear dentro do caminho de escrita de stat
`StatController.ts:343-347` (novo) → `CombatController.NotifyDerivedMarkers` (`:1167-1172`) →
`StatusController.NotifyStatusChange` (`:122-140`, dispara evento de janela) → `obrBridge.ts:148-152`
→ `syncCombatantStatusMarkers` (`obrBridge.ts:2103-2126`: `OBR.scene.items.getItems` + escrita de
metadata de item).
O `AGENTS.md` proíbe chamadas desse tipo no caminho de atributo. Há mitigação real: o guard
`inDangerZone === this._lastDangerZoneMarker` limita a emissão às **transições** da Zona de Perigo —
mas `_lastDangerZoneMarker` nasce `undefined`, então a **primeira** escrita de stat de cada sessão
sempre emite. Risco baixo de frequência, forma de código contrária à regra.
**Correção:** inicializar o flag na desserialização/início de rodada e coalescer o envio fora do
write-path.

### M4. Duração crua com sufixo não numérico nunca expira
`Expiration.ts:28,53-54` + `effect_events/eventTarget.ts:168` (`RawDuration || Duration`): para um
valor como `round_end`, `Number('round_end'.split('_').pop())` = `NaN` →
`RoundEndNumber = NaN`; `HasExpired` (`:71-75`) devolve `false` para sempre, **inclusive no fim do
encontro** (o ramo `Period === 'round'` retorna antes de `context.encounterEnded`, linha 85). Antes,
o texto humano caía em `Period = 'encounter'` e expirava. Verificado por leitura; regressão estreita,
mas real. **Correção:** `Number.isFinite(n) ? n : 1` e fallback para `encounter`.

### M5. Encontro ativo substituído automaticamente pelo estado da sala
`CombatTrackerTab.vue:1262-1269` observa `roomSyncedTracker` e chama `adoptRoomEncounter()`, que faz
**substituição** dos combatentes locais pelos reconstruídos do snapshot
(`features/gm/store/encounter_store.ts:261-299`). O código documenta a intenção ("a mesa é a fonte da
verdade") e existe um plano não commitado (`plano_sincronizacao_websocket_go.md`), então
provavelmente é decisão deliberada — mas o `AGENTS.md` ainda afirma o oposto ("o encontro ativo não é
sincronizado… não reintroduza broadcast de encontro sem decisão explícita"). Além da divergência de
documentação, a troca descarta estado que só existe em memória (log de combate, efeitos estagiados).
**Ação:** atualizar `AGENTS.md` ou exigir clique explícito.

### M6. Strings de UI hardcoded em pt-BR (regra do projeto)
- `features/gm/store/encounter_store.ts:200` — `'Operação em Andamento'`, alcançado automaticamente
  por `GMEncounterRunner.vue:456` (`ensureContinuousEncounter()` no `onMounted`, que também cria e
  ativa um encontro sem o usuário pedir).
- `runner/pilot/_components/PcEndRound.vue:311,315,316` — `'Piloto'`, `Fim de Turno — …`,
  `'Turno encerrado. Ações e movimento renovados…'` (vai para o chat da mesa).
- `ui/components/TableActionDrawer/CombatTrackerTab.vue:1245,1250` — `Dano — …`, `' · DESTRUÍDO'`.
- `classes/components/feature/active_effects/_activeEffectUtils.ts:56-63` — mapa
  `kinetic: 'Cinético', …` (duplica `enums.damageType.*`, que já existe no i18n, e usa `toLowerCase()`
  em vez de `slug()`, então `'Applied Burn'` não casa).
- `features/active_mode/TableChatView.vue:80,97`, `ui/components/AppNavbar.vue:432`.

### M7. Backend proxy: sem timeout, sem teto, sem rate limit, rota morta
`server/proxy.mjs:127-156` importa `../api/rooms/[roomId]/sheets*.js`, que **não existem** no
repositório (só `api/share/[code].js` e `api/image.js`) → sempre `500` com vazamento de caminho
(`:152`, `:218` refletem mensagens internas). `public/_redirects:1` está em formato Netlify
(`/* /index.html 200.`, com ponto final sobrando) e não há `vercel.json`, então o fallback de SPA do
deploy real não está configurado.

### M8. Vulnerabilidades de dependências
`npm audit`: 32 (1 crítica, 26 altas). A crítica é `expr-eval` (dependência de produção, 1 uso no
código); as altas vêm majoritariamente de `vue`/`source-map-js`/`postcss`/`sass` via árvores de build.
Vale triar com contexto de exploitabilidade, não apenas pelo número.

### M9. Dívida de manutenibilidade acumulada no diff
- `src/services/obrBridge.ts` (99 KB / 2.608 linhas) e `ui/components/TableActionDrawer/CombatTrackerTab.vue`
  (85 KB) cresceram ainda mais; `tableSyncSocket.ts` tem 43 KB.
- Bloco "encerra turno / renova estado" duplicado em 5 pontos (`PilotSheet.ts:192-213`,
  `PcEndRound.vue:263-300`, `CombatTrackerTab.vue:1524-1560/1575-1610/1634-1660`).
- `_localizeField` (`ActiveEffect.ts:213-273`) escreve `this._lkey` **dentro de getters**, fazendo
  `Name`/`Detail`/`Condition`/`Trigger` dependerem da ordem de leitura.
- `services/tabId.ts` ficou órfão (o único import, em `encounter_store.ts:15`, não é mais usado).
- Fila offline sem teto no caminho de exceção (`tableSyncSocket.ts:712`), embora o caminho normal
  limite a 500 (`:701`).
- Métricas do `src`: 1.236 `as any`, 429 `v-html`, 149 `console.warn`, 82 `console.log`, 16
  `@ts-ignore`.

---

## 5. Achados — Baixo / higiene

1. `server/sync-server/server.exe` (15 MB) **não** é coberto pelo `.gitignore` (o padrão é
   `sync-server*`, que casa o outro binário, `sync-server.exe`) — está untracked a um `git add .` de
   entrar no repositório. `data/*.db*` está corretamente ignorado.
2. Comentário JSDoc malformado em `tableSyncSocket.ts:683-692`: o `/**` de 683 só fecha em 692,
   engolindo o JSDoc de `send()` e descrevendo uma allowlist de "somente-leitura" que **não existe**
   no método (não há mais `readOnly` no socket).
3. `catch {}` vazios engolindo erro em `tableSyncSocket.ts` (240, 575, 599, 609, 618, 1003, 1012,
   1034, 1074, 1083, 1097) e `PcEndRound.vue:318`.
4. Chunk principal de **4,15 MB** (1,16 MB gzip) em `dist/assets/main-*.js`, e o build emite avisos de
   dependência circular de chunk (`CompendiumStore`/`UserStore` reexportados por `src/stores.ts`).
5. Banco SQLite com `-wal` de 963 KB em `server/sync-server/data/` (ignorado, mas convém não deixar
   artefato de runtime no checkout).
6. `Dockerfile` roda como root, sem `USER`/`HEALTHCHECK`; `go.mod` marca `gorilla/websocket` e
   `modernc.org/sqlite` como `// indirect`.

---

## 6. O que foi executado (e ressalvas)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm run test:run` | ✅ 170 arquivos, 2.169 testes, 1 skipped, ~118 s |
| `npm run build` | ✅ `✓ built in 23.70s` — **precisou de `TEMP`/`TMP` dentro do workspace** |
| `npm run i18n:check` | ✅ 100% (4.807 chaves do universo) |
| `go vet ./...` / `go test ./...` em `server/sync-server` | ✅ exit 0 / ok |
| `npm audit --omit=dev` | ⚠️ 32 vulnerabilidades (5 low, 26 high, 1 critical) |

Ressalvas de ambiente (não são defeitos do projeto):
- O sandbox desta sessão bloqueia o `esbuild` (pipe/`spawn EPERM`) e a remoção de arquivos em
  `%TEMP%`; o build só passa com `TEMP` redirecionado para o workspace. **Isso não afeta a máquina do
  desenvolvedor** — apenas esta sessão de revisão.
- `go test -race` não roda nesta máquina (`runtime/race: cannot find package`); a corrida em A3 foi
  identificada por leitura de código.
- Os itens não marcados como "verificado" vêm de revisão estática do diff (leitura), não de execução.

---

## 7. Pontos fortes (para não se perder no meio dos achados)

- `src/services/obrLayout.ts` é uma fonte única de geometria de verdade: constantes comentadas,
  funções puras, com o histórico do problema documentado, e nenhuma cópia residual em
  `windowManager`/`mainWindow`.
- A migração para janela única está limpa: **zero** referências residuais a `prewarmContext`,
  `tableChatWindow`, `TableSheetManagerDialog` ou `tableSheetsWindow`, e nenhum fluxo novo que
  feche/recrie o popover para "mover" a janela.
- `trackerSync.ts` respeita a regra de ouro: só publica em evento estrutural do encontro, com debounce
  de 200 ms, dedupe por assinatura, throttle de 2 s nas respostas e guarda de GM. Nenhum envio por
  mudança de PV/calor.
- O protocolo TS↔Go casa 1:1 (`types/sync-protocol.ts` × `models/envelope.go`: 12 tipos, envelope e
  payloads), e o servidor tem `SetReadLimit(512 KB)`, ping/pong com deadlines, um único escritor por
  conexão e SQL 100% parametrizado.
- Testes: 2.169 casos verdes, specs ao lado do código, dois projetos Vitest bem separados e novos
  testes para o código novo (`obrLayout`, `coalescedDispatcher`, `tableRoster`, `windowReload`,
  `tableSyncSocket`, `DamageApplicationDialog`).
- Tradução pt-BR em 100% do que é endereçável offline; strings novas do diff foram para
  `ui.combat.*` em `pt.json` **e** `en.json`.

---

## 8. Plano de ação sugerido

**Antes de qualquer commit (P0):**
1. Rotacionar a chave exposta e movê-la para variável de ambiente (C1) — o resto do diff não deve ser
   publicado enquanto a credencial não for trocada.
2. `.gitignore`: adicionar `server/sync-server/*.exe` (§5.1) e conferir que nenhum binário/DB entra no
   commit.
3. Decidir o destino do diff atual: 4,1 mil linhas não commitadas em 69 arquivos, com 3 arquivos
   deletados, é risco alto de perder trabalho. Sugestão: commits temáticos (janela única → sync
   WebSocket → tracker de dano → i18n), com `npm run typecheck && npm run test:run` entre eles.

**Curto prazo (P1):** corrigir M1 (dano), M2 (read-only reativo), M4 (expiração), M6 (strings pt-BR
hardcoded) e C2 (SSRF) — são todos localizados e com correção clara.

**Médio prazo (P2):** autenticação do servidor de sync + autorização por dono/papel (C3), limites de
profundidade/índice de patch (C4), eviction de salas (A1), clonagem sob lock (A3), allowlist de
`Content-Type` (A2), `recover()` nas goroutines, eviction/limites de taxa no proxy.

**Documentação (P3):** atualizar `AGENTS.md` (encontro ativo **é** sincronizado; `obrBridge` já não é
o único caminho de sync), corrigir o `README.md` ("não há segredos de servidor"), documentar o
servidor Go (`server/sync-server/`) e o formato de `activeTracker`, e mover os `plano_*.md` da raiz
para `docs/`.
