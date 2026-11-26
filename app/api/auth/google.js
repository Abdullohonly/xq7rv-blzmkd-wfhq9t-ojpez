import { sql, verifyGoogle, setSession, publicUser, sign, send, onlyMethod, sameOrigin, isOwnerEmail, rateLimit, clientIp, tooMany } from '../_lib.js';
// POST /api/auth/google { credential } — Google bilan kirish yoki ro'yxatdan o'tishni boshlash
export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  try {
    if (!(await rateLimit('google:' + clientIp(req), 30, 600))) return tooMany(res);
    const g = await verifyGoogle(req.body && req.body.credential);
    if (!g) return send(res, 401, { error: 'google_invalid', message: 'Google tasdiqlamadi, qayta urinib ko‘ring' });
    const db = sql();
    const [ban] = await db`select 1 from banned_emails where email = ${g.email}`;
    if (ban) return send(res, 403, { error: 'banned', message: 'Bu Gmail bloklangan' });
    let [u] = await db`select * from users where google_sub = ${g.sub} or email = ${g.email} limit 1`;
    if (u) {
      if (u.is_blocked) return send(res, 403, { error: 'blocked', message: 'Akkauntingiz bloklangan' });
      if (!u.google_sub) [u] = await db`update users set google_sub = ${g.sub} where id = ${u.id} returning *`;
      setSession(res, u);
      return send(res, 200, { user: publicUser(u) });
    }
    // Yangi odam: 20 daqiqalik ro'yxatdan o'tish chiptasi (imzolangan)
    const ticket = sign({ k: 't', sub: g.sub, email: g.email, picture: g.picture, exp: Math.floor(Date.now() / 1000) + 1200 });
    return send(res, 200, { needsSignup: true, ticket, email: g.email, name: g.name, owner: isOwnerEmail(g.email) });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status === 503 ? 'not_configured' : 'server', message: e.status === 503 ? 'Google kirish hali sozlanmagan' : 'Server xatosi' });
  }
}
