# AGENTS.md — instruções para agentes de código

Guia de convenções, arquitetura e armadilhas deste repositório. Leia antes de mexer no código.

## O que é

Fork da extensão **COMP/CON Official Active Mode** (assistente do RPG LANCER) para o
**Owlbear Rodeo**. Vue 3 + TypeScript + Vite + Vuetify + Pinia + vue-i18n. O frontend roda como
popover dentro do Owlbear (ver `public/manifest.json`).

## Comandos

```bash
npm install
npm run dev            # Vite dev server (http://localhost:5173)
npm run build          # build de produção (index.html + launcher.html)
npm run typecheck      # vue-tsc --noEmit (pesado; use antes de commits grandes)
npm run test:run       # Vitest single-run (dois projetos: domain e component)
```

## Arquitetura em 3 camadas (IMPORTANTE)

1. **Estado ativo (tempo real)** — `src/services/obrBridge.ts`. Tudo via SDK do Owlbear:
   `OBR.room.setMetadata/getMetadata/onMetadataChange`, `OBR.scene.*`, broadcast e item metadata
   de tokens. É a **fonte da verdade durante o jogo**.
2. **Orquestração** — `src/services/roomColdStorage.ts` + `src/io/apis/roomStorage.ts`.
   Ações **explícitas** de Enviar/Carregar/Apagar.
3. **Cold storage (MongoDB Atlas)** — `api/rooms/**` (Vercel Functions) + `server/coldStorage.mjs`.
   CRUD estreito sobre a coleção `room_sheets`, particionado por `room.id`.

**Regra de ouro:** a camada 1 **nunca** fala com a camada 3 a cada clique/rolagem/atributo. Só a
camada 2 fala com a 3, e apenas quando o usuário aciona um botão. **Não** adicione chamadas de
Mongo/HTTP dentro de `onMetadataChange`, `onMetadataChange` da cena nem em watchers de atributo
(HP, heat, etc.).

## Convenções críticas

- **Alias `@`** → `src` (ver `vite.config.mts`). Use `@/...` nos imports do frontend.
- **Sem autenticação no cold storage** ("modo ingênuo", decisão do projeto): a URI do Mongo só
  existe como env var da Vercel (`MONGODB_URI`). **Nunca** coloque a connection string no bundle,
  em resposta de API ou em erro. Erros 5xx do servidor devem retornar mensagem **genérica**
  (`handleError` em `server/coldStorage.mjs`).
- **Cloud AWS legado é inerte neste fork.** `src/io/apis/account.ts`, `src/classes/components/cloud/*`
  e `UserStore().Cognito` apontam para a conta AWS do projeto original, que **não é acessível**.
  Não construa nada em cima disso; se precisar, neutralize no nível de I/O (não remova
  `CloudController` bruscamente — `Pilot`/`Npc`/`Encounter` o referenciam em Serialize/Deserialize).
- **Persistência local** via `SetItem`/`GetItem` de `src/io/Storage.ts` (IndexedDB/localforage).
  `SetItem(collection, item)` **exige** `item.id`/`ID`/`sortkey`/`_id` — objetos sem chave são
  ignorados com um warn.
- **i18n:** strings novas de UI vão para `src/i18n/locales/**` (vue-i18n, pt-BR). Não hardcode
  texto de UI.
- **`.env` é gitignored** (`.env`, `.env.local`, `.env.*.local`). Nunca commite credenciais.

## Gotchas / armadilhas

- **Room metadata tem limite de ~16 kB.** Payloads de ficha vão para a **cena** (`OBR.scene`,
  limite 25 MB), comprimidos (gzip+base64) e fatiados em chunks de 12 kB
  (`encodeDataToChunks`/`decodeDataFromChunks` em `obrBridge.ts`). No room ficam só rosters leves.
- **`/api/rooms/**` (cold storage) NÃO roda sob `npm run dev`.** O middleware do Vite só cobre
  `/api/share` e `/api/image` (ver `vite.config.mts`). Para testar as funções de catálogo
  localmente, use `vercel dev` (ou teste contra o deploy).
- **O "Gerenciador de Fichas da Mesa" é o dialog** `src/ui/components/Owlbear/TableSheetManagerDialog.vue`
  (montado em `App.vue`). A antiga view standalone (`features/gm/TableSheetsView.vue`, rota
  `/table-sheets`) foi **removida**; `openTableSheetsWindow()` agora apenas dispara o evento
  `compcon-open-table-sheets`, que abre o dialog.
- **`mongodb` (driver) é server-only.** Importe apenas em `server/*.mjs` e `api/**`. Nunca importe
  em código de `src/` (não roda no navegador).
- **NPCs têm discriminador `npcType`** (`unit` | `doodad` | `eidolon`) — é ele que decide qual
  `Deserialize` usar (ver `importSheetFromCold`).
- **Concorrência otimista no catálogo:** o cliente envia `expectedRevision` (quando conhece) e o
  servidor responde **409** em conflito. `ColdConflictError` carrega o documento `current`.

## Mapa do cold storage (feature recente)

| Arquivo | Papel |
|---|---|
| `server/coldStorage.mjs` | Mongo lazy, CORS, rate limit por IP, `handleError` genérico |
| `api/rooms/[roomId]/sheets.js` | `GET` lista (projeção sem `payload`) |
| `api/rooms/[roomId]/sheets/[sheetId].js` | `GET`/`PUT` (upsert + revision)/`DELETE` |
| `src/io/apis/roomStorage.ts` | Client HTTP (`listRoomSheets`, `getRoomSheet`, `saveRoomSheet`, `deleteRoomSheet`) |
| `src/services/roomColdStorage.ts` | `exportSheetToCold`, `importSheetFromCold`, `deleteSheetFromCold` |
| `.env.example` | `MONGODB_URI`, `MONGODB_DB` |
| `docs/arquitetura-persistencia-cold-storage.md` | arquitetura completa |

## Testes

- Specs `.spec.ts` ficam ao lado do código.
- Dois projetos Vitest (domain/component, ambos happy-dom) — não mude o `include` sem necessidade.
- Cobertura tem thresholds em `src/io/**` e `src/classes/**`.

## Checklist rápido antes de finalizar uma mudança

1. `npm run typecheck` (ou ao menos `npm run build`) sem erros.
2. Nenhuma string de UI hardcoded (use i18n).
3. Nenhuma chamada de rede/Mongo em watchers de estado em tempo real.
4. Nenhum segredo (URI do Mongo, senha, token) no bundle ou em resposta/erro.
5. Se mexeu na persistência local, respeitou a exigência de `id` no `SetItem`.
