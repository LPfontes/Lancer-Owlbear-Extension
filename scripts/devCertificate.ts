import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import * as selfsigned from 'selfsigned'

/**
 * Certificado HTTPS para o dev server local.
 *
 * Por que existe: dentro do Owlbear Rodeo o app roda num **iframe**. Em
 * `http://localhost` o Chromium não concede armazenamento durável a esse iframe
 * (o IndexedDB é negado), a ficha fica só em memória e some no reload. Servindo
 * por **https://localhost**, o comportamento fica equivalente ao deploy.
 *
 * A geração usa `selfsigned` (ASN.1 à mão erra com facilidade). O certificado é
 * guardado em `.certs/` (gitignored) e reaproveitado enquanto for válido.
 *
 * Para eliminar o aviso de certificado do navegador, confie na CA gerada:
 *
 *     certutil -user -addstore Root .certs\localhost.crt
 */

const CACHE_DIR = path.resolve(process.cwd(), '.certs')
const KEY_FILE = path.join(CACHE_DIR, 'localhost.key')
const CRT_FILE = path.join(CACHE_DIR, 'localhost.crt')
const META_FILE = path.join(CACHE_DIR, 'localhost.json')

/** Navegadores recusam certificado de servidor com validade acima de 398 dias. */
const VALID_DAYS = 397
/** Renova 15 dias antes de vencer, para não quebrar no meio de um teste. */
const RENEW_MARGIN_DAYS = 15

interface CertMeta {
  createdAt: number
  expiresAt: number
  altNames: string[]
}

export interface HttpsCredentials {
  key: string
  cert: string
}

/** Tipos de GeneralName do X.509 que o `selfsigned` espera. */
const GENERAL_NAME_DNS = 2
const GENERAL_NAME_IP = 7

const ALT_NAMES = [
  { type: GENERAL_NAME_DNS, value: 'localhost' },
  { type: GENERAL_NAME_IP, value: '127.0.0.1' },
  { type: GENERAL_NAME_IP, value: '::1' },
]

function readMeta(): CertMeta | null {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8')) as CertMeta
  } catch {
    return null
  }
}

function isStillValid(meta: CertMeta | null): boolean {
  if (!meta) return false
  const renewAt = meta.expiresAt - RENEW_MARGIN_DAYS * 24 * 60 * 60 * 1000
  return Date.now() < renewAt
}

/** Certificado analisável e com SAN para localhost? */
function certificateIsUsable(cert: string): boolean {
  try {
    const parsed = new crypto.X509Certificate(cert)
    return /DNS:localhost/.test(String(parsed.subjectAltName || ''))
  } catch {
    return false
  }
}

async function generate(): Promise<{ key: string; cert: string; meta: CertMeta }> {
  const notAfter = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000)

  // Na versão 5.x do `selfsigned`, `generate` é assíncrono.
  const pems = await (selfsigned as any).generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    algorithm: 'sha256',
    days: VALID_DAYS,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: ALT_NAMES },
    ],
  })

  return {
    key: pems.private,
    cert: pems.cert,
    meta: {
      createdAt: Date.now(),
      expiresAt: notAfter.getTime(),
      altNames: ALT_NAMES.map(entry => `${entry.type === 7 ? 'IP' : 'DNS'}:${entry.value}`),
    },
  }
}

/** Lê do cache ou gera um certificado novo, sempre validando o resultado. */
export async function getHttpsCredentials(): Promise<HttpsCredentials> {
  const meta = readMeta()

  if (isStillValid(meta) && fs.existsSync(KEY_FILE) && fs.existsSync(CRT_FILE)) {
    const key = fs.readFileSync(KEY_FILE, 'utf8')
    const cert = fs.readFileSync(CRT_FILE, 'utf8')
    if (certificateIsUsable(cert)) return { key, cert }
    // cache corrompido: regenera abaixo
  }

  const { key, cert, meta: newMeta } = await generate()

  // Falhar aqui é muito melhor do que falhar no handshake TLS do navegador.
  if (!certificateIsUsable(cert)) {
    throw new Error(
      'devCertificate: o certificado gerado não pôde ser analisado ou não tem SAN para localhost.',
    )
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(KEY_FILE, key)
  fs.writeFileSync(CRT_FILE, cert)
  fs.writeFileSync(META_FILE, JSON.stringify(newMeta, null, 2))

  return { key, cert }
}

export const CERT_PATHS = { dir: CACHE_DIR, key: KEY_FILE, crt: CRT_FILE }
