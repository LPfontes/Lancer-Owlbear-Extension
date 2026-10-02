import http from 'node:http';
import { URL } from 'node:url';

/**
 * Resolves a COMP/CON ShareCode using COMP/CON v3 AWS API Gateway & CloudFront CDN
 * @param {string} rawCode 
 * @returns {Promise<any>}
 */
export async function resolveShareCode(rawCode) {
  let shareCode = rawCode.trim();
  if (shareCode.includes('/link/pilot/')) {
    shareCode = shareCode.split('/link/pilot/')[1].split('/')[0];
  }
  shareCode = shareCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!shareCode) {
    throw new Error('ShareCode ou URL do COMP/CON não informada.');
  }

  // 1. Consulta a API oficial do COMP/CON v3 no AWS API Gateway
  try {
    const apiUrl = `https://idu55qr85i.execute-api.us-east-1.amazonaws.com/prod/code?scope=item&codes=${encodeURIComponent(
      JSON.stringify([shareCode])
    )}`;

    const codeResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'Y5DnZ4miJi30iazqn9VV73A253Db7HRxamHEQeMr'
      }
    });

    if (codeResponse.ok) {
      const resData = await codeResponse.json();
      const uri = resData?.uri || (Array.isArray(resData) && resData[0]?.uri);

      if (uri) {
        // Baixa o payload real do CloudFront S3
        const cfResponse = await fetch(`https://ds69h3g1zxwgy.cloudfront.net/${uri}`);

        if (cfResponse.ok) {
          const payload = await cfResponse.json();
          if (payload && (payload.callsign || payload.mechs || payload.itemType === 'pilot' || payload.id || payload.ID || payload.name || payload.npcClass || payload.class || payload.features)) {
            return payload;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Proxy] Falha ao consultar API oficial do COMP/CON v3 para ${shareCode}:`, err.message);
  }

  // 2. URLs de Fallback do ecossistema legado
  const candidateUrls = [
    `https://compcon-app.firebaseio.com/shares/${shareCode}.json`,
    `https://cloud.compcon.app/api/share/${shareCode}`
  ];

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload && (payload.callsign || payload.pilot || payload.mechs || payload.id || payload.ID || payload.name || payload.npcClass || payload.class || payload.features)) {
          return payload;
        }
      }
    } catch (e) {
      // Continua
    }
  }

  throw new Error(`Não foi possível localizar a ficha para o ShareCode "${shareCode}" no COMP/CON. Verifique se o código está correto ou copie e cole o JSON exportado diretamente.`);
}

/**
 * Node HTTP Request Listener with full CORS headers
 */
export async function handleProxyRequest(req, res) {
  // Configura cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  if (reqUrl.pathname.startsWith('/api/share')) {
    const parts = reqUrl.pathname.split('/');
    let code = req.query?.code || parts[parts.length - 1];

    if (!code || code === 'share' || code === '[code]') {
      code = reqUrl.searchParams.get('code') || '';
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ShareCode é obrigatório. Exemplo: /api/share/J9LJUQ9PCJA6' }));
      return;
    }

    try {
      const payload = await resolveShareCode(code);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Erro ao processar ShareCode' }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Rota não encontrada' }));
}

// Executa servidor autônomo se chamado diretamente (node server/proxy.mjs)
if (process.argv[1]?.includes('proxy.mjs')) {
  const PORT = process.env.PORT || 3001;
  const server = http.createServer(handleProxyRequest);
  server.listen(PORT, () => {
    console.log(`[COMP/CON Proxy] Servidor rodando na porta ${PORT}`);
  });
}

export default handleProxyRequest;
