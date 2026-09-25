import { createI18n } from 'vue-i18n'
import pt from './locales/pt.json'
import en from './locales/en.json'

export const SUPPORTED_LOCALES = [
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
  { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

export const DEFAULT_LOCALE: LocaleCode = 'pt'

export function isSupportedLocale(code: string): code is LocaleCode {
  return SUPPORTED_LOCALES.some(l => l.code === code)
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: 'en',
  messages: { pt, en } as unknown as Record<LocaleCode, typeof pt>,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
})
