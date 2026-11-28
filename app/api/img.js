import { sql, currentUser, isOwnerEmail, hasAdminPass, send } from './_lib.js';
// GET /api/img?u=ID — profil rasmi (hamma ko'radi, uzoq keshlanadi: v= o'zgarsa yangisi olinadi)
// GET /api/img?m=ID — chatdagi rasm (faqat shu chat a'zolari ko'radi)
const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const R2_HOST = (() => { try { return new URL(process.env.R2_PUBLIC_URL || '').hostname; } catch { return ''; } })();
const ALLOWED = u => { try { const x = new URL(u), h = x.hostname; return x.protocol === 'https:' && !x.port && ((R2_HOST && h === R2_HOST) || h.endsWith('.googleusercontent.com')); } catch { return false; } };
async function out(res, dataUrl, cache) {
  // R2 / Google havolasi: serverda olib, o'z domenimizdan beramiz (CDN keshlaydi)
  if (/^https:\/\//.test(dataUrl || '')) {
    if (!ALLOWED(dataUrl)) return send(res, 404, { error: 'not_found' });
    const r = await fetch(dataUrl, { redirect: 'error', signal: AbortSignal.timeout(10000) });
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
// Ilova ikonkasi: har foydalanuvchiga o'zi tanlagan ikonka (⭐ Yulduz). Android Chrome manifest o'zgarganini ko'rib, ikonkani yangilaydi
const MANIFEST = {"id": "/", "name": "Lahzam", "short_name": "Lahzam", "description": "Fikrlar, guruhlar va shaxsiy suhbatlar uchun o‘zbekcha ijtimoiy tarmoq", "lang": "uz", "start_url": "/?source=app", "scope": "/", "display": "standalone", "display_override": ["window-controls-overlay", "standalone"], "orientation": "portrait", "background_color": "#FF5A1F", "theme_color": "#FF5A1F", "categories": ["social"], "shortcuts": [{"name": "Shaxsiy", "url": "/shaxsiy", "icons": [{"src": "/icon-192.png", "sizes": "192x192"}]}, {"name": "Guruhlar", "url": "/guruhlar", "icons": [{"src": "/icon-192.png", "sizes": "192x192"}]}]};
async function appIcon(req, res) {
  let k = null;
  try { const u = await currentUser(req); const star = u && (isOwnerEmail(u.email) || (u.star_until && new Date(u.star_until) > new Date())); if (star && ['qora', 'tilla', 'kok'].includes(u.app_icon)) k = u.app_icon; } catch (e) {}
  res.setHeader('Cache-Control', 'private, no-cache'); res.setHeader('Vary', 'Cookie');
  if (req.query.app === 'apple') { res.setHeader('Location', k ? `/icons/${k}-apple.png` : '/icons/default-apple.png'); return res.status(302).end(); }
  const icons = k ? [{ src: `/icons/${k}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `/icons/${k}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: `/icons/${k}-mask.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    : [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  return res.status(200).end(JSON.stringify({ ...MANIFEST, icons }));
}
// 🔗 Guruh taklif havolasi uchun chiroyli oldindan ko'rinish (Telegram, WhatsApp, Instagram botlari JS'ni ishga tushirmaydi)
const H = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function groupCard(req, res) {
  const id = Number(String(req.query.g || '').replace(/^c/, '')), host = 'https://' + String(req.headers.host || 'app.lahzam.uz').replace(/[^\w.\-:]/g, '');
  let title = 'Lahzam guruhi', desc = 'O‘zbekcha ijtimoiy tarmoq: guruhlar, chat, o‘yinlar.';
  if (Number.isSafeInteger(id) && id > 0) {
    const [c] = await sql()`select c.name, c.description, c.access, (select count(*)::int from chat_members m where m.chat_id = c.id and m.status = 'member') as n
      from chats c where c.id = ${id} and c.kind = 'group'`;
    if (c) { title = `👥 ${c.name} — Lahzam`; desc = `${c.n} a’zo${c.access !== 'closed' && c.description ? ' · ' + String(c.description).slice(0, 140) : ''} · Lahzam’da qo‘shiling!`; }
  }
  const url = `${host}/g/c${Number.isSafeInteger(id) ? id : ''}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).end(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${H(title)}</title>
<meta name="description" content="${H(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Lahzam">
<meta property="og:title" content="${H(title)}"><meta property="og:description" content="${H(desc)}"><meta property="og:url" content="${H(url)}">
<meta property="og:image" content="${host}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"></head><body><h1>${H(title)}</h1><p>${H(desc)}</p><a href="${H(url)}">Guruhni ochish</a></body></html>`);
}
export default async function handler(req, res) {
  if (req.query.app) return appIcon(req, res);
  if (req.query.g) return groupCard(req, res).catch(() => send(res, 500, { error: 'server' }));
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
