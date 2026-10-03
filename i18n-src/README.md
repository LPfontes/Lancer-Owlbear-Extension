# Fonte crua da tradução pt-BR

Este diretório é a **cópia crua** do projeto de tradução pt-BR do COMP/CON, no layout em que ele
é publicado (o mesmo que o COMP/CON v2 consumia). **Nada aqui é lido pelo aplicativo** — é a fonte
da verdade de onde `scripts/sync-pt-translations.mjs` gera os arquivos que o app carrega.

## Procedência

- Origem: arquivo baixado pelo mantenedor do fork como `compcon-pt_BR (2)` (pasta interna `compcon/`).
- Copiado para cá em 2026-10-03, sem alteração de conteúdo (32 arquivos, ~3,7 MB).
- Atribuição/licença: **a preencher** — a exportação não traz metadados de autoria nem de licença.
  Use a página de distribuição do projeto para preencher os campos `translator`/`website` dos
  patches (ver `public/llps/targets.json` em [`docs/traducao.md`](../docs/traducao.md)).

## Estrutura

| caminho | conteúdo | vira |
|---|---|---|
| `ui/content/<slug>/pt_BR.json` | strings de um pack (mapa plano `chave → texto`) | `content/pt/<slug>.json` |
| `ui/content/<slug>/en.json` | as mesmas chaves em inglês | só referência (filtra chaves que o app não usa mais) |
| `ui/ui/pt_BR.json` | interface (aninhado) | `src/i18n/locales/pt.json` |
| `ui/ui/en.json` | interface em inglês | só referência |
| `ui/glossary/pt_BR.csv`, `ui/glossary/en.csv` | glossário do projeto (`source,target,explanation,flags`) | nada (material de apoio para traduzir) |
| `manual/pt-BR-additions.json` | **escrito neste fork**, não vem do projeto: 203 strings que o upstream ainda não traduziu (condições de habilidades, features de NPC do Dustgrave/SotW) | `content/pt/*.json` via `npm run i18n:manual` |

Três diretórios de pack vêm vazios do projeto (`{}`): `ows-npc-data`, `ssmr-npc-data`,
`wallflower-npc-data`. O sync os ignora.

## Como atualizar

1. Substitua o conteúdo deste diretório por uma exportação mais nova (mesmo layout).
2. `npm run i18n:sync` — mostra por arquivo: novas, divergentes, iguais, só-locais e ignoradas.
3. Revise o `git diff` (a política de conflito padrão mantém o texto local).
4. `npm run i18n:llp && npm run i18n:lcps` para regerar os patches e reembutí-los nos `.lcp`.
5. `npm run i18n:check` — cobertura por pack e lista de pendências.
