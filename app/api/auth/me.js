import { isStar, STAR_COLORS, COVER_RE, checkUsername, sql, currentUser, publicUser, clearSession, send, sameOrigin, rateLimit, tooMany } from '../_lib.js';
import { r2PutDataUrl } from '../_r2.js';
// Bio cheklovlari: qisqa, havolasiz, telefon raqamsiz, spamsiz
function bioProblem(v, max = 100) {
  if (v.length > max) return `Bio ko‘pi bilan ${max} belgi`;
  if (v.split('\n').length > 3) return 'Bio ko‘pi bilan 3 qator';
  if (/(https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(uz|com|ru|net|org|me|io|link|app)\b)/i.test(v)) return 'Bioga havola (link) qo‘yib bo‘lmaydi';
  if ((v.match(/\d/g) || []).length >= 9) return 'Bioga telefon raqam yozmang: xavfsizligingiz uchun';
  if (/(.)\1{5,}/u.test(v)) return 'Bir belgini ko‘p takrorlamang';
  return null;
}
// GET /api/auth/me — kim kirgan; PATCH — profil (ism, bio, rang, rasm); DELETE — chiqish
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export default async function handler(req, res) {
  if (req.method === 'DELETE') { if (!sameOrigin(req)) return send(res, 403, { error: 'origin' }); clearSession(res); return send(res, 200, { ok: true }); }
  if (req.method === 'PATCH') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    try {
      const u = await currentUser(req); if (!u) return send(res, 401, { error: 'auth' });
      if (!(await rateLimit('profile:' + u.id, 30, 600))) return tooMany(res);
      const b = req.body || {};
      const name = String(b.name ?? u.name).trim().slice(0, 40) || u.name;
      const bio = String(b.bio ?? u.bio ?? '').replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();
      const star = isStar(u);
      if (b.bio != null && bio !== (u.bio || '')) { const bp = bioProblem(bio, star ? 200 : 100); if (bp) return send(res, 400, { error: 'bio', message: bp }); }
      // ⭐ Yulduz sozlamalari: faqat faol obunada o'zgaradi
      const yz = k => b[k] !== undefined && star;
      const starColor = yz('starColor') && STAR_COLORS.includes(b.starColor) ? b.starColor : u.star_color;
      const cover = yz('cover') ? (b.cover === null ? null : COVER_RE.test(String(b.cover)) ? String(b.cover) : u.cover) : u.cover;
      const appIcon = yz('appIcon') ? (['qora', 'tilla', 'kok'].includes(b.appIcon) ? b.appIcon : null) : u.app_icon;
      const hideOnline = yz('hideOnline') ? !!b.hideOnline : !!u.hide_online, hideRead = yz('hideRead') ? !!b.hideRead : !!u.hide_read;
      let pinned = u.pinned_post;
      if (yz('pinned')) { if (b.pinned === null) pinned = null; else { const pid = Number(String(b.pinned).replace('p', '')); const [pp] = Number.isSafeInteger(pid) ? await sql()`select id from posts where id = ${pid} and user_id = ${u.id}` : []; if (!pp) return send(res, 400, { error: 'pin', message: 'Post topilmadi' }); pinned = pid; } }
      let username = u.username, unAt = u.un_changed_at;
      if (b.username !== undefined && String(b.username).toLowerCase() !== u.username) {
        if (!star) return send(res, 403, { error: 'star', message: 'Username’ni almashtirish faqat ⭐ Yulduz a’zolari uchun' });
        if (u.un_changed_at && Date.now() - new Date(u.un_changed_at).getTime() < 30 * 864e5) return send(res, 400, { error: 'username', message: 'Username’ni oyiga bir marta almashtirish mumkin' });
        const nu = String(b.username).trim().toLowerCase(), bad = checkUsername(nu, u.email, true); if (bad) return send(res, 400, { error: 'username', message: bad });
        const [tk] = await sql()`select 1 from users where username = ${nu}`; if (tk) return send(res, 409, { error: 'taken', message: `@${nu} band` });
        username = nu; unAt = new Date();
      }
      const color = /^#[0-9A-Fa-f]{6}$/.test(b.color || '') ? b.color : u.color;
      let photo = u.photo;
      if (b.photo === null) photo = null;
      else if (b.photo !== undefined) {
        if (typeof b.photo !== 'string' || b.photo.length > 150000 || !PHOTO_RE.test(b.photo)) return send(res, 400, { error: 'photo', message: 'Rasm juda katta yoki noto‘g‘ri formatda' });
        photo = (await r2PutDataUrl(b.photo, 'u').catch(() => null)) || b.photo; // R2 bo'lsa havola, bo'lmasa bazada
      }
      const dmFrom = b.dmFrom === 'fol' || b.dmFrom === 'all' ? b.dmFrom : (u.dm_from || 'all');
      const notifOff = typeof b.notifOff === 'boolean' ? b.notifOff : !!u.notif_off, rrOff = typeof b.rrOff === 'boolean' ? b.rrOff : !!u.rr_off;
      const [r] = await sql()`update users set name = ${name}, bio = ${bio}, color = ${color}, photo = ${photo}, dm_from = ${dmFrom}, notif_off = ${notifOff}, rr_off = ${rrOff},
        star_color = ${starColor}, cover = ${cover}, hide_online = ${hideOnline}, hide_read = ${hideRead}, pinned_post = ${pinned}, app_icon = ${appIcon}, username = ${username}, un_changed_at = ${unAt} where id = ${u.id} returning *`;
      return send(res, 200, { user: publicUser(r) });
    } catch { return send(res, 500, { error: 'server' }); }
  }
  try { send(res, 200, { user: publicUser(await currentUser(req)) }); }
  catch { send(res, 200, { user: null }); }
}
