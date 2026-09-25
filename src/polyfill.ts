// Polyfills para execução em ambiente sandboxed de iFrame do Owlbear Rodeo (sem inline scripts para respeitar CSP)

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
  console.warn('[COMP/CON] LocalStorage restrito no iframe. Ativando In-Memory Storage.')
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
  const testKey = '__cc_tests__'
  window.sessionStorage.setItem(testKey, testKey)
  window.sessionStorage.removeItem(testKey)
} catch {
  console.warn('[COMP/CON] SessionStorage restrito no iframe. Ativando In-Memory Storage.')
  const mockSession = createMockStorage()
  try {
    Object.defineProperty(window, 'sessionStorage', {
      get: () => mockSession,
      configurable: true,
    })
  } catch {
    try {
      w.sessionStorage = mockSession
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

export {}
