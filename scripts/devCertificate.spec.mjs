// Verifica que o certificado de dev é um X.509 válido com SAN para localhost.
// Uso: node --experimental-strip-types scripts/devCertificate.spec.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import { getHttpsCredentials, CERT_PATHS } from './devCertificate.ts'

const { key, cert } = await getHttpsCredentials()

// 1. O Node consegue analisar o certificado?
const parsed = new crypto.X509Certificate(cert)
console.log('subject   :', parsed.subject.replace(/\n/g, ' | '))
console.log('issuer    :', parsed.issuer.replace(/\n/g, ' | '))
console.log('válido de :', parsed.validFrom)
console.log('válido até:', parsed.validTo)
console.log('SAN       :', parsed.subjectAltName)
console.log('chave OK  :', crypto.createPrivateKey(key).asymmetricKeyType)

// 2. Confere que o certificado corresponde à chave privada (o TLS falharia sem isso).
const pubFromCert = parsed.publicKey.export({ type: 'spki', format: 'pem' })
const pubFromKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' })
const matches = String(pubFromCert) === String(pubFromKey)
console.log('par chave/certificado:', matches ? 'OK' : '❌ DIVERGENTE')

// 3. Verifica a autoassinatura.
const ok = parsed.verify(parsed.publicKey)
console.log('autoassinatura:', ok ? 'OK' : '❌ INVÁLIDA')

// 4. O SAN precisa cobrir localhost.
const sanOk = /DNS:localhost/.test(String(parsed.subjectAltName))
console.log('SAN localhost:', sanOk ? 'OK' : '❌ AUSENTE')

console.log('\narquivos:', CERT_PATHS.dir)
console.log('tamanho cert:', fs.statSync(CERT_PATHS.crt).size, 'bytes')

const allOk = matches && ok && sanOk
console.log(allOk ? '\n✅ CERTIFICADO UTILIZÁVEL' : '\n❌ CERTIFICADO COM PROBLEMA')
process.exit(allOk ? 0 : 1)
