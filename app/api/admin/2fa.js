import { sql, currentUser, isOwnerEmail, hashPhrase, checkPhrase, setAdminPass, hasAdminPass, rateLimit, clearLimit, clientIp, tooMany, send, sameOrigin } from '../_lib.js';
// Admin 2-bosqich. GET — holat; POST { phrase, confirm? } — birinchi marta o'rnatish yoki tekshirish
export default async function handler(req, res) {
  try {
    const me = await currentUser(req);
    if (!me || !isOwnerEmail(me.email)) return send(res, 403, { error: 'forbidden' });
    const db = sql();
    const [row] = await db`select hash from admin_secrets where id = 'phrase'`;
    if (req.method === 'GET') return send(res, 200, { configured: !!row, verified: hasAdminPass(req, me) });
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    const phrase = String((req.body || {}).phrase || '');
    if (phrase.length > 200) return send(res, 400, { error: 'long', message: 'Juda uzun' });
    if (!row) {
      const confirm = String((req.body || {}).confirm || '');
      if (phrase.trim().length < 12) return send(res, 400, { error: 'short', message: 'Kamida 12 belgi: bir nechta so‘zdan iborat ibora tanlang' });
      if (phrase !== confirm) return send(res, 400, { error: 'confirm', message: 'Ikkala fraza bir xil emas' });
      const h = await hashPhrase(phrase);
      const [ins] = await db`insert into admin_secrets (id, hash) values ('phrase', ${h}) on conflict (id) do nothing returning id`;
      if (!ins) return send(res, 409, { error: 'exists', message: 'Fraza allaqachon o‘rnatilgan' });
      setAdminPass(res, me);
      return send(res, 200, { ok: true, configured: true, verified: true });
    }
    // 15 daqiqada ko'pi bilan 5 urinish (IP va akkaunt bo'yicha)
    if (!(await rateLimit('a2f:u:' + me.id, 5, 900)) || !(await rateLimit('a2f:ip:' + clientIp(req), 10, 900))) return tooMany(res);
    if (!(await checkPhrase(phrase, row.hash))) return send(res, 401, { error: 'wrong', message: 'Fraza noto‘g‘ri' });
    await clearLimit('a2f:u:' + me.id);
    setAdminPass(res, me);
    send(res, 200, { ok: true, configured: true, verified: true });
  } catch { send(res, 500, { error: 'server', message: 'Server xatosi' }); }
}
