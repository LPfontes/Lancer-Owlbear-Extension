import { MongoClient } from 'mongodb';
import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignora se não for permitido alterar servidores DNS
}

/**
 * Cold storage (MongoDB Atlas) para fichas da mesa, particionado por room.id.
 *
 * MODELO DE SEGURANÇA ("modo ingênuo", sem autenticação):
 * - A URI do Mongo existe SOMENTE como env var da Vercel (MONGODB_URI). Ela nunca
 *   aparece no bundle do frontend nem em nenhuma resposta da API.
 * - Estas funções expõem APENAS um CRUD estreito sobre a coleção fixa `room_sheets`.
 *   Não há query arbitrária, não há acesso a outras coleções, não há comandos de
 *   admin. Um cliente mal-intencionado consegue, no máximo, ler/gravar/apagar
 *   documentos de ficha de uma sala cujo roomId ele conheça — aceitável, pois são
 *   dados não sensíveis.
 * - Proteção contra abuso: rate limit por IP + limites de tamanho + validação.
 */

import fs from 'node:fs';
import path from 'node:path';

function ensureEnvLoaded() {
  if (process.env.MONGODB_URI) return;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Continua sem falhar se não conseguir ler .env
  }
}

let client = null;

function dbName() {
  ensureEnvLoaded();
  return process.env.MONGODB_DB || 'owlbear';
}

export async function getDb() {
  ensureEnvLoaded();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw Object.assign(new Error('MONGODB_URI não configurado no servidor (Vercel ou .env local).'), { status: 500 });
  }
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
    await client.connect();
  }
  return client.db(dbName());
}

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4_000_000) {
        reject(Object.assign(new Error('Payload grande demais.'), { status: 413 }));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

const hits = new Map();
export function rateLimit(req, limit = 120, windowMs = 60_000) {
  const key = clientIp(req);
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [k, rec] of hits) if (now > rec.resetAt) hits.delete(k);
  }
  const rec = hits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + windowMs;
  }
  rec.count += 1;
  hits.set(key, rec);
  if (rec.count > limit) {
    throw Object.assign(new Error('Muitas requisições. Tente novamente em instantes.'), { status: 429 });
  }
}

export function handleError(res, err) {
  const status = err?.status || 500;
  // Em erros 5xx, NÃO devolve a mensagem interna (pode conter detalhes da conexão).
  const message = err?.status ? (err?.message || 'Erro') : 'Erro interno.';
  sendJson(res, status, { error: message });
}
