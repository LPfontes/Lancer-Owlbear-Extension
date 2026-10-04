import './polyfill'

import { version } from '../package.json'

import { QuillEditor, loadQuill } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'

import { registerHorusText } from '@/ui/style/horusText'

import { register } from '@/ui/style/quillSetup'
void loadQuill().then(Quill => {
  registerHorusText(Quill)
  register(Quill)
})

import lancerData from '@massif/lancer-data'
import { kebabCase } from 'lodash-es'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import * as Sentry from '@sentry/vue'

import logger from '@/user/logger'

import './assets/css/global.css'
import './ui/style/_style.css'

import App from './App.vue'

import router from './router'
import { i18n } from './i18n'
import { enumLabel } from './i18n/enumLabel'
import vuetify from './ui/style'
import * as globals from './ui/globals'
import Notifications from '@kyvg/vue3-notification'
import { flushNotifyQueue } from '@/util/notify'

import Startup from './io/Startup'
import { reportWebVitals } from '@/util/performance'

import VueSecureHTML from 'vue-html-secure' // provides v-html-safe

const compcon = createApp(App)

function isErrorReportingEnabled(): boolean {
  try {
    const cfg = localStorage.getItem('cc_user')
    if (cfg) {
      const parsed = JSON.parse(cfg)
      return parsed.error_reporting ?? true
    }
    const val = localStorage.getItem('cc_error_reporting')
    if (val !== null) return JSON.parse(val)
  } catch {
    // fall through
  }
  return false
}

function isEnhancedReportingEnabled(): boolean {
  try {
    const cfg = localStorage.getItem('cc_user')
    if (cfg) {
      const parsed = JSON.parse(cfg)
      return parsed.enhanced_reporting ?? false
    }
    const val = localStorage.getItem('cc_enhanced_reporting')
    if (val !== null) return JSON.parse(val)
  } catch {
    // fall through
  }
  return false
}

let sentryLastSent = 0

if (
  import.meta.env.VITE_APP_ENV !== 'localhost' &&
  window.location.hostname !== 'cc-dev-preview.netlify.app'
) {
  Sentry.init({
    app: compcon,
    dsn: import.meta.env.VITE_APP_SENTRY_DSN,
    tunnel: `${import.meta.env.VITE_APP_INVOKE_URL}/sentry-tunnel`,
    integrations: [],
    environment: import.meta.env.MODE,
    release: APP_VERSION,
    beforeSend(event, hint) {
      if (!isErrorReportingEnabled()) return null
      // Suppress expected Amplify auth errors (user not logged in)
      const err = hint?.originalException
      if (
        err instanceof Error &&
        (err.name === 'UserUnAuthenticatedException' ||
          err.message?.includes('User needs to be authenticated'))
      ) {
        return null
      }
      const now = Date.now()
      if (now - sentryLastSent < 10 * 60 * 1000) return null
      sentryLastSent = now
      if (!isEnhancedReportingEnabled()) {
        // Strip PII when enhanced reporting is off
        delete event.user
        if (event.request) {
          delete event.request.cookies
          delete event.request.headers
        }
      }
      return event
    },
  })
}

compcon.use(createPinia())
compcon.use(i18n)
compcon.use(vuetify)
compcon.use(router)
compcon.use(VueSecureHTML)
compcon.use(Notifications)

logger.attachGlobalHandlers(compcon)

compcon.component('QuillEditor', QuillEditor)

Object.keys(globals).forEach((key: string) => {
  const componentConfig = globals[key as keyof typeof globals]
  compcon.component(kebabCase(key), componentConfig.default || componentConfig)
})

compcon.config.globalProperties.$appVersion = version
compcon.config.globalProperties.$lancerVersion = lancerData.info.version
compcon.config.globalProperties.$enum = enumLabel

// Enable Vue component-level timing in DevTools (dev only)
if (import.meta.env.DEV) {
  compcon.config.performance = true
}

import { obrBridge } from '@/services/obrBridge'
import { initSheetWindowVisibility } from '@/services/mainWindow'

// Antes de montar o Vue: a janela persistente da ficha nasce já oculta quando o
// usuário a ocultou (evita o flash da ficha aparecendo por um frame) e passa a
// anunciar presença para as outras janelas da sala.
initSheetWindowVisibility()

void obrBridge.init()

compcon.mount('#app')
reportWebVitals()
flushNotifyQueue()
await Startup()

export { compcon }
