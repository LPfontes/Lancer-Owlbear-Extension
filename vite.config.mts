import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'url'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  server: {
    port: 5173,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    proxy: {
      '/compcon-api': {
        target: 'https://api.compcon.app',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/compcon-api/, ''),
      },
    },
    watch: {
      usePolling: true,
    },
    hmr: {
      overlay: true,
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        launcher: fileURLToPath(new URL('./launcher.html', import.meta.url)),
      },
    },
  },
  plugins: [
    {
      name: 'compcon-proxy-server',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && (req.url.startsWith('/api/share') || req.url.startsWith('/api/image'))) {
            const { handleProxyRequest } = await import('./server/proxy.mjs')
            await handleProxyRequest(req, res)
            return
          }
          next()
        })
      },
    },
    VitePWA({
      disable: true,
    }),
    vue(),
    vuetify({ autoImport: true }),
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/i18n/locales/**', import.meta.url))],
      runtimeOnly: true,
      strictMessage: false,
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
      {
        find: './runtimeConfig',
        replacement: './runtimeConfig.browser',
      },
    ],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
  },
  define: {
    APP_VERSION: JSON.stringify(pkg.version),
    'import.meta.env.VITE_ACHIEVEMENT_KEY': JSON.stringify('gumbodog'),
  },
  // Test setup mirrored from upstream COMP/CON (vitest 4 project layout).
  test: {
    globals: true,
    server: {
      deps: { inline: ['vuetify'] },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'domain',
          environment: 'happy-dom',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/ui/**', 'src/features/**'],
          setupFiles: ['src/__tests__/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'happy-dom',
          include: ['src/{ui,features}/**/*.spec.ts'],
          setupFiles: ['src/__tests__/setup.ts', 'src/__tests__/setup.component.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/classes/**/*.ts',
        'src/io/**/*.ts',
        'src/util/**/*.ts',
        'src/composables/**/*.ts',
      ],
      exclude: [
        'src/**/*.spec.ts',
        'src/__tests__/**',
        'src/**/*.d.ts',
        'src/**/enums.ts',
        'src/**/*_dictionary.ts',
      ],
      thresholds: {
        'src/io/**': { functions: 62 },
        'src/classes/**': { functions: 46 },
      },
    },
  },
})
