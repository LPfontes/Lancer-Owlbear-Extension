# Roteiro de teste manual — Token Trackers LANCER

> Verificação em sala real do serviço de token trackers (PV, Blindagem, Calor,
> Movimento, Estrutura, Estresse). Plano: `plano_token_trackers_lancer.md`.
>
> O que já está automatizado: **147 specs** dos trackers, `npm run typecheck` e
> `npm run build`. O que só uma sala de verdade responde: como os itens locais se
> comportam no canvas, a corrida entre janelas no resumo do token e a política de
> visibilidade vista de dois clientes diferentes.

## 0. Diagnóstico: logs (comece por aqui)

Os logs **já vêm ligados** por padrão — basta abrir o console da janela da extensão. Para
silenciar (persiste):

```js
// no console da JANELA DA EXTENSÃO (não no console do topo: a extensão roda num iframe)
__ccTokenTracker.disable()   // religa com __ccTokenTracker.enable()
```

Também dá para desligar por `localStorage.setItem('cc_token_tracker_debug', '0')` + reload.

A qualquer momento, **`__ccTokenTracker.dump()`** imprime uma linha por token vinculado:

| coluna | o que responde |
|--------|----------------|
| `vinculo` | qual ficha o token aponta (`sheetType`/`sheetId`/`mechId`/`combatantId`) |
| `fonteDosValores` | de onde saiu o leitor: encontro ativo, `PilotStore`, `NpcStore`… ou o motivo de não ter saído |
| `chavesLidas` | leitura **crua** de `StatController` (`pv.current (hp)`, `heat.max (heatcap)`…) |
| `resumoNoToken` | o que está gravado em `com.compcon.activemode/trackers` |
| `valoresFinais` | o que o serviço vai desenhar |
| `resultado` | `ok` ou o motivo de não desenhar (`no-data`, `side-blocked`, `hidden-from-players`, `not-tracked`, `disabled`) |
| `itensNoMapa` | quantos itens do painel existem anexados ao token |

### Como ler "está vazio"

| Sintoma no dump | Causa provável |
|-----------------|----------------|
| o dump não lista **nenhum** token | nenhum item tem `metadata["com.compcon.activemode"]` — o token não foi vinculado |
| `[TokenTracker][stores] … nenhuma ficha na memória desta janela` | é O aviso que importa: veja o `retrato do armazenamento` que vem junto (`driver`/`durável`/contagens). Com `driver: MEMORY` ou `durável: false`, o IndexedDB foi negado no iframe (tipicamente `http://localhost`) e cada janela tem um banco próprio — sirva por HTTPS (`DEV_HTTPS=true`) |
| `noStorage.pilot_sheets` > 0 mas `naMemoria.fichasAtivas` = 0 | a ficha do modo ativo existe no banco mas não foi carregada nesta janela (o serviço consulta `pilot_sheets` direto, então ainda deve resolver) |
| `fonteDosValores` diz "ficha X não está no PilotStore(0 pilotos), no PilotSheetStore(0 fichas) nem no NpcStore(0 npcs)" | a ficha realmente não está neste banco |
| `chavesLidas` com tudo `undefined` | `StatController` não inicializado para o encontro, ou a ficha é de outro tipo |
| `valoresFinais (sem valores)` e `resumoNoToken nenhum` | ninguém conseguiu resolver a ficha ainda — olhe `[TokenTracker][resumo]` para saber se **esta** janela é a escritora |
| `resultado: no-data` | os valores não existem aqui; é o caso que o resumo do token deveria cobrir |
| `resultado: side-blocked` | política da sala (é esperado para inimigo com "Inimigos" desligado) |
| `resultado: hidden-from-players` | combatente oculto (encontro ou lista da sala) |
| `resultado: disabled` | "Desenhar trackers nos tokens" está desligado |
| `resultado: ok` mas `itensNoMapa: 0` | os itens não foram criados: procure `[TokenTracker][items]` no console |
| `porSlot.stress` = 0 | a linha do Estresse foi **descartada na montagem**: sem máximo conhecido (`max 0`), slot desligado ou teto de quadrados |
| `porSlot.stress` = 4 mas não se vê nada | os itens existem: compare `faixaY.structure` com `faixaY.stress` no mesmo log — faixas iguais significariam sobreposição (há spec garantindo que não); faixas distintas apontam para zoom/token cobrindo a última linha |
| `porSlot.heat` = 2 e o calor não muda | confira a chave: calor é **`heatcap`** nas duas pontas (ver tabela abaixo) |

### Onde cada tracker é desenhado

Ordem de cima para baixo no painel (que fica logo abaixo do token):

| # | Slot | Forma |
|---|------|-------|
| 1 | **Estrutura** | quadrados |
| 2 | **PV** | barra (a Blindagem é a bolha à direita da barra) |
| 3 | **Estresse** | quadrados |
| 4 | **Calor** | barra |
| — | **Movimento** | **badge no canto superior esquerdo do token**, com o ícone `mdi-arrow-right-bold-hexagon-outline` ao lado do número |

Espaçamento: 4 unidades entre linhas, **+2 quando o tipo da linha muda** (quadrados ↔ barra), para
a trilha de quadrados não colar na barra seguinte. A distância até o token é o `panelGap` do painel
(negativo aproxima).

Sem nomes no mapa: o painel não escreve rótulos (o nome de cada stat vive só no painel de
configuração). O ícone do Movimento é um **item de imagem** apontando para
`/tracker-icons/speed.svg` — o Owlbear não carrega a fonte MDI em itens de texto, então o ícone
precisa ser SVG estático (mesmo caminho dos marcadores de status).

O log `[TokenTracker][layout]` diz o que foi desenhado e **por que cada slot ficou de fora**:

```
[layout] "Bate-Estaca": linhas e slots pulados {
  linhas: [structure, pv, stress, heat],
  canto: [speed],
  pulados: [{ slot: 'overshield', reason: 'hidden-when-zero' }],
  slotsDesligados: ['stress']
}
```

Motivos possíveis em `pulados[].reason`: `disabled` (chip desligado no painel), `no-value`
(a fonte não tem esse stat), `no-max` (quadrados sem máximo conhecido — ex.: fonte zerada),
`hidden-when-zero` (Blindagem 0 escondida de propósito), `no-room` (não coube).

### Chaves de stat que o serviço lê (fonte: o próprio app)

| Slot | Atual | Máximo | Observação |
|------|-------|--------|------------|
| PV | `hp` | `hp` | |
| Blindagem | `overshield` | `overshield` | normalmente só-corrente (max 0) |
| **Calor** | **`heatcap`** | **`heatcap`** | **`heat` é legado**: quem escreve calor é `DamageFlow`/`ApplyHeat`/overcharge, todos em `heatcap`; o HUD da ficha também mostra `CurrentStats['heatcap'] / MaxStats['heatcap']` |
| Movimento | `speed` | `speed` | |
| Estrutura | `structure` | `structure` | |
| Estresse | `stress` | `stress` | |

Para um token de **piloto**, o serviço usa o `StatController` do **mecha** (`actor.ActiveMech`), não
do piloto — o piloto não tem calor/estrutura/estresse de mecha.

### O tipo de ficha manda na fonte (regra explícita)

| Vínculo do token | Tipo | De onde saem os stats |
|------------------|------|------------------------|
| `sheetType: 'npc'` | **NPC** | `NpcStore` (`npcs`) — `sheetType` ganha do resto |
| `sheetType: 'pilot'` **com** `mechId` | **MECHA** | ficha ativa → outras `pilot_sheets` → `PilotStore`→**mecha** (`ActiveMech`/`Mechs[mechId]`) |
| `sheetType: 'pilot'` **sem** `mechId` | **PILOTO (a pé)** | ficha ativa → outras `pilot_sheets` → `PilotStore`→**o próprio piloto** |

PV, calor, estrutura e estresse são stats de MECHA: para um vínculo de mecha, o serviço lê o
`StatController` do mecha (`actor.ActiveMech`), nunca o do piloto. Vínculo sem `mechId` é piloto a
pé, e aí o certo é o `StatController` do próprio piloto (que não tem calor/estrutura/estresse — as
linhas correspondentes simplesmente não aparecem).

### Ordem em que o serviço procura a ficha (o log diz qual venceu)

O `fonteDosValores` do `[refresh]` mostra **todos os candidatos** e marca com `✔` o escolhido.

1. **encontro ativo desta janela** (o GM com o combate aberto);
2. **encontros ativos lidos do `active_encounters`** — cobre a janela de chat, que não tem o
   encontro em memória;
3. **ficha ATIVA do modo ativo** (`PilotSheetStore().GetActiveSheet()`) — é onde o combate
   escreve de verdade;
4. outras fichas de **`pilot_sheets`**;
5. **`PilotStore`** (`pilots`) pelo `sheetId` — cuidado: o mecha do Hangar tem o `StatController`
   **zerado** fora de combate;
6. **`NpcStore`** (`npcs`);
7. **resumo no metadata do token** (`com.compcon.activemode/trackers`), se nada acima responder.

Duas proteções que saíram daí e valem saber:

- **Escolha por PONTUAÇÃO, não por "tem algum valor":** cada candidato é pontuado por quantos
  stats estão preenchidos (máximo conhecido = 2, valor corrente isolado = 1) e ganha o mais
  completo. Isso separa a **ficha do modo ativo** do **mecha do Hangar**: `PilotSheet.FromPilot`
  faz uma cópia do piloto e chama `SetStats()`, então só a cópia tem os máximos completos
  (estresse incluído). O mecha do Hangar pode ter PV e estrutura e **zero de estresse** — e
  venceria se a regra fosse só "não está vazio".
- **Controlador memorizado (com pontuação):** o sync da sala pode esvaziar
  `PilotStore`/`PilotSheetStore` no meio do jogo (a lista chega vazia e substitui a que tinha
  dados). Quando isso acontece, o serviço continua lendo a **referência** do melhor controlador já
  resolvido (o objeto vivo, não uma cópia dos números) — e nunca troca um controlador mais
  completo por um parcial que apareceu depois.

Logs por área: `[TokenTracker][start]` (boot), `[stores]` (rosters, encontros do storage e
retrato do armazenamento), `[ponte]` (mudança de estado → redesenho), `[refreshAll]`/`[refresh]`
(por token), `[items]` (add/update/delete), `[resumo]` (quem grava e por quê), `[evento]`
(evento de estado recebido), `[config]`, `[dump]`.

## Preparação

- `npm run dev` (dev server em `https://localhost:5173`; com `DEV_HTTPS=true` no
  `.env` o IndexedDB funciona igual ao deploy).
- Instale/aponte a extensão para esse dev server na sua sala do Owlbear.
- Monte pelo menos: **1 mecha de jogador (aliado)**, **1 unit NPC inimigo**,
  **1 doodad ou NPC neutro** — e vincule cada token à ficha correspondente pelo
  menu de contexto → *Vincular Ficha COMP/CON*.
- Duas janelas/clientes: o Mestre e um jogador (o jogador precisa ter a ficha dele
  no armazenamento local).

## 1. Painel e configuração

1. Abra a janela **Ações da Mesa & Chat** → aba **Trackers do Token**.
2. Confira a lista **Tokens vinculados**: cada token aparece com o lado
   (`Aliado` / `Inimigo` / `Neutro` / `Sem lado`) e o estado
   (`Dados da ficha` / `Dados do token` / `Sem dados aqui`).
3. Desligue **Estrutura** nos chips de trackers.
   - ✅ Os quadrados de Estrutura somem do mapa; Estresse continua.
4. Ligue **Marcar dano nos quadrados**.
   - ✅ Estrutura/Estresse passam a preencher o que foi **perdido** (o inverso do padrão).
5. Desligue **Desenhar trackers nos tokens**.
   - ✅ Nenhum painel no mapa, para ninguém.

## 2. O básico do desenho

Para o token do mecha:

1. **PV (barra) + Blindagem (numérico)**: a barra mostra `PV 12/20` (ou o valor da
   ficha) e a bolha da Blindagem fica **à direita** da barra.
   - ✅ Com Blindagem 0, a bolha **não** aparece e a barra ocupa a largura cheia.
   - ✅ Conceda escudo (ex.: Overshield 4): a bolha aparece com o número.
2. **Calor**: barra com `atual/capacidade`; leve o calor acima da capacidade.
   - ✅ A barra enche e **não** estoura a largura.
3. **Movimento**: número puro quando cheio; `atual/máximo` depois de gasto.
4. **Estrutura/Estresse**: N quadrados, `atual` preenchidos.
5. Mova e escale o token.
   - ✅ O painel acompanha (posição e largura), sem sobrar item na posição antiga.
6. Gire o token.
   - ✅ O painel **não** gira junto.

## 3. Atualização em tempo real

1. Na ficha, mude PV e Calor.
   - ✅ O mapa atualiza em menos de ~300 ms, sem redesenhar o que não mudou.
2. Leve dano de estrutura até 0.
   - ✅ Os quadrados esvaziam até o último.
3. Troque o tema claro/escuro do Owlbear.
   - ✅ O painel continua legível.

## 4. Política de visibilidade (o teste mais importante)

Com **um jogador conectado**:

1. Config default (`Aliados` ligado, `Inimigos` desligado).
   - ✅ O jogador vê o painel do **aliado** e do **neutro**, e **não** vê o do inimigo.
2. Ligue **Inimigos** no painel do Mestre.
   - ✅ O painel do inimigo aparece na janela do jogador **sem reload**.
3. No painel do Mestre, clique no **olho** do aliado (ocultar dos jogadores).
   - ✅ O painel some **só** na janela do jogador; o Mestre continua vendo.
4. Desmarque o checkbox de um token (fora da lista).
   - ✅ Some **só** naquela janela; o outro cliente continua vendo.

## 5. Multi-token

1. Marque 2–3 tokens na lista.
   - ✅ Os 3 desenham ao mesmo tempo.
2. Feche e reabra a janela.
   - ✅ A lista (watchlist) sobrevive — ela é local do navegador.
3. Apague um token marcado da cena e reabra o painel.
   - ✅ Ele some da lista (podada).

## 6. Resumo no metadata do token

Use o inspetor do Owlbear (ou `OBR.scene.items.getItems` no console) para olhar o
metadata do token vinculado:

1. Com o mecha em jogo:
   - ✅ Existe `com.compcon.activemode/trackers` com **apenas** os 6 números
     (`pv`, `ov`, `he`, `sp`, `st`, `ss`) mais `v`/`w`/`t`.
   - ❌ Não pode haver nome, retrato, tags, itens, condições ou ficha serializada.
2. **Jogador sem a ficha do aliado** (ex.: abra a sala num segundo navegador, sem
   sincronizar as fichas): o token do aliado ainda desenha, com os valores vindos
   do resumo.
3. Desvincule o token (*Vincular Ficha* → desvincular).
   - ✅ O painel some **e** a chave do resumo é removida do metadata.

## 7. Limpeza e ausência de laço

1. Com o console aberto nas duas janelas, mude PV várias vezes.
   - ✅ Não há enxurrada de `updateItems`/`deleteItems` nos logs, e o consumo não
     cresce sem parar (se houvesse laço de `onChange`, apareceria aqui).
2. Saia e volte da cena (`OBR` recarrega a cena).
   - ✅ O painel volta a aparecer; sem itens órfãos duplicados na cena.
3. Desinstale/recarregue a extensão com o painel visível.
   - ✅ Os itens do painel somem (são locais, não ficam gravados na cena).

## Sinais de problema (o que reportar)

- Painel deslocado (meio item para cima/baixo) → hipótese: âncora de `Shape` no SDK
  (o render assume que shape é desenhada **centrada** na posição).
- Painel não some ao desvincular → resumo ou itens órfãos.
- Jogador vendo inimigo com a política desligada → a decisão está em
  `evaluateTokenRender` (`src/services/tokenTrackerModel.ts`), coberta por spec.
- Duplicidade de painéis → provável convivência com a extensão **Owl Trackers**;
  não use as duas no mesmo token.
