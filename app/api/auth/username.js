import { sql, checkUsername, send, rateLimit, clientIp, tooMany } from '../_lib.js';
// GET /api/auth/username?u=aziz.k — username bo'shligini tez tekshirish (bitta yengil so'rov)
export default async function handler(req, res) {
  const u = String(req.query.u || '').toLowerCase().slice(0, 40);
  if (!u) return send(res, 200, { ok: false, warm: true }); // oldindan uyg'otish
  const bad = checkUsername(u, req.query.e, req.query.s === '1'); // e — faqat ko'rsatma uchun (asl tekshiruv signup'da)
  if (bad) return send(res, 200, { ok: false, message: bad });
  try {
    if (!(await rateLimit('un:' + clientIp(req), 60, 60))) return tooMany(res);
    const [row] = await sql()`select exists(select 1 from users where username = ${u}) as taken`;
    send(res, 200, row.taken ? { ok: false, message: `@${u} band ❌` } : { ok: true, message: `@${u} bo‘sh ✅` });
  } catch { send(res, 500, { ok: false, message: 'Tekshirib bo‘lmadi, qayta urinib ko‘ring' }); }
}
