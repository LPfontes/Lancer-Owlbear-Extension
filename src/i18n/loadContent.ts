import { LocalizationStore } from '@/stores/localization'

const modules = import.meta.glob(['/content/*/*.json', '!/content/en/*.json'])

export async function setContentLocale(code: string): Promise<void> {
  const store = LocalizationStore()
  await store.ensurePatchesLoaded()

  const merged: Record<string, string> = {}
  if (code !== 'en') {
    const prefix = `/content/${code}/`
    const paths = Object.keys(modules).filter(p => p.startsWith(prefix))
    for (const p of paths) {
      const mod = (await modules[p]()) as { default: Record<string, string> }
      Object.assign(merged, mod.default)
    }
  }
  store.setCatalog(merged)

  // keep last so llps win on collision
  for (const patch of store.patches) {
    if (patch.lang === code) store.mergeCatalog(patch.data)
  }
}
