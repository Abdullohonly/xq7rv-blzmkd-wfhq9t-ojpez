import { sql, unsign, checkUsername, hashPassword, setSession, publicUser, send, onlyMethod, sameOrigin, isOwnerEmail, rateLimit, clientIp, tooMany } from '../_lib.js';
const COLORS = ['#FFD9C7', '#C9E4FF', '#FFE3A3', '#BDEBD6', '#D9D0FF', '#FFC9DA', '#E8E2D8', '#CDEBF2'];
// POST /api/auth/signup { ticket, username, name, password }
export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  const { ticket, username, name, password } = req.body || {};
  const t = unsign(ticket);
  if (!t || t.k !== 't') return send(res, 401, { error: 'ticket', message: 'Vaqt tugadi, Google bilan qayta kiring' });
  const owner = isOwnerEmail(t.email);
  const un = String(username || '').trim().toLowerCase();
  const nm = String(name || '').trim().slice(0, 40);
  const bad = checkUsername(un, t.email);
  if (bad) return send(res, 400, { error: 'username', message: bad });
  if (!nm) return send(res, 400, { error: 'name', message: 'Ismingizni yozing' });
  if (!owner && (typeof password !== 'string' || password.length < 6 || password.length > 200)) return send(res, 400, { error: 'password', message: 'Parol kamida 6 belgi' });
  try {
    if (!(await rateLimit('signup:' + clientIp(req), 10, 3600))) return tooMany(res);
    const db = sql();
    const [ban] = await db`select 1 from banned_emails where email = ${t.email}`;
    if (ban) return send(res, 403, { error: 'banned', message: 'Bu Gmail bloklangan' });
    const ph = owner ? null : await hashPassword(password);
    const [{ n }] = await db`select count(*)::int as n from users`;
    const [u] = await db`insert into users (username, name, email, google_sub, password_hash, photo, color)
      values (${un}, ${nm}, ${t.email}, ${t.sub}, ${ph}, ${t.picture || null}, ${COLORS[n % COLORS.length]}) returning *`;
    setSession(res, u);
    return send(res, 201, { user: publicUser(u) });
  } catch (e) {
    if (String(e.message).includes('duplicate') || e.code === '23505') return send(res, 409, { error: 'taken', message: 'Bu username yoki Gmail allaqachon band' });
    return send(res, 500, { error: 'server', message: 'Server xatosi' });
  }
}
