import { sql, checkPassword, setSession, publicUser, send, onlyMethod, sameOrigin, rateLimit, clearLimit, clientIp, tooMany } from '../_lib.js';
// POST /api/auth/login { username, password }
export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  const un = String((req.body || {}).username || '').trim().toLowerCase().replace(/^@/, '');
  const pw = String((req.body || {}).password || '');
  const fail = () => send(res, 401, { error: 'bad', message: 'Username yoki parol noto‘g‘ri' });
  if (!un || un.length > 20 || pw.length > 200) return fail();
  try {
    const ip = clientIp(req);
    if (!(await rateLimit('login:ip:' + ip, 20, 900)) || !(await rateLimit('login:u:' + un, 8, 900))) return tooMany(res);
    const [u] = await sql()`select * from users where username = ${un} and not is_system`;
    if (u && !u.password_hash) return send(res, 400, { error: 'google_only', message: 'Bu akkauntga faqat Google orqali kiriladi' });
    const good = await checkPassword(pw, u && u.password_hash);
    if (!u || !good) return fail();
    await clearLimit('login:u:' + un);
    if (u.is_blocked) return send(res, 403, { error: 'blocked', message: 'Akkauntingiz bloklangan' });
    setSession(res, u);
    send(res, 200, { user: publicUser(u) });
  } catch { send(res, 500, { error: 'server', message: 'Server xatosi' }); }
}
