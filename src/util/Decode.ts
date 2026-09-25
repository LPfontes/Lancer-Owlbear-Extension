const DEFAULT_KEY = 'gumbodog'

function getKey(): string {
  return import.meta.env?.VITE_ACHIEVEMENT_KEY || DEFAULT_KEY
}

function decrypt(encryptedText?: string): string {
  if (!encryptedText) return ''
  try {
    encryptedText = decodeURIComponent(encryptedText)
  } catch {
    // If not URI-encoded, keep original string
  }
  const key = getKey()
  let decrypted = ''
  for (let i = 0; i < encryptedText.length; i++) {
    const charCode = encryptedText.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    decrypted += String.fromCharCode(charCode)
  }
  return decrypted
}

function encrypt(text?: string): string {
  if (!text) return ''
  const key = getKey()
  let encrypted = ''
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    encrypted += String.fromCharCode(charCode)
  }
  return encodeURIComponent(encrypted)
}

export { decrypt, encrypt }
