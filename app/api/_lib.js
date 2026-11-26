// Lahzam server yordamchilari: sessiya, Google tekshiruvi, parol xeshi
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual, scrypt as _scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
export const OWNER_EMAIL = 'musoxonshovkatov@gmail.com';
export const RESERVED = ['admin', 'lahzam', 'musoojon', 'support', 'yordam', 'root', 'api', 'flappy', 'tetris', '2048', 'musoxon'];
const COOKIE = 'lz_s';
const MONTH = 30 * 24 * 3600;

export const sql = () => neon(process.env.DATABASE_URL);
export const isOwnerEmail = e => String(e || '').toLowerCase() === OWNER_EMAIL;

const b64u = b => Buffer.from(b).toString('base64url');
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET missing');
  return s;
}
export function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + createHmac('sha256', secret()).update(body).digest('base64url');
}
export function unsign(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = createHmac('sha256', secret()).update(body).digest();
  let got; try { got = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
  return p;
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return null;
}
export function setSession(res, user) {
  const token = sign({ uid: Number(user.id), exp: Math.floor(Date.now() / 1000) + MONTH, k: 's' });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MONTH}`);
}
export function clearSession(res) {
  res.setHeader('Set-Cookie', [`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`]);
}

/* ---------- admin 2-bosqich: sirli fraza ---------- */
const ADMIN_COOKIE = 'lz_a';
const ADMIN_TTL = 8 * 3600; // 8 soat
// Fraza bazada faqat qaytarib bo'lmaydigan xesh ko'rinishida turadi: scrypt + serverdagi maxfiy "pepper".
// Baza o'g'irlansa ham pepper'siz frazani topib bo'lmaydi; pepper esa faqat Vercel'da.
const STRONG = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
function pepper() { const p = process.env.ADMIN_PEPPER; if (!p || p.length < 32) throw new Error('ADMIN_PEPPER missing'); return p; }
const pep = phrase => createHmac('sha256', pepper()).update(String(phrase).normalize('NFKC')).digest();
export async function hashPhrase(phrase) {
  const salt = randomBytes(16);
  const key = await scrypt(pep(phrase), salt, 64, STRONG);
  return `scrypt2$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function checkPhrase(phrase, stored) {
  const [alg, s, k] = String(stored || '').split('$');
  if (alg !== 'scrypt2' || !s || !k) return false;
  const want = Buffer.from(k, 'base64');
  const got = await scrypt(pep(phrase), Buffer.from(s, 'base64'), want.length, STRONG);
  return timingSafeEqual(got, want);
}
export function setAdminPass(res, user) {
  const token = sign({ uid: Number(user.id), k: 'a', exp: Math.floor(Date.now() / 1000) + ADMIN_TTL });
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_TTL}`);
}
export function hasAdminPass(req, user) {
  const p = unsign(readCookie(req, ADMIN_COOKIE));
  return !!p && p.k === 'a' && user && p.uid === Number(user.id);
}
// Ega + sirli fraza tasdiqlangan bo'lsa, foydalanuvchini qaytaradi
export async function requireAdmin(req) {
  const me = await currentUser(req);
  if (!me || !isOwnerEmail(me.email)) return { error: 403 };
  if (!hasAdminPass(req, me)) return { error: 401, me };
  return { me };
}

/* ---------- urinishlarni cheklash (brute-force himoyasi) ---------- */
export const clientIp = req => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64);
// key bo'yicha window soniya ichida limit tadan ko'p urinish bo'lsa false qaytaradi
export async function rateLimit(key, limit, windowSec) {
  const [r] = await sql()`insert into rate_limits (k, n, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowSec}))
    on conflict (k) do update set
      n = case when rate_limits.reset_at < now() then 1 else rate_limits.n + 1 end,
      reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
    returning n`;
  return Number(r.n) <= limit;
}
export async function clearLimit(key) { await sql()`delete from rate_limits where k = ${key}`; }
export const tooMany = res => send(res, 429, { error: 'rate', message: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring' });

export async function currentUser(req) {
  const p = unsign(readCookie(req));
  if (!p || p.k !== 's') return null;
  const [u] = await sql()`select * from users where id = ${p.uid} and not is_system`;
  if (!u || u.is_blocked) return null;
  return u;
}
export const TERMS_VER = 2; // hujjatlar o'zgarsa oshiriladi: hamma qayta rozilik beradi
// ⭐ Yulduz obunasi: muddati tugamagan bo'lsa faol (Owner'da hamma imkoniyat doim ochiq)
export const isStar = u => !!u && (isOwnerEmail(u.email) || (!!u.star_until && new Date(u.star_until) > new Date()));
export const STAR_COLORS = ['tilla', 'olov', 'platina', 'yoqut', 'zumrad'];
export const COVER_RE = /^g(10|[1-9])(\.p(10|[1-9]))?$/;
export const publicUser = u => u && ({
  id: Number(u.id), username: u.username, name: u.name, bio: u.bio, color: u.color, photo: u.photo || null,
  email: u.email, isOwner: isOwnerEmail(u.email), hasPassword: !!u.password_hash, createdAt: u.created_at,
  dmFrom: u.dm_from || 'all', notifOff: !!u.notif_off, rrOff: !!u.rr_off, termsOk: Number(u.terms_ver || 0) >= TERMS_VER,
  star: isStar(u), starUntil: u.star_until || null, starColor: u.star_color || 'tilla', cover: u.cover || null, hideOnline: !!u.hide_online, hideRead: !!u.hide_read,
  pinned: u.pinned_post ? 'p' + u.pinned_post : null, unChangedAt: u.un_changed_at || null, appIcon: u.app_icon || null
});

export function checkUsername(v, email, star) {
  v = String(v || '');
  if (v.length < 3) return 'Kamida 3 belgi';
  if (v.length < 4 && !star && !isOwnerEmail(email)) return '3 harfli username faqat ⭐ Yulduz a’zolari uchun. Kamida 4 belgi';
  if (v.length > 15) return 'Ko‘pi bilan 15 belgi';
  if (!/^[a-z0-9._]+$/.test(v)) return 'Faqat kichik harf, raqam, nuqta (.) va pastki chiziq (_)';
  if (/^[0-9]/.test(v)) return 'Username raqam bilan boshlanmasin';
  if (!/[a-z]/.test(v)) return 'Username faqat raqamdan iborat bo‘lmasin: kamida bitta harf kerak';
  if ((v.match(/\./g) || []).length > 2) return 'Ko‘pi bilan 2 ta nuqta (.) ishlatish mumkin';
  if (/^\.|\.$/.test(v) || v.includes('..')) return 'Nuqta boshida, oxirida yoki ketma-ket bo‘lmasin';
  if (RESERVED.includes(v) && !(v === 'musoxon' && isOwnerEmail(email))) return `@${v} band`;
  return null;
}

// Google ID tokenini Google'ning o'zida tekshiramiz: imzo, muddat, kimga berilgani (aud)
export async function verifyGoogle(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw Object.assign(new Error('not_configured'), { status: 503 });
  if (typeof idToken !== 'string' || idToken.length > 4096) return null;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!r.ok) return null;
  const t = await r.json();
  const okIss = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== clientId || !okIss || String(t.email_verified) !== 'true' || Number(t.exp) * 1000 < Date.now()) return null;
  return { sub: String(t.sub), email: String(t.email).toLowerCase(), name: String(t.name || t.given_name || '').slice(0, 40), picture: t.picture || null };
}

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
const DUMMY = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
export async function checkPassword(pw, stored) {
  const [alg, s, k] = String(stored || DUMMY).split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const want = Buffer.from(k, 'base64');
  const got = await scrypt(pw, Buffer.from(s, 'base64'), want.length);
  return timingSafeEqual(got, want);
}

export function send(res, status, data) { res.setHeader('Cache-Control', 'no-store'); res.status(status).json(data); }
export function onlyMethod(req, res, ...methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', ')); send(res, 405, { error: 'method' }); return false;
}
// Faqat o'z saytimizdan kelgan POST so'rovlar (CSRF himoyasi)
export function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return req.headers['sec-fetch-site'] ? req.headers['sec-fetch-site'] === 'same-origin' : true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
