import { sql, checkUsername, send, rateLimit, clientIp, tooMany } from '../_lib.js';
// GET /api/auth/username?u=aziz.k — username bo'shligini tez tekshirish
export default async function handler(req, res) {
  const u = String(req.query.u || '').toLowerCase().slice(0, 40);
  const bad = checkUsername(u, req.query.e);
  if (bad) return send(res, 200, { ok: false, message: bad });
  try {
    if (!(await rateLimit('uname:' + clientIp(req), 90, 60))) return tooMany(res);
    const [row] = await sql()`select 1 from users where username = ${u}`;
    send(res, 200, row ? { ok: false, message: `@${u} band ❌` } : { ok: true, message: `@${u} bo‘sh ✅` });
  } catch { send(res, 500, { ok: false, message: 'Tekshirib bo‘lmadi' }); }
}
