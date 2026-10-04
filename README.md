# COMP/CON Official Active Mode — fork (Owlbear Rodeo)

Extensão para o [Owlbear Rodeo](https://www.owlbear.rodeo/) que integra o **COMP/CON**
(assistente digital do RPG **LANCER**) à mesa virtual: fichas de **Piloto** e **NPC** em tempo
real, encontro/combate, vinculação de tokens, dados 3D (dddice), ações/chat da mesa e **catálogo
(cold storage)** de fichas.

> ⚠️ **Fork.** Este repositório é um fork do projeto original. A infraestrutura de cloud AWS do
> original (Cognito / API Gateway / DynamoDB / S3) **não é acessível neste fork** e deve ser
> tratada como inativa. A persistência externa aqui é o **cold storage em MongoDB Atlas +
> Vercel Functions** (veja [Cold storage](#cold-storage-mongodb-atlas--vercel)).

---

## Stack

- **Vue 3.5** + **TypeScript** + **Vite 6**
- **Vuetify 3**, **Pinia 3**, **Vue Router 4**, **vue-i18n**
- **@owlbear-rodeo/sdk** (estado em tempo real da mesa)
- **Vitest 4** + happy-dom (testes)

## Requisitos

- Node.js **18+** (recomendado **20**)
- npm (o projeto usa `package-lock.json`)
- Conta no [Owlbear Rodeo](https://www.owlbear.rodeo/)

## Instalação e desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
```

A extensão roda como um popover dentro do Owlbear Rodeo (ver `public/manifest.json`).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor Vite de desenvolvimento (porta 5173) |
| `npm run build` | Build de produção (gera `index.html` e `launcher.html`) |
| `npm run build-nocheck` | Build sem typecheck |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run test` / `test:run` | Vitest (watch / single-run) |
| `npm run test:coverage` | Cobertura de testes |
| `npm run lcps` / `lcps:update` | Baixa os LCPs oficiais |
| `npm run i18n:sync` / `i18n:*` | Sincroniza/verifica traduções pt-BR |

## Testes

Vitest está dividido em dois projetos (ver `vite.config.mts`):

- **domain** — `src/**/*.spec.ts` (classes/io/util), happy-dom;
- **component** — `src/{ui,features}/**/*.spec.ts`, happy-dom.

Os arquivos `.spec.ts` ficam ao lado do código que testam.

## Variáveis de ambiente

**Nunca** commite arquivos `.env` — o `.gitignore` já cobre `.env`, `.env.local` e `.env.*.local`.

### Cliente (build-time, prefixo `VITE_`)

| Variável | Uso |
|---|---|
| `VITE_APP_INVOKE_URL` | Base do API Gateway AWS **legado** (inerte no fork) |
| `VITE_APP_API_KEY` | API key AWS **legada** (inerte no fork) |
| `VITE_COLD_STORAGE_URL` | (opcional) Base do backend de catálogo; default é `/api` relativo |

### Servidor (Vercel Functions, só no painel da Vercel)

| Variável | Uso |
|---|---|
| `MONGODB_URI` | Connection string do MongoDB Atlas (**segredo** — nunca vai para o bundle) |
| `MONGODB_DB` | Nome do banco (default `owlbear`) |

Modelo pronto em [`.env.example`](.env.example).

## Cold storage (MongoDB Atlas + Vercel)

O estado **em tempo real** da mesa vive 100% no Owlbear (via SDK: `room`/`scene` metadata,
broadcast e item metadata de tokens). O MongoDB Atlas é usado como **repositório frio** de fichas,
particionado por `room.id`.

- **Sem autenticação** (modo ingênuo): só a Vercel tem acesso ao banco; as funções expõem apenas
  um CRUD estreito sobre a coleção `room_sheets`.
- **Ações explícitas** no "Gerenciador de Fichas da Mesa": **Enviar** (ficha → Mongo), **Carregar**
  (Mongo → mesa) e **Apagar** (só no Mongo).

Arquitetura completa, schema e código: [`docs/arquitetura-persistencia-cold-storage.md`](docs/arquitetura-persistencia-cold-storage.md).

## Deploy na Vercel

1. No painel da Vercel, configure as env vars `MONGODB_URI` e `MONGODB_DB`.
2. No MongoDB Atlas, crie o banco `owlbear` + coleção `room_sheets` e os índices da seção §4 do doc.
3. `git push` — a Vercel detecta as funções em `api/` automaticamente.

> O projeto já usa `api/` (ex.: `api/share/[code].js`) e um `public/_redirects`.

## Estrutura do projeto

```
api/                      Funções serverless da Vercel (cold storage, share)
  rooms/[roomId]/sheets.js          GET lista catálogo (sem payload)
  rooms/[roomId]/sheets/[sheetId].js GET/PUT/DELETE
  share/[code].js                   proxy de ShareCode COMP/CON
server/                   Código servidor compartilhado (.mjs)
  proxy.mjs               proxy /api/share e /api/image (CORS, anti-SSRF)
  coldStorage.mjs         conexão Mongo + helpers do cold storage
src/
  services/obrBridge.ts   PONTE COM O OWLBear (estado em tempo real)
  services/roomColdStorage.ts  orquestração Enviar/Carregar/Apagar
  io/apis/roomStorage.ts  client HTTP do catálogo
  io/apis/account.ts      cloud AWS legado (inerte no fork)
  io/Storage.ts           persistência local (IndexedDB via localforage)
  classes/                domínio: Pilot, Npc, Mech, Encounter, Campaign...
  classes/components/cloud/  sync AWS legado (CloudController etc.)
  features/               módulos por feature (pilot_management, gm, active_mode...)
  ui/components/          componentes compartilhados (incl. TableSheetManagerDialog)
  i18n/locales/           traduções
public/                   manifest.json do Owlbear + assets/ícones
docs/                     documentação de arquitetura
```

## Internacionalização (i18n)

Strings de UI vão para `src/i18n/locales/**` via `vue-i18n` (pt-BR). Scripts auxiliares:
`i18n:sync`, `i18n:manual`, `i18n:llp`, `i18n:lcps`, `i18n:check`, `i18n:verify`.

## Créditos

Projeto original: **Massif Press & LANCER Community** — "COMP/CON Official Active Mode".
Este repositório é um fork com foco em persistência própria (MongoDB Atlas + Vercel).
