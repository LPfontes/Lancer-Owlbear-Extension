import { getDb, sendJson, cors, rateLimit, handleError } from '../../../server/coldStorage.mjs';

/**
 * GET /api/rooms/:roomId/sheets?type=pilot|npc
 * Lista o catálogo (SEM o payload) das fichas de uma sala.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    rateLimit(req);

    const roomId = req.query.roomId;
    if (!roomId || Array.isArray(roomId)) {
      return sendJson(res, 400, { error: 'roomId é obrigatório.' });
    }

    const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    if (type && !['pilot', 'npc'].includes(type)) {
      return sendJson(res, 400, { error: 'type deve ser "pilot" ou "npc".' });
    }

    const filter = { roomId, ...(type ? { entityType: type } : {}) };
    const db = await getDb();
    const docs = await db
      .collection('room_sheets')
      .find(filter, { projection: { payload: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();

    return sendJson(res, 200, docs);
  } catch (err) {
    return handleError(res, err);
  }
}
