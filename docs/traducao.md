# Tradução (pt-BR) — pipeline

Como o conteúdo dos LCPs chega traduzido ao aplicativo, o que é gerado por script e o que é
decisão manual.

## Camadas

| camada | o que é | onde vive | como o app consome | por que existe |
|---|---|---|---|---|
| 1. Catálogo estático | `content/pt/<slug>.json` (mapa plano `chave → texto`) | repo, commitado | `src/i18n/loadContent.ts` faz glob de `/content/*/*.json` (exceto `en`) e mescla no `LocalizationStore` | funciona offline, sem ação do usuário, para todo mundo que abre o app |
| 2. Patch `.llp` por pack | `public/llps/<slug>.llp` | repo, commitado | `installPatch` (`src/i18n/translationPatch.ts`) grava em localforage; `loadContent` mescla no catálogo | dá para instalar/remover por pack no Content Manager e distribuir a tradução de um pack isolado |
| 3. `.llp` embutido no `.lcp` | entrada `pt.llp` dentro de `public/lcps/<slug>.lcp` | repo, commitado | `getBundledPatches` (`src/io/ContentPackParser.ts:287`) é lido no install manual do pack (`PackInstall.vue:431`) | um `.lcp` entregue a outra pessoa (ou baixado do itch.io) carrega a tradução junto |

O texto exibido resolve por `localize(<chave>, <campo>, <texto em inglês>)`, onde a chave é o `id` do
item de topo, um prefixo aninhado registrado por `stampContentKeys`, `<id>.<on_attack|on_hit|on_crit|on_miss>`
(registrado por `mkEffect`) ou `glossary_<Nome>`.

## Fonte da verdade

[`i18n-src/pt_BR/`](../i18n-src/README.md) — cópia crua do projeto de tradução pt-BR, no layout
upstream. Nada ali é carregado pelo app; tudo em `content/pt/` e `src/i18n/locales/pt.json` é
**gerado** a partir dele.

## Scripts

| comando | script | o que faz | idempotente |
|---|---|---|---|
| `npm run i18n:sync` | [`scripts/sync-pt-translations.mjs`](../scripts/sync-pt-translations.mjs) | fonte crua → `content/pt/*.json` + `src/i18n/locales/pt.json` | sim (2ª execução = 0 arquivos) |
| `npm run i18n:manual` | [`scripts/apply-manual-translations.mjs`](../scripts/apply-manual-translations.mjs) | traduções escritas aqui (`i18n-src/pt_BR/manual/pt-BR-additions.json`) → catálogos, validadas contra a lista de pendências | sim |
| `npm run i18n:llp` | [`scripts/build-llp.mjs`](../scripts/build-llp.mjs) | `content/pt/*.json` → `public/llps/<slug>.llp` + `index.json` | sim |
| `npm run i18n:lcps` | [`scripts/inject-llp-into-lcps.mjs`](../scripts/inject-llp-into-lcps.mjs) | embute `pt.llp` dentro de `public/lcps/*.lcp` (+ campo `languages` no `index.json`) | sim (não reescreve zip em dia) |
| `npm run i18n:check` | [`scripts/check-lcp-translations.mjs`](../scripts/check-lcp-translations.mjs) | cobertura do catálogo por pack/core, faltas por campo, chaves órfãs, chaves que este fork não localiza; `--check=<%>` falha abaixo do limite; `--pending=arq.csv` exporta o que falta traduzir | leitura apenas |
| `npm run i18n:verify` | (composto) | `i18n:check --check=95` + `i18n:lcps --check` | leitura apenas |

### Regras do sync (para o diff ser revisável)

- **O arquivo commitado é a base**: chaves existentes mantêm a posição, chaves novas entram no fim,
  na ordem da fonte.
- **Nada é removido**: chave que só existe aqui (ex.: as `.condition` escritas à mão) permanece.
- **Conflito** (mesma chave, texto diferente) mantém o texto **local** por padrão;
  `--conflicts=external` aplica o texto do projeto.
- **Chave nova só entra se o `en.json` de referência ainda a lista** (`ui/content/<slug>/en.json`
  para packs, `src/i18n/locales/en.json` para a interface) — assim strings de itens que o app não tem
  mais nunca entram no catálogo.
- **Formato preservado**: indentação e fim de linha do arquivo de destino (repo: 2 espaços + CRLF;
  packs: 4 espaços + LF, como a exportação upstream).

## Patches `.llp`

Formato validado por [`src/i18n/validatePatch.mjs`](../src/i18n/validatePatch.mjs):
`{ lang, target, target_version?, data: { chave: texto } }`.

- **`lang` é o código do app (`pt`)**, não o sufixo do projeto (`pt_BR`): `loadContent` só mescla o
  patch quando `patch.lang === locale` ([`loadContent.ts:21`](../src/i18n/loadContent.ts#L21)).
- **`target` = id do pack** vindo de `public/lcps/index.json` (é um dos três identificadores aceitos
  por `packPatches`, junto de `item_prefix` e `name` — o id é o mais estável).
- **`target_version` = `^<versão do manifest>`**; `build-llp.mjs --any-version` usa `"*"`. Depois de
  atualizar um pack, rode `npm run i18n:llp` para regerar o intervalo; a UI mostra "stale" como aviso
  (`patchIsStale`), nunca bloqueia.
- Packs que **não** são empacotados aqui (ex.: o pacote oficial de NPCs) podem ganhar patch declarando-os
  em `public/llps/targets.json`:

  ```json
  {
    "lancer-npc-data": {
      "target": "<id do pack, item_prefix ou nome do manifest>",
      "target_version": "*",
      "pack": "Lancer NPC Data",
      "version": "3.0.0",
      "translator": "…",
      "website": "…"
    }
  }
  ```

### Por que o startup não instala os patches embutidos

O install automático (`src/io/OfficialContent.ts`) instala os `.lcp` empacotados; ele **não** chama
`getBundledPatches` de propósito:

- para `pt`, o catálogo estático já entrega essas ~3,4 mil strings, então instalar os patches só
  duplicaria o catálogo em memória e reabriria os 8 zips no boot;
- o patch passaria a sobrescrever nomes em runtime (ex.: `mw_caliban_integrated` vira
  "Espingarda EOP-075 “Devoradora”" em vez do texto do pack), mudando o comportamento de telas e de
  testes que hoje dependem do fallback em inglês;
- o `.llp` embutido continua funcionando onde importa: install manual do pack (`PackInstall.vue`
  já faz o auto-stage) e install de um `.lcp` vindo de fora.

Se algum idioma passar a ser distribuído **só** por patch (sem catálogo estático), aí sim vale ligar o
auto-install — a mudança é local (`downloadOfficialPack` → `getBundledPatches` → `installPatch`).

## Pendências conhecidas

- **Cobertura de 100%** no universo de conteúdo (4807/4807 chaves: core + os 8 packs empacotados + SRD), medido por `npm run i18n:check`.
- **Traduções autorais**: as 203 chaves que o projeto upstream não tinha (100 `.condition`, 101 features de NPC do Dustgrave, 2 do SotW) foram escritas aqui e vivem em
  [`i18n-src/pt_BR/manual/pt-BR-additions.json`](../i18n-src/pt_BR/manual/pt-BR-additions.json), aplicadas por `npm run i18n:manual`. Se o projeto upstream publicar o texto dele
  para essas chaves, rode `npm run i18n:sync -- --conflicts=external` para deixar o texto do projeto vencer; sem isso, o sync preserva o texto local.
- **91 textos divergentes** já resolvidos a favor do projeto (`--conflicts=external`); registro em [`revisao-traducao-pt_BR.md`](../revisao-traducao-pt_BR.md).
- **389 chaves de Bond/BondPower** já traduzidas nunca são consultadas: `Bond.ts` lê `data.name`, `major_ideals` e `powers[].name/description` sem `localize`.
- **1 chave morta**: `ms_exo_emi_theater.effect` em `content/pt/ssmr-data.json` (item não existe no pack empacotado).
- O pacote oficial de NPCs não é empacotado no repo, então `content/pt/lancer-npc-data.json` (1475 chaves) não é validável offline — funciona quando o pack estiver instalado, pois o catálogo é global.
- Terminologia ainda mista em *deployable*: **Implementos** em 2 chaves e **Implantáveis** em 5 (fora do escopo do que foi aplicado).

## Atualizar a tradução

```bash
# 1. nova exportação do projeto em i18n-src/pt_BR (mesmo layout) — ver i18n-src/README.md
npm run i18n:sync                 # gera os catálogos (conflitos: mantém o local)
npm run i18n:sync -- --dry-run    # só relatório
git diff                          # revisar

# 2. patches e packs
npm run i18n:llp                  # public/llps/*.llp
npm run i18n:lcps                 # embute pt.llp dentro de public/lcps/*.lcp

# 3. verificação
npm run i18n:verify               # cobertura >= 95% e packs em dia
npm run i18n:check -- --pending=pendencias-traducao-lcp.csv
```

Depois de `npm run lcps:update` (re-download dos packs oficiais), rode `npm run i18n:llp` e
`npm run i18n:lcps` de novo: o `fetch-official-lcps.mjs` já embute o patch existente no pack novo, mas
os patches em `public/llps` precisam ser regerados se a versão do pack mudou.
