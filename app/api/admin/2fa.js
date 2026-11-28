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
    // 🔒 3 marta xato → shu IP 5 soatga bloklanadi
    const fk = 'a2f:fail:' + clientIp(req);
    const [bl] = await db`select ceil(extract(epoch from reset_at - now()) / 60)::int as mins from rate_limits where k = ${fk} and n >= 3 and reset_at > now()`;
    if (bl) return send(res, 429, { error: 'blocked', message: `3 marta xato kiritildi. Bu IP manzil ${Math.floor(bl.mins / 60)} soat ${bl.mins % 60} daqiqaga bloklangan 🔒` });
    if (!(await rateLimit('a2f:u:' + me.id, 5, 900))) return tooMany(res);
    if (!(await checkPhrase(phrase, row.hash))) {
      const [f] = await db`insert into rate_limits (k, n, reset_at) values (${fk}, 1, now() + interval '5 hours')
        on conflict (k) do update set n = case when rate_limits.reset_at < now() then 1 else rate_limits.n + 1 end,
          reset_at = now() + interval '5 hours' returning n`;
      const left = 3 - Number(f.n);
      return send(res, 401, { error: 'wrong', message: left > 0 ? `Fraza noto‘g‘ri. Yana ${left} ta urinish qoldi, keyin IP 5 soatga bloklanadi` : '3 marta xato kiritildi. Bu IP manzil 5 soatga bloklandi 🔒' });
    }
    await clearLimit('a2f:u:' + me.id); await clearLimit(fk);
    setAdminPass(res, me);
    send(res, 200, { ok: true, configured: true, verified: true });
  } catch { send(res, 500, { error: 'server', message: 'Server xatosi' }); }
}
