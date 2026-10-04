import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PREWARM_QUERY_FLAG, isPrewarmUrl } from '@/services/prewarmContext'

describe('isPrewarmUrl', () => {
  it('reconhece o documento de pré-aquecimento', () => {
    expect(isPrewarmUrl('?ccPrewarm=1#/active-mode')).toBe(true)
    expect(isPrewarmUrl('?windowType=floating&ccPrewarm=1#/active-mode')).toBe(true)
  })

  it('não confunde a janela da ficha nem o chat', () => {
    expect(isPrewarmUrl('?windowType=floating#/active-mode')).toBe(false)
    expect(isPrewarmUrl('#/table-chat')).toBe(false)
    expect(isPrewarmUrl('')).toBe(false)
  })

  /**
   * O iframe é criado por um `<script>` no `index.html`; se ele e este módulo saírem de
   * sincronia, o app deixa de neutralizar os efeitos colaterais da segunda instância
   * (menu de contexto, popover da ficha) ou passa a criar iframes aninhados.
   */
  describe('contrato com o index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    it('cria o iframe oculto apontando para /active-mode com a flag', () => {
      expect(html).toContain(`?${PREWARM_QUERY_FLAG}=1#/active-mode`)
      expect(html).toContain("frame.id = 'cc-active-mode-prewarm'")
      expect(html).toContain('document.body.appendChild(frame)')
    })

    it('mantém as guardas contra recursão e desperdício', () => {
      expect(html).toContain(`url.search.indexOf('${PREWARM_QUERY_FLAG}=')`)
      expect(html).toContain("url.search.indexOf('windowType=floating')")
      expect(html).toContain("url.hash.indexOf('/table-chat')")
    })

    it('deixa o iframe fora da tela e sem interação', () => {
      expect(html).toContain('visibility:hidden')
      expect(html).toContain('pointer-events:none')
      expect(html).toContain("frame.setAttribute('aria-hidden', 'true')")
      expect(html).toContain("frame.setAttribute('tabindex', '-1')")
    })

    it('não deixa o pré-aquecimento derrubar o boot', () => {
      expect(html).toContain('catch (e)')
    })
  })
})
