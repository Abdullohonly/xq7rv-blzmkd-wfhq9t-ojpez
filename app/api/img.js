import { sql, currentUser, isOwnerEmail, hasAdminPass, send } from './_lib.js';
// GET /api/img?u=ID — profil rasmi (hamma ko'radi, uzoq keshlanadi: v= o'zgarsa yangisi olinadi)
// GET /api/img?m=ID — chatdagi rasm (faqat shu chat a'zolari ko'radi)
const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const ALLOWED = u => { try { const h = new URL(u).hostname; return h.endsWith('.r2.dev') || h.endsWith('.googleusercontent.com'); } catch { return false; } };
async function out(res, dataUrl, cache) {
  // R2 / Google havolasi: serverda olib, o'z domenimizdan beramiz (CDN keshlaydi)
  if (/^https:\/\//.test(dataUrl || '')) {
    if (!ALLOWED(dataUrl)) return send(res, 404, { error: 'not_found' });
    const r = await fetch(dataUrl, { signal: AbortSignal.timeout(10000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return send(res, 404, { error: 'not_found' });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', type.split(';')[0]); res.setHeader('Cache-Control', cache);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'");
    return res.status(200).end(buf);
  }
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return send(res, 404, { error: 'not_found' });
  const buf = Buffer.from(m[2], 'base64');
  res.setHeader('Content-Type', TYPES[m[1]]);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.status(200).end(buf);
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const q = req.query || {}, db = sql();
    const u = Number(q.u), m = Number(q.m), p = Number(q.p);
    if (Number.isSafeInteger(p) && p > 0) { // post rasmi: ommaviy
      const [r] = await db`select img from posts where id = ${p} and not is_hidden`;
      return await out(res, r && r.img, 'public, max-age=31536000, s-maxage=31536000, immutable');
    }
    if (Number.isSafeInteger(u) && u > 0) {
      const [r] = await db`select photo from users where id = ${u} and not is_blocked`;
      return await out(res, r && r.photo, 'public, max-age=31536000, s-maxage=31536000, immutable');
    }
    if (Number.isSafeInteger(m) && m > 0) {
      const me = await currentUser(req); if (!me) return send(res, 401, { error: 'auth' });
      const admin = isOwnerEmail(me.email) && hasAdminPass(req, me);
      const [r] = await db`select msg.img from messages msg join chats c on c.id = msg.chat_id
        where msg.id = ${m} and (exists(select 1 from chat_members a where a.chat_id = c.id and a.user_id = ${me.id} and a.status = 'member')
          or (${admin} and c.kind = 'group' and c.access = 'open'))`;
      return await out(res, r && r.img, 'private, max-age=31536000, immutable');
    }
    send(res, 400, { error: 'bad' });
  } catch { send(res, 500, { error: 'server' }); }
}
