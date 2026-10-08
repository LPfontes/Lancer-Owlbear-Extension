/**
 * Sessão de LEITURA da ficha (`pilot-runner?readonly=1`) desta janela.
 *
 * O runner do piloto é montado dentro da janela de jogo, com os MESMOS painéis do modo
 * ativo — e alguns deles escrevem no token quando veem o estado mudar (ex.:
 * `StatusConditionSelector.syncMarkers` empurra os marcadores assim que a lista de
 * status muda). No modo leitura nada pode sair desta janela: nem sincronização com a
 * mesa, nem alteração/geração de token.
 *
 * O runner já se protege nos caminhos de dados (não anuncia, não manda delta, não
 * salva, não cria token); este sinalizador é o cinto de segurança para os SERVIÇOS que
 * desenham no token, que são compartilhados com o resto da janela.
 *
 * Escopo: janela. Enquanto a ficha estiver aberta em modo leitura, os serviços de token
 * desta janela ficam inertes e voltam ao normal ao sair da ficha.
 */
let active = false

export function setSheetReadOnlySession(value: boolean): void {
  active = !!value
}

export function isSheetReadOnlySession(): boolean {
  return active
}
