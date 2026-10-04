# Arquitetura de Persistência — Estado Ativo (Owlbear) × Cold Storage (MongoDB Atlas)

> Revisão de arquitetura para o fork da extensão COMP/CON Active Mode (Owlbear Rodeo).
> **Premissa-chave do fork:** você **não** tem acesso à infraestrutura AWS do projeto original
> (Cognito / API Gateway / DynamoDB / S3). Portanto o "cold storage" em MongoDB Atlas deve ser
> infraestrutura **sua**, com backend **seu**, e o caminho de cloud legado deve ser tratado como inerte.

---

## 1. Diagnóstico do código atual (o que já existe)

Mapeei o estado atual do repositório. Ele já implementa uma separação parcial, mas com dois
sistemas que se misturam conceitualmente:

### 1.1 Estado ativo da mesa — **já está no Owlbear** (correto)

Tudo em `src/services/obrBridge.ts`, gerenciado exclusivamente via SDK:

| O quê | Onde | Mecanismo |
|---|---|---|
| Roster da mesa (apenas ids) | `OBR.room.setMetadata` | chaves `.../pilot_roster`, `.../npc_roster` |
| Índice de ids da cena | `OBR.scene.setMetadata` | chaves `.../pilots_index`, `.../npcs_index` |
| Tempo real entre clientes | `OBR.broadcast` + `BroadcastChannel` local | canal `...broadcast` (payload gzip) |
| Vínculo token↔ficha | item metadata `[COMPCON_METADATA_KEY]` | `bindTokenToSheet` — **só ids** |
| Ações da mesa (log/chat) | `OBR.room` metadata | `table_actions` |
| **Ficha (conteúdo)** | **armazenamento local do cliente** (`pilot_sheets`/`pilots`/`npcs`) | `SetItem`/`GetItem` (IndexedDB via localforage) |

> **Regra atual (importante):** a ficha **nunca** é gravada nos metadados do Owlbear. Sala e cena
> guardam **apenas um link por id**; o conteúdo vive no armazenamento local e é replicado em tempo
> real por `OBR.broadcast` (fragmentado em chunks de 12 kB) e por `BroadcastChannel` entre abas.
> Token vinculado também carrega só o link (`sheetType`, `sheetId`, `mechId?`, `combatantId?`).

Isso elimina três problemas estruturais do modelo anterior:
1. **Divergência de cópia** — o estado de combate existia em dois lugares (ficha + metadados do token).
2. **Cota** — payloads comprimidos de ficha no room (16 kB) e o cache por ficha na cena (25 MB).
3. **Perda de dados** — o cache de cena era escrito uma vez e ficava obsoleto.

`cleanupRoomMetadata()` continua existindo **somente como migração**: ele remove payloads de ficha
(`com.compcon.activemode/p/*`, `/n/*`, `.../pilots`, `.../npcs`) deixados por instalações antigas,
depois que `syncFromRoom()` já os importou para o armazenamento local.

> **Encontro ativo (sincronização removida):** o encontro **não** é mais transmitido entre GM e
> jogadores. Saíram do `obrBridge` o broadcast `ENCOUNTER_DATA`, o comando `PLAYER_COMBATANT_UPDATE`,
> a chave de cena `com.compcon.activemode/active_encounter` e o `syncActiveEncounterFromScene`. O
> encontro ativo vive só no armazenamento local do cliente (`active_encounters`,
> `current_active_encounter_id`); payloads antigos ainda podem permanecer nos metadados da cena.

Funções relevantes (reutilize-as, não reinvente):
`savePilotToRoom`, `saveNpcToRoom`, `removePilotFromRoom`, `removeNpcFromRoom`,
`getRoomPilots`, `getRoomNpcs`, `syncFromRoom`, `createTokenForSheet`, `bindTokenToSheet`,
`cleanupRoomMetadata`.

### 1.2 Persistência externa legada — **AWS de terceiros, inerte no fork**

Em `src/classes/components/cloud/` + `src/io/apis/account.ts`:

- `CloudController` / `CloudMetadataController` / `CloudTransferController` /
  `CloudSyncOrchestrator` implementam sync por **usuário** (sortkey = `user_id`), com merge
  campo-a-campo (`fieldMerge.ts`, `_fieldTs`, `_lastContentHash`) e tombstone de exclusão.
- O backend é **API Gateway + Cognito + DynamoDB + S3**, apontado por
  `VITE_APP_INVOKE_URL = https://idu55qr85i.execute-api.us-east-1.amazonaws.com/prod` e
  `x-api-key` **hardcoded** em `src/io/apis/account.ts`.
- A autenticação usa `fetchAuthSession()` (Cognito via `aws-amplify`).

**Implicação do fork:** esse caminho aponta para a conta AWS do autor original. Você não tem as
credenciais, não pode emitir tokens Cognito nem publicar Lambdas lá. Na prática, para o fork, esse
cloud é **morto**. Recomendação (ver §6): desativar/desacoplar esse caminho e **não** construir o
MongoDB em cima dele.

### 1.3 UI "Gerenciador de Fichas da Mesa" — **já existe**

`src/ui/components/Owlbear/TableSheetManagerDialog.vue` (e o duplicado
`src/features/gm/TableSheetsView.vue`). Já tem: sincronizar mesa, publicar piloto/NPC na mesa,
remover da mesa, excluir definitivo, vincular token, importar, abrir ficha.

**O que falta** (objeto deste documento): ações de **Enviar → MongoDB**, **Carregar ← MongoDB** e
**Apagar (no MongoDB)** — distintas de "remover da mesa" (que só tira do Owlbear).

---

## 2. Modelo-alvo: três camadas desacopladas

```
┌─────────────────────────────────────────────────────────────────────┐
│  CAMADA 1 — ESTADO ATIVO (tempo real)                                │
│  Owlbear SDK: room.setMetadata / scene.setMetadata / item metadata  │
│  Fonte da verdade DURANTE o jogo. Nenhuma chamada ao Mongo aqui.    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  só em ações EXPLÍCITAS do usuário
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAMADA 2 — ORQUESTRAÇÃO (cliente)                                   │
│  src/services/roomColdStorage.ts  (Enviar / Carregar / Apagar)       │
│  + src/io/apis/roomStorage.ts    (client HTTP fino)                  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  HTTP + token de API (NUNCA a URI do Mongo)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CAMADA 3 — API INTERMEDIÁRIA (backend SEU)                          │
│  Vercel Function / Cloudflare Worker / Lambda sua                    │
│  Mongo URI em env var (segredo). Valida token + rate limit + upsert. │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
                     MongoDB Atlas (cold storage, por room.id)
```

Regra de ouro: **a camada 1 nunca fala com a camada 3 diretamente a cada clique/rolagem.**
Só a camada 2 fala com a 3, e apenas quando o usuário aciona Enviar/Carregar/Apagar.

---

## 3. Revisão crítica do fluxo de dados (orquestração sem conflito / sobrecarga)

### 3.1 O que já está certo no fluxo atual

- **Estado ativo no Owlbear, conteúdo no cliente.** Índice/roster (só ids) no room/cena, broadcast
  para tempo real e ficha no armazenamento local. Isso já satisfaz o requisito "sem persistência
  contínua a cada rolagem" e, agora, também "sem ficha nos metadados".
- **Contenção de re-entrada** com `isSyncingFromRemote` / `isSavingToRemote`. Reuse o mesmo padrão
  na camada 2 (`isExporting` / `isImporting`).
- **Chunking/compressão** para o limite de 16 kB do room. No Mongo esse limite **não** existe
  (limite BSON é 16 MB por documento — uma ficha LANCER fica muito abaixo).

### 3.2 Riscos e decisões de projeto

**R1 — Acoplar Mongo aos watchers de estado. (Proibido)**
Nunca chame o Mongo dentro de `onMetadataChange`, `onMetadataChange` da cena, nem em watchers de
atributos (HP, Heat, etc.). Se um dia quiser "auto-backup", use debounce longo (≥ 30–60 s) e
somente quando o documento estiver "dirty", nunca por campo.

**R2 — Duas fontes de verdade divergindo (conflito).**
Durante o jogo, o Owlbear é a verdade; o Mongo é um **snapshot**. Entre "Enviar" e "Carregar" pode
haver divergência. Solução recomendada: **concorrência otimista** com campo `revision` (número
monotônico). O cliente guarda a `revision` que leu; no `PUT` envia `expectedRevision`; o backend
retorna **409** se não bater, e a UI pergunta: "sobrescrever o do servidor ou manter o local?".
Não use last-writer-wins silencioso para ação manual (o usuário deve escolher).

**R3 — Multi-escritor na mesma sala.**
O Owlbear permite vários GMs/players. Para cold storage, restrinja **Enviar/Apagar** ao papel GM
(a UI já tem `isGM`). Isso colapsa o problema para single-writer por sala e elimina a maioria dos
conflitos. (Players podem continuar enviando via "publicar na mesa", que é estado ativo.)

**R4 — Sobrecarga de requisições.**
- Ações são **explícitas** (botão), nunca automáticas.
- Guarda `isExporting/isImporting` evita clique duplo.
- `idempotency-key` no `PUT` (um UUID gerado por ação) para o caso de retry em rede.
- Rate limit no backend por token/room (ex.: 30 req/min).
- `GET /sheets` de listagem retorna **sem** `payload` (só metadados) para a lista; o payload só vem
  no `GET /sheets/{sheetId}` (uma ficha por vez).

**R5 — Identificação de sala (`room.id`).**
`OBR.room.id` existe (getter no SDK) e é estável por sala. Use-o como partição. Atenção: `room.id`
**não é segredo** (sala é aberta por código). Logo, a autorização não pode se apoiar só nele — ver §5.

**R6 — O cloud legado AWS pode interferir.**
Se o `CloudController` tentar sincronizar em background contra o API Gateway do autor original,
vai gerar erros/spam no fork. Desative o ciclo de sync automático (ou o deixe atrás de flag) antes
de adicionar o cold storage. Ver §6.

### 3.3 Sequência canônica de cada ação

- **Enviar (ativo → Mongo):** `raw.Serialize()` → sanitizar → montar doc → `PUT` com
  `expectedRevision` → trata 409 (pergunta) → notifica. **Não** altera o estado ativo.
- **Carregar (Mongo → ativo):** `GET /sheets/{sheetId}` → `payload` → `Pilot.Deserialize` ou
  `Unit/Doodad/Eidolon.Deserialize` → push no store local + `SetItem` (IndexedDB) →
  `obrBridge.savePilotToRoom(pilot, true)` / `saveNpcToRoom(npc, true)` (instancia no Owlbear) →
  opcional `createTokenForSheet`.
- **Apagar (Mongo):** `DELETE /sheets/{sheetId}`. **Não** remove da mesa (isso é
  `removePilotFromRoom`/`removeNpcFromRoom`). A UI deve deixar explícito que são operações
  independentes.

### 3.4 Sincronização automática (padrão) — `src/services/sheetColdSync.ts`

Além dos botões, o catálogo acompanha a vida da ficha **sem ação do usuário**. Três eventos
disparam a fila:

| Evento | Gatilho no código | Ação no catálogo |
|---|---|---|
| Ficha importada/criada (sharecode, JSON, clone, editor) | `PilotStore.AddPilot`, `NpcStore.AddNpc` | `PUT` (upsert) |
| Ficha salva | `SaveController._save()` | `PUT` (upsert) |
| Ficha excluída em definitivo | `DeletePilotPermanent`, `DeleteNpcPermanent` | `DELETE` |

Decisões que mantêm isso compatível com a "regra de ouro" (§3.2) e com o rate limit do backend:

- **Ficha canônica apenas.** O gatilho de "salva" chega para toda entidade salvável, então a fila
  verifica identidade (`toRaw`) contra `PilotStore().Pilots` / `NpcStore().Npcs`. O ator dentro de
  uma pilot sheet ou de um encontro é uma cópia desacoplada — mudar PV/calor/ação ali **não** gera
  requisição. `pilot_sheets`, `active_encounters`, encontros e campanhas nunca são enviados.
- **Coalescência.** Fila é um mapa por `sheetId` (a última ação vence) com debounce de 3 s, **teto de
  espera de 10 s**, uma requisição em voo por vez e retry com backoff (3 tentativas). O teto é
  necessário porque o `SaveController` grava duas vezes por `save()` (leading + trailing do throttle
  de 1,5 s) e cada gravação reinicia o debounce — sem teto, uma ficha em edição contínua nunca
  sincronizaria.
- **Last-write-wins.** O `PUT` automático não envia `expectedRevision` (o servidor só responde 409
  quando ela vem), então a versão local sempre vence. Os botões continuam com concorrência otimista.
- **Silencioso.** Sem `OBR.notification` — um aviso por gravação seria ruído. Falhas vão para o
  `logger` (WARN) e para o estado por ficha (`getSheetColdSyncStatus`).
- **Fora da sala não há catálogo:** a fila é descartada e nada é enviado.
- **Carregar não reenvia:** `importSheetFromCold` escreve por `SetItem` + push direto na store (nunca
  por `AddPilot`/`AddNpc` nem pelo `SaveController`), então o ato de carregar não realimenta a fila.
- **Serialização:** todas as operações de cold storage passam por um lock (uma por vez, na ordem de
  chegada). Antes havia um `busy` que **descartava** a chamada concorrente — com a sincronização
  automática isso perderia gravações.

---

## 4. Schema MongoDB Atlas

Banco `owlbear` (ou `compcon`), coleção **`room_sheets`**. Um documento por ficha por sala.

```js
{
  _id: ObjectId(),              // opaco, gerado pelo driver

  // --- Partição / identidade ---
  roomId: "a1b2c3...",          // OBR.room.id  → índice obrigatório
  sheetId: "pilot-uuid",        // ID estável da ficha (Pilot.ID / Npc.ID)
  entityType: "pilot",          // "pilot" | "npc"  (extensível a "encounter")

  // --- Metadados leves (para listagens SEM payload) ---
  name: "Nyx",
  callsign: "Wraith",           // só para pilotos
  meta: {
    authorId: "obr-player-id",  // quem salvou (não é segredo, só auditoria)
    lastModified: 1710000000000,// LastModified da fonte (SaveController)
    source: "table",            // "table" | "catalog" | "manual"
    tags: ["boss", "recorrente"]
  },

  // --- Concorrência otimista ---
  revision: 7,                  // incrementado a cada upsert; cliente reenvia p/ CAS

  // --- Payload da ficha (o que Serialize() produz, idêntico ao que vai p/ a cena) ---
  payload: { /* Pilot.Serialize() ou Npc.Serialize() integral */ },

  // --- Auditoria ---
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

### Índices

```js
db.room_sheets.createIndex({ roomId: 1, entityType: 1, updatedAt: -1 })   // listagem por sala
db.room_sheets.createIndex({ roomId: 1, sheetId: 1 }, { unique: true })   // 1 doc por ficha/sala
```

### Regras do payload

- `payload` deve ser **exatamente** o objeto que `Pilot.Serialize()` / `Npc.Serialize()` retornam
  (o mesmo `sanitized` de `savePilotsToRoom`), para round-trip limpo via `Deserialize`.
- Guarde `entityType` e (para NPC) o discriminador `payload.npcType` (`unit`/`doodad`/`eidolon`)
  — é ele que decide qual `Deserialize` usar no "Carregar".
- Não serialize para string; mantenha como subdocumento BSON (permite consultas futuras).
- Opcional: TTL index em um `deletedAt` para "lixeira" com retenção.

---

## 5. API intermediária (backend **seu**, serverless)

### 5.1 Por que um backend é obrigatório

O driver Node do MongoDB **não roda no navegador** (sem TCP/TLS direto) e, mesmo que rodasse,
**embutir a connection string no bundle expõe o banco inteiro** a qualquer usuário que abrir o
DevTools. A URI/credenciais do Atlas **nunca** vão para o frontend. Elas vivem só como **env var**
da função.

### 5.2 Onde hospedar (recomendado para fork)

Como o AWS do projeto original é inacessível, escolha algo **que você controla**, com free tier e
env vars simples:

- **Vercel Functions** (Next.js `/api` ou standalone) — recomendado; deploy trivial, env vars nativas.
- **Cloudflare Workers** — latência excelente, KV/D1, mas atenção ao runtime (não é Node puro; use
  o driver `mongodb` em compat mode ou o **Atlas Data API**).
- **Render / Railway / Fly.io** — um serviço Node pequeno, sem serverless.
- **Sua própria conta AWS/Azure/GCP** — Lambda + API Gateway novos, só se você já tiver conta.

Para o restante, assumo **Vercel/Node**, mas a lógica é a mesma em qualquer um.

### 5.3 Autenticação — decisão adotada: **modo ingênuo (sem token)**

Por decisão do projeto, a extensão será usada por **vários mestres e jogadores** e os dados não são
sensíveis. Então **não há autenticação**: o backend não exige token/login. O único requisito real é
que **só a Vercel tenha acesso ao banco** e que a API exponha apenas operações de ficha. Isso é
garantido por:

- `MONGODB_URI` existe **somente** como env var da Vercel (nunca no bundle nem em respostas).
- As funções fazem **só CRUD estreito** na coleção fixa `room_sheets` — sem query arbitrária, sem
  outras coleções, sem comandos de admin.
- **Validação de entrada** (`entityType` ∈ {pilot, npc}, `payload` objeto) + **teto de tamanho** (4 MB).
- **Rate limit por IP** + resposta **genérica** em erros 5xx (não vaza detalhes da conexão).
- `room.id` é um ID aleatório não-trivial: na prática, um cliente só conhece o `roomId` da própria
  sala, então o estrago máximo é "salvar/apagar fichas da própria sala" — aceito pelo projeto.

> Se um dia os dados ficarem sensíveis, basta reintroduzir um token por sala (fluxo de "claim")
> descrito na revisão anterior — a estrutura de endpoints já está pronta para isso.

### 5.4 Contrato HTTP

```
GET    /rooms/{roomId}/sheets?type=pilot|npc        → [{ roomId, sheetId, entityType, name,
                                                       callsign, meta, revision, updatedAt }]  // sem payload
GET    /rooms/{roomId}/sheets/{sheetId}             → documento completo (com payload)
PUT    /rooms/{roomId}/sheets/{sheetId}             → upsert (Enviar)
         body: { entityType, name, callsign, meta, payload, expectedRevision?, idempotencyKey? }
         200 → doc salvo (revision nova) | 409 → conflito (revision divergente)
DELETE /rooms/{roomId}/sheets/{sheetId}             → remove (Apagar)
```

Cabeçalhos comuns: `Content-Type: application/json`. (Sem `Authorization` no modo ingênuo.)

### 5.5 Esqueleto da função (Node + driver `mongodb`) — **superseded**

> O pseudo-código abaixo (estilo `Request/Response`) foi substituído pela implementação real em
> `server/coldStorage.mjs` + `api/rooms/...` (estilo `(req, res)`), descrita na §10. No modo
> ingênuo, remova o `authorize()`/`API_KEY` deste exemplo.

```js
// api/rooms/[roomId]/sheets/[...sheetId].js  (Vercel) — ou handler único em Lambda
import { MongoClient } from 'mongodb'

const URI = process.env.MONGODB_URI          // SEGREDO — nunca no frontend
const API_KEY = process.env.COLD_STORAGE_API_KEY
const DB = process.env.MONGODB_DB || 'owlbear'

let client
async function db() {
  client ??= await new MongoClient(URI, { maxPoolSize: 5 }).connect()  // conexão reutilizada
  return client.db(DB)
}

const err = (status, message) => Object.assign(new Error(message), { status })

function authorize(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token || token !== API_KEY) throw err(401, 'unauthorized')
  // (opção 2: verificar token de sala assinado HMAC com escopo { roomId })
}

export default async function handler(req) {
  authorize(req)
  const { roomId, sheetId } = req.query            // ou pathParameters
  if (!roomId) throw err(400, 'missing roomId')

  const col = (await db()).collection('room_sheets')
  const filter = { roomId, sheetId }
  const method = req.method

  if (method === 'GET' && sheetId) {
    const doc = await col.findOne(filter)
    return doc ? Response.json(doc) : err(404, 'not found')
  }

  if (method === 'GET') {                            // listagem sem payload
    const type = req.nextUrl?.searchParams?.get('type')
    const q = { roomId, ...(type ? { entityType: type } : {}) }
    return Response.json(await col.find(q, { projection: { payload: 0 } })
      .sort({ updatedAt: -1 }).toArray())
  }

  if (method === 'PUT') {
    const body = await req.json()
    const existing = await col.findOne(filter)

    // Concorrência otimista: só sobrescreve se a revision bater
    if (body.expectedRevision != null && existing && existing.revision !== body.expectedRevision) {
      throw err(409, 'conflict')
    }

    const now = new Date()
    const doc = {
      roomId, sheetId,
      entityType: body.entityType,
      name: body.name, callsign: body.callsign,
      meta: body.meta,
      payload: body.payload,
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await col.updateOne(filter, { $set: doc }, { upsert: true })
    return Response.json(doc)
  }

  if (method === 'DELETE') {
    await col.deleteOne(filter)
    return new Response(null, { status: 204 })
  }

  throw err(404, 'not found')
}
```

> Rate limiting: já implementado em `server/coldStorage.mjs` (mapa `IP → janela` em memória).

---

## 6. Desativando o cloud AWS legado (passo obrigatório no fork)

O `CloudController`/`SyncStore` tentam falar com o API Gateway do autor original. No fork:

1. **Opção A (rápida):** desative o auto-sync. Em `src/io/Startup.ts` e `src/user/store/SyncStore.ts`,
   não chame `BatchUpdateCloud`/`syncFromCloud` quando não houver `VITE_APP_INVOKE_URL` próprio.
2. **Opção B (limpa):** coloque uma flag `VITE_ENABLE_LEGACY_CLOUD` (default `false`) e gateie
   `getHeaders()`/`fetchWithRetry` e os gatilhos de sync atrás dela. Assim o fork fica sem tráfego
   para a AWS de terceiros, mas o código permanece para eventual re-ligação.
3. **Não** remova `CloudController` bruscamente — `Pilot`/`Npc`/`Encounter` o referenciam em
   `Serialize`/`Deserialize`. Neutralize no nível de I/O, não no modelo.

---

## 7. Lógica do gerenciador (Enviar / Carregar / Apagar)

> Os arquivos reais já estão implementados no repositório (`src/io/apis/roomStorage.ts` e
> `src/services/roomColdStorage.ts`) e prevalecem sobre os trechos ilustrativos abaixo — que usam
> o modo ingênuo (sem token).

### 7.1 Client HTTP fino — `src/io/apis/roomStorage.ts` (novo)

```ts
// src/io/apis/roomStorage.ts
export type SheetEntityType = 'pilot' | 'npc'

export interface ColdSheetSummary {
  roomId: string; sheetId: string; entityType: SheetEntityType
  name: string; callsign?: string
  meta: { authorId: string; lastModified: number; source: string; tags?: string[] }
  revision: number; updatedAt: number
}
export interface ColdSheetDoc extends ColdSheetSummary { payload: any }

const INVOKE = (import.meta as any).env.VITE_COLD_STORAGE_URL // ex.: https://seu-app.vercel.app

async function roomFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${INVOKE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 409) throw new ColdConflictError()
  if (!res.ok) {
    const b = await res.json().catch(() => null)
    throw new Error(b?.message || `room storage ${res.status}`)
  }
  return res
}

export class ColdConflictError extends Error { constructor() { super('conflict') } }

export async function listRoomSheets(roomId: string, type?: SheetEntityType): Promise<ColdSheetSummary[]> {
  const q = type ? `?type=${type}` : ''
  const res = await roomFetch(`/rooms/${encodeURIComponent(roomId)}/sheets${q}`)
  return res.json()
}
export async function getRoomSheet(roomId: string, sheetId: string): Promise<ColdSheetDoc> {
  const res = await roomFetch(`/rooms/${encodeURIComponent(roomId)}/sheets/${encodeURIComponent(sheetId)}`)
  return res.json()
}
export async function saveRoomSheet(doc: ColdSheetDoc & { expectedRevision?: number }): Promise<ColdSheetDoc> {
  const res = await roomFetch(
    `/rooms/${encodeURIComponent(doc.roomId)}/sheets/${encodeURIComponent(doc.sheetId)}`,
    { method: 'PUT', body: JSON.stringify(doc) }
  )
  return res.json()
}
export async function deleteRoomSheet(roomId: string, sheetId: string): Promise<void> {
  await roomFetch(`/rooms/${encodeURIComponent(roomId)}/sheets/${encodeURIComponent(sheetId)}`, { method: 'DELETE' })
}
```

> A URI do backend vem de `VITE_COLD_STORAGE_URL` (não é segredo — a função é pública). Sem token:
> o acesso é aberto, e **a URI do Mongo nunca aparece no frontend** (só na env da Vercel).

### 7.2 Orquestração — `src/services/roomColdStorage.ts` (novo)

```ts
// src/services/roomColdStorage.ts
import OBR from '@owlbear-rodeo/sdk'
import { toRaw } from 'vue'
import { getRoomSheet, saveRoomSheet, deleteRoomSheet, ColdConflictError,
         type SheetEntityType, type ColdSheetDoc } from '@/io/apis/roomStorage'
import { obrBridge } from './obrBridge'
import { SetItem } from '@/io/Storage'

const sanitize = (v: unknown) => JSON.parse(JSON.stringify(v))
let busy = false

function roomId(): string {
  if (!OBR.room?.id) throw new Error('Sala Owlbear não disponível')
  return OBR.room.id
}

function buildDoc(sheet: any, type: SheetEntityType): ColdSheetDoc {
  const raw = toRaw(sheet)
  const id = raw.ID ?? raw.id
  const payload = typeof raw.Serialize === 'function' ? raw.Serialize() : raw
  return {
    roomId: roomId(),
    sheetId: id,
    entityType: type,
    name: raw.Name || raw.name || raw.Callsign || raw.callsign || 'Ficha',
    callsign: raw.Callsign || raw.callsign,
    meta: {
      authorId: OBR.player?.id ?? '',
      lastModified: raw.SaveController?.LastModified ?? Date.now(),
      source: 'table',
    },
    payload: sanitize(payload),
    revision: raw.CloudController?.Metadata?.Updated ?? 0,
    updatedAt: Date.now(),
  }
}

/** ENVIAR: estado ativo → MongoDB (não altera o Owlbear) */
export async function exportSheetToCold(
  sheet: any, type: SheetEntityType, onConflict?: () => Promise<boolean>
): Promise<void> {
  if (busy) return
  busy = true
  try {
    const doc = buildDoc(sheet, type)
    try {
      const saved = await saveRoomSheet(doc)
      await OBR.notification.show(`"${saved.name}" salvo no catálogo da sala.`)
    } catch (e) {
      if (e instanceof ColdConflictError && onConflict) {
        const overwrite = await onConflict()          // UI: "sobrescrever servidor?"
        if (overwrite) {
          const force = await saveRoomSheet({ ...doc, expectedRevision: undefined })
          await OBR.notification.show(`"${force.name}" sobrescrito no catálogo.`)
        }
      } else throw e
    }
  } finally { busy = false }
}

/** CARREGAR: MongoDB → estado ativo do Owlbear */
export async function importSheetFromCold(sheetId: string, type: SheetEntityType): Promise<void> {
  if (busy) return
  busy = true
  try {
    const doc = await getRoomSheet(roomId(), sheetId)
    const data = { ...(doc.payload ?? {}), id: doc.sheetId }

    if (type === 'pilot') {
      const { Pilot } = await import('@/classes/pilot/Pilot')
      const { PilotStore } = await import('@/features/pilot_management/store')
      const pilot = Pilot.Deserialize(data)
      const store = PilotStore()
      const idx = store.Pilots.findIndex((p: any) => (p.ID || p.id) === doc.sheetId)
      idx === -1 ? store.Pilots.push(pilot) : store.Pilots.splice(idx, 1, pilot)
      await SetItem('pilots', sanitize(data))
      await obrBridge.savePilotToRoom(pilot, true)          // instancia no Owlbear (roster+scene+broadcast)
      await obrBridge.createTokenForSheet(pilot, 'pilot')   // opcional
    } else {
      const { NpcStore } = await import('@/features/gm/store/npc_store')
      let npc: any = null
      if (data.npcType === 'unit')      { const { Unit } = await import('@/classes/npc/unit/Unit'); npc = Unit.Deserialize(data) }
      else if (data.npcType === 'doodad'){ const { Doodad } = await import('@/classes/npc/doodad/Doodad'); npc = Doodad.Deserialize(data) }
      else if (data.npcType === 'eidolon'){ const { Eidolon } = await import('@/classes/npc/eidolon/Eidolon'); npc = Eidolon.Deserialize(data) }
      if (!npc) throw new Error('Tipo de NPC não reconhecido')

      const store = NpcStore()
      const idx = store.Npcs.findIndex((n: any) => (n.ID || n.id) === doc.sheetId)
      idx === -1 ? store.Npcs.push(npc) : store.Npcs.splice(idx, 1, npc)
      await SetItem('npcs', sanitize(data))
      await obrBridge.saveNpcToRoom(npc, true)
      await obrBridge.createTokenForSheet(npc, 'npc')
    }

    await OBR.notification.show(`"${doc.name}" carregado para a mesa.`)
  } finally { busy = false }
}

/** APAGAR: remove do MongoDB (NÃO remove da mesa Owlbear) */
export async function deleteSheetFromCold(sheetId: string): Promise<void> {
  if (busy) return
  busy = true
  try {
    await deleteRoomSheet(roomId(), sheetId)
    await OBR.notification.show('Ficha removida do catálogo da sala.')
  } finally { busy = false }
}
```

### 7.3 Integração na UI — `TableSheetManagerDialog.vue`

Acrescente uma aba "Catálogo (MongoDB)" (ou botões por ficha) e conecte às funções acima. Esqueleto:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { exportSheetToCold, importSheetFromCold, deleteSheetFromCold } from '@/services/roomColdStorage'
import { listRoomSheets, type ColdSheetSummary } from '@/io/apis/roomStorage'
import { obrBridge } from '@/services/obrBridge'
import OBR from '@owlbear-rodeo/sdk'

const isGM = computed(() => obrBridge.getRole() === 'GM')
const coldSheets = ref<ColdSheetSummary[]>([])
const isLoadingCold = ref(false)

async function refreshColdCatalog() {
  if (!isGM.value) return
  isLoadingCold.value = true
  try { coldSheets.value = await listRoomSheets(OBR.room.id) }
  finally { isLoadingCold.value = false }
}

// ENVIAR ficha atual
async function sendToCold(sheet: any, type: 'pilot' | 'npc') {
  await exportSheetToCold(sheet, type, async () => {
    // callback de conflito 409 → pergunta ao usuário
    return window.confirm('A ficha no servidor mudou. Sobrescrever com a versão local?')
  })
}

// CARREGAR ficha do catálogo
async function loadFromCold(s: ColdSheetSummary) {
  await importSheetFromCold(s.sheetId, s.entityType)
  await refreshColdCatalog()
}

// APAGAR do catálogo (sem tocar na mesa)
async function removeFromCold(s: ColdSheetSummary) {
  if (window.confirm(`Apagar "${s.name}" do catálogo da sala? (não remove da mesa)`)) {
    await deleteSheetFromCold(s.sheetId)
    await refreshColdCatalog()
  }
}
</script>
```

Regras de UI a respeitar:

- **Enviar/Apagar no Mongo** só visíveis para `isGM`.
- **Apagar no Mongo** ≠ **Remover da Mesa** — rotule claramente ("Remover do catálogo" vs
  "Remover da mesa").
- Mostre estado `isLoadingCold`/loading nos botões para evitar duplo clique.
- Mostre erro de conflito (409) com opção explícita sobrescrever/manter.

---

## 8. Checklist de implementação (ordem sugerida)

1. **Provisionar backend seu** (Vercel/Cloudflare) + env vars `MONGODB_URI`, `MONGODB_DB`.
2. **Criar coleção e índices** no Atlas (§4).
3. **Desativar cloud legado AWS** no fork (§6).
4. **Criar `src/io/apis/roomStorage.ts`** (§7.1).
5. **Criar `src/services/roomColdStorage.ts`** (§7.2).
6. **Adicionar aba/controles na UI** do gerenciador (§7.3).
7. **Testar round-trip**: Enviar → limpar store local → Carregar → conferir que voltou ao store
   local do cliente (metadados do Owlbear continuam guardando apenas o link por id).
8. **Testar conflito**: dois clientes editando a mesma ficha → 409 → fluxo de sobrescrever/manter.

---

## 9. Resumo das decisões

| Decisão | Escolha |
|---|---|
| Fonte da verdade em jogo | Store local do cliente (IndexedDB) + Owlbear SDK para **índices/links por id** |
| Fonte da verdade em "repouso" | MongoDB Atlas, partição `room.id` |
| Gatilho de persistência | Ação explícita do usuário (nunca watcher de atributo) |
| Conflito | Concorrência otimista (`revision` + 409) |
| Escritores | Só GM (single-writer por sala) |
| Backend | Serverless **seu** (Vercel/Cloudflare), Mongo URI em env var |
| Auth | Sem autenticação (modo ingênuo) — backend expõe só CRUD estreito em `room_sheets` + rate limit por IP |
| Cloud legado AWS | Inerte/desativado no fork |

---

## 10. Implementação criada (Vercel + MongoDB Atlas)

Já implementei os arquivos abaixo, seguindo a convenção do projeto (Vercel Functions em estilo
Node `(req, res)` — o mesmo padrão de `api/share/[code].js` + `server/proxy.mjs`). Isso substitui o
pseudo-código em estilo `Request/Response` da §5.5.

| Arquivo | Papel |
|---|---|
| `server/coldStorage.mjs` | Conexão Mongo (lazy), CORS, CRUD estreito, rate limit por IP, helpers |
| `api/rooms/[roomId]/sheets.js` | `GET` lista o catálogo (sem `payload`) |
| `api/rooms/[roomId]/sheets/[sheetId].js` | `GET`/`PUT`(upsert+revision)/`DELETE` |
| `src/io/apis/roomStorage.ts` | Client HTTP fino (sem token) |
| `src/services/roomColdStorage.ts` | Orquestração Enviar/Carregar/Apagar + portas automáticas (`pushSheetToCold`/`purgeSheetFromCold`) |
| `src/services/sheetColdSync.ts` | Fila da sincronização automática (gatilhos, coalescência, retry) |
| `.env.example` | Variáveis de ambiente do servidor |

### Como subir (passos)

1. `npm install` (ou `pnpm install`) para baixar o driver `mongodb` (adicionado ao `package.json`).
2. No Atlas: criar banco `owlbear` e coleção `room_sheets` + os índices da §4.
3. No painel da Vercel → *Settings → Environment Variables*, adicionar:
   `MONGODB_URI` e `MONGODB_DB` (valores em `.env.example`).
4. Conectar a UI (`TableSheetManagerDialog.vue`) às funções de `roomColdStorage.ts`, conforme §7.3.

> A rota `api/` já existe no projeto (`api/share/[code].js`), então o deploy da Vercel detecta as
> novas funções automaticamente ao fazer push.
