import { sql, requireAdmin, send, sameOrigin } from './_lib.js';
// GET /api/updates — hamma uchun; POST/DELETE — faqat ega (Google + sirli fraza)
const clean = (s, max) => String(s ?? '').replace(/\r/g, '').trim().slice(0, max);
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql()`select id, title, body, created_at from updates order by created_at desc limit 50`;
      return send(res, 200, { updates: rows.map(r => ({ id: Number(r.id), title: r.title, body: r.body, createdAt: r.created_at })) });
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') { res.setHeader('Allow', 'GET, POST, DELETE'); return send(res, 405, { error: 'method' }); }
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    const a = await requireAdmin(req);
    if (a.error) return send(res, a.error, { error: a.error === 403 ? 'forbidden' : 'phrase' });
    if (req.method === 'DELETE') {
      const id = Number((req.body || {}).id);
      if (!Number.isSafeInteger(id) || id < 1) return send(res, 400, { error: 'id' });
      await sql()`delete from updates where id = ${id}`;
      return send(res, 200, { ok: true });
    }
    const title = clean((req.body || {}).title, 80), body = clean((req.body || {}).body, 2000);
    if (!title) return send(res, 400, { error: 'title', message: 'Sarlavha yozing' });
    const [r] = await sql()`insert into updates (title, body) values (${title}, ${body}) returning id, title, body, created_at`;
    send(res, 201, { update: { id: Number(r.id), title: r.title, body: r.body, createdAt: r.created_at } });
  } catch { send(res, 500, { error: 'server' }); }
}
