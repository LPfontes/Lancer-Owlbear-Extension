import { getDb, sendJson, cors, rateLimit, readJsonBody, handleError } from '../../../../server/coldStorage.mjs';

/**
 * GET    /api/rooms/:roomId/sheets/:sheetId  → documento completo
 * PUT    /api/rooms/:roomId/sheets/:sheetId  → upsert (Enviar), com concorrência otimista
 * DELETE /api/rooms/:roomId/sheets/:sheetId  → remove (Apagar)
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    rateLimit(req);

    const roomId = req.query.roomId;
    const sheetId = req.query.sheetId;
    if (!roomId || Array.isArray(roomId) || !sheetId || Array.isArray(sheetId)) {
      return sendJson(res, 400, { error: 'roomId e sheetId são obrigatórios.' });
    }

    const db = await getDb();
    const col = db.collection('room_sheets');
    const filter = { roomId, sheetId };

    if (req.method === 'GET') {
      const doc = await col.findOne(filter);
      if (!doc) return sendJson(res, 404, { error: 'Ficha não encontrada.' });
      return sendJson(res, 200, doc);
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);

      const entityType = body.entityType === 'npc' || body.entityType === 'pilot' ? body.entityType : null;
      if (!entityType) return sendJson(res, 400, { error: 'entityType deve ser "pilot" ou "npc".' });
      if (typeof body.payload !== 'object' || body.payload === null || Array.isArray(body.payload)) {
        return sendJson(res, 400, { error: 'payload deve ser um objeto.' });
      }

      const existing = await col.findOne(filter);

      // Concorrência otimista: só sobrescreve se a revision do cliente bater.
      if (body.expectedRevision != null && existing && existing.revision !== body.expectedRevision) {
        return sendJson(res, 409, { error: 'conflito', current: existing });
      }

      const now = new Date();
      const doc = {
        roomId,
        sheetId,
        entityType,
        name: typeof body.name === 'string' ? body.name : 'Ficha',
        callsign: typeof body.callsign === 'string' ? body.callsign : null,
        meta: body.meta && typeof body.meta === 'object' ? body.meta : {},
        payload: body.payload,
        revision: (existing?.revision ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await col.updateOne(filter, { $set: doc }, { upsert: true });
      return sendJson(res, 200, doc);
    }

    if (req.method === 'DELETE') {
      await col.deleteOne(filter);
      res.writeHead(204);
      return res.end();
    }

    return sendJson(res, 405, { error: 'Método não suportado.' });
  } catch (err) {
    return handleError(res, err);
  }
}
