import { sql, currentUser, publicUser, clearSession, send, sameOrigin, rateLimit, tooMany } from '../_lib.js';
import { r2PutDataUrl } from '../_r2.js';
// Bio cheklovlari: qisqa, havolasiz, telefon raqamsiz, spamsiz
function bioProblem(v) {
  if (v.length > 100) return 'Bio ko‘pi bilan 100 belgi';
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
      if (b.bio != null && bio !== (u.bio || '')) { const bp = bioProblem(bio); if (bp) return send(res, 400, { error: 'bio', message: bp }); }
      const color = /^#[0-9A-Fa-f]{6}$/.test(b.color || '') ? b.color : u.color;
      let photo = u.photo;
      if (b.photo === null) photo = null;
      else if (b.photo !== undefined) {
        if (typeof b.photo !== 'string' || b.photo.length > 150000 || !PHOTO_RE.test(b.photo)) return send(res, 400, { error: 'photo', message: 'Rasm juda katta yoki noto‘g‘ri formatda' });
        photo = (await r2PutDataUrl(b.photo, 'u').catch(() => null)) || b.photo; // R2 bo'lsa havola, bo'lmasa bazada
      }
      const dmFrom = b.dmFrom === 'fol' || b.dmFrom === 'all' ? b.dmFrom : (u.dm_from || 'all');
      const notifOff = typeof b.notifOff === 'boolean' ? b.notifOff : !!u.notif_off, rrOff = typeof b.rrOff === 'boolean' ? b.rrOff : !!u.rr_off;
      const [r] = await sql()`update users set name = ${name}, bio = ${bio}, color = ${color}, photo = ${photo}, dm_from = ${dmFrom}, notif_off = ${notifOff}, rr_off = ${rrOff} where id = ${u.id} returning *`;
      return send(res, 200, { user: publicUser(r) });
    } catch { return send(res, 500, { error: 'server' }); }
  }
  try { send(res, 200, { user: publicUser(await currentUser(req)) }); }
  catch { send(res, 200, { user: null }); }
}
