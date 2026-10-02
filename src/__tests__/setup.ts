import { beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'

// This fork defaults the application locale to Portuguese, but the specs (and
// the LANCER rule tables they encode) were written against the English locale.
// Pin the test locale so the suite does not depend on the application default.
i18n.global.locale.value = 'en'

beforeEach(() => {
  setActivePinia(createPinia())
})
