// Polyfills para execução em ambiente sandboxed de iFrame do Owlbear Rodeo (sem inline scripts para respeitar CSP)

// 0. Garante que se o Owlbear Rodeo anexou ?obrref=... após o hash (#/table-chat?obrref=...),
// os parâmetros sejam movidos para window.location.search para o OBR SDK inicializar sem erros.
if (typeof window !== 'undefined') {
  try {
    const search = window.location.search
    const hash = window.location.hash
    if (!search.includes('obrref=') && hash.includes('obrref=')) {
      const qIndex = hash.indexOf('?')
      if (qIndex !== -1) {
        const route = hash.slice(0, qIndex)
        const query = hash.slice(qIndex + 1)
        const existingSearch = search ? search + '&' : '?'
        const newUrl = window.location.pathname + existingSearch + query + route
        window.history.replaceState(null, '', newUrl)
      }
    }
  } catch {
    // ignore
  }
}

const w = typeof window !== 'undefined' ? (window as any) : {}

// 1. Polyfill de process e global
if (!w.global) {
  w.global = w
}

if (!w.process) {
  w.process = {
    env: { DEBUG: undefined },
    version: [],
  }
}

// 2. In-Memory Mock Storage para iFrames com storage particionado ou restrito
function createMockStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => (store[k] !== undefined ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k in store) delete store[k]
    },
    key: (i: number) => Object.keys(store)[i] || null,
    get length() {
      return Object.keys(store).length
    },
  }
}

// 3. Teste e Proteção para LocalStorage
try {
  const testKey = '__cc_test__'
  window.localStorage.setItem(testKey, testKey)
  window.localStorage.removeItem(testKey)
} catch {
  const mockStorage = createMockStorage()
  try {
    Object.defineProperty(window, 'localStorage', {
      get: () => mockStorage,
      configurable: true,
    })
  } catch {
    try {
      w.localStorage = mockStorage
    } catch {}
  }
}

// 4. Teste e Proteção para SessionStorage
try {
  const testKey = '__cc_test_session__'
  window.sessionStorage.setItem(testKey, testKey)
  window.sessionStorage.removeItem(testKey)
} catch {
  const mockSessionStorage = createMockStorage()
  try {
    Object.defineProperty(window, 'sessionStorage', {
      get: () => mockSessionStorage,
      configurable: true,
    })
  } catch {
    try {
      w.sessionStorage = mockSessionStorage
    } catch {}
  }
}

// 5. Proteção para IndexedDB
try {
  const _ = window.indexedDB
} catch {
  console.warn('[COMP/CON] IndexedDB restrito no iframe.')
  try {
    Object.defineProperty(window, 'indexedDB', {
      get: () => null,
      configurable: true,
    })
  } catch {}
}

// 6. Proteção e lazy-resume para AudioContext (evita avisos de Autoplay Policy no iFrame)
if (typeof window !== 'undefined') {
  const originalWarn = console.warn
  console.warn = function (...args: any[]) {
    if (typeof args[0] === 'string' && args[0].includes('The AudioContext was not allowed to start')) {
      return
    }
    return originalWarn.apply(console, args)
  }

  const NativeAudioContext = window.AudioContext || (window as any).webkitAudioContext
  if (NativeAudioContext) {
    let hasUserGesture = false
    const unlockEvents = ['click', 'touchstart', 'keydown', 'pointerdown']
    const unlock = () => {
      hasUserGesture = true
      unlockEvents.forEach(evt => window.removeEventListener(evt, unlock, true))
    }
    unlockEvents.forEach(evt => window.addEventListener(evt, unlock, { capture: true, once: true, passive: true }))

    class SafeAudioContext extends NativeAudioContext {
      override resume(): Promise<void> {
        if (!hasUserGesture && this.state === 'suspended') {
          return new Promise(resolve => {
            const onGesture = () => {
              unlockEvents.forEach(evt => window.removeEventListener(evt, onGesture, true))
              try {
                super.resume().then(resolve).catch(resolve)
              } catch {
                resolve()
              }
            }
            unlockEvents.forEach(evt => window.addEventListener(evt, onGesture, { capture: true, once: true, passive: true }))
          })
        }
        return super.resume()
      }
    }

    try {
      window.AudioContext = SafeAudioContext as any
      if ((window as any).webkitAudioContext) {
        (window as any).webkitAudioContext = SafeAudioContext as any
      }
    } catch {}
  }
}

// 7. Proteção contra unhandledrejection de RPCs do Owlbear Rodeo ou promises externas que rejeitam com Object
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && typeof event.reason === 'object') {
      const msg = event.reason.message || event.reason.error || ''
      if (
        (typeof msg === 'string' && (
          msg.includes('not ready') ||
          msg.includes('Popover') ||
          msg.includes('already exists') ||
          msg.includes('Context menu') ||
          msg.includes('Extension') ||
          msg.includes('Action')
        )) ||
        event.reason.code === 400 ||
        event.reason.error !== undefined
      ) {
        event.preventDefault()
        const detail = event.reason?.error?.message || event.reason?.message || event.reason
        console.warn('[COMP/CON Handled Rejection]:', detail)
      }
    }
  })
}

export {}

