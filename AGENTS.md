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

## Arquitetura (IMPORTANTE)

1. **Estado ativo (tempo real)** — `src/services/obrBridge.ts`. Tudo via SDK do Owlbear:
   `OBR.room.setMetadata/getMetadata/onMetadataChange`, `OBR.scene.*`, broadcast e item metadata
   de tokens. É a **fonte da verdade durante o jogo**.
2. **Persistência local** — `src/io/Storage.ts` (IndexedDB via localforage, com fallback para
   LocalStorage/memória). Fichas, encontros, logbooks e ações da mesa vivem aqui.
3. **Backend (Vercel Functions)** — `api/share/[code].js` e `api/image.js`, sobre
   `server/proxy.mjs` (CORS, anti-SSRF). **Não há banco de dados externo.**

> O antigo **cold storage em MongoDB Atlas** (`api/rooms/**`, `server/coldStorage.mjs`,
> `src/services/roomColdStorage.ts`, `src/services/sheetColdSync.ts`, `src/io/apis/roomStorage.ts`)
> foi **removido do projeto**, junto com a dependência `mongodb`. Não reintroduza persistência
> externa sem decisão explícita.

**Regra de ouro:** a camada de estado ativo **nunca** fala com a rede a cada clique/rolagem/atributo.
**Não** adicione chamadas HTTP dentro de `onMetadataChange`, `onMetadataChange` da cena nem em
watchers de atributo (HP, heat, etc.). Se algum dia houver sincronização externa, ela tem que ser
coalescida e disparada por evento de entidade (ficha salva, importada, excluída) — nunca por estado
de combate, que muda a cada PV/calor/ação.

## Convenções críticas

- **Alias `@`** → `src` (ver `vite.config.mts`). Use `@/...` nos imports do frontend.
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
- **O middleware do Vite cobre `/api/share` e `/api/image`** (ver `vite.config.mts`); as demais
  rotas de `api/**` só existem no deploy da Vercel. Para exercitar as funções localmente, use
  `vercel dev`.
- **O "Gerenciador de Fichas da Mesa" foi removido**, junto com `TableSheetManagerDialog.vue` e
  `services/tableSheetsWindow.ts` (o botão que o abria saiu do chat da mesa). As fichas da mesa
  continuam sendo listadas/gerenciadas pelos fluxos do modo ativo (Hangar, roster de NPCs e
  vínculo de token).
- **NPCs têm discriminador `npcType`** (`unit` | `doodad` | `eidolon`) — é ele que decide qual
  `Deserialize` usar (ver `src/classes/npc/` e `src/io/Importer.ts`).
- **O encontro ativo não é sincronizado entre GM e jogadores.** Ele vive no armazenamento local de
  cada janela (`active_encounters`, `current_active_encounter_id`); o que cruza a mesa são as fichas
  (posse de token) e as ações/chat da mesa. Não reintroduza broadcast de encontro sem decisão
  explícita.

## Testes

- Specs `.spec.ts` ficam ao lado do código.
- Dois projetos Vitest (domain/component, ambos happy-dom) — não mude o `include` sem necessidade.
- Cobertura tem thresholds em `src/io/**` e `src/classes/**`.

## Checklist rápido antes de finalizar uma mudança

1. `npm run typecheck` (ou ao menos `npm run build`) sem erros.
2. Nenhuma string de UI hardcoded (use i18n).
3. Nenhuma chamada de rede em watchers de estado em tempo real.
4. Nenhum segredo (senha, token, connection string) no bundle ou em resposta/erro.
5. Se mexeu na persistência local, respeitou a exigência de `id` no `SetItem`.
