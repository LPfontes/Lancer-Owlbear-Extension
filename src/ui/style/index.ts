import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { ccIcons } from '@/assets/icons/cc-icons'
import '@mdi/font/css/materialdesignicons.css'

import * as themes from './themes'
import { pt, en } from 'vuetify/locale'

const preload = JSON.parse(localStorage.getItem('cc_theme') as string) || 'gms_dark'

const vuetify = createVuetify({
  // RTL is driven per locale code; `setUiLocale` syncs `locale.current` so `isRtl` follows.
  // Only `ar` is RTL among SUPPORTED_LOCALES (kept literal here to avoid an i18n import cycle).
  locale: {
    locale: 'pt',
    fallback: 'en',
    messages: { pt, en },
    rtl: { ar: true },
  },
  defaults: {
    VTextField: { density: 'compact', hideDetails: true },
    VSelect: { density: 'compact', hideDetails: true },
    VCombobox: { density: 'compact', hideDetails: true },
    VAutocomplete: { density: 'compact', hideDetails: true },
    VBtn: { rounded: 0 },
  },
  theme: {
    defaultTheme: preload,
    variations: {
      colors: ['primary', 'secondary', 'accent', 'error', 'warning', 'info', 'success'],
      lighten: 5,
      darken: 5,
    },
    themes: {
      ...themes,
      dark: themes.gms_dark,
    },
  },
  icons: {
    defaultSet: 'mdi',
    // aliases,
    sets: {
      cc: ccIcons,
      // mdi,
    },
  },
})

export default vuetify
