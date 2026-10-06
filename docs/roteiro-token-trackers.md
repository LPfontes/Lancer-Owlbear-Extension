# Roteiro de teste manual — Token Trackers LANCER

> Verificação em sala real do serviço de token trackers (PV, Blindagem, Calor,
> Movimento, Estrutura, Estresse). Plano: `plano_token_trackers_lancer.md`.
>
> O que já está automatizado: **2013 specs** (suíte inteira), `npm run typecheck` e
> `npm run build`. O que só uma sala de verdade responde: como os itens locais se
> comportam no canvas, a corrida entre janelas no resumo do token e a política de
> visibilidade vista de dois clientes diferentes.

## 0. Diagnóstico: logs com dois níveis

Os logs **vêm ligados** em `summary`. No console da **JANELA DA EXTENSÃO** (não no console do
topo: a extensão roda num iframe):

```js
__ccTokenTracker.level()      // 'summary' (padrão) | 'verbose' | 'off'
__ccTokenTracker.verbose()    // tudo: cada refresh, cada add/update/delete de item
__ccTokenTracker.summary()    // volta ao padrão
__ccTokenTracker.off()        // silencia (persiste no localStorage)
__ccTokenTracker.dump()       // tabela por token vinculado
__ccTokenTracker.storage()    // retrato do armazenamento DESTA janela
```

### Duas janelas, duas origens (o erro mais caro)

O app roda em iframes separados — a ficha viva na janela persistente (`windowType=floating`), o
mapa em outra. Eles só compartilham dados se tiverem a **mesma origem**: `http://localhost`,
`https://localhost`, `http://127.0.0.1` e `http://localhost:5174` são origens **diferentes**, com
IndexedDB **diferente**. Além disso, num iframe sob `http://` o Chromium pode negar IndexedDB — e aí
`Storage.ts` cai para memória e cada janela fica com o seu banco.

O sintoma é sempre o mesmo: a janela do mapa mostra `0 pilotos, 0 fichas, 0 npcs` para sempre, e
`[OBRBridge] 0 piloto(s) sincronizado(s)`, mesmo com a ficha aberta ao lado. Rode o retrato nas
**duas** janelas e compare:

```js
await __ccTokenTracker.storage()
```

| Campo | Esperado | Se estiver diferente |
|-------|----------|----------------------|
| `origem` | **idêntica** nas duas janelas | origens diferentes = bancos diferentes; recarregue a extensão na mesma URL |
| `driver` / `duravel` | `duravel: true` | `duravel: false` = IndexedDB negado no iframe; sirva por HTTPS (`DEV_HTTPS=true`, já no `.env`) |
| `noArmazenamento.pilot_sheets` | ≥ 1 na janela da ficha | 0 na janela da ficha = a ficha nunca foi salva |
| `janelaDaFicha` | `true` em exatamente uma | serve para confirmar qual iframe é qual |
| `porDriver` + `veredito` | sem divergência | ver abaixo |

### "A ficha sumiu": dados no outro driver

`Initialize()` decide o driver por **capacidade** (`window.indexedDB` existe?), não por um teste real.
Se a primeira operação falhar com permissão negada, `Storage.ts` troca tudo para **LocalStorage** —
e aí os dados gravados quando o IndexedDB funcionava ficam **invisíveis**, porque cada driver tem o
seu namespace. O sintoma no console é a sequência:

```
[Storage] driver=INDEXEDDB (durável).                                  ← decisão otimista do boot
COMP/CONWARN Storage: IndexedDB indisponível; operando em LocalStorage  ← a troca de verdade
```

Nesse estado, **todas** as coleções aparecem vazias (`0 pilotos, 0 fichas, 0 npcs`) — mesmo as que
nada têm a ver com os trackers. O `storage()` agora conta nos DOIS drivers e diz o veredito:

```js
await __ccTokenTracker.storage()
// porDriver: { pilot_sheets: { indexeddb: 1, localstorage: 0 }, … }
// veredito: "ATENÇÃO: pilot_sheets existem no OUTRO driver (não no LOCALSTORAGE, que é o ativo)…"
```

Se o veredito acusar divergência, o dado **não foi perdido**: ele está no outro driver. As saídas
são copiar as coleções para o driver ativo, ou fazer o IndexedDB voltar a funcionar (recarregar
todas as janelas e conferir se a troca acontece de novo).

O `[stores]` do serviço avisa uma vez quando, depois de uma recarga, esta janela continua sem
nenhuma ficha — e já imprime este retrato junto.

| Nível | O que sai | Serve para |
|-------|-----------|------------|
| `summary` | decisões: fonte escolhida, token sem valor, resumo gravado, **todo gesto de movimento** (espaços, classificação, decisão, débito) | jogar com o console aberto |
| `verbose` | `summary` + cada rodada de `[refreshAll]`/`[refresh]`/`[items]`/`[layout]`/`[resumo]`/`[ponte]` | "por que não aparece / por que não atualiza" |
| `off` | nada (nem `console.warn` de falha) | silêncio total |

Escopos: `start`, `bridge`, `ponte`, `stores`, `resolve`, `refreshAll`, `refresh`, `items`,
`layout`, `resumo`, `movimento`, `dump`.

### O que o dump responde

| coluna | o que responde |
|--------|----------------|
| `vinculo` | qual ficha o token aponta (`sheetType`/`sheetId`/`mechId`/`combatantId`) |
| `fonteDosValores` | de onde saiu o leitor **e os candidatos perdedores** com a pontuação de cada um |
| `chavesLidas` | leitura **crua** do `StatController` (`pv.current (hp)`, `heat.max (heatcap)`, `speed.cap (BoostedSpeed)`…) |
| `resumoNoToken` | o que está gravado em `com.compcon.activemode/trackers`, **e quem gravou** |
| `valoresFinais` | o que o serviço vai desenhar |
| `estadoDoMovimento` | `normal` / `boosted` / `overflow` (a cor do badge) |
| `resultado` | `ok` ou o motivo de não desenhar (`no-data`, `side-blocked`, `hidden-from-players`, `not-tracked`, `disabled`) |
| `itensNoMapa` | quantos itens do painel existem anexados ao token |

### Como ler "está vazio"

| Sintoma | Causa provável |
|---------|----------------|
| o dump não lista **nenhum** token | nenhum item tem `metadata["com.compcon.activemode"]` — o token não foi vinculado |
| `valoresFinais (sem valores)` + `resumoNoToken nenhum` | ninguém resolveu a ficha ainda; procure `[stores]` no console — o aviso `> 0 token(s) vinculado(s), mas nenhuma ficha nesta janela` costuma vir junto, e aí o problema é o armazenamento do iframe (use HTTPS: `DEV_HTTPS=true`) |
| `chavesLidas` com tudo `(undefined)` | `StatController` não inicializado para o encontro, ou a ficha é de outro tipo |
| `resultado: no-data` | os valores não existem aqui; é o caso que o resumo do token deveria cobrir |
| `resultado: side-blocked` | política da sala (esperado para inimigo com "Inimigos" desligado) |
| `resultado: hidden-from-players` | combatente oculto (encontro ou lista da sala) |
| `resultado: disabled` | "Desenhar trackers nos tokens" está desligado |
| `resultado: ok` mas `itensNoMapa: 0` | nada foi criado: veja `[items]` em `verbose` |
| um slot sem linha (ex.: Estresse) | o `[layout]` (em `verbose`) diz o motivo: `disabled` (chip), `no-value` (a fonte não tem o stat), `no-max` (quadrados sem máximo), `hidden-when-zero` (Blindagem 0), `no-room` |
| calor não muda e `heat max` tem valor | calor é **`heatcap`** nas duas pontas (ver tabela abaixo); `heat` é chave legada |

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
| Movimento | `speed` | **`BoostedSpeed`** (cap do turno) | o badge mostra o **restante**; o cap cai para `getMax('speed')` em leitor sem `getBoostedSpeed` |
| Estrutura | `structure` | `structure` | |
| Estresse | `stress` | `stress` | |

Para um token de **piloto**, o serviço usa o `StatController` do **mecha** (`actor.ActiveMech`), não
do piloto — o piloto não tem calor/estrutura/estresse de mecha.

## 0.1 Movimento dinâmico (§13) — o que testar na sala

> **A ficha viva fica num iframe separado.** O modo ativo roda na janela persistente
> (`windowType=floating`) e o arrasto acontece na janela do mapa. O `StatController` vivo só
> existe no iframe da ficha, então **é ele que decide e debita**: a janela do mapa manda o
> *gesto* por broadcast (`MOVEMENT_SPEND`) e recebe de volta o que foi feito
> (`MOVEMENT_SPENT`). Quem decide precisa do `remaining`/`BoostBonus` de verdade — uma cópia
> deserializada mentiria, e debitar nela seria perdido quando a ficha salvasse por cima.

Nos logs, isso aparece em duas janelas diferentes: na do mapa sai
`N espaço(s) enviados para a janela da ficha`; na da ficha sai
`debitei um gesto vindo de outra janela`; e na do mapa volta
`resposta da janela da ficha { debitado: N, restanteDepois: M }`.

| Sintoma | O que significa |
|---------|-----------------|
| `enviados para a janela da ficha` e **nada** de resposta | não há iframe da ficha aberto (ou nenhum com essa ficha). Abra a ficha no modo ativo |
| resposta com `acao: 'offer-boost'` | o gesto passou do cap: nada foi debitado de propósito (cartão da M2) |
| resposta com `motivo: 'immobilized'` / `'over-cap-no-boost'` | recusado pelo motor — o token já andou e o Desfazer é a M2 |
| na janela da ficha: `pedido … não é desta janela` | outra ficha está aberta ali: aquele iframe não é o dono |

Arrastar o token **custa movimento**: o gesto é medido centro a centro e debitado
`MOVEMENT_SETTLE_MS` (250 ms) depois que o token para. Cada gesto sai uma linha `[movimento]` já
no nível `summary`:

```
[TokenTracker][movimento] token abc: gesto de 2 espaço(s) {
  classificacao: 'voluntary', atribuicao: 'esta janela mexeu no token',
  restante: 5, capDoTurno: 5, boostBonus: 0, podeDarBoost: true, imobilizado: false,
  decisao: 'spend', gasto: 2, leg: 'move'
}
[TokenTracker][movimento] token abc: debitados 2 { restanteAntes: 5, restanteDepois: 3, ... }
```

Leitura direta quando **não** debita: `decisao: 'reject'` com `motivo`
(`involuntary` = outra janela mexeu, `free` = movimento livre armado, `immobilized`,
`over-cap-no-boost`) ou `decisao: 'offer-boost'` com `passouDoCapEm` — nesse último o badge fica
vermelho e o cartão de Boost/Desfazer é a M2, por isso **nada** é debitado.

Se em vez do gesto vier `gesto sem alvo — nada debitado`, a linha **seguinte** diz qual das três
causas foi:

| Linha do serviço | Causa |
|------------------|-------|
| (`verbose`) `arrastado, mas não tem vínculo de ficha` | o token não está vinculado — arrastar cenário não custa movimento |
| `ficha resolvida mas o dono não tem CombatController` + `dono: <tipo> id=…` | a ficha resolveu, mas o dono não é um ator de combate (ou vem `dono: nenhum`, com `temStatController: false`) |
| `sem vínculo em metadata[...]` (verbose) | o vínculo sumiu entre o gesto e o settle |
| `não existe mais na cena` | o token foi apagado durante o gesto |

Em `verbose`, a resolução bem-sucedida também sai (`alvo de movimento de "…"` com `dono`,
`restante`, `capDoTurno`, `boostBonus`) — é a linha que confirma **qual cópia** do mecha está sendo
debitada.

| Ação | Esperado |
|------|----------|
| arrastar 2 células com 5 de movimento | badge mostra `3/5` |
| arrastar e **voltar** ao mesmo lugar | nada é debitado (distância 0) |
| arrastar 6 células com 5 e Boost legal | **nada é debitado** e o badge fica **vermelho** (estouro pendente, cartão da M2) |
| empurrar o token de outro jogador (outra janela) | nada é debitado |
| token com `immobilized` | nada é debitado |
| dar Boost na ficha | badge fica **âmbar** e o cap sobe (`10/10` num mecha speed 5) |

Sem o centro do token (`getItemBounds` falhando) a captura **não cobra**: o princípio é preferir
sobrar movimento a cobrar errado. O valor do badge é sempre o restante do turno.

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

> **Antes de tudo: o iframe do Owlbear é armazenamento de TERCEIROS.** A extensão roda dentro de
> `owlbear.rodeo`, então IndexedDB/localStorage são storage de terceiros para o navegador. Em
> `http://localhost` (e às vezes em `https://localhost` com certificado não confiável) o Chromium
> **nega** o IndexedDB — a app cai para LocalStorage e os dados que estavam no IndexedDB ficam
> invisíveis. Faça nesta ordem:

1. **Confie na CA do dev server** (o `vite` imprime o comando, e o certificado já existe em
   `.certs/`). Isso tira o aviso e faz o iframe virar contexto seguro de verdade:

   ```bash
   certutil -user -addstore Root .certs\localhost.crt
   ```

   Depois **feche o navegador** e recarregue todas as janelas do Owlbear.

2. **Permita storage de terceiros para o Owlbear** no perfil de teste:
   `chrome://settings/cookies` → *Sites que podem sempre usar cookies* → adicione
   `https://owlbear.rodeo`.

3. Ou use um **perfil dedicado** com as flags explícitas (não mexe no seu perfil principal, e é o
   caminho mais repetível):

   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --user-data-dir="$env:TEMP\obr-dev-perfil" `
     --disable-features=ThirdPartyStoragePartitioning,BlockThirdPartyCookies,ThirdPartyCookiePhaseout `
     "https://www.owlbear.rodeo"
   ```

4. **Confirme o que o navegador decidiu**, dentro da janela da extensão:

   ```js
   await __ccTokenTracker.storage()   // driver + porDriver + veredito
   ```

   O boot loga `[Storage] driver=INDEXEDDB (verificado com gravação de teste)` quando o IndexedDB
   está realmente gravável; se vier a linha `COMP/CONWARN Storage: IndexedDB indisponível`, a app
   trocou para LocalStorage e o `veredito` do `storage()` diz se há dados no outro driver.

5. Um teste rápido de primeira-parte (sem OBR) para separar "o navegador bloqueia o iframe" de "o
   navegador bloqueia tudo": abra `https://localhost:5173/?windowType=floating#/active-mode` numa
   **aba normal**. Ali o IndexedDB funciona (não é iframe), então dá para confirmar que a camada de
   armazenamento está sã — mas sem SDK do Owlbear (nada de token, broadcast ou tracker no mapa).

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
