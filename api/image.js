import { handleProxyRequest } from '../server/proxy.mjs';

export default async function(req, res) {
  return handleProxyRequest(req, res);
}
