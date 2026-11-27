/* Lahzam v1.7.0 — hamma ma'lumot serverda (Neon). Brauzerda faqat tez ochilish uchun nusxa saqlanadi. */
(function () {
'use strict';
const KEY = 'lahzam_db_v2';
const VERSION = '1.12.8'; // har yangilanishda oshadi: kichik tuzatish → 1.0.x, yangi funksiya → 1.x.0
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const LIMIT = { reply: 300, msg: 2000 };
Object.defineProperty(LIMIT, 'post', { get: () => (typeof me === 'function' && me() && me().star ? 1500 : 500) });
const COLORS = ['#FFD9C7', '#C9E4FF', '#FFE3A3', '#BDEBD6', '#D9D0FF', '#FFC9DA', '#E8E2D8', '#CDEBF2'];
const RESERVED = ['admin', 'lahzam', 'musoojon', 'support', 'yordam', 'root', 'api'];
const OWNER_EMAIL = 'musoxonshovkatov@gmail.com'; // Lahzam egasi: admin huquqlari shu Gmail'ga bog'langan
const CATS = ['Ta‘lim', 'Sport', 'Kitoblar', 'Biznes', 'IT', 'Oila', 'Boshqa'];
const ACCESS = { open: 'Hamma uchun', ask: 'Ruxsatli', closed: 'Yopiq' };
const REACTS = ['❤️', '👎', '⭐', '🫶', '😂', '😮', '😢', '🤲'];
const now = () => Date.now();
const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- data ---------------- */
let DB;
const fresh = (keep = {}) => ({ v: 2, users: [], follows: [], posts: [], chats: [], notifs: [], stars: {}, me: null, sess: null, limits: {}, spam: [], theme: keep.theme || 'light', fs: keep.fs || 'md', updSeen: keep.updSeen || 0 });
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 2) return d; } catch (e) {}
  let old = {}; try { old = JSON.parse(localStorage.getItem('lahzam_db_v1')) || {}; localStorage.removeItem('lahzam_db_v1'); } catch (e) {}
  return fresh(old); // eski demo ma'lumotlar o'chadi: endi hammasi serverdan keladi
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
DB = load();
// Shriftlar sahifani kutdirmasdan yuklanadi (sekin internetda ham matn darhol ko'rinadi)
{ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Manrope:wght@800&family=Unbounded:wght@500;700&display=swap'; document.head.appendChild(l); }

const GHOST = id => ({ id, u: 'deleted', name: 'O‘chirilgan akkaunt', color: '#E8E2D8', bio: '', ghost: true });
const user = id => id == null ? undefined : (DB.users.find(u => u.id === id) || GHOST(id));
const byName = n => DB.users.find(u => u.u.toLowerCase() === String(n).toLowerCase());
const me = () => (DB.me == null ? null : user(DB.me));
let SESSION = null; // serverda tasdiqlangan foydalanuvchi (Google yoki parol bilan kirgan)
const isOwnerUser = u => !!u && u.email === OWNER_EMAIL;
const isOwnerSession = () => { const u = me(); return !!u && !!SESSION && SESSION.isOwner === true && u.id === SESSION.id; };
let ADM = { checked: false, configured: false, verified: false }; // admin 2-bosqich holati (serverdan)
const isAdmin = () => isOwnerSession() && ADM.verified;
async function refreshAdm() {
  if (!isOwnerSession()) { ADM = { checked: true, configured: false, verified: false }; return; }
  const r = await api('admin/2fa');
  ADM = { checked: true, configured: !!r.configured, verified: !!r.verified };
}
async function api(path, opts = {}) {
  try {
    const r = await fetch('/api/' + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...data };
  } catch (e) { return { ok: false, status: 0, message: 'Internetga ulanib bo‘lmadi' }; }
}
// Server sessiyasi: kim kirgan. Boshqa hamma narsa sync() orqali serverdan keladi
function adoptSession(su) {
  const prev = DB.me;
  SESSION = su || null; DB.sess = SESSION;
  if (!su) { if (prev != null) DB = fresh(DB); return; }
  if (prev != null && prev !== su.id) DB = Object.assign(fresh(DB), { sess: su }); // boshqa akkaunt: eski keshni tozalaymiz
  DB.me = su.id;
  if (!DB.users.some(x => x.id === su.id)) DB.users.push({ id: su.id, u: su.username, name: su.name, bio: su.bio || '', color: su.color, joined: Date.parse(su.createdAt) || now(), photo: null });
}
/* Server bilan sinxronlash: har bir necha soniyada yangi postlar va xabarlar o'zi keladi */
let SYNC = { busy: false, sig: '', last: 0, readSent: {} };
async function sync(force) {
  if (!SESSION || (SYNC.busy && !force)) return;
  SYNC.busy = true;
  let r;
  try {
    const res = await fetch('/api/sync', { credentials: 'same-origin', headers: SYNC.etag && !force ? { 'If-None-Match': SYNC.etag } : {} });
    SYNC.busy = false; SYNC.last = now();
    if (res.status === 304) return; // o'zgarish yo'q: hech narsa yuklanmaydi
    r = { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
    if (res.ok) SYNC.etag = res.headers.get('ETag');
  } catch (e) { SYNC.busy = false; SYNC.last = now(); return; }
  if (r.status === 401) { adoptSession(null); save(); render(); return; }
  if (!r.ok) return;
  const sig = JSON.stringify([r.users, r.follows, r.posts, r.chats, r.notifs, r.stars, r.daily, r.dq]);
  if (sig === SYNC.sig && !force) return;
  SYNC.sig = sig;
  Object.assign(DB, { me: r.me, users: r.users, follows: r.follows, stars: r.stars || {}, posts: r.posts, daily: r.daily || [], dq: r.dq || null, chats: r.chats, notifs: r.notifs.map(n => ({ ...n, to: r.me })) });
  if (isOwnerSession() && ADM.checked && r.admin !== ADM.verified) ADM.verified = r.admin;
  save(); softRender();
}
// Foydalanuvchi yozayotganda sahifani qayta chizmaymiz, faqat chatdagi xabarlarni yangilaymiz
function softRender() {
  const name = route()[0];
  if (name === 'chat') {
    const box = $('#msgs'), c = DB.chats.find(x => x.id === CH.cid);
    if (box && c) { const near = innerHeight + scrollY >= document.body.scrollHeight - 160; box.innerHTML = msgList(c); const sb = $('#chat-sub'), u0 = me(); if (sb && u0) sb.innerHTML = typingText(c) ? `<span class="typing">${typingText(c)}</span>` : c.type === 'group' ? `${c.members.length} a‘zo` : isSaved(c) ? 'Faqat siz ko‘rasiz' : seenText(peer(c, u0)); if (near) scrollTo(0, document.body.scrollHeight); markRead(c); if (!XOQ.t || XOQ.idle > 0) xoPoll(); return; }
  }
  // Admin panel fonda o'zi qayta chizilmaydi (sakramasin); ↻ tugmasi bilan yangilanadi
  if (name === 'admin') return;
  if (busy()) { SYNC.pending = true; return; }
  const y = scrollY; render(true); if (name !== 'chat') scrollTo(0, y);
}
const busy = () => { const a = document.activeElement; return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value) || !!$('#modal-root').innerHTML || !!document.querySelector('.rx-bar'); };
document.addEventListener('focusout', () => setTimeout(() => { if (SYNC.pending && !busy()) { SYNC.pending = false; softRender(); } }, 300));
// Amal serverga yuboriladi; xato bo'lsa aytiladi va haqiqiy holat qayta olinadi
async function server(body, okMsg) {
  const r = await api('act', { method: 'POST', body });
  if (!r.ok) { toast(r.message || (r.status === 0 ? 'Internetga ulanib bo‘lmadi' : 'Bajarilmadi, qayta urinib ko‘ring'), true); if (r.status === 401 && r.error === 'auth') { adoptSession(null); go('/kirish'); return r; } }
  else if (okMsg) toast(okMsg);
  sync(true);
  return r;
}
const VIEWQ = new Set(); let viewT;
function seen(p) { if (p.seen || !me()) return; p.seen = true; p.views = (p.views || 0) + 1; VIEWQ.add(p.id); clearTimeout(viewT); viewT = setTimeout(() => { const ids = [...VIEWQ]; VIEWQ.clear(); api('act', { method: 'POST', body: { t: 'views', posts: ids } }); }, 1500); }
function markRead(c) {
  const u = me(); if (!u || !c || !c.members.includes(u.id)) return;
  const last = c.msgs.length ? c.msgs[c.msgs.length - 1].t : 0;
  c.read[u.id] = now();
  if (last > (SYNC.readSent[c.id] || 0)) { SYNC.readSent[c.id] = last; api('act', { method: 'POST', body: { t: 'read', chat: c.id } }); }
}
const realUsers = () => DB.users.filter(u => !u.system).sort((a, b) => a.id - b.id);
const isFounder = u => !u.system && realUsers().findIndex(x => x.id === u.id) < 50;
const followers = id => DB.follows.filter(f => f[1] === id).map(f => f[0]);
const following = id => DB.follows.filter(f => f[0] === id).map(f => f[1]);
const isFollowing = (a, b) => DB.follows.some(f => f[0] === a && f[1] === b);
const alive = p => !p.hidden && !(p.lahza && now() - p.t > DAY) && !(user(p.uid) || {}).blocked;
// ⭐ Foydali: server hisoblaydi (bir odamning ⭐ si bir marta)
const foydaliCount = (id, since = 0) => { const s2 = (DB.stars || {})[id]; return s2 ? (since ? s2.week : s2.all) : 0; };
function notify() { /* bildirishnomalarni endi server yaratadi */ }
function mentions(text) { return [...new Set((text.match(/@([a-z0-9._]{3,20})/gi) || []).map(s => s.slice(1).toLowerCase()))]; }

/* ---------------- helpers ---------------- */
const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const uzDate = (t, year) => { const d = new Date(t); return `${d.getDate()}-${OYLAR[d.getMonth()]}${year || d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : ''}`; };

function ago(t) {
  const s = Math.max(1, Math.round((now() - t) / 1000));
  if (s < 60) return 'hozir'; const m = Math.round(s / 60); if (m < 60) return m + ' daq';
  const h = Math.round(m / 60); if (h < 24) return h + ' soat'; const d = Math.round(h / 24); if (d < 7) return d + ' kun';
  return uzDate(t);
}
const fmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + 'k' : String(n);
// 🔤 Lotin ↔ Kirill: foydalanuvchi matnlari tanlangan yozuvda ko'rsatiladi (havola, @username va #teglar o'zgarmaydi)
const L2C = [["sh", "ш"], ["ch", "ч"], ["o‘", "ў"], ["o'", "ў"], ["oʻ", "ў"], ["o`", "ў"], ["g‘", "ғ"], ["g'", "ғ"], ["gʻ", "ғ"], ["g`", "ғ"], ["yo", "ё"], ["yu", "ю"], ["ya", "я"], ["ye", "е"], ["ts", "ц"],
  ["a", "а"], ["b", "б"], ["d", "д"], ["e", "е"], ["f", "ф"], ["g", "г"], ["h", "ҳ"], ["i", "и"], ["j", "ж"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["q", "қ"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["v", "в"], ["x", "х"], ["y", "й"], ["z", "з"], ["’", "ъ"], ["ʼ", "ъ"], ["'", "ъ"]];
const C2L = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '’', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o‘', қ: 'q', ғ: 'g‘', ҳ: 'h' };
const caseLike = (src, out) => { const up0 = src[0] !== src[0].toLowerCase(), all = src.length > 1 && src[1] !== src[1].toLowerCase(); return up0 && all ? out.toUpperCase() : up0 ? out[0].toUpperCase() + out.slice(1) : out; };
function wordToCyr(w) {
  let out = '', i = 0;
  while (i < w.length) {
    let hit = null;
    for (const [l, c] of L2C) { if (w.substr(i, l.length).toLowerCase() === l) { hit = [l, c]; break; } }
    if (!hit) { out += w[i]; i++; continue; }
    let c = hit[1]; if (hit[0] === 'e' && i === 0) c = 'э';
    out += caseLike(w.substr(i, hit[0].length), c); i += hit[0].length;
  }
  return out;
}
function wordToLat(w) {
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const ch = w[i], lo = ch.toLowerCase(); let l = C2L[lo];
    if (l === undefined) { out += ch; continue; }
    if (lo === 'е' && (i === 0 || /[аеёиоуўэюяaeiou]/i.test(w[i - 1]))) l = 'ye';
    out += ch !== lo ? (l.length > 1 && w[i + 1] && w[i + 1] === w[i + 1].toUpperCase() ? l.toUpperCase() : l[0].toUpperCase() + l.slice(1)) : l;
  }
  return out;
}
function translit(text) {
  const sc = DB.script; if (!sc || !text) return text;
  return String(text).split(/(\s+)/).map(tok => {
    if (/^(@|#|https?:|www\.)/i.test(tok) || /\.[a-z]{2,}/i.test(tok) || /^\[(s|post):/.test(tok)) return tok;
    const cyr = /[\u0400-\u04FF]/.test(tok);
    return sc === 'cyr' && !cyr && /[a-z]/i.test(tok) ? wordToCyr(tok) : sc === 'lat' && cyr ? wordToLat(tok) : tok;
  }).join('');
}
// Matnni bo'laklarga ajratib, har birini alohida xavfsiz chiqaramiz: havola ichiga @mention tushib qolmaydi
function linkify(text) {
  const t = translit(String(text ?? '')), re = /(https?:\/\/[^\s<>"']+)|(^|[^\w/])@([a-z0-9._]{3,20})|(^|\s)#([\p{L}0-9_]{2,30})/giu;
  let out = '', last = 0, m;
  while ((m = re.exec(t))) {
    out += esc(t.slice(last, m.index));
    if (m[1]) { const u = m[1]; out += `<a href="${esc(u)}" target="_blank" rel="noopener nofollow ugc">${esc(u)}</a>`; }
    else if (m[3]) out += m[3].toLowerCase() === 'everyone' ? `${esc(m[2])}<span class="evr">📣 @everyone</span>` : `${esc(m[2])}<a href="/@${m[3]}" data-link>@${m[3]}</a>`;
    else out += `${esc(m[4])}<a href="/t/${encodeURIComponent(m[5])}" data-link>#${esc(m[5])}</a>`;
    last = re.lastIndex;
  }
  return out + esc(t.slice(last));
}
function avatar(u, size = 44) {
  if (!u) return '';
  if (u.owner && !u._in) { const w = size >= 80 ? 5 : size >= 44 ? 3 : 2.5; return `<span class="oav" style="--ow:${w}px">${avatar({ ...u, _in: 1 }, size - w * 2)}</span>`; }
  if (u.photo) return `<span class="av" style="width:${size}px;height:${size}px;background:${u.color}" aria-hidden="true"><img src="${esc(u.photo)}" alt="" style="width:100%;height:100%;object-fit:cover"></span>`;
  if (u.system) { const g = gameOf(u); return `<span class="av" style="width:${size}px;height:${size}px;background:${g && g.k !== 'flappy' ? '#1d1d22' : '#BFEAF7'}">${g && g.k !== 'flappy' ? g.ico(size * .8) : Flappy.birdSVG(size * .86)}</span>`; }
  return `<span class="av" style="width:${size}px;height:${size}px;background:${u.color};font-size:${Math.round(size * .38)}px" aria-hidden="true">${esc(u.name[0] || u.u[0]).toUpperCase()}</span>`;
}
const OWNER_PILL = '<span class="founder owner-pill">Owner</span>';
// 🏆 Foydali darajalari: guruhlarda olingan ⭐ soniga qarab
const LEVELS = [[200, '🎓', 'Ustoz'], [50, '📚', 'Bilimdon'], [10, '🤝', 'Yordamchi']];
const levelOf = u => u && !u.system ? LEVELS.find(([n]) => foydaliCount(u.id) >= n) : null;
const levelPill = u => { const l = levelOf(u); return l ? ` <span class="lvl" title="${l[2]}: ${l[0]}+ ⭐">${l[1]} ${l[2]}</span>` : ''; };
const founderPill = u => !u ? '' : (u.owner ? ' ' + OWNER_PILL : isFounder(u) ? ' <span class="founder">Asoschi</span>' : '') + levelPill(u);
let toastT;
function toast(msg, warn) { const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (warn ? ' warn' : ''); clearTimeout(toastT); toastT = setTimeout(() => el.className = 'toast', warn ? 3200 : 2000); }
async function hash(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lahzam:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return 'x' + s.length + s; } }
// Lahzam uslubidagi navigatsiya ikonkalari: yumaloq, qalin chiziq va brendning to'q sariq "lahza nuqtasi"
const DOTC = '#FF5A1F';
function NI(name, on = false, size = 22) {
  const f = `fill="currentColor" fill-opacity="${on ? 0.22 : 0}"`, st = 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const P = {
    home: `<path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h1A3.5 3.5 0 0 1 13 6.5V12h4.5A3.5 3.5 0 0 1 21 15.5v1a3.5 3.5 0 0 1-3.5 3.5H9.5L5 23z" ${f} ${st}/><circle cx="17.4" cy="6.6" r="2.6" fill="${DOTC}"/>`,
    groups: `<path d="M3 7.5A3.5 3.5 0 0 1 6.5 4h5A3.5 3.5 0 0 1 15 7.5" ${st} fill="none"/><path d="M3 7.5v2.5a3 3 0 0 0 3 3" ${st} fill="none"/><path d="M12.5 9h5a3.5 3.5 0 0 1 3.5 3.5v2a3.5 3.5 0 0 1-3.5 3.5H17v3l-4-3h-.5A3.5 3.5 0 0 1 9 14.5v-2A3.5 3.5 0 0 1 12.5 9z" ${f} ${st}/><circle cx="15" cy="13.5" r="1.7" fill="${DOTC}"/>`,
    dms: `<path d="M6 4h12a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 18 18h-6l-5 4v-4H6a3.5 3.5 0 0 1-3.5-3.5v-7A3.5 3.5 0 0 1 6 4z" ${f} ${st}/><path d="M12 14.2l-2.6-2.5a1.7 1.7 0 0 1 2.6-2.1 1.7 1.7 0 0 1 2.6 2.1z" fill="${DOTC}"/>`,
    search: `<circle cx="10.5" cy="10.5" r="6.8" ${f} ${st}/><path d="M15.6 15.6L21 21" ${st}/><circle cx="10.5" cy="10.5" r="2.3" fill="${DOTC}"/>`,
    bell: `<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 2H4.2z" ${f} ${st}/><path d="M10 21.2h4" ${st}/><circle cx="18" cy="5.2" r="2.7" fill="${DOTC}"/>`,
    trophy: `<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z" ${f} ${st}/><path d="M7 5.5H4v1.2A3.3 3.3 0 0 0 7.3 10M17 5.5h3v1.2a3.3 3.3 0 0 1-3.3 3.3M12 14v4M8 21h8" ${st} fill="none"/><path d="M12 5.6l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="${DOTC}"/>`,
    updates: `<path d="M11 3c.7 5 2.7 7.4 7.5 8-4.8.6-6.8 3-7.5 8-.7-5-2.7-7.4-7.5-8 4.8-.6 6.8-3 7.5-8z" ${f} ${st}/><circle cx="19.5" cy="19" r="2" fill="${DOTC}"/><circle cx="19" cy="4.5" r="1.3" fill="${DOTC}"/>`,
    gear: `<circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-dasharray="3.1 2.87" transform="rotate(8 12 12)"/><circle cx="12" cy="12" r="5.6" ${f} ${st}/><circle cx="12" cy="12" r="2.2" fill="${DOTC}"/>`,
    games: `<path d="M7 8h10a5 5 0 0 1 4.9 6l-.6 3a2.6 2.6 0 0 1-4.6 1.1L15 16H9l-1.7 2.1a2.6 2.6 0 0 1-4.6-1.1l-.6-3A5 5 0 0 1 7 8z" ${f} ${st}/><path d="M7.5 11v3M6 12.5h3" ${st}/><circle cx="16.5" cy="12.5" r="1.7" fill="${DOTC}"/>`,
    saved: `<path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v16l-7-4.5L5 21V5a1.5 1.5 0 0 1 1.5-1.5z" ${f} ${st}/><circle cx="12" cy="9.5" r="2.2" fill="${DOTC}"/>`
  };
  return `<svg class="ni${on ? ' on' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${P[name]}</svg>`;
}
const THEME_ICO = () => DB.theme === 'dark'
  ? '<svg class="ni" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="#FFC531"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
  : '<svg class="ni" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="17.5" cy="5.5" r="1.8" fill="#FF5A1F"/></svg>';
const I = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  trophy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
  spark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/><path d="M19 3v4M17 5h4"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  heart: f => `<svg viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.7-4.9A8 8 0 1 1 21 12z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
  group: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.4 3.2-5.2 6-5.2s5.2 1.8 6 5.2"/><path d="M16 5.3a3 3 0 0 1 0 5.6M18 14.9c1.6.7 2.6 2.4 3 5.1"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  logo: (fill = '#fff', dot = '#121212', s = 26) => `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-hidden="true"><path d="M14 12a8 8 0 0 1 8-8h14a8 8 0 0 1 8 8v46h34a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H30L14 98z" fill="${fill}"/><circle cx="72" cy="30" r="13" fill="${dot}"/></svg>`
};

/* ---------------- anti-spam ---------------- */
function guard(kind, text) {
  const u = me(); if (!u) { go('/kirish'); return false; }
  if (u.blocked) { toast('Akkauntingiz moderator tomonidan bloklangan.', true); return false; }
  const L = DB.limits[u.id] = DB.limits[u.id] || { sends: [], warnedAt: 0, pauseUntil: 0, coolUntil: 0 };
  const t = now();
  if (t < L.coolUntil) { const m = Math.ceil((L.coolUntil - t) / MIN); toast(`Hordiq davom etmoqda 🍵 Yana ${m} daqiqa`, true); return false; }
  if (t < L.pauseUntil) { toast(`Shoshmang 🙂 Yana ${Math.ceil((L.pauseUntil - t) / 1000)} soniya dam oling`, true); return false; }
  const clean = text.trim();
  if (!clean) { toast('Avval biror narsa yozing'); return false; }
  if (clean.length > LIMIT[kind]) { toast(`Juda uzun: ko‘pi bilan ${LIMIT[kind]} belgi`, true); return false; }
  if (kind !== 'msg') {
    if (/@(flappy|tetris|2048)(?!\w)/i.test(clean)) { toast('O‘yinlar faqat chat va guruhlarda ishlaydi 🎮', true); return false; }
    const links = (clean.match(/https?:\/\//g) || []).length;
    const fresh = t - u.joined < 7 * DAY && !isOwnerSession();
    if (links > 1) { toast('Bitta postda ko‘pi bilan 1 ta havola', true); return false; }
    if (links && fresh) { toast('Yangi akkauntlar 7 kun havola qo‘ya olmaydi', true); return false; }
    if (mentions(clean).length > 5) { toast('Ko‘pi bilan 5 ta @belgilash', true); return false; }
  }
  if (kind === 'post') {
    const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    if (DB.posts.some(p => p.uid === u.id && t - p.t < DAY && norm(p.text) === norm(clean))) { toast('Bu matnni 24 soat ichida allaqachon joylagansiz', true); return false; }
    const lastHour = L.sends.filter(s => s.k === 'post' && t - s.t < HOUR).length;
    if (lastHour >= 10) { toast('Soatiga ko‘pi bilan 10 ta post', true); return false; }
    if (t - u.joined < 7 * DAY && !isOwnerSession() && DB.posts.filter(p => p.uid === u.id).length >= 7) { toast('Yangi akkauntlar birinchi haftada ko‘pi bilan 7 ta post joylay oladi. Yozish uchun eski postlaringizni o‘chiring', true); return false; }
  }
  if (kind === 'reply' && L.sends.filter(s => s.k === 'reply' && t - s.t < HOUR).length >= 30) { toast('Soatiga ko‘pi bilan 30 ta javob', true); return false; }
  const junk = clean.length <= 2 || /^[\s.\-_,!?…*]+$/.test(clean) || /^(.)\1+$/.test(clean.replace(/\s/g, ''));
  L.sends.push({ t, k: kind, junk });
  L.sends = L.sends.filter(s => t - s.t < DAY);
  const burst = L.sends.filter(s => t - s.t < 10e3).length > 5 || L.sends.filter(s => t - s.t < 20e3 && s.junk).length >= 3;
  if (burst) {
    if (t - L.warnedAt < 5 * MIN) {
      L.coolUntil = t + 15 * MIN; L.warnedAt = 0;
      DB.spam.push({ uid: u.id, t, reason: 'Ogohlantirishdan keyin yana tez yozdi: 15 daqiqa hordiq' });
      save(); toast('15 daqiqalik hordiq 🍵 Choy ichib keling, keyin davom etamiz', true); return false;
    }
    L.warnedAt = t; L.pauseUntil = t + 30e3;
    DB.spam.push({ uid: u.id, t, reason: 'Juda tez yozdi: ogohlantirildi' });
    save(); toast('Shoshmang 🙂 Biroz dam olib, keyin yozing', true); return false;
  }
  return true;
}

/* ---------------- router ---------------- */
const app = $('#app');
function go(path, replace) { if (typeof quietUpdate === 'function' && !replace && quietUpdate(path)) return; if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path); render(); if (route()[0] === 'chat') chatBottom(); else window.scrollTo(0, 0); }
window.addEventListener('popstate', render);
function route() {
  const p = decodeURI(location.pathname).replace(/\/+$/, '') || '/';
  let m;
  if (p === '/') return ['home'];
  if (p === '/kirish') return ['auth'];
  if (p === '/guruhlar') return ['groups'];
  if (p === '/shaxsiy') return ['dms'];
  if (p === '/qidiruv') return ['search'];
  if (p === '/bildirishnomalar') return ['notifs'];
  if (p === '/sozlamalar') return ['settings'];
  if (p === '/musoojon') return ['admin'];
  if (p === '/yangiliklar') return ['updates'];
  if (p === '/reyting') return ['leaders'];
  if (p === '/oyinlar') return ['games'];
  if (p === '/yulduz') return ['star'];
  if (p === '/statistika') return ['stats'];
  if (p === '/shartlar' || p === '/maxfiylik' || p === '/qoidalar') return ['doc', p.slice(1)];
  if ((m = p.match(/^\/@([a-z0-9._]+)$/i))) return ['profile', m[1]];
  if ((m = p.match(/^\/p\/([\w-]+)$/))) return ['post', m[1]];
  if ((m = p.match(/^\/c\/([\w-]+)$/))) return ['chat', m[1]];
  if ((m = p.match(/^\/g\/([\w-]+)$/))) return ['group', m[1]];
  if ((m = p.match(/^\/t\/(.+)$/))) { let tg = m[1]; try { tg = decodeURIComponent(tg); } catch (e) {} return ['tag', tg]; }
  return ['404'];
}
const PUBLIC = ['auth', 'profile', 'post', 'tag', 'admin', 'updates', 'doc', 'star', '404'];
const PG = { last: null, tm: 0, ind: {} }, NAV_ORDER = ['home', 'groups', 'dms', 'updates'];
// Navigatsiyadagi tanlangan fon eski joyidan yangi joyiga suriladi
function slideNav() {
  [['dock', '.dock', '.dock .on'], ['side', '.side', '.side .snav.on']].forEach(([k, cs, os]) => {
    const box = $(cs), on = $(os); if (!box) return;
    if (!on) { box.classList.remove('has-ind'); return; }
    const ind = document.createElement('span'); ind.className = 'nav-ind'; ind.setAttribute('aria-hidden', 'true');
    box.prepend(ind); box.classList.add('has-ind');
    const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const put = r => { ind.style.transform = `translate(${r.x}px,${r.y}px)`; ind.style.width = r.w + 'px'; ind.style.height = r.h + 'px'; };
    const from = PG.ind[k];
    PG.ind[k] = to;
    if (!from || (from.x === to.x && from.y === to.y && from.w === to.w)) return put(to);
    put(from); void ind.offsetWidth; ind.classList.add('go'); put(to);
  });
}
// ✍️ Qoralama: yozilayotgan matn telefonga saqlanadi — sahifa yangilansa yoki chiqib ketsangiz ham yo'qolmaydi
const draftKey = el => !el ? null : el.id === 'msg-in' ? (CH.edit ? null : 'lz_d:m:' + CH.cid) : el.id === 'post-text' ? 'lz_d:p' : el.id === 'reply-text' ? 'lz_d:r:' + ((el.form && el.form.dataset.id) || '') : null;
let DRAFT_KEEP = null;
function draftRestore() {
  if (DRAFT_KEEP != null) { const ta = $('#post-text'); if (ta && !ta.value) { ta.value = DRAFT_KEEP; ta.dispatchEvent(new Event('input', { bubbles: true })); } DRAFT_KEEP = null; }
  ['#msg-in', '#post-text', '#reply-text'].forEach(sel => { const el = $(sel), k = draftKey(el); if (!k || el.value) return; let v = null; try { v = localStorage.getItem(k); } catch (e) {} if (v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } });
}
document.addEventListener('input', e => { const k = draftKey(e.target); if (!k) return; try { e.target.value.trim() ? localStorage.setItem(k, e.target.value.slice(0, 2000)) : localStorage.removeItem(k); } catch (err) {} });
document.addEventListener('submit', e => { const el = e.target.querySelector('#msg-in,#post-text,#reply-text'), k = draftKey(el); if (k) try { localStorage.removeItem(k); } catch (err) {} }, true);
function render() {
  document.documentElement.dataset.theme = DB.theme;
  document.documentElement.dataset.fs = DB.fs || 'md';
  const [name, arg] = route();
  if (me() && me().blocked) { DB.me = null; save(); toast('Akkauntingiz bloklangan.', true); }
  if (!me() && !PUBLIC.includes(name)) return go('/kirish', true);
  if (me() && name === 'auth') return go('/', true);
  const V = { home, auth, groups, dms, search, notifs, settings, admin, profile, post, chat, group, tag, updates, leaders, doc: docPage, games: gamesPage, star: starPage, stats: statsPage, '404': notFound }[name];
  const html = V(arg);
  const desk = DESK.matches && me() && !['auth', 'admin'].includes(name);
  document.body.classList.toggle('is-desk', !!desk);
  app.innerHTML = desk ? deskShell(name, html) : html;
  draftRestore();
  // sahifa almashganda animatsiya: dock bo'yicha o'ngga/chapga, boshqa sahifalar pastdan
  if (PG.last !== name) {
    const a = NAV_ORDER.indexOf(PG.last), b = NAV_ORDER.indexOf(name);
    const dir = PG.last == null ? '' : a > -1 && b > -1 ? (b > a ? 'pg-r' : 'pg-l') : 'pg-u';
    PG.last = name;
    if (dir) { app.classList.remove('pg-r', 'pg-l', 'pg-u'); void app.offsetWidth; app.classList.add(dir); clearTimeout(PG.tm); PG.tm = setTimeout(() => app.classList.remove(dir), 400); }
  }
  document.title = name === 'home' ? 'Lahzam — Har lahza yoningizda!' : (TITLES[name] || '') + ' · Lahzam';
  slideNav();
  after[name] && after[name](arg);
  if (SESSION && SESSION.termsOk === false && name !== 'doc') consentGate();
  save();
}
/* Kompyuter ko'rinishi: chapda menyu, o'rtada asosiy qism, o'ngda reyting va yangiliklar */
const DESK = window.matchMedia('(min-width: 1080px)');
DESK.addEventListener('change', () => render());
function deskShell(name, html) {
  const u = me(), g = unread('group'), d = unread('dm'), n = unreadNotifs(), nu = unreadUpdates();
  const L = (href, icon, label, on, num) => `<a href="${href}" data-link class="snav${on ? ' on' : ''}">${icon}<span>${label}</span>${num ? `<span class="dot">${num > 99 ? '99+' : num}</span>` : ''}</a>`;
  const ico = s => s.replace('<svg', '<svg width="22" height="22"');
  const top = realUsers().filter(x => !x.blocked).map(x => ({ x, n: foydaliCount(x.id, now() - 7 * DAY) })).filter(r => r.n).sort((a, b) => b.n - a.n).slice(0, 5);
  const sug = realUsers().filter(x => x.id !== u.id && !x.blocked && !isFollowing(u.id, x.id)).slice(0, 4);
  const upd = (UPD.list || [])[0];
  return `<div class="desk">
    <aside class="side"><a href="/" data-link class="side-brand">${I.logo('#FF5A1F', '#121212', 34)}<b>lahzam</b></a>
      <nav aria-label="Asosiy">
        ${L('/', NI('home', name === 'home'), 'Ochiq maydon', name === 'home')}
        ${L('/guruhlar', NI('groups', name === 'groups'), 'Guruhlar', name === 'groups', g)}
        ${L('/shaxsiy', NI('dms', name === 'dms'), 'Shaxsiy', name === 'dms', d)}
        ${L('/qidiruv', NI('search', name === 'search'), 'Qidiruv', name === 'search')}
        ${L('/bildirishnomalar', NI('bell', name === 'notifs'), 'Bildirishnomalar', name === 'notifs', n)}
        ${L('/oyinlar', NI('games', name === 'games'), 'O‘yinlar', name === 'games')}
        ${L('/reyting', NI('trophy', name === 'leaders'), 'Reyting', name === 'leaders')}
        ${L('/yangiliklar', NI('updates', name === 'updates'), 'Lahzam Updates', name === 'updates', nu)}
        ${L('/sozlamalar', NI('gear', name === 'settings'), 'Sozlamalar', name === 'settings')}
        <button class="snav" style="width:100%;border:0;background:none;cursor:pointer" data-act="theme">${THEME_ICO().replace('width="20" height="20"', 'width="22" height="22"')}<span>${DB.theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}</span></button>
      </nav>
      <button class="btn acc full" style="border-radius:999px;margin-top:14px" data-act="compose">+ Yangi post</button>
      <a href="/@${esc(u.u)}" data-link class="side-me">${avatar(u, 42)}<span style="min-width:0"><b>${NM(u)}</b><span class="muted" style="display:block">@${esc(u.u)}</span></span></a>
      <p class="muted side-ver">Lahzam v${VERSION}</p>
    </aside>
    <main class="center">${html}</main>
    <aside class="rail">
      <div class="card"><div class="row" style="justify-content:space-between"><b style="font-family:var(--head)">🏆 Haftaning foydalilari</b><a href="/reyting" data-link class="more" style="font-size:13px">Hammasi</a></div>
        ${top.map((r, i) => `<a href="/@${esc(r.x.u)}" data-link class="li" style="padding:9px 0">${['🥇', '🥈', '🥉'][i] || `<b class="rank" style="width:22px;text-align:center">${i + 1}</b>`}${avatar(r.x, 34)}<span style="flex:1;min-width:0"><b style="font-size:14px">${esc(r.x.name)}</b></span><b style="font-size:13px">⭐ ${r.n}</b></a>`).join('') || '<p class="muted">Bu hafta hali ⭐ yo‘q. Guruhlarda foydali javob yozing!</p>'}</div>
      ${upd ? `<a href="/yangiliklar" data-link class="card" style="display:block;text-decoration:none;background:#121212;color:#fff"><span class="muted" style="color:#aaa">✨ So‘nggi yangilanish</span><b style="display:block;font-family:var(--head);margin-top:4px">${esc(upd.title)}</b></a>` : ''}
      ${sug.length ? `<div class="card"><b style="font-family:var(--head)">Kimni kuzatish</b>${sug.map(x => `<div class="li" style="padding:9px 0"><a href="/@${esc(x.u)}" data-link class="row" style="flex:1;text-decoration:none;gap:10px;min-width:0">${avatar(x, 34)}<span style="min-width:0"><b style="font-size:14px">${esc(x.name)}</b><span class="muted" style="display:block">@${esc(x.u)}</span></span></a><button class="pill" data-act="follow" data-id="${x.id}">Kuzatish</button></div>`).join('')}</div>` : ''}
      <p class="muted" style="text-align:center">Lahzam v${VERSION} · Har lahza yoningizda!</p>
    </aside></div>`;
}
const TITLES = { stats: 'Statistika', star: 'Yulduz', games: 'O‘yinlar', doc: 'Hujjatlar', auth: 'Kirish', groups: 'Guruhlar', dms: 'Shaxsiy', search: 'Qidiruv', notifs: 'Bildirishnomalar', settings: 'Sozlamalar', admin: 'Admin', updates: 'Lahzam Updates', leaders: 'Reyting', profile: 'Profil', post: 'Post', chat: 'Suhbat', group: 'Guruh', tag: 'Heshteg' };
const after = {};

/* ---------------- shared pieces ---------------- */
function unread(kind) {
  const u = me(); if (!u) return 0;
  return DB.chats.filter(c => c.type === kind && c.members.includes(u.id)).reduce((n, c) => n + c.msgs.filter(m => m.uid !== u.id && m.t > (c.read[u.id] || 0)).length, 0);
}
const unreadNotifs = () => me() ? DB.notifs.filter(n => n.to === me().id && !n.read).length : 0;
function dock(active) {
  const g = unread('group'), d = unread('dm'), nu = unreadUpdates();
  return `<nav class="dock" aria-label="Asosiy">
    <button class="plus" data-act="compose" aria-label="Yangi post">${I.plus}</button>
    <a href="/" data-link class="tab ${active === 'home' ? 'on' : ''}" aria-label="Ochiq maydon">${NI('home', active === 'home', 20)}Ochiq</a>
    <a href="/guruhlar" data-link class="ico ${active === 'groups' ? 'on' : ''}" aria-label="Guruhlar${g ? ', ' + g + ' ta yangi' : ''}">${NI('groups', active === 'groups', 22)}<span>Guruhlar</span>${g ? `<span class="num">${g > 99 ? '99+' : g}</span>` : ''}</a>
    <a href="/shaxsiy" data-link class="ico ${active === 'dms' ? 'on' : ''}" aria-label="Shaxsiy${d ? ', ' + d + ' ta yangi' : ''}">${NI('dms', active === 'dms', 22)}<span>Shaxsiy</span>${d ? `<span class="num">${d > 99 ? '99+' : d}</span>` : ''}</a>
    <a href="/yangiliklar" data-link class="ico ${active === 'updates' ? 'on' : ''}" aria-label="Lahzam Updates${nu ? ', ' + nu + ' ta yangi' : ''}">${NI('updates', active === 'updates', 22)}<span>Updates</span>${nu ? `<span class="num">${nu}</span>` : ''}</a>
  </nav>`;
}
function header(extra = '', deskTitle = '') {
  const u = me(), n = unreadNotifs();
  return `<header class="top"><div class="top-row">
    <a href="/" data-link class="brand" aria-label="Lahzam bosh sahifa, versiya ${VERSION}">${I.logo()}<span class="brand-t"><b>lahzam</b><small>v${VERSION}</small></span></a>${deskTitle ? `<b class="desk-title">${deskTitle}</b>` : ''}
    <div class="top-act">
      <a href="/qidiruv" data-link class="ibtn" aria-label="Qidirish">${NI('search', false, 20)}</a>
      <a href="/bildirishnomalar" data-link class="ibtn" aria-label="Bildirishnomalar${n ? ', ' + n + ' ta yangi' : ''}">${NI('bell', false, 20)}${n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}</a>
      <button class="ibtn" data-act="theme" aria-label="${DB.theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}" title="${DB.theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}">${THEME_ICO()}</button>
      <button class="ibtn" data-act="topmenu" aria-label="Ko‘proq: tungi rejim, yozuv, reyting, o‘yinlar"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg></button>
      ${u ? `<a href="/@${esc(u.u)}" data-link class="top-av" aria-label="Profilim">${avatar(u, 38)}</a>` : `<a href="/kirish" data-link class="btn" style="height:40px;background:#fff;color:#111;border-radius:999px">Kirish</a>`}
    </div></div>${extra}</header>`;
}
// Mini o'yinlar: Flappy, Tetris, 2048
const GAMES = [
  { k: 'flappy', name: 'Flappy', ico: s => Flappy.birdSVG(s), desc: 'Qushchani quvurlar orasidan uchiring', tag: '@flappy', act: 'sendflappy', open: o => Flappy.open(o) },
  { k: 'tetris', name: 'Tetris', ico: s => Tetris.icon(s), desc: 'Bloklarni joylab, qatorlarni to‘ldiring', tag: '@tetris', act: 'sendtetris', open: o => Tetris.open(o) },
  { k: '2048', name: '2048', ico: s => G2048.icon(s), desc: 'Bir xil sonlarni qo‘shib, 2048 ga yeting', tag: '@2048', act: 'send2048', open: o => G2048.open(o) },
  { k: 'mines', name: 'Mina', ico: s => Mines.icon(s), desc: 'Minalarni topib, qolgan kataklarni oching', tag: '@mines', act: 'sendmines', open: o => Mines.open(o) },
  { k: 'xo', name: 'X/O', ico: s => XO.icon(s), desc: 'Kompyuterga qarshi yoki chatda do‘stingiz bilan', tag: '@xo', act: 'sendxo', open: o => XO.open(o), duo: true }
];
const gameOf = u => u && u.system && GAMES.find(g => g.k === u.u);
// O'yinlar reytingi: natija serverga faqat shu haftadagi shaxsiy rekordingizdan oshsa yuboriladi (baza tejaladi)
const LBG = [['flappy', 'Flappy', '🐤'], ['tetris', 'Tetris', '🧱'], ['2048', '2048', '🔢'], ['mines', 'Mina', '💣'], ['xo', 'X/O', '❌⭕']];
const GLB = { rows: null, at: 0, tab: 'week', g: 'flappy', loading: false };
const wkKey = () => { const d = new Date(Date.now() + 5 * 3600e3); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
function gsend(g, s) {
  if (!SESSION || !(s > 0)) return; const k = 'lahzam_wk_' + g, wk = wkKey(); let o = {};
  try { o = JSON.parse(localStorage.getItem(k)) || {}; } catch (e) {}
  if (o.wk === wk && o.s >= s) return;
  try { localStorage.setItem(k, JSON.stringify({ wk, s })); } catch (e) {}
  api('act', { method: 'POST', body: { t: 'gscore', game: g, score: Math.floor(s) } }).then(() => { GLB.at = 0; });
}
[['flappy', 'Flappy'], ['tetris', 'Tetris'], ['2048', 'G2048'], ['mines', 'Mines']].forEach(([k, n]) => { const M = window[n]; if (!M || M.__lb) return; const o = M.open; M.__lb = true; M.open = opts => o({ ...(opts || {}), onEnd: sc => { gsend(k, sc); return opts && opts.onEnd ? opts.onEnd(sc) : null; } }); });
async function loadGLB(force) {
  if (GLB.loading || (!force && GLB.rows && now() - GLB.at < 60e3)) return;
  GLB.loading = true; const r = await api('act', { method: 'POST', body: { t: 'lboard' } }).catch(() => null); GLB.loading = false;
  if (r && r.ok) { GLB.rows = r.rows; GLB.at = now(); const n = route()[0]; if (n === 'games' || n === 'profile') { const y = scrollY; render(); scrollTo(0, y); } }
}
const medalsOf = id => (GLB.rows || []).filter(r => r.k === 'last' && r.u === id && r.n <= 3).map(r => ({ m: ['🥇', '🥈', '🥉'][r.n - 1], g: (LBG.find(x => x[0] === r.g) || [])[1] }));
function lbCard() {
  const u = me(), R = GLB.rows; if (!R) return `<div class="card lb"><b class="lb-h">🏆 Reyting</b><p class="muted" style="margin:8px 0 0">Yuklanmoqda…</p></div>`;
  const top = R.filter(r => r.g === GLB.g && r.k === GLB.tab && r.n <= 3).sort((a, b) => a.n - b.n), mine = R.find(r => r.g === GLB.g && r.k === GLB.tab && r.u === u.id);
  const unit = GLB.g === 'xo' ? ' g‘alaba' : '';
  const order = [top[1], top[0], top[2]];
  return `<div class="card lb"><div class="row" style="justify-content:space-between;gap:8px"><b class="lb-h">🏆 Reyting</b>
    <div class="lb-tabs"><button class="${GLB.tab === 'week' ? 'on' : ''}" data-act="glbtab" data-id="week">Bu hafta</button><button class="${GLB.tab === 'all' ? 'on' : ''}" data-act="glbtab" data-id="all">Umrbod</button></div></div>
    <div class="lb-games">${LBG.map(([k, n, e]) => `<button class="${GLB.g === k ? 'on' : ''}" data-act="glbgame" data-id="${k}">${e} ${n}</button>`).join('')}</div>
    ${top.length ? `<div class="podium">${order.map((r, i) => { const pl = [2, 1, 3][i]; if (!r) return `<div class="pd p${pl} empty"><span class="pd-m">${['🥈', '🥇', '🥉'][i]}</span><div class="pd-b">—</div></div>`; const w = user(r.u) || { u: '?', name: '?' };
      return `<a href="/@${esc(w.u)}" data-link class="pd p${pl}${r.u === u.id ? ' me' : ''}">${avatar(w, pl === 1 ? 56 : 46)}<span class="pd-m">${['🥈', '🥇', '🥉'][i]}</span><b>${esc(w.name.split(' ')[0])}</b><span class="pd-s">${r.s}${unit}</span><div class="pd-b"></div></a>`; }).join('')}</div>`
      : `<p class="muted" style="text-align:center;margin:18px 0 6px">${GLB.tab === 'week' ? 'Bu hafta hali hech kim o‘ynamadi. Birinchi bo‘ling! 🚀' : 'Hali natija yo‘q.'}</p>`}
    <div class="lb-me">${mine ? `Siz: <b>${mine.n}-o‘rin</b> · ${mine.s}${unit}` : GLB.g === 'xo' ? 'Chatda do‘stingiz bilan @xo o‘ynab, g‘alaba qozoning' : 'Hali natijangiz yo‘q: o‘ynang va reytingga chiqing!'}</div>
    <p class="muted" style="margin:8px 0 0;font-size:12px;text-align:center">Yakka, chat va guruhlardagi natijalar ham hisoblanadi · haftalik reyting har dushanba yangilanadi · top 3 profilda medal bilan turadi</p></div>`;
}
function gamesPage() {
  const best = k => { try { return +localStorage.getItem({ flappy: 'lahzam_flappy_best', tetris: 'lahzam_tetris_best', '2048': 'lahzam_2048_best', mines: 'lahzam_mines_best' }[k]) || 0; } catch (e) { return 0; } };
  return `<div class="shell">${backBar('O‘yinlar 🎮')}<div class="pad stack">
    ${me() ? lbCard() : ''}
    <p class="muted" style="margin:0">Yakka o‘ynang yoki do‘stlaringizga chatda yuboring: har chat va guruhning o‘z rekordi bo‘ladi 🏆</p>
    ${GAMES.map(g => `<div class="card game-tile"><div class="row" style="gap:14px">${g.ico(56)}<span style="flex:1;min-width:0"><b style="font-family:var(--head);font-size:18px;display:block">${g.name}</b><span class="muted" style="font-size:14px">${g.desc}</span>${best(g.k) ? `<span style="display:block;font-size:13px;font-weight:700;color:var(--acc-ink,var(--acc));margin-top:2px">Eng yaxshi natijangiz: ${best(g.k)}</span>` : ''}</span></div>
      <div class="row" style="gap:8px;margin-top:12px"><button class="btn acc" style="flex:1;height:46px;border-radius:999px" data-act="solo" data-id="${g.k}">▶ O‘ynash</button><button class="btn ghost" style="flex:1;height:46px;border-radius:999px" data-act="gamesend" data-id="${g.k}">↗ Yuborish</button></div></div>`).join('')}
  </div></div>`;
}
function bioProblem(v, max = me() && me().star ? 200 : 100) {
  if (v.length > max) return `Bio ko‘pi bilan ${max} belgi`;
  if (v.split('\n').length > 3) return 'Bio ko‘pi bilan 3 qator';
  if (/(https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(uz|com|ru|net|org|me|io|link|app)\b)/i.test(v)) return 'Bioga havola (link) qo‘yib bo‘lmaydi';
  if ((v.match(/\d/g) || []).length >= 9) return 'Bioga telefon raqam yozmang: xavfsizligingiz uchun';
  if (/(.)\1{5,}/u.test(v)) return 'Bir belgini ko‘p takrorlamang';
  return null;
}
const STAR_BUY = 'https://t.me/xarp01';
function starPage() {
  const u = me(), active = u && u.star, until = SESSION && SESSION.starUntil;
  const perk = (ico, t, d) => `<div class="li"><span class="perk-i">${ico}</span><span style="flex:1"><b>${t}</b><span class="muted" style="display:block;font-size:14px">${d}</span></span></div>`;
  return `<div class="shell">${backBar('⭐ Yulduz')}<div class="pad stack">
    <div class="card star-hero"><div class="star-big">${STAR_I.replace('width="13" height="13"', 'width="64" height="64"')}</div>
      <b style="font-family:var(--head);font-size:26px;display:block">Lahzam Yulduz</b>
      <span style="opacity:.85">Profilingizni boshqalardan ajratib turing</span>
      ${active ? `<span class="tag" style="margin-top:10px;background:#fff;color:#121212">Faol${until && !isOwnerSession() ? ` · ${uzDate(new Date(until).getTime(), true)} gacha` : ''}</span>` : ''}</div>
    <div class="card" style="padding:4px 16px">
      ${perk('✨', 'Rangli nametag va yulduzcha', 'Ismingiz atrofida aylanadigan ramka, 5 xil rangdan tanlaysiz')}
      ${perk('🖼', 'Profil muqovasi', '10 xil gradient va 10 xil naqsh')}
      ${perk('⏳', 'Kuniga 8 ta Lahza', 'Oddiy akkauntda kuniga 1 ta, Yulduz bilan 8 tagacha 24 soatlik lahza')}
      ${perk('🔤', '3 harfli username', 'Username’ni oyiga bir marta almashtirish, qisqa nomlar faqat siz uchun')}
      ${perk('📝', 'Uzun postlar', '1500 belgigacha post va 200 belgigacha bio')}
      ${perk('👻', 'Ko‘rinmas rejim', 'Onlayn holat va “o‘qildi” belgisini yashirish')}
      ${perk('📌', 'Postni qadash', 'Eng yaxshi postingiz profil tepasida turadi')}</div>
    <div class="plans">
      <div class="card plan"><span class="muted">1 oy</span><b>5 000 so‘m</b><span class="muted" style="font-size:13px">oyiga 5 000</span></div>
      <div class="card plan best"><span class="badge-best">Foydali</span><span class="muted">3 oy</span><b>12 000 so‘m</b><span class="muted" style="font-size:13px">oyiga 4 000</span></div></div>
    <p class="muted" style="margin:0;font-size:13px;text-align:center">Ochilish narxi: keyinchalik oshishi mumkin. Asosiy imkoniyatlar hammaga bepul qoladi.</p>
    <a class="btn acc full" style="height:54px;border-radius:999px;font-size:16px" href="${STAR_BUY}" target="_blank" rel="noopener">${active ? 'Muddatni uzaytirish' : '⭐ Yulduz olish'} · Telegram</a>
    <p class="muted" style="margin:0;font-size:13px;text-align:center">Telegram’da ${u ? `<b>@${esc(u.u)}</b>` : 'username’ingizni'} va tarifni yozing. To‘lovdan keyin Yulduz akkauntingizda yoqiladi. To‘lov qaytarilmaydi (<a href="/shartlar" data-link>shartlar</a>).</p>
  </div></div>`;
}
// Bepul foydalanuvchilar uchun: Sozlamalar tepasida jonli Yulduz kartasi
function starPromo() {
  const big = STAR_I.replace('width="13" height="13"', 'width="40" height="40"').replace('class="star-i"', 'class="sp-star"');
  return `<a href="/yulduz" data-link class="sp-card" aria-label="Yulduz obunasi haqida">
    <span class="sp-shine" aria-hidden="true"></span><span class="sp-dot d1" aria-hidden="true">✦</span><span class="sp-dot d2" aria-hidden="true">✦</span><span class="sp-dot d3" aria-hidden="true">✦</span><span class="sp-dot d4" aria-hidden="true">✦</span>
    <span class="sp-ico">${big}</span>
    <span style="flex:1;min-width:0"><b class="sp-t">Lahzam Yulduz</b><span class="sp-s">Rangli nametag, profil muqovasi, 3 harfli username va boshqalar</span><span class="sp-p">oyiga 4 000 so‘mdan</span></span>
    <span class="sp-go">›</span></a>`;
}
const ICONS = [['', 'Lahzam', '/icon-192.png'], ['qora', 'Qora', '/icons/qora-192.png'], ['tilla', 'Tilla', '/icons/tilla-192.png'], ['kok', 'Ko‘k', '/icons/kok-192.png']];
// Tanlangan ilova ikonkasi: manifest, iPhone ikonkasi va favicon almashadi (o'rnatishda va Android yangilanishida qo'llanadi)
function iconHelp() {
  sheet(`<h2>📱 Ikonka tanlandi ✅</h2><div class="stack" style="gap:10px">
        <div class="card" style="margin:0"><b>🤖 Android (Chrome)</b><p class="muted" style="margin:4px 0 0">Ilovani bir necha marta ochib-yoping. Chrome 1 kun ichida yangi ikonkani topadi va “Ikonkani yangilash”ni so‘raydi. Tezroq kerak bo‘lsa: ilovani o‘chirib, saytdan qayta o‘rnating.</p></div>
        <div class="card" style="margin:0"><b>🍎 iPhone / iPad</b><p class="muted" style="margin:4px 0 0">iPhone ikonkani faqat qo‘shish paytida oladi: bosh ekrandagi Lahzam’ni o‘chiring, keyin Safari’da Ulashish → “Bosh ekranga qo‘shish”.</p></div>
        <div class="card" style="margin:0"><b>💻 Kompyuter (Chrome / Edge)</b><p class="muted" style="margin:4px 0 0">Brauzer ilovani keyingi ochishda yangilaydi yoki ruxsat so‘raydi.</p></div>
        <button class="btn acc full" data-act="close-sheet-btn">Tushunarli</button></div>`);
}
function applyIcon() {
  const k = SESSION && me() && me().star && SESSION.appIcon; const set = (sel, attr, v) => { const e = document.querySelector(sel); if (e) e.setAttribute(attr, v); };
  // manifest va iPhone ikonkasini server har foydalanuvchiga o'zi beradi; bu yerda faqat favicon
  set('link[rel=icon]', 'href', k ? `/icons/${k}-192.png` : '/icon.svg');
}
let STATS = null;
function statsPage() {
  const u = me(); if (!u || !u.star) return starPage();
  if (!STATS) { api('act', { method: 'POST', body: { t: 'stats' } }).then(r => { STATS = r.ok ? r : { err: r.message || 'Yuklab bo‘lmadi' }; if (route()[0] === 'stats') render(); }); return `<div class="shell">${backBar('📊 Statistika')}<div class="pad"><div class="card muted">Yuklanmoqda…</div></div></div>`; }
  if (STATS.err) return `<div class="shell">${backBar('📊 Statistika')}<div class="pad"><div class="card">${esc(STATS.err)}</div></div></div>`;
  const days = [...Array(14)].map((_, i) => { const d = new Date(Date.now() - (13 - i) * DAY), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
  const chart = (rows, label) => { const m = Object.fromEntries(rows.map(r => [r.d, r.n])), vals = days.map(d => m[d] || 0), mx = Math.max(1, ...vals), sum = vals.reduce((a, b) => a + b, 0);
    return `<div class="card"><div class="row" style="justify-content:space-between"><b>${label}</b><span class="muted">14 kunda: <b style="color:var(--ink)">${fmt(sum)}</b></span></div>
      <div class="bars">${vals.map((v, i) => `<div class="bar" title="${days[i].slice(5)}: ${v}"><span style="height:${Math.round(v / mx * 100)}%"></span><i>${i % 2 ? '' : days[i].slice(8)}</i></div>`).join('')}</div></div>`; };
  const T = STATS.total, tile = (v, l) => `<div class="card st-tile"><b>${fmt(v)}</b><span class="muted">${l}</span></div>`;
  return `<div class="shell">${backBar('📊 Statistika', 'Oxirgi 14 kun')}<div class="pad stack">
    <div class="st-grid">${tile(T.views, 'ko‘rish')}${tile(T.likes, 'layk')}${tile(T.replies, 'javob')}${tile(T.followers, 'kuzatuvchi')}${tile(T.posts, 'post')}${tile(T.views ? Math.round((T.likes + T.replies) / T.views * 100) : 0, '% faollik')}</div>
    ${chart(STATS.views, '👁 Postlaringiz ko‘rilishi')}${chart(STATS.fols, '👥 Yangi kuzatuvchilar')}
    <div class="card"><b>🏆 Eng ko‘p ko‘rilgan postlaringiz</b>${STATS.top.map(p => `<a href="/p/${p.id.slice(1)}" data-link class="li"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.text)}</span><span class="muted" style="white-space:nowrap">👁 ${fmt(p.views)} · ❤ ${fmt(p.likes)}</span></a>`).join('') || '<p class="muted">Hali post yo‘q</p>'}</div>
    <button class="btn ghost full" data-act="restats">↻ Yangilash</button></div></div>`;
}
function starSettings(u) {
  const S = SESSION || {}, sw = (act2, on, label) => `<button class="switch${on ? ' on' : ''}" data-act="${act2}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button>`;
  const row = (title, sub, right) => `<div class="li set-row"><span style="flex:1;min-width:0"><b>${title}</b>${sub ? `<span class="muted" style="display:block">${sub}</span>` : ''}</span>${right}</div>`;
  if (!u.star) return '';
  const cv = /^g(\d+)(?:\.p(\d+))?$/.exec(S.cover || '') || [], g = +cv[1] || 0, pt = +cv[2] || 0;
  return `<h3 class="set-h">⭐ Yulduz</h3>
    <div class="card" style="padding:14px 16px">
      <b>Nametag rangi</b><div class="sc-row">${STAR_COLOR_LIST.map(([k, l]) => `<button class="sc-pick${(S.starColor || 'tilla') === k ? ' on' : ''}" data-act="starcolor" data-v="${k}" aria-label="${l}" aria-pressed="${(S.starColor || 'tilla') === k}"><span class="ntag star c-${k}"><span class="in"><span class="gtx">${l}</span></span></span></button>`).join('')}</div>
      <b style="display:block;margin-top:14px">Muqova: gradient</b><div class="cv-grid">${GRADS.map((x, i) => `<button class="cv-pick${g === i + 1 ? ' on' : ''}" style="background:${x}" data-act="cover" data-g="${i + 1}" data-p="${pt}" aria-label="${GRAD_NAMES[i]}" title="${GRAD_NAMES[i]}"></button>`).join('')}</div>
      <b style="display:block;margin-top:14px">Muqova: naqsh</b><div class="cv-grid"><button class="cv-pick${!pt ? ' on' : ''}" style="background:${GRADS[(g || 1) - 1]}" data-act="cover" data-g="${g || 1}" data-p="0" aria-label="Naqshsiz" title="Naqshsiz"></button>${PATS.map((x, i) => `<button class="cv-pick${pt === i + 1 ? ' on' : ''}" style="background:${x},${GRADS[(g || 1) - 1]}" data-act="cover" data-g="${g || 1}" data-p="${i + 1}" aria-label="${PAT_NAMES[i]}" title="${PAT_NAMES[i]}"></button>`).join('')}</div>
      ${S.cover ? '<button class="link-btn" style="margin-top:8px" data-act="cover" data-g="0">Muqovani olib tashlash</button>' : ''}</div>
    <div class="card" style="padding:2px 16px">
      ${row('👻 Onlayn holatni yashirish', 'Boshqalar onlayn ekaningizni va oxirgi kirgan vaqtingizni ko‘rmaydi', sw('hideonline', !!S.hideOnline, 'Onlayn holatni yashirish'))}
      ${row('👁 “O‘qildi”ni yashirish', 'Xabarni o‘qiganingiz boshqalarga ko‘rinmaydi', sw('hideread', !!S.hideRead, 'O‘qildi belgisini yashirish'))}
      <button class="li set-row" style="width:100%;text-align:left" data-act="chun"><span style="flex:1"><b>🔤 Username’ni almashtirish</b><span class="muted" style="display:block">@${esc(u.u)} · oyiga bir marta, 3 harfli ham bo‘ladi</span></span>›</button>
      <a href="/statistika" data-link class="li set-row"><span style="flex:1"><b>📊 Statistika</b><span class="muted" style="display:block">Ko‘rishlar, kuzatuvchilar o‘sishi, eng yaxshi postlar</span></span>›</a>
      <div class="li set-row" style="flex-wrap:wrap"><span style="flex:1;min-width:160px"><b>📱 Ilova ikonkasi</b><span class="muted" style="display:block">Ilovani o‘rnatganda shu ikonka chiqadi</span></span>
        <div class="row" style="gap:8px">${ICONS.map(([k, l, src]) => `<button class="ic-pick${(SESSION.appIcon || '') === k ? ' on' : ''}" data-act="appicon" data-v="${k}" aria-label="${l} ikonka" title="${l}"><img src="${src}" alt="" width="44" height="44"></button>`).join('')}</div></div>
      <a href="/yulduz" data-link class="li set-row"><span style="flex:1"><b>⭐ Obuna</b><span class="muted" style="display:block">${S.starUntil && !isOwnerSession() ? uzDate(new Date(S.starUntil).getTime(), true) + ' gacha' : 'Faol'}</span></span>›</a></div>`;
}
async function patchMe(body, ok) {
  const r = await api('auth/me', { method: 'PATCH', body }); if (r.user) { SESSION = r.user; DB.sess = SESSION; if (ok) toast(ok); await sync(true); } else toast(r.message || 'Saqlab bo‘lmadi', true);
  const y = scrollY; render(); scrollTo(0, y); return r;
}
function docPage(k) {
  const d = window.LahzamDocs && LahzamDocs[k]; if (!d) return notFound();
  const tabs = [['shartlar', 'Shartlar'], ['maxfiylik', 'Maxfiylik'], ['qoidalar', 'Qoidalar']];
  return `<div class="shell">${backBar(d.title)}<div class="pad stack">
    <div class="seg doc-tabs" style="grid-template-columns:repeat(3,minmax(0,1fr))">${tabs.map(([key, l]) => `<a href="/${key}" data-link class="${key === k ? 'on' : ''}" aria-current="${key === k}">${l}</a>`).join('')}</div>
    <article class="card doc">${d.html}</article></div></div>`;
}
function consentGate() {
  if (document.querySelector('.consent')) return;
  $('#modal-root').innerHTML = `<div class="scrim"><div class="sheet consent" role="dialog" aria-modal="true" aria-labelledby="cg-h">
    <h2 id="cg-h">Lahzam shartlari 📜</h2>
    <p class="muted" style="margin:-4px 0 12px">Davom etish uchun hujjatlar bilan tanishib, rozilik bildiring.</p>
    <div class="card" style="padding:4px 16px;margin-bottom:12px">
      <a href="/shartlar" data-link class="li"><span style="flex:1"><b>📄 Foydalanish shartlari</b></span>›</a>
      <a href="/maxfiylik" data-link class="li"><span style="flex:1"><b>🔒 Maxfiylik siyosati</b></span>›</a>
      <a href="/qoidalar" data-link class="li" style="border:0"><span style="flex:1"><b>🤝 Jamiyat qoidalari</b></span>›</a></div>
    <label class="agree"><input type="checkbox" id="agree3"><span>Men <b>13 yoshdan kattaman</b> va yuqoridagi hujjatlarga roziman</span></label>
    <button class="btn acc full" style="margin-top:12px" data-act="agree-go" disabled id="agree-go">Roziman, davom etish</button>
    <button class="btn ghost full" style="margin-top:8px" data-act="logout">Rozi emasman, chiqish</button></div></div>`;
  const c = $('#agree3'); c.addEventListener('change', () => { $('#agree-go').disabled = !c.checked; });
}
function backBar(title, sub = '', right = '') {
  return `<header class="top"><div class="top-row">
    <div class="row" style="gap:10px"><button class="ibtn" data-act="back" aria-label="Orqaga">${I.back}</button>
    <div><div style="font-family:var(--head);font-weight:700;font-size:18px;line-height:1.15">${title}</div>${sub ? `<div class="sub-h">${sub}</div>` : ''}</div></div>${right}</div></header>`;
}
// 📊 Post so'rovnomasi
function postPoll(p) {
  const u = me(), P = p.poll, total = P.opts.reduce((n, o) => n + o.v.length, 0), mineI = u ? P.opts.findIndex(o => o.v.includes(u.id)) : -1, show = mineI > -1;
  return `<div class="ppoll"><b class="ppoll-q">📊 ${esc(P.q)}</b>${P.opts.map((o, i) => { const pc = total ? Math.round(o.v.length / total * 100) : 0;
    return `<button class="ppoll-o${i === mineI ? ' on' : ''}" data-act="pvote" data-id="${p.id}" data-i="${i}" aria-pressed="${i === mineI}"><span class="ppoll-f" style="width:${show ? pc : 0}%"></span><span class="ppoll-t">${esc(o.t)}</span>${show ? `<span class="ppoll-p">${pc}%</span>` : ''}</button>`; }).join('')}
    <span class="muted" style="font-size:12px">${total} ta ovoz${show ? '' : ' · ovoz berib natijani ko‘ring'}</span></div>`;
}
// 🔁 Iqtibos qilingan post (ichma-ich kichik karta)
function quoteCard(qid) {
  const q = DB.posts.find(x => x.id === qid); if (!q || !alive(q)) return `<div class="qpost muted">🔁 Asl post o‘chirilgan yoki topilmadi</div>`;
  const a = user(q.uid) || { u: '?', name: '?' };
  return `<a class="qpost" href="/p/${q.id}" data-link><span class="row" style="gap:6px">${avatar(a, 22)}<b>${esc(a.name)}</b><span class="muted">@${esc(a.u)} · ${ago(q.t)}</span></span>${q.text ? `<span class="qpost-t">${esc(q.text.slice(0, 220))}${q.text.length > 220 ? '…' : ''}</span>` : ''}${q.img ? `<img src="${esc(q.img)}" alt="" loading="lazy">` : ''}</a>`;
}
function postCard(p, full) {
  const a = user(p.uid), u = me();
  if (u) seen(p);
  const liked = u && p.likes.includes(u.id);
  const long = !full && (p.text.length > 300 || p.text.split('\n').length > 6);
  return `<article class="card stack" data-post="${p.id}" style="gap:8px">
    <div class="row" style="justify-content:space-between">
      <a href="/@${esc(a.u)}" data-link class="row" style="text-decoration:none;gap:10px">${avatar(a, 42)}
        <div><div class="name" style="font-size:15px">${NM(a)}${founderPill(a)}</div><div class="muted">@${esc(a.u)} · ${ago(p.t)}${p.edited ? ' · tahrirlandi' : ''}${p.lahza ? ' · <span class="lahza">Lahza · 24 soat</span>' : ''}</div></div></a>
      <button class="ibtn dark" style="width:38px;height:38px" data-act="postmenu" data-id="${p.id}" aria-label="Ko‘proq">${I.dots}</button>
    </div>
    ${p.text ? `<p class="txt ${long ? 'clamp' : ''}" style="${full ? 'font-size:19px' : ''}">${linkify(p.text)}</p>` : ''}
    ${p.img ? `<button class="pimg" data-act="viewpimg" data-id="${p.id}" aria-label="Rasmni kattalashtirish"><img src="${esc(p.img)}" alt="Post rasmi" loading="lazy"></button>` : ''}
    ${long ? `<a href="/p/${p.id}" data-link class="more">Ko‘proq o‘qish</a>` : ''}
    ${p.poll ? postPoll(p) : ''}${p.quote ? quoteCard(p.quote) : ''}${p.sched ? `<div class="sched-b">⏰ ${new Date(p.t).toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} da chiqadi · faqat siz ko‘ryapsiz</div>` : ''}
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <button class="pill ${liked ? 'on' : ''}" data-act="like" data-id="${p.id}" aria-label="Yoqtirish" aria-pressed="${!!liked}">${I.heart(liked)}${fmt(p.likes.length)}</button>
      <a class="pill" href="/p/${p.id}" data-link aria-label="Javoblar">${I.reply}${p.replies.length}</a>
      <button class="pill" data-act="sendpost" data-id="${p.id}" aria-label="Chatga yuborish">${I.send}</button>
      <button class="pill" data-act="sharepost" data-id="${p.id}" aria-label="Havolani ulashish">${I.share}</button>
      <span class="pill" style="background:none;color:var(--mute);margin-left:auto" title="Ko‘rishlar">${I.eye}${fmt(p.views || 0)}</span>
    </div>
  </article>`;
}

/* ---------------- ⏳ Lahzalar halqasi (24 soatlik "Lahza" postlar hikoya ko'rinishida) ---------------- */
const LZ = { seen: (() => { try { return new Set(JSON.parse(localStorage.getItem('lahzam_lz_seen') || '[]')); } catch (e) { return new Set(); } })(), q: [], ui: 0, pi: 0, t: 0 };
const lzSave = () => { try { localStorage.setItem('lahzam_lz_seen', JSON.stringify([...LZ.seen].slice(-400))); } catch (e) {} };
function lzGroups() {
  const u = me(), live = DB.posts.filter(p => p.lahza && alive(p) && !String(p.id).startsWith('tmp')).sort((a, b) => a.t - b.t), by = new Map();
  live.forEach(p => { if (!by.has(p.uid)) by.set(p.uid, []); by.get(p.uid).push(p); });
  return [...by.entries()].map(([uid, ps]) => ({ uid, ps, last: ps[ps.length - 1].t, unseen: ps.some(p => !LZ.seen.has(p.id)) }))
    .sort((a, b) => (b.uid === u.id) - (a.uid === u.id) || b.unseen - a.unseen || b.last - a.last);
}
function lzRing() {
  const u = me(), G = lzGroups(), mine = G.find(g => g.uid === u.id);
  // halqa ichida oddiy avatar (Owner olmos halqasi bilan ikki halqa ustma-ust tushmasin)
  const item = g => { const w = user(g.uid); return `<button class="lz-it${g.unseen ? '' : ' seen'}" data-act="lzopen" data-id="${g.uid}" aria-label="@${esc(w.u)} lahzalari"><span class="lz-ring">${avatar({ ...w, _in: 1 }, 56)}</span><span class="lz-nm">${g.uid === u.id ? 'Siz' : esc(w.name.split(' ')[0])}</span></button>`; };
  return `<div class="lz-bar" role="list" aria-label="Lahzalar">
    <button class="lz-it lz-add" data-act="lzadd" aria-label="Lahza qo‘shish"><span class="lz-ring"><span class="lz-plus">+</span></span><span class="lz-nm">${mine ? 'Yana' : 'Lahza'}</span></button>
    ${G.map(item).join('')}
    ${G.length ? '' : '<div class="lz-empty muted">⏳ Hali hech kim Lahza joylamadi. 24 soatda yo‘qoladigan birinchi lahzani siz joylang!</div>'}</div>`;
}
function lzShow() {
  clearTimeout(LZ.t); const g = LZ.q[LZ.ui]; if (!g) return lzClose();
  const p = g.ps[LZ.pi], w = user(g.uid), u = me(); if (!p) { LZ.ui++; LZ.pi = 0; return lzShow(); }
  LZ.seen.add(p.id); lzSave();
  const liked = p.likes.includes(u.id), dur = p.img ? 6000 : Math.min(9000, 4000 + p.text.length * 40);
  let o = $('#lz-view'); if (!o) { o = document.createElement('div'); o.id = 'lz-view'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Lahza'); document.body.appendChild(o); document.body.style.overflow = 'hidden'; }
  o.style.setProperty('--lzc', w.color || '#FF5A1F');
  o.innerHTML = `<div class="lz-bars">${g.ps.map((x, i) => `<i><em style="${i < LZ.pi ? 'width:100%' : i === LZ.pi ? `animation:lzBar ${dur}ms linear forwards` : ''}"></em></i>`).join('')}</div>
    <div class="lz-head"><button class="lz-av" data-act="lzgo" data-href="/@${esc(w.u)}" aria-label="@${esc(w.u)} profili">${avatar(w, 36)}</button><div style="flex:1;min-width:0"><b>${NM(w)}</b><span>${ago(p.t)} · ⏳ ${Math.max(1, Math.ceil((DAY - (now() - p.t)) / 3600e3))} soat qoldi</span></div><button class="lz-x" data-act="lzclose" aria-label="Yopish">✕</button></div>
    <div class="lz-body${p.img ? ' has-img' : ''}">${p.img ? `<img src="${esc(p.img)}" alt="">` : ''}${p.text ? `<p class="${p.img ? 'cap' : 'big'}">${linkify(p.text)}</p>` : ''}</div>
    <button class="lz-nav l" data-act="lzprev" aria-label="Oldingi"></button><button class="lz-nav r" data-act="lznext" aria-label="Keyingi"></button>
    <div class="lz-foot"><button class="lz-reply" data-act="lzgo" data-href="/p/${p.id}">💬 Javob yozish</button><button class="lz-like${liked ? ' on' : ''}" data-act="lzlike" data-id="${p.id}" aria-label="Yoqtirish">${liked ? '❤️' : '🤍'} ${p.likes.length || ''}</button></div>`;
  LZ.t = setTimeout(() => lzNext(), dur);
}
function lzNext() { const g = LZ.q[LZ.ui]; if (!g) return lzClose(); if (LZ.pi < g.ps.length - 1) LZ.pi++; else { LZ.ui++; LZ.pi = 0; } lzShow(); }
function lzPrev() { if (LZ.pi > 0) LZ.pi--; else if (LZ.ui > 0) { LZ.ui--; LZ.pi = LZ.q[LZ.ui].ps.length - 1; } lzShow(); }
function lzClose() { clearTimeout(LZ.t); const o = $('#lz-view'); if (o) { o.classList.add('out'); setTimeout(() => o.remove(), 200); } document.body.style.overflow = ''; if (route()[0] === 'home') softRender(); }
document.addEventListener('keydown', e => { if (!$('#lz-view')) return; if (e.key === 'Escape') lzClose(); else if (e.key === 'ArrowRight') lzNext(); else if (e.key === 'ArrowLeft') lzPrev(); });

/* ---------------- Kun savoli ---------------- */
const QS = ['Bugun sizni nima xursand qildi?','Eng sevimli taomingiz qaysi va nega?','Agar bir kunlik dam olish bo‘lsa, nima qilardingiz?','O‘zbekistonda eng chiroyli joy qayer deb o‘ylaysiz?','Bolalikdagi eng shirin xotirangiz?','Hozir qaysi kitobni o‘qiyapsiz yoki o‘qimoqchisiz?','Hayotdagi eng yaxshi maslahat qaysi bo‘lgan?','5 yildan keyin o‘zingizni qayerda ko‘rasiz?','Qaysi kasbni eng qiziq deb bilasiz?','Eng yaxshi ko‘rgan fasl qaysi?','Bugun nimani o‘rgandingiz?','Agar bir tilni bir kunda o‘rgana olsangiz, qaysi biri bo‘lardi?','Sizni nima ilhomlantiradi?','Eng yoqtirgan sport turingiz?','Qaysi ilovasiz yashay olmaysiz?','Choy yoki qahva? ☕','Qaysi shahar yoki davlatga borishni orzu qilasiz?','Do‘stlaringiz sizni qanday so‘z bilan ta’riflashadi?','Eng ko‘p kulgan voqeangiz?','Hozirgi kundagi eng katta maqsadingiz?','Qaysi odatni tashlamoqchisiz?','Qaysi yangi odatni boshlamoqchisiz?','Eng yaxshi ko‘rgan o‘zbek taomi?','Ota-onangizdan o‘rgangan eng muhim narsa?','Bo‘sh vaqtingizda nima qilasiz?','Telefoningizdagi eng ko‘p ishlatiladigan ilova?','Kelajakda qanday ixtiro bo‘lishini xohlardingiz?','Sizga qaysi fan eng qiyin bo‘lgan?','Eng yaxshi sovg‘a qaysi bo‘lgan?','Ertalab turib birinchi nima qilasiz?','Qaysi mahoratni o‘rganmoqchisiz?','Hayotingizni o‘zgartirgan bitta qaror?','Yoshlarga qanday maslahat berardingiz?','Qaysi sayohatingiz esda qolarli bo‘lgan?','Sizni nima tinchlantiradi?','Agar mashhur bo‘lsangiz, nima bilan mashhur bo‘lardingiz?','Bugun kimga rahmat aytmoqchisiz? 🤍','Eng yaxshi ko‘rgan so‘zingiz?','Qaysi multfilm yoki film bolaligingizni eslatadi?','Bir million so‘m topsangiz, nimaga sarflardingiz?'];
const qDay = () => Math.floor((Date.now() + 5 * 3600e3) / 864e5);
const qText = () => (DB && DB.dq) || QS[qDay() % QS.length];
function qCard() {
  const A = DB.daily || [], u = me(), mineA = A.find(a => a.uid === u.id);
  const top = A.slice(0, 2).map(a => { const w = user(a.uid); return `<a class="q-ans" href="/@${esc(w.u)}" data-link><b>${esc(w.name.split(' ')[0])}</b> ${esc(a.text)}${a.likes ? `<span class="q-lk">❤️ ${a.likes}</span>` : ''}</a>`; }).join('');
  return `<section class="card q-card" aria-label="Kun savoli">
    <div class="q-top"><span class="q-tag">✦ KUN SAVOLI</span><span class="q-n">${A.length ? A.length + ' ta javob' : 'Birinchi bo‘lib javob bering'}${isAdmin() ? ` <button class="q-edit" data-act="qedit" aria-label="Savolni o‘zgartirish">✏️</button>` : ''}</span></div>
    <h3 class="q-q">${esc(qText())}</h3>
    ${mineA ? `<div class="q-mine"><span class="muted">Sizning javobingiz:</span> ${esc(mineA.text)}</div>` : `<form class="q-form" data-form="qans"><label class="sr" for="q-in">Javobingiz</label><input id="q-in" maxlength="200" placeholder="Javobingizni yozing…" autocomplete="off"><button class="q-send" aria-label="Yuborish">➤</button></form>`}
    ${top}
    ${A.length ? `<button class="q-all" data-act="qall">Barcha javoblar (${A.length}) →</button>` : ''}
  </section>`;
}
function qSheet() {
  const A = DB.daily || [], u = me();
  return `<h2>✦ Kun savoli</h2><p style="margin:-4px 0 12px;font-weight:700">${esc(qText())}</p>
  <div class="stack" style="gap:8px">${A.map(a => { const w = user(a.uid); return `<div class="q-row"><a href="/@${esc(w.u)}" data-link aria-label="@${esc(w.u)} profili">${avatar(w, 34)}</a><div style="flex:1;min-width:0"><div class="row" style="gap:6px"><a href="/@${esc(w.u)}" data-link style="text-decoration:none;color:inherit">${NM(w)}</a><span class="muted" style="font-size:12px">${ago(a.t)}</span></div><div>${esc(a.text)}</div></div>
    <button class="pill ${a.liked ? 'on' : ''}" data-act="qlike" data-id="${a.id}" aria-label="Yoqtirish">${I.heart(a.liked)}${a.likes || ''}</button>
    ${a.uid === u.id ? `<button class="pill" data-act="qdel" data-id="${a.id}" aria-label="O‘chirish">✕</button>` : ''}</div>`; }).join('') || '<p class="muted">Hali javob yo‘q.</p>'}</div>`;
}

let HOMETAB = 'all';
// 🤝 "Siz bilishingiz mumkin": umumiy do'stlar va umumiy guruhlar bo'yicha (hammasi telefonda hisoblanadi, bazaga so'rov yo'q)
function suggestions(n = 8) {
  const u = me(); if (!u) return [];
  const fw = new Set(following(u.id)), hidden = (() => { try { return new Set(JSON.parse(localStorage.getItem('lahzam_sug_hide') || '[]')); } catch (e) { return new Set(); } })();
  const myGroups = DB.chats.filter(c => c.type === 'group' && c.members.includes(u.id));
  const score = new Map(), why = new Map(), add = (id, v, w) => { score.set(id, (score.get(id) || 0) + v); if (!why.has(id)) why.set(id, w); };
  fw.forEach(f => following(f).forEach(x => add(x, 3, 'Umumiy do‘stlar')));
  followers(u.id).forEach(x => add(x, 5, 'Sizni kuzatadi'));
  myGroups.forEach(c => c.members.forEach(x => add(x, 1, 'Umumiy guruh: ' + c.name)));
  return [...score.entries()].filter(([id]) => id !== u.id && !fw.has(id) && !hidden.has(id) && (user(id) || {}).u && !user(id).sys && !user(id).blocked)
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => ({ u: user(id), why: why.get(id) }));
}
function suggestCard() {
  const L = suggestions(); if (!L.length) return '';
  return `<div class="card sug"><b class="sug-h">🤝 Siz bilishingiz mumkin</b><div class="sug-row">${L.map(({ u: w, why }) => `<div class="sug-it"><button class="sug-x" data-act="sughide" data-id="${w.id}" aria-label="Yashirish">✕</button><a href="/@${esc(w.u)}" data-link>${avatar(w, 56)}<b>${esc(w.name.split(' ')[0])}</b><span>${esc(why.length > 22 ? why.slice(0, 21) + '…' : why)}</span></a><button class="btn acc" data-act="follow" data-id="${w.id}">Kuzatish</button></div>`).join('')}</div></div>`;
}
const CMP = { poll: null, quote: null, at: null }; // post yozish maydoni holati
/* ---------------- views ---------------- */
function home() {
  const u = me();
  const tags = (SESSION && SESSION.tags) || [], tagRe = tags.length ? new RegExp('#(' + tags.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}0-9_])', 'iu') : null;
  if (!tagRe && HOMETAB === 'tags') HOMETAB = 'all';
  const posts = DB.posts.filter(alive).filter(p => HOMETAB !== 'tags' || tagRe.test(p.text)).sort((a, b) => b.t - a.t);
  return `<div class="shell">${header('', 'Ochiq maydon 🌍')}
  <div class="pad stack">
    ${lzRing()}
    ${qCard()}
    <form class="card comp comp-d" data-form="post">
      <div class="cd-rail" aria-hidden="true">${avatar(u, 42)}<span class="cd-line"></span><span class="cd-dot"></span></div>
      <div class="cd-main">
        <div class="cd-who">${NM(u)}<span class="muted">@${esc(u.u)}</span></div>
        <label><span class="sr">Post matni</span><textarea id="post-text" rows="2" maxlength="${LIMIT.post + 100}" placeholder="Nima gap, ${esc(u.name.split(' ')[0])}?"></textarea></label>
        <div id="post-prev"></div>
        ${CMP.poll ? `<div class="cmp-poll"><input id="pp-q" maxlength="140" placeholder="So‘rovnoma savoli" value="${esc(CMP.poll.q)}">${CMP.poll.opts.map((o, i) => `<input class="pp-o" data-i="${i}" maxlength="60" placeholder="${i + 1}-variant" value="${esc(o)}">`).join('')}
          <div class="row" style="gap:6px">${CMP.poll.opts.length < 4 ? '<button type="button" class="cd-chip" data-act="ppadd">+ Variant</button>' : ''}<button type="button" class="cd-chip" data-act="cmppoll">✕ Olib tashlash</button></div></div>` : ''}
        ${CMP.quote ? `<div class="cmp-quote"><button type="button" class="cmp-x" data-act="cmpunquote" aria-label="Iqtibosni olib tashlash">✕</button>${quoteCard(CMP.quote)}</div>` : ''}
        <div class="cd-chips">
          <label class="cd-chip cd-img" aria-label="Rasm qo‘shish"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>Rasm<input type="file" accept="image/*" id="post-img" class="sr"></label>
          <label class="cd-chip" title="24 soatdan keyin yo‘qoladi"><input type="checkbox" id="post-lahza" class="sr"><span>⏳ Lahza</span></label>
          <button type="button" class="cd-chip${CMP.poll ? ' on' : ''}" data-act="cmppoll">📊 So‘rovnoma</button>
          ${u.star ? `<button type="button" class="cd-chip${CMP.at ? ' on' : ''}" data-act="cmpsched">⏰ ${CMP.at ? new Date(CMP.at).toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Keyinroq'}</button>` : ''}
          <button type="button" class="cd-chip" data-act="cd-ins" data-v="#"># Teg</button>
          <button type="button" class="cd-chip" data-act="cd-ins" data-v="@">@ Belgilash</button>
        </div>
        <div class="cd-foot"><span class="counter" id="post-count">0 / ${LIMIT.post}</span><button class="btn cd-go">Joylash</button></div>
      </div>
    </form>
    ${tags.length ? `<div class="home-tabs" role="tablist"><button role="tab" class="${HOMETAB === 'all' ? 'on' : ''}" data-act="hometab" data-id="all" aria-selected="${HOMETAB === 'all'}">🌍 Hammasi</button><button role="tab" class="${HOMETAB === 'tags' ? 'on' : ''}" data-act="hometab" data-id="tags" aria-selected="${HOMETAB === 'tags'}">🏷 Teglarim</button></div>${HOMETAB === 'tags' ? `<div class="tagrow">${tags.map(x => `<a href="/t/${encodeURIComponent(x)}" data-link>#${esc(x)}</a>`).join('')}</div>` : ''}` : ''}
    ${posts.map(p => postCard(p)).join('') || `<div class="card muted">${HOMETAB === 'tags' ? 'Kuzatayotgan teglaringiz bilan hali post yo‘q.' : 'Hali post yo‘q.'}</div>`}
    <p class="muted ver">Lahzam v${VERSION} · <a href="/yangiliklar" data-link>nimalar yangi?</a></p>
  </div>${dock('home')}</div>`;
}
after.home = () => bindCounter('#post-text', '#post-count', LIMIT.post);
after.games = () => loadGLB();
after.profile = () => { if (SESSION && !GLB.rows) loadGLB(); };
function bindCounter(ta, ct, max) {
  const t = $(ta), c = $(ct); if (!t || !c) return;
  const up = () => { const n = t.value.length; c.textContent = `${n} / ${max}`; c.className = 'counter' + (n > max ? ' over' : n > max - 50 ? ' warn' : ''); const b = t.form && t.form.querySelector('button.btn'); if (b) b.disabled = n > max; };
  t.addEventListener('input', up); up();
}

/* auth */
let AUTH = { step: 'start', email: '' };
function auth() {
  const s = AUTH.step;
  const shell = inner => `<div class="shell" style="padding:0 0 40px">
    <div style="background:var(--acc);color:#fff;padding:40px 22px 60px;border-radius:0 0 36px 36px">
      <div class="row" style="gap:10px">${I.logo('#fff', '#121212', 40)}<b style="font-family:var(--brand);font-size:30px;letter-spacing:-.045em">lahzam</b></div>
      <h1 class="title-h" style="font-size:30px;margin-top:26px">Har lahza<br>yoningizda!</h1>
      <p style="margin:8px 0 0;font-weight:600">Fikrlar, guruhlar va shaxsiy suhbatlar bir joyda.</p>
      <p style="margin:10px 0 0;font-weight:500">Birinchi 50 kishi profilida umrbod “Asoschi” belgisi bo‘ladi.</p>
    </div>
    <div class="card stack" style="margin:-30px 12px 0;gap:14px;padding:20px">${inner}</div>
    <a class="about-btn" href="https://lahzam-three.vercel.app" target="_blank" rel="noopener">✦ Loyiha bilan tanishish <span aria-hidden="true">→</span></a></div>`;
  if (s === 'start') return shell(`
    <label class="agree"><input type="checkbox" id="agree" ${AUTH.agree ? 'checked' : ''}><span>Men <b>13 yoshdan kattaman</b> va Lahzamning <a href="/shartlar" data-link>Foydalanish shartlari</a>, <a href="/maxfiylik" data-link>Maxfiylik siyosati</a> hamda <a href="/qoidalar" data-link>Jamiyat qoidalari</a>ga roziman</span></label>
    <div class="gwrap${AUTH.agree ? '' : ' locked'}"><button type="button" class="gfake" data-act="gfake"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>Google bilan davom etish</span></button><div id="gbtn" class="greal"></div><button type="button" class="glock" data-act="glock" aria-label="Avval rozilik belgisini qo‘ying"></button></div>
    <div class="row muted" style="justify-content:center">yoki</div>
    <button class="btn ghost full" data-act="auth-login">Akkauntim bor: username va parol</button>
    <p class="muted" style="margin:0;text-align:center;font-size:13px">Belgini qo‘ymaguningizcha akkaunt ochib bo‘lmaydi.</p>`);
  if (s === 'username') return shell(`
    <h2 style="font-family:var(--head);font-size:20px;margin:0">Username tanlang</h2>
    <p class="muted" style="margin:0">${esc(AUTH.email)} ✅ Google tasdiqladi. Username: 3–15 belgi, harf bilan boshlanadi, kichik harf, raqam, ko‘pi bilan 2 ta nuqta yoki pastki chiziq.</p>
    <form class="stack" data-form="signup">
      <div class="field"><label for="un">Username</label>
        <div style="position:relative"><span style="position:absolute;left:16px;top:14px;color:var(--mute);font-weight:700">@</span>
        <input class="inp" id="un" style="padding-left:34px" required autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="15" placeholder="masalan: aziz.k"></div>
        <div class="hint" id="un-hint" aria-live="polite"></div></div>
      <div class="field"><label for="nm">Ismingiz</label><input class="inp" id="nm" required maxlength="40" placeholder="Ism Familiya" autocomplete="name" value="${esc(AUTH.name || '')}"></div>
      ${AUTH.owner ? '<p class="card" style="background:#121212;color:#fff;margin:0">👑 Siz Lahzam egasisiz. Parol kerak emas: bu akkauntga faqat Google orqali kiriladi.</p>' : `<div class="field"><label for="pw">Parol</label><input class="inp" id="pw" type="password" required minlength="6" autocomplete="new-password" placeholder="Kamida 6 belgi">
        <div class="hint" id="pw-hint"></div></div>`}
      <label class="agree"><input type="checkbox" id="agree2" ${AUTH.agree ? 'checked' : ''}><span>Men <b>13 yoshdan kattaman</b> va Lahzamning <a href="/shartlar" data-link>Foydalanish shartlari</a>, <a href="/maxfiylik" data-link>Maxfiylik siyosati</a> hamda <a href="/qoidalar" data-link>Jamiyat qoidalari</a>ga roziman</span></label>
      <div class="hint bad" id="su-hint"></div>
      <button class="btn acc full" id="su-btn" disabled>Ro‘yxatdan o‘tish</button>
    </form>`);
  return shell(`
    <h2 style="font-family:var(--head);font-size:20px;margin:0">Kirish</h2>
    <form class="stack" data-form="login">
      <div class="field"><label for="lu">Username</label><input class="inp" id="lu" required autocomplete="username" autocapitalize="none"></div>
      <div class="field"><label for="lp">Parol</label><input class="inp" id="lp" type="password" required autocomplete="current-password"></div>
      <div class="hint bad" id="li-hint"></div>
      <button class="btn acc full">Kirish</button>
      <button type="button" class="btn ghost full" data-act="auth-start">Orqaga</button>
    </form>
    <p class="muted" style="margin:0">Parolni Google bilan ro‘yxatdan o‘tayotganda qo‘ygansiz.</p>`);
}
function checkUsername(v, star) {
  if (!v) return ['', null];
  if (v.length < 3) return ['Kamida 3 belgi', false];
  if (v.length < 4 && !star && !AUTH.owner) return ['3 harfli username faqat ⭐ Yulduz uchun. Kamida 4 belgi', false];
  if (v.length > 15) return ['Ko‘pi bilan 15 belgi', false];
  if (!/^[a-z0-9._]+$/.test(v)) return ['Faqat kichik harf, raqam, nuqta (.) va pastki chiziq (_)', false];
  if (/^[0-9]/.test(v)) return ['Username raqam bilan boshlanmasin', false];
  if (!/[a-z]/.test(v)) return ['Faqat raqam bo‘lmasin: kamida bitta harf kerak', false];
  if ((v.match(/\./g) || []).length > 2) return ['Ko‘pi bilan 2 ta nuqta (.)', false];
  if (/^\.|\.$/.test(v) || v.includes('..')) return ['Nuqta boshida, oxirida yoki ketma-ket bo‘lmasin', false];
  if ((RESERVED.includes(v) || ['flappy', 'tetris', '2048'].includes(v)) && !(v === 'musoxon' && AUTH.owner)) return [`@${v} band ❌`, false];
  return [`@${v} bo‘sh ✅`, true];
}
let GCFG; try { GCFG = localStorage.getItem('lahzam_gcid') || undefined; } catch (e) {}
// Google skriptini oldindan yuklash (kirish sahifasida tugma darhol chiqishi uchun)
function loadGsi(cb) {
  if (window.google && google.accounts) return cb && cb();
  let sc = document.getElementById('gsi');
  if (!sc) { sc = document.createElement('script'); sc.id = 'gsi'; sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; document.head.appendChild(sc); }
  if (cb) { sc.addEventListener('load', cb); sc.addEventListener('error', () => { const b = $('#gbtn'); if (b) b.innerHTML = '<p class="hint bad" style="text-align:center">Google yuklanmadi. Internetni tekshirib, sahifani yangilang.</p>'; }); }
}
async function initGoogle() {
  const box = $('#gbtn'); if (!box) return;
  if (GCFG === undefined) { const r = await api('auth/config'); GCFG = r.ok ? r.googleClientId : null; try { if (GCFG) localStorage.setItem('lahzam_gcid', GCFG); } catch (e) {} }
  if (!$('#gbtn')) return;
  if (!GCFG) { box.innerHTML = '<p class="muted" style="margin:0;text-align:center">Google bilan kirish sozlanmoqda, tez orada ishga tushadi.</p>'; return; }
  const draw = () => {
    const b = $('#gbtn'); if (!b || !window.google || !google.accounts) return;
    // auto_select: avval kirgan odam tugma bosmasdan kiradi; yangi odamga bir bosishli oyna chiqadi
    google.accounts.id.initialize({ client_id: GCFG, callback: onGoogle, ux_mode: 'popup', context: 'signin', itp_support: true, auto_select: !noAuto(), cancel_on_tap_outside: false, use_fedcm_for_prompt: true });
    b.innerHTML = '';
    // Google'ning haqiqiy tugmasi o'zimizning tugma ustiga aniq joylashadi (absolute): sahifa sakramaydi
    google.accounts.id.renderButton(b, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: Math.min(400, b.clientWidth || 320), locale: 'uz' });
    b.closest('.gwrap') && b.closest('.gwrap').classList.add('ready');
    try { google.accounts.id.prompt(); } catch (e) {}
  };
  loadGsi(draw);
}
const noAuto = () => { try { return localStorage.getItem('lahzam_noauto') === '1'; } catch (e) { return false; } };
async function onGoogle(resp) {
  const r = await api('auth/google', { method: 'POST', body: { credential: resp.credential } });
  if (r.user) { try { localStorage.removeItem('lahzam_noauto'); } catch (e) {} adoptSession(r.user); AUTH = { step: 'start' }; save(); go('/'); toast(`Xush kelibsiz, ${r.user.name.split(' ')[0]} 👋`); if (isOwnerSession()) refreshAdm(); sync(true); return; }
  if (r.needsSignup) { AUTH = { step: 'username', ticket: r.ticket, email: r.email, name: r.name, owner: r.owner, agree: !!AUTH.agree }; render(); return; }
  toast(r.message || 'Kirib bo‘lmadi', true);
}
after.auth = () => {
  if (AUTH.step === 'start') initGoogle();
  const ag = $('#agree'); if (ag) ag.addEventListener('change', () => { AUTH.agree = ag.checked; const w = $('.gwrap'); w && w.classList.toggle('locked', !ag.checked); });
  const un = $('#un'); if (!un) return;
  api('auth/username?u='); // serverni oldindan uyg'otamiz: birinchi tekshiruv tez bo'ladi
  let okU = false, okP = !!AUTH.owner, tm, seq = 0;
  const btn = $('#su-btn'), uh = $('#un-hint'), pw = $('#pw'), ph = $('#pw-hint');
  const sync = () => { btn.disabled = !(okU && okP && $('#nm').value.trim() && $('#agree2').checked); };
  $('#agree2').addEventListener('change', () => { AUTH.agree = $('#agree2').checked; sync(); });
  un.addEventListener('input', () => {
    un.value = un.value.toLowerCase().replace(/\s/g, '');
    clearTimeout(tm); uh.textContent = un.value.length >= 3 ? 'Tekshirilmoqda…' : ''; uh.className = 'hint';
    okU = false; sync();
    tm = setTimeout(async () => {
      const v = un.value, [msg, ok] = checkUsername(v);
      if (!ok) { uh.textContent = msg; uh.className = 'hint ' + (ok === false ? 'bad' : ''); return; }
      const my = ++seq, r = await api('auth/username?u=' + encodeURIComponent(v) + '&e=' + encodeURIComponent(AUTH.email || ''));
      if (my !== seq || un.value !== v) return;
      uh.textContent = r.message || (r.ok ? msg : 'Tekshirib bo‘lmadi'); uh.className = 'hint ' + (r.ok ? 'ok' : 'bad'); okU = !!r.ok; sync();
    }, 120);
  });
  if (AUTH.owner && !un.value) { un.value = 'musoxon'; un.dispatchEvent(new Event('input')); }
  if (pw) pw.addEventListener('input', () => { const v = pw.value; okP = v.length >= 6; ph.textContent = !v ? '' : okP ? (/[0-9]/.test(v) && /[a-zA-Z]/.test(v) ? 'Kuchli parol ✅' : 'Yaxshi. Raqam va harf aralashsa yanada kuchli') : `Yana ${6 - v.length} belgi`; ph.className = 'hint ' + (okP ? 'ok' : 'bad'); sync(); });
  $('#nm').addEventListener('input', sync);
};

/* groups & dms */
// Owner ismi hamma joyda aylanadigan tilla ramkada
const STAR_COLOR_LIST = [['tilla', 'Tilla'], ['olov', 'Lahzam olovi'], ['platina', 'Platina'], ['yoqut', 'Yoqut'], ['zumrad', 'Zumrad']];
const STAR_I = '<svg class="star-i" width="13" height="13" viewBox="0 0 24 24" aria-label="Yulduz a’zosi" role="img"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.6l-6 3.3 1.3-6.7-5-4.7 6.8-.8z" fill="currentColor"/></svg>';
const NM = (x, big) => !x ? '' : (x.star && !x.owner) ? `<span class="ntag star c-${esc(x.starColor || 'tilla')}${big ? ' big' : ''}"><span class="in">${STAR_I}<span class="gtx">${esc(x.name)}</span></span></span>` : x.owner ? `<span class="ntag${big ? ' big' : ''}"><span class="in"><span class="gtx">${esc(x.name)}</span></span></span>` : esc(x.name);
// ⭐ Yulduz profil muqovalari: 10 gradient + 10 naqsh
const GRADS = ['linear-gradient(135deg,#FF5A1F,#FFB547)', 'linear-gradient(135deg,#0B1026,#2B2F6B)', 'linear-gradient(135deg,#0EA5E9,#22D3EE)', 'linear-gradient(135deg,#FF8FA3,#FFC3A0)', 'linear-gradient(135deg,#7C3AED,#DB2777)',
  'linear-gradient(135deg,#059669,#34D399)', 'linear-gradient(135deg,#8A6410,#F5C542)', 'linear-gradient(135deg,#64748B,#CBD5E1)', 'linear-gradient(135deg,#121212,#FF3D00)', 'linear-gradient(120deg,#5FD3F3,#B07CFF,#FF8FD8)'];
const GRAD_NAMES = ['Olov', 'Tun', 'Okean', 'Shaftoli', 'Binafsha', 'Zumrad', 'Oltin', 'Kumush', 'Lava', 'Kamalak'];
const PATS = ['radial-gradient(rgba(255,255,255,.28) 2px,transparent 2.6px) 0 0/22px 22px', 'repeating-linear-gradient(45deg,rgba(255,255,255,.15) 0 10px,transparent 10px 22px)',
  'linear-gradient(rgba(255,255,255,.16) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,rgba(255,255,255,.16) 1px,transparent 1px) 0 0/28px 28px',
  'radial-gradient(circle at 50% 100%,transparent 14px,rgba(255,255,255,.2) 15px 17px,transparent 18px) 0 0/40px 20px', 'conic-gradient(rgba(255,255,255,.13) 25%,transparent 0 50%,rgba(255,255,255,.13) 0 75%,transparent 0) 0 0/36px 36px',
  'radial-gradient(circle,transparent 10px,rgba(255,255,255,.2) 11px 12px,transparent 13px) 0 0/34px 34px', 'radial-gradient(rgba(255,255,255,.8) 1px,transparent 1.6px) 0 0/40px 40px,radial-gradient(rgba(255,255,255,.45) 1px,transparent 1.6px) 20px 20px/40px 40px',
  'linear-gradient(135deg,rgba(255,255,255,.15) 25%,transparent 25%) -14px 0/28px 28px,linear-gradient(225deg,rgba(255,255,255,.15) 25%,transparent 25%) -14px 0/28px 28px', 'repeating-linear-gradient(90deg,rgba(255,255,255,.13) 0 2px,transparent 2px 18px)',
  'linear-gradient(45deg,rgba(255,255,255,.13) 25%,transparent 25% 75%,rgba(255,255,255,.13) 75%) 0 0/30px 30px,linear-gradient(45deg,rgba(255,255,255,.13) 25%,transparent 25% 75%,rgba(255,255,255,.13) 75%) 15px 15px/30px 30px'];
const PAT_NAMES = ['Nuqtalar', 'Qiya chiziq', 'Katak', 'To‘lqin', 'Shaxmat', 'Doiralar', 'Yulduzlar', 'Zigzag', 'Chiziqlar', 'Romb'];
function coverCss(c) { const m = /^g(\d+)(?:\.p(\d+))?$/.exec(c || ''); if (!m) return ''; const g = GRADS[+m[1] - 1], pt = m[2] ? PATS[+m[2] - 1] : ''; return g ? `background:${pt ? pt + ',' : ''}${g}` : ''; }
const isSaved = c => c && c.type === 'dm' && c.members.length === 1;
const peer = (c, u) => user(c.members.find(x => x !== u.id)) || { name: 'O‘chirilgan', u: 'deleted', color: '#ccc' };
const savedAv = (s = 50) => `<span class="gav saved-av" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .3)}px">${NI('saved', true, Math.round(s * .55))}</span>`;
const chatName = (c, u) => c.type === 'group' ? c.name : isSaved(c) ? 'Saqlangan xabarlar' : peer(c, u).name;
const chatAv = (c, u, s) => c.type === 'group' ? `<span class="gav" style="background:${c.color};width:${s}px;height:${s}px;border-radius:${Math.round(s * .3)}px">${esc(c.name[0])}</span>` : isSaved(c) ? savedAv(s) : avatar(peer(c, u), s);
const typingText = c => { const t = (c.typing || []).map(user).filter(Boolean); return !t.length ? '' : c.type === 'group' ? esc(t[0].name.split(' ')[0]) + (t.length > 1 ? ` va yana ${t.length - 1}` : '') + ' yozmoqda…' : 'yozmoqda…'; };
function seenText(o) { if (!o) return ''; if (o.on) return 'onlayn'; if (!o.ls) return '@' + esc(o.u); const a = ago(o.ls); return a === 'hozir' ? 'hozirgina shu yerda edi' : `${a} oldin shu yerda edi`; }
function chatRow(c) {
  const u = me(), last = c.msgs[c.msgs.length - 1];
  const n = c.msgs.filter(m => m.uid !== u.id && m.t > (c.read[u.id] || 0)).length;
  let title, av;
  if (c.type === 'group') { title = esc(c.name); av = `<span class="gav" style="background:${c.color}">${esc(c.name[0])}</span>`; }
  else if (isSaved(c)) { title = 'Saqlangan xabarlar'; av = savedAv(50); }
  else { const o = peer(c, u); title = NM(o); av = `<span class="avw${o.on ? ' online' : ''}">${avatar(o, 50)}</span>`; }
  const ty = typingText(c);
  const lastTxt = ty ? `<span class="typing">${ty}</span>` : last ? (last.sys ? esc(last.text) : (c.type === 'group' && user(last.uid) ? esc(user(last.uid).name.split(' ')[0]) + ': ' : '') + esc(msgPreview(last))) : 'Hali xabar yo‘q';
  return `<a href="/c/${c.id}" data-link class="li">${av}<span style="flex:1;min-width:0"><span class="row" style="justify-content:space-between"><b>${title}${c.muted ? ' <span title="Ovozsiz" aria-label="ovozsiz">🔕</span>' : ''}</b><span class="muted">${last ? ago(last.t) : ''}</span></span>
    <span class="muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px">${lastTxt}</span>
    ${c.type === 'group' ? `<span class="muted" style="font-size:12px">${c.members.length} a‘zo · ${ACCESS[c.access]} · ${esc(c.cat)}</span>` : ''}</span>${n ? `<span class="dot">${n}</span>` : ''}</a>`;
}
function groups() {
  const u = me();
  const mine = DB.chats.filter(c => c.type === 'group' && c.members.includes(u.id));
  const cat = DB.chats.filter(c => c.type === 'group' && !c.members.includes(u.id) && c.access !== 'closed');
  return `<div class="shell">${header(`<div class="row" style="justify-content:space-between;margin-top:12px"><div><div class="title-h" style="margin:0">Guruhlar</div><div class="sub-h">${unread('group')} ta yangi xabar · ${mine.length} guruh</div></div><button class="btn" style="height:44px;background:#fff;color:#111;border-radius:999px" data-act="newgroup">Yangi guruh</button></div>`)}
  <div class="pad stack"><div class="card" style="padding:4px 16px">${mine.map(chatRow).join('') || '<p class="muted">Hali guruhingiz yo‘q. Pastdagi katalogdan qo‘shiling yoki yangisini oching.</p>'}</div>
  <div class="card"><b style="font-family:var(--head);font-size:16px">Guruhlar katalogi</b>
    ${cat.map(c => `<div class="li"><span class="gav" style="background:${c.color}">${esc(c.name[0])}</span><span style="flex:1"><b>${esc(c.name)}</b><span class="muted" style="display:block">${esc(c.cat)} · ${c.members.length} a‘zo · ${ACCESS[c.access]}</span></span>
      <button class="btn ${c.pending.includes(u.id) ? 'ghost' : 'ink'}" style="height:38px;font-size:13px;border-radius:999px" data-act="join" data-id="${c.id}" ${c.pending.includes(u.id) ? 'disabled' : ''}>${c.pending.includes(u.id) ? 'So‘rov yuborildi' : c.access === 'ask' ? 'So‘rov yuborish' : 'Qo‘shilish'}</button></div>`).join('') || '<p class="muted">Hozircha boshqa ochiq guruh yo‘q.</p>'}
  </div></div>${dock('groups')}</div>`;
}
function dms() {
  const u = me();
  const list = DB.chats.filter(c => c.type === 'dm' && c.members.includes(u.id) && !isSaved(c)).sort((a, b) => (b.msgs.at(-1)?.t || 0) - (a.msgs.at(-1)?.t || 0));
  const sv = DB.chats.find(c => isSaved(c) && c.members.includes(u.id)), svLast = sv && sv.msgs.at(-1);
  const savedRow = `<button class="li" style="width:100%;text-align:left" data-act="opensaved">${savedAv(50)}<span style="flex:1;min-width:0"><b>Saqlangan xabarlar</b><span class="muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px">${svLast ? esc(msgPreview(svLast)) : 'Muhim xabarlarni shu yerga saqlang 🔖'}</span></span></button>`;
  return `<div class="shell">${header(`<div style="margin-top:12px"><div class="title-h" style="margin:0">Shaxsiy</div><div class="sub-h">${unread('dm')} ta yangi xabar</div></div>`)}
  <div class="pad"><div class="card" style="padding:4px 16px">${savedRow}${list.map(chatRow).join('') || '<p class="muted">Hali suhbat yo‘q. Biror profilga kirib “Xabar yozish”ni bosing.</p>'}</div></div>${dock('dms')}</div>`;
}
/* chat: Telegram uslubidagi funksiyalar */
let CH = { cid: null, reply: null, edit: null, q: '', search: false };
const clock = t => new Date(t).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false });
function dayLabel(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
  return diff === 0 ? 'Bugun' : diff === 1 ? 'Kecha' : uzDate(t);
}
const gameKind = t => /@tetris\b/i.test(t || '') ? 'tetris' : /@2048(?!\w)/.test(t || '') ? '2048' : /@mines\b/i.test(t || '') ? 'mines' : 'flappy';
const stickerOf = m => m && !m.img && !m.poll && !m.game && window.Stickers && (Stickers.re.exec(m.text || '') || [])[1];
const POSTRE = /^\[post:(\d+)\]\n?([\s\S]*)$/;
const postOf = m => m && !m.img && !m.poll && !m.game && POSTRE.exec(m.text || '');
function chatPostCard(m) {
  const [, pid, snip] = postOf(m), p = DB.posts.find(x => x.id === 'p' + pid), a = p && user(p.uid);
  return `<a href="/p/${pid}" data-link class="pcard">${a ? `<span class="pc-h">${avatar(a, 26)}<b>${esc(a.name)}</b><span>@${esc(a.u)}</span></span>` : '<span class="pc-h"><b>Lahzam post</b></span>'}
    ${p && p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : ''}<span class="pc-t">${esc(p ? p.text : snip)}</span>
    <span class="pc-f">${p ? `❤ ${p.likes.length} · 💬 ${p.replies.length} · ` : ''}Postni ochish ›</span></a>`;
}
const msgPreview = m => !m ? 'O‘chirilgan xabar' : postOf(m) ? '📝 Post' + (postOf(m)[2] ? ': ' + postOf(m)[2].split('\n')[0] : '') : m.img ? '📷 Rasm' + (m.text ? ': ' + m.text : '') : m.poll ? '📊 ' + m.poll.q : m.xo ? '❌⭕ X/O o‘yini' : m.game ? ({ tetris: '🧱 Tetris o‘yini', '2048': '🔢 2048 o‘yini', mines: '💣 Mina o‘yini', flappy: '🐤 Flappy o‘yini' })[gameKind(m.text)] : stickerOf(m) ? '🎨 Stiker' : m.text;
const canPin = c => c.type === 'dm' || c.admin === me().id || isAdmin();
const canDelMsg = (c, m) => m.uid === me().id || (c.type === 'group' && (isAdmin() || c.admin === me().id));
function pollHtml(c, m) {
  const u = me(), P = m.poll, total = P.opts.reduce((n, o) => n + o.v.length, 0), voted = P.opts.some(o => o.v.includes(u.id));
  return `<div class="poll"><b>📊 ${esc(P.q)}</b>${P.opts.map((o, i) => { const pc = total ? Math.round(o.v.length / total * 100) : 0, mine = o.v.includes(u.id);
    return `<button class="popt${mine ? ' mine' : ''}" data-act="vote" data-c="${c.id}" data-m="${m.id}" data-i="${i}"><span class="pbar" style="width:${voted ? pc : 0}%"></span><span class="ptxt">${mine ? '✓ ' : ''}${esc(o.t)}</span>${voted ? `<span class="ppc">${pc}%</span>` : ''}</button>`; }).join('')}
    <span class="pmeta">${total} ta ovoz${voted ? '' : ' · ovoz bering'}</span></div>`;
}
// X/O chatda: ikki kishi navbat bilan yuradi, holat serverda saqlanadi
function xoCard(c, m) {
  const G = m.xo, u = me(), X = user(G.x) || { u: '?' }, O = G.o != null ? user(G.o) : null;
  const res = G.w ? XO.winner(G.b) : null, line = res ? res.line : [];
  const myTurn = !G.w && (G.t === 'x' ? G.x === u.id : (G.o == null ? G.x !== u.id : G.o === u.id));
  const st = G.w === 'd' ? '🤝 Durang' : G.w ? `🏆 ${G.w === 'x' ? '❌ @' + esc(X.u) : '⭕ @' + esc(O ? O.u : '?')} yutdi` : myTurn ? (G.t === 'o' && G.o == null ? 'Siz ⭕ bo‘lib o‘ynang!' : 'Sizning navbatingiz 👇') : G.t === 'o' && G.o == null ? 'Raqib kutilmoqda…' : `@${esc((G.t === 'x' ? X : O || {}).u || '?')} yurmoqda…`;
  return `<div class="xo-card"><div class="row" style="gap:8px;margin-bottom:8px">${XO.icon(28)}<div style="flex:1;min-width:0;font-size:12px;line-height:1.3"><b style="display:block;font-size:14px">X/O</b>❌ @${esc(X.u)} · ⭕ ${O ? '@' + esc(O.u) : '<i>bo‘sh joy</i>'}</div></div>
    <div class="xo-board">${[...G.b].map((v, i) => `<button class="xo-c${line.includes(i) ? ' win' : ''}" data-act="xomove" data-c="${c.id}" data-m="${m.id}" data-i="${i}" ${v !== '.' || !myTurn || m.tmp ? 'disabled' : ''} aria-label="${v === '.' ? 'Bo‘sh katak' : v.toUpperCase()}">${XO.mark(v, 30)}</button>`).join('')}</div>
    <div class="xo-st${myTurn ? ' me' : ''}">${st}</div>${G.w ? `<button class="btn acc full" style="height:36px;border-radius:999px;font-size:13px;margin-top:8px" data-act="sendxo" data-id="${c.id}">↻ Yana o‘ynash</button>` : ''}</div>`;
}
// X/O tezkor yangilanish: faqat o'yin kartasi qayta chiziladi, raqib kutilayotganda har 0.8 soniyada tekshiriladi
const XOQ = { t: 0, busy: false, idle: 0 };
function xoPatch(c, m) { const el = document.querySelector(`#m-${m.id} .xo-card`); if (el) el.outerHTML = xoCard(c, m); }
function xoPoll() {
  clearTimeout(XOQ.t);
  const c = CH.cid && DB.chats.find(x => x.id === CH.cid); if (!c || route()[0] !== 'chat') return;
  const u = me(), live = c.msgs.filter(m => m.xo && !m.xo.w && !m.tmp && (m.xo.x === u.id || m.xo.o === u.id || m.xo.o == null)).slice(-5);
  if (!live.length) return;
  const waiting = live.some(m => { const G = m.xo; return G.t === 'x' ? G.x !== u.id : G.o == null ? G.x === u.id : G.o !== u.id; });
  XOQ.t = setTimeout(async () => {
    if (document.visibilityState !== 'visible' || XOQ.busy) return xoPoll();
    const r = await api('act', { method: 'POST', body: { t: 'xoget', msgs: live.map(m => m.id) } }).catch(() => null);
    let changed = false, ended = false;
    if (r && r.ok) live.forEach(m => { const n = r.xo[m.id]; if (n && n.b !== m.xo.b || n && n.o !== m.xo.o) { m.xo = n; changed = true; if (n.w) ended = true; xoPatch(c, m); } });
    XOQ.idle = changed ? 0 : XOQ.idle + 1;
    if (changed) navigator.vibrate && navigator.vibrate(20);
    if (ended) sync(true);
    if (XOQ.idle < 400) xoPoll();
  }, waiting ? 800 : 2500);
}
const MSEEN = { cid: null, ids: new Set() };
function msgHtml(c, m) {
  const u = me();
  if (m.sys) return `<div class="sys">${linkify(m.text)}</div>`;
  const a = user(m.uid) || { name: 'O‘chirilgan', u: 'deleted', color: '#ccc' }, mine = m.uid === u.id;
  const rx = Object.entries(m.reacts || {}).filter(([, v]) => v.length);
  const rep = m.replyTo ? c.msgs.find(x => x.id === m.replyTo) : null;
  const quote = m.replyTo ? `<button class="quote" data-act="jump" data-m="${m.replyTo}"><b>${rep ? esc((user(rep.uid) || {}).name || '') : ''}</b><span>${esc(msgPreview(rep)).slice(0, 90)}</span></button>` : '';
  const fwd = m.fwd ? `<span class="fwd">↪ Uzatildi: ${esc((user(m.fwd) || { name: 'kimdir' }).name)}</span>` : '';
  let body;
  const stk = stickerOf(m);
  if (m.xo) body = xoCard(c, m);
  else if (m.game) { const gk = gameKind(m.text), G = { tetris: ['Tetris', Tetris.icon, c.trecord, 'playtet'], '2048': ['2048', G2048.icon, c.grecord, 'play48'], mines: ['Mina', Mines.icon, c.mrecord, 'playmn'], flappy: ['Flappy', Flappy.birdSVG, c.record, 'play'] }[gk], rec = G[2];
    body = `<div class="game-card">${G[1](42)}<div style="flex:1"><b style="display:block">${G[0]}</b><span style="font-size:12px;color:#bbb">${rec ? `Rekord: ${rec.score} · @${esc(user(rec.uid).u)}` : 'Rekord yo‘q, birinchi bo‘ling!'}</span></div>
      <button class="btn acc" style="height:38px;border-radius:999px;font-size:13px" data-act="${G[3]}" data-id="${c.id}">O‘ynash</button></div>`; }
  else if (postOf(m)) body = chatPostCard(m);
  else if (stk) body = `<div class="stk" role="img" aria-label="Stiker: ${esc(Stickers.label(stk))}">${Stickers.svg(stk)}</div>`;
  else if (m.poll) body = pollHtml(c, m);
  else body = (m.img ? `<button class="mimg" data-act="viewimg" data-c="${c.id}" data-m="${m.id}"><img src="${esc(m.img)}" alt="Rasm" loading="lazy"></button>` : '') + (m.text ? `<span class="mtx">${linkify(m.text)}</span>` : '');
  const rd = mine && !isSaved(c) ? readersOf(c, m).length : 0;
  const meta = m.sched ? `<span class="mt sched">⏰ ${dayLabel(m.t) === 'Bugun' ? '' : uzDate(m.t) + ' '}${clock(m.t)} da yuboriladi</span>` : `<span class="mt">${m.edited ? 'tahrirlandi · ' : ''}${clock(m.t)}${mine && !isSaved(c) ? (m.tmp ? '<i class="tick">🕓</i>' : `<i class="tick${rd ? ' read' : ''}" aria-label="${rd ? 'O‘qildi' : 'Yetkazildi'}">✓✓</i>`) : ''}</span>`;
  const hit = CH.q && m.text && m.text.toLowerCase().includes(CH.q) ? ' hit' : '';
  // yangi xabar bir marta animatsiya bilan chiqadi (qayta chizilganda takrorlanmaydi)
  let fresh = '';
  if (MSEEN.cid === c.id && !MSEEN.ids.has(m.id) && !(m.tmp === undefined && MSEEN.ids.has('tmp-of-' + m.text))) fresh = mine ? ' m-new-out' : ' m-new-in';
  MSEEN.ids.add(m.id); if (m.tmp) MSEEN.ids.add('tmp-of-' + m.text);
  return `<div class="m ${mine ? 'out' : 'in'}${hit}${stk ? ' stkm' : ''}${m.sched ? ' schedm' : ''}${fresh}" data-msg="${m.id}" id="m-${m.id}">${c.type === 'group' && !mine ? `<a class="who" href="/@${esc(a.u)}" data-link style="text-decoration:none">${NM(a)}</a>` : ''}${fwd}${quote}${body}
    <div class="reacts">${rx.map(([e, v]) => `<button class="rx ${v.includes(u.id) ? 'mine' : ''}" data-act="react" data-c="${c.id}" data-m="${m.id}" data-e="${e}" aria-label="${e} reaksiya, ${v.length}">${e} ${v.length}</button>`).join('')}
      <button class="rx-add rx-btn" data-act="rxbar" data-c="${c.id}" data-m="${m.id}" aria-label="Reaksiya bildirish">😊<b>+</b></button>${m.tmp || m.sched ? '' : `<button class="rx-add" data-act="m-reply" data-c="${c.id}" data-m="${m.id}" aria-label="Javob berish">↩</button>`}<button class="rx-add" data-act="msgmenu" data-c="${c.id}" data-m="${m.id}" aria-label="Xabar amallari">⋯</button>${meta}</div></div>`;
}
// Chatda qidiruv: yuklangan xabarlar + serverdagi eski xabarlar (qancha eski bo'lsa ham topiladi)
let SRV_T = 0;
function srvSearch(c) {
  clearTimeout(SRV_T); const q = CH.q; if (!c || q.length < 2) { CH.srv = null; return; }
  SRV_T = setTimeout(async () => {
    const r = await api('act', { method: 'POST', body: { t: 'msearch', chat: c.id, q } });
    if (CH.q !== q || CH.cid !== c.id || !r.ok) return; CH.srv = { q, list: r.list }; const box = $('#msgs'); if (box) box.innerHTML = msgList(c);
  }, 350);
}
// Kim o'qidi: a'zoning oxirgi o'qigan vaqti xabar vaqtidan keyin bo'lsa
const readersOf = (c, m) => c.members.filter(x => x !== m.uid && (c.read[x] || 0) >= m.t);
function seenLine(c, m) {
  if (m.tmp) return `<div class="seen">🕓 Yuborilmoqda…</div>`;
  const r = readersOf(c, m);
  if (c.type === 'dm') return r.length ? `<div class="seen on">👁 O‘qildi · ${clock(c.read[r[0]])}</div>` : `<div class="seen">✓ Yetkazildi, hali o‘qilmadi</div>`;
  return r.length ? `<button class="seen on" data-act="readers" data-c="${c.id}" data-m="${m.id}">👁 ${r.length} kishi o‘qidi ›</button>` : `<div class="seen">✓ Yetkazildi, hali hech kim o‘qimadi</div>`;
}
function msgList(c) {
  let last = '', out = '';
  const list = CH.q ? c.msgs.filter(m => !m.sys && ((m.text || '').toLowerCase().includes(CH.q) || (m.poll && m.poll.q.toLowerCase().includes(CH.q)))) : c.msgs;
  const u0 = me(), lastMine = !CH.q && !isSaved(c) && [...c.msgs].reverse().find(m => !m.sys && m.uid === u0.id);
  list.forEach(m => { const d = dayLabel(m.t); if (d !== last) { out += `<div class="day">${d}</div>`; last = d; } out += msgHtml(c, m); if (lastMine && m.id === lastMine.id) out += seenLine(c, m); });
  if (CH.q && CH.srv && CH.srv.q === CH.q) {
    const have = new Set(c.msgs.map(m => m.id)), old = CH.srv.list.filter(m => !have.has(m.id));
    if (old.length) out += `<div class="day">Eski xabarlar</div><div class="card old-res">${old.map(m => `<button class="li" style="width:100%;text-align:left" data-act="oldmsg" data-c="${c.id}" data-m="${m.id}"><span style="flex:1;min-width:0"><b>${esc((user(m.uid) || { name: '—' }).name)}</b> <span class="muted">${uzDate(m.t)}</span><span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.text)}</span></span>›</button>`).join('')}</div>`;
  }
  return out || `<div class="sys">${CH.q ? (CH.q.length > 1 && !(CH.srv && CH.srv.q === CH.q) ? 'Qidirilmoqda…' : 'Hech narsa topilmadi') : 'Hali xabar yo‘q. Birinchi bo‘lib yozing 👋'}</div>`;
}
// 🏁 Turnir paneli: qolgan vaqt va jonli reyting
function tourBar(c) {
  const T = c.tour, g = GAMES.find(x => x.k === T.game), left = Math.max(0, T.ends - now()), mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
  const top = T.sc.slice(0, 3).map((r, i) => `${['🥇', '🥈', '🥉'][i]} @${esc((user(r.u) || { u: '?' }).u)} ${r.s}`).join(' · ');
  return `<div class="tourbar"><span class="tb-i">${g ? g.ico(30) : ''}</span><span style="flex:1;min-width:0"><b>🏁 ${g ? g.name : ''} turniri · <span class="tb-t" data-ends="${T.ends}">${mm}:${String(ss).padStart(2, '0')}</span></b><span class="tb-s">${top || 'Hali hech kim o‘ynamadi: birinchi bo‘ling!'}</span></span><button class="btn acc tb-go" data-act="tplay" data-id="${c.id}">O‘ynash</button></div>`;
}
setInterval(() => document.querySelectorAll('.tb-t').forEach(e => { const l = Math.max(0, +e.dataset.ends - now()); e.textContent = `${Math.floor(l / 60000)}:${String(Math.floor(l % 60000 / 1000)).padStart(2, '0')}`; if (!l) e.textContent = 'tugadi'; }), 1000);
function chat(id) {
  const u = me(), c = DB.chats.find(x => x.id === id);
  const peek = c && c.full && isAdmin() && c.type === 'group' && c.access === 'open';
  if (!c || (!c.members.includes(u.id) && !peek)) return notFound();
  if (CH.cid !== id) CH = { cid: id, reply: null, edit: null, q: '', search: false, srv: null };
  let title, sub, link;
  if (c.type === 'group') { title = esc(c.name); sub = `${c.members.length} a‘zo`; link = `/g/${c.id}`; }
  else if (isSaved(c)) { title = 'Saqlangan xabarlar'; sub = 'Faqat siz ko‘rasiz'; link = '/shaxsiy'; }
  else { const o = peer(c, u); title = NM(o); sub = seenText(o); link = `/@${o.u}`; }
  if (typingText(c)) sub = `<span class="typing">${typingText(c)}</span>`;
  const pin = c.pin && c.msgs.find(m => m.id === c.pin);
  const editing = CH.edit && c.msgs.find(m => m.id === CH.edit), replying = CH.reply && c.msgs.find(m => m.id === CH.reply);
  const bar = editing ? `<div class="cbar"><span>✏️ <b>Tahrirlash</b><em>${esc(msgPreview(editing)).slice(0, 80)}</em></span><button type="button" data-act="cancelbar" aria-label="Bekor qilish">✕</button></div>`
    : replying ? `<div class="cbar"><span>↩️ <b>${esc(user(replying.uid).name)}</b><em>${esc(msgPreview(replying)).slice(0, 80)}</em></span><button type="button" data-act="cancelbar" aria-label="Bekor qilish">✕</button></div>` : '';
  return `<div class="shell chatv" style="padding-bottom:0">
    <div class="chat-top"><button class="ibtn" data-act="back" aria-label="Orqaga">${I.back}</button>
      <a href="${link}" data-link class="row" style="text-decoration:none;color:#fff;gap:10px;flex:1;min-width:0">${chatAv(c, u, 42)}
      <span style="min-width:0"><b style="display:block;font-family:var(--head);font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</b><span class="sub-h" id="chat-sub" style="font-size:13px">${sub}</span></span></a>
      ${isSaved(c) ? '' : `<button class="ibtn" data-act="mute" data-id="${c.id}" aria-label="${c.muted ? 'Bildirishnomalarni yoqish' : 'Ovozsiz qilish'}" aria-pressed="${!!c.muted}">${c.muted ? '🔕' : '🔔'}</button>`}
      <button class="ibtn" data-act="chatsearch" aria-label="Chatda qidirish" aria-pressed="${CH.search}">${I.search}</button></div>
    ${CH.search ? `<label class="csearch"><span class="sr">Chatda qidirish</span><input id="cq" autocomplete="off" placeholder="Xabarlardan qidirish…" value="${esc(CH.q)}"></label>` : ''}
    ${c.tour ? tourBar(c) : ''}
    ${pin ? `<button class="pinbar" data-act="jump" data-m="${pin.id}"><span>📌 <b>Qadalgan xabar</b><em>${esc(msgPreview(pin)).slice(0, 90)}</em></span></button>` : ''}
    <div class="msgs" id="msgs">${msgList(c)}</div>
    <form class="chat-in" data-form="msg" data-id="${c.id}">${bar}<div class="cin-row">
      <button type="button" class="attach" data-act="attach" data-id="${c.id}" aria-label="Biriktirish: rasm, so‘rovnoma, o‘yin">📎</button><button type="button" class="attach" data-act="stickers" data-id="${c.id}" aria-label="Stikerlar">🎨</button>
      <label style="flex:1;display:flex"><span class="sr">Xabar</span><input id="msg-in" maxlength="2000" autocomplete="off" placeholder="${editing ? 'Yangi matn' : 'Xabar yozing…'}" value="${editing ? esc(editing.text) : ''}"></label>
      <button class="round" aria-label="${editing ? 'Saqlash' : 'Yuborish'}">${editing ? '✓' : I.send.replace('<svg', '<svg width="18" height="18"')}</button></div>
      <input type="file" id="img-file" accept="image/*" class="sr" tabindex="-1"></form></div>`;
}
// Chatga kirganda eng oxirgi xabar ko'rinadi (rasmlar yuklangach ham pastda qoladi)
function chatBottom() {
  const go2 = () => window.scrollTo(0, document.body.scrollHeight);
  go2(); requestAnimationFrame(go2); setTimeout(go2, 120); setTimeout(go2, 400);
  const box = $('#msgs'); if (box) box.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', () => { if (innerHeight + scrollY >= document.body.scrollHeight - im.clientHeight - 200) go2(); }, { once: true }); });
}
after.chat = () => {
  const c0 = DB.chats.find(x => x.id === CH.cid);
  if (c0 && MSEEN.cid !== c0.id) { MSEEN.cid = c0.id; MSEEN.ids = new Set(c0.msgs.map(x => x.id)); c0.msgs.forEach(x => x.tmp && MSEEN.ids.add('tmp-of-' + x.text)); }
  markRead(DB.chats.find(x => x.id === CH.cid));
  const q = $('#cq');
  if (q) { q.addEventListener('input', () => { CH.q = q.value.trim().toLowerCase(); const c = DB.chats.find(x => x.id === CH.cid); $('#msgs').innerHTML = msgList(c); srvSearch(c); }); if (!CH.q) q.focus(); return; }
  const mi = $('#msg-in'), cc = DB.chats.find(x => x.id === CH.cid);
  if (mi && cc && !isSaved(cc)) mi.addEventListener('input', () => { if (mi.value.trim() && now() - (CH.typedAt || 0) > 3500) { CH.typedAt = now(); api('act', { method: 'POST', body: { t: 'typing', chat: cc.id } }); } });
  chatBottom();
  if (CH.reply || CH.edit) { const i = $('#msg-in'); i && i.focus(); }
  XOQ.idle = 0; xoPoll();
};
function compressImage(file, max = 1080) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let q = 0.72, out = c.toDataURL('image/jpeg', q);
      while (out.length > 260000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}
function group(id) {
  const u = me(), c = DB.chats.find(x => x.id === id && x.type === 'group');
  if (!c || (c.access === 'closed' && !c.members.includes(u.id))) return notFound();
  const inG = c.members.includes(u.id), gAdmin = c.admin === u.id;
  return `<div class="shell">
    <div class="top" style="text-align:center"><div class="top-row"><button class="ibtn" data-act="back" aria-label="Orqaga">${I.back}</button>${inG ? `<button class="btn" style="height:40px;color:#fff;background:rgba(255,255,255,.22);border-radius:999px" data-act="leave" data-id="${c.id}">Chiqish</button>` : ''}</div>
      <span class="gav" style="background:${c.color};width:96px;height:96px;border-radius:50%;font-size:36px;margin:0 auto;border:4px solid #fff">${esc(c.name[0])}</span>
      <div class="title-h" style="font-size:22px">${esc(c.name)}</div><div class="sub-h">${c.members.length} a‘zo · ${ACCESS[c.access]} · ${esc(c.cat)}</div></div>
    <div class="pad stack">
      <div class="card"><p class="txt" style="font-size:15px">${linkify(c.desc || 'Tavsif yo‘q.')}</p><div class="muted" style="margin-top:4px">Tavsif</div>
        <div class="li" style="border:0;padding-bottom:0"><span style="flex:1"><b style="color:var(--acc-ink)">${location.host}/g/${c.id}</b><span class="muted" style="display:block">Taklif havolasi</span></span><button class="pill" data-act="copy" data-text="${location.origin}/g/${c.id}">Nusxa</button></div></div>
      ${c.record ? `<div class="card row" style="background:#121212;color:#fff">${Flappy.birdSVG(40)}<span>Flappy rekordi: <b>${c.record.score}</b> · @${esc(user(c.record.uid).u)}</span></div>` : ''}
      ${gAdmin && c.pending.length ? `<div class="card"><b>Qo‘shilish so‘rovlari</b>${c.pending.map(p => `<div class="li">${avatar(user(p), 36)}<span style="flex:1">${esc(user(p).name)}</span><button class="pill" data-act="approve" data-id="${c.id}" data-u="${p}">Qabul qilish</button></div>`).join('')}</div>` : ''}
      <div class="card"><b>A‘zolar</b>${c.members.map(m => `<div class="li"><a href="/@${esc(user(m).u)}" data-link class="row" style="flex:1;min-width:0;text-decoration:none;color:inherit;gap:12px">${avatar(user(m), 40)}<span style="flex:1;min-width:0"><b>${NM(user(m))}</b>${founderPill(user(m))}<span class="muted" style="display:block">@${esc(user(m).u)}</span></span></a>${m === c.admin ? '<span class="tag">admin</span>' : (gAdmin || isAdmin()) ? `<button class="pill ban-btn" data-act="gban" data-id="${c.id}" data-u="${m}" aria-label="@${esc(user(m).u)} ni chetlatish">🚫 Chetlatish</button>` : ''}</div>`).join('')}</div>
      ${(gAdmin || isAdmin()) && (c.banned || []).length ? `<div class="card"><b>🚫 Chetlatilganlar</b>${c.banned.map(m => `<div class="li">${avatar(user(m), 36)}<span style="flex:1">${esc((user(m) || {}).name || '')}<span class="muted" style="display:block">@${esc((user(m) || {}).u || '')}</span></span><button class="pill" data-act="gunban" data-id="${c.id}" data-u="${m}">Qaytarish</button></div>`).join('')}</div>` : ''}
      ${inG ? `<a href="/c/${c.id}" data-link class="btn acc full">Guruhga yozish</a>` : c.isBanned ? '<p class="muted" style="text-align:center">🚫 Guruh admini sizni bu guruhdan chetlatgan.</p>' : c.access !== 'closed' ? `<button class="btn ink full" data-act="join" data-id="${c.id}">${c.access === 'ask' ? 'So‘rov yuborish' : 'Qo‘shilish'}</button>` : '<p class="muted" style="text-align:center">Yopiq guruh: faqat taklif bilan.</p>'}
      ${isAdmin() && !inG && c.access === 'open' ? `<a href="/c/${c.id}" data-link class="btn ghost full">Admin sifatida kirish</a>` : ''}
      ${isAdmin() || gAdmin ? `<button class="btn ghost full" style="color:var(--danger)" data-act="delgroup" data-id="${c.id}">Guruhni o‘chirish</button>` : ''}
    </div></div>`;
}

/* profile */
let SHOW_ALL = false;
function profile(name) {
  const p = byName(name); if (!p) return notFound();
  const u = me(), own = u && u.id === p.id;
  const fl = followers(p.id), fw = following(p.id);
  const myPosts = DB.posts.filter(x => x.uid === p.id && alive(x)).sort((a, b) => b.t - a.t);
  const best = [...myPosts].sort((a, b) => b.likes.length - a.likes.length)[0];
  const followBtn = u && !own ? `<button class="btn ${isFollowing(u.id, p.id) ? 'ghost' : 'acc'}" style="flex:1" data-act="follow" data-id="${p.id}">${isFollowing(u.id, p.id) ? 'Kuzatilmoqda' : 'Kuzatish'}</button>` : (!u ? `<a href="/kirish" data-link class="btn acc" style="flex:1">Kuzatish</a>` : '');
  if (p.system) {
    return `<div class="shell"><div class="phead"><button class="ibtn" data-act="back" aria-label="Orqaga">${I.back}</button></div>
    <div class="pmain">${avatar(p, 112)}<div style="font-family:var(--head);font-weight:700;font-size:22px;margin-top:10px">${NM(p, true)}</div><div class="muted">@${esc(p.u)} · mini o‘yin</div>
      <p style="margin:10px 0 0;max-width:340px">${esc(p.bio)}</p>${gameOf(p) ? `<div class="row" style="gap:8px;margin-top:12px"><button class="btn acc" style="height:46px;border-radius:999px;padding:0 22px" data-act="solo" data-id="${p.u}">▶ O‘ynash</button><button class="btn ghost" style="height:46px;border-radius:999px;padding:0 22px" data-act="gamesend" data-id="${p.u}">↗ Chatga yuborish</button></div>` : ''}</div>
    <div class="pad stack"><div class="card row" style="justify-content:space-between"><span><b style="font-size:22px">${fl.length}</b> <span class="muted">kuzatuvchi</span></span>${followBtn}</div>
      <div class="card"><b>Kuzatuvchilar</b>${fl.map(f => `<a href="/@${esc(user(f).u)}" data-link class="li">${avatar(user(f), 40)}<span style="flex:1"><b>${NM(user(f))}</b>${founderPill(user(f))}<span class="muted" style="display:block">@${esc(user(f).u)}</span></span></a>`).join('') || '<p class="muted">Hali kuzatuvchi yo‘q.</p>'}</div></div>${u ? dock('') : ''}</div>`;
  }
  const pinP = p.star && p.pin && DB.posts.find(x => x.id === p.pin);
  return `<div class="shell">
    <div class="phead" style="${p.star && p.cover ? coverCss(p.cover) : ''}"><button class="ibtn" data-act="back" aria-label="Orqaga">${I.back}</button>
      ${own ? `<div class="row" style="gap:6px"><button class="ibtn" data-act="proflink" aria-label="Profil havolasi">🔗</button><button class="ibtn" data-act="qr" aria-label="QR kod"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg></button><button class="ibtn" data-act="logoutask" aria-label="Akkauntdan chiqish"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H4"/></svg></button><a href="/sozlamalar" data-link class="ibtn" aria-label="Sozlamalar">${I.gear}</a></div>` : ''}</div>
    <div class="pmain">${own ? `<button class="av-edit" data-act="editprofile" aria-label="Profil rasmini almashtirish">${avatar(p, 112)}<span class="cam" aria-hidden="true">📷</span></button>` : avatar(p, 112)}
      <div style="font-family:var(--head);font-weight:700;font-size:22px;margin-top:10px">${NM(p, true)}</div>
      <div class="row" style="justify-content:center;gap:8px;margin-top:2px"><span class="muted" style="font-size:14px">@${esc(p.u)}</span>${p.owner ? OWNER_PILL : isFounder(p) ? '<span class="founder">Asoschi</span>' : ''}${p.star && !p.owner ? '<a href="/yulduz" data-link class="founder star-pill">⭐ Yulduz</a>' : ''}</div>
      ${medalsOf(p.id).length ? `<a href="/oyinlar" data-link class="medals">${medalsOf(p.id).map(x => `<span>${x.m} ${esc(x.g)}</span>`).join('')}</a>` : ''}
      ${p.bio ? `<p style="margin:10px 0 0;max-width:320px">${linkify(p.bio)}</p>` : ''}
      ${own && (!p.bio || !p.photo) ? `<button class="link-btn" style="margin-top:8px" data-act="editprofile">+ ${!p.photo ? 'Rasm' : ''}${!p.photo && !p.bio ? ' va ' : ''}${!p.bio ? 'bio' : ''} qo‘shish</button>` : ''}
      ${p.blocked ? '<span class="tag red" style="margin-top:8px">Bloklangan</span>' : ''}</div>
    <div class="stats">
      <button class="stat" data-act="follist" data-id="${p.id}" data-v="fl"><b>${fmt(fl.length)}</b><span>kuzatuvchi</span></button><button class="stat" data-act="follist" data-id="${p.id}" data-v="fw"><b>${fmt(fw.length)}</b><span>kuzatmoqda</span></button>
      <div class="stat"><b>${myPosts.length}</b><span>post</span></div><div class="stat" title="Guruhlarda ⭐ Foydali bosgan turli odamlar soni"><b>⭐ ${foydaliCount(p.id)}</b><span>foydali</span></div></div>
    <div class="row" style="gap:8px;margin:12px 16px 0">
      ${own ? `<button class="btn ghost" style="flex:1" data-act="editprofile">Profilni tahrirlash</button>` : followBtn}
      ${!own ? `<button class="btn ink" style="flex:1" data-act="dm" data-id="${p.id}">Xabar yozish</button>` : ''}</div>
    ${isAdmin() && !own ? `<div class="row" style="gap:8px;margin:8px 16px 0"><button class="btn ghost" style="flex:1;height:42px;font-size:14px" data-act="adm-block" data-u="${p.id}">${p.blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button><button class="btn ghost" style="flex:1;height:42px;font-size:14px;color:var(--danger)" data-act="adm-del" data-u="${p.id}">O‘chirish</button></div>` : ''}
    <div class="pad stack">
      ${own ? suggestCard() : ''}
      ${pinP ? `<div class="pin-lbl">📌 Qadalgan post</div>${postCard(pinP)}` : ''}
      ${best ? `<a href="/p/${best.id}" data-link class="card" style="text-decoration:none;display:block"><div class="row" style="justify-content:space-between"><span class="muted" style="font-weight:700">Eng ko‘p yoqqan post</span><span style="color:#D61F52;font-weight:700;font-size:13px">❤ ${fmt(best.likes.length)}</span></div>
        <p class="txt" style="font-weight:600;margin-top:6px">${esc(best.text)}</p><div class="muted" style="margin-top:4px">${best.replies.length} javob · ${ago(best.t)}</div></a>` : `<div class="card muted">Hali post yo‘q.</div>`}
      ${myPosts.length > 1 ? (SHOW_ALL ? myPosts.filter(x => x !== best).map(x => postCard(x)).join('') : `<button class="btn ghost full" data-act="allposts">Barcha postlarni ko‘rish →</button>`) : ''}
    </div>${u ? dock('') : ''}</div>`;
}
function post(id) {
  const p = DB.posts.find(x => x.id === id || x.id === 'p' + id); if (!p || !alive(p)) return notFound();
  const u = me();
  return `<div class="shell">${backBar('Suhbat', `${p.replies.length} javob`)}
  <div class="pad stack">${postCard(p, true)}
    ${u ? `<form class="card comp" data-form="reply" data-id="${p.id}">${RTO && RTO.post === p.id ? `<div class="cbar" style="margin-bottom:8px"><span>↩️ <b>@${esc(user(RTO.uid).u)}</b> ga javob<em>${esc(RTO.text.slice(0, 80))}</em></span><button type="button" data-act="replyto-x" aria-label="Bekor qilish">✕</button></div>` : ''}<label><span class="sr">Javob</span><textarea id="reply-text" rows="2" maxlength="400" placeholder="${RTO && RTO.post === p.id ? 'Javobingiz…' : 'Javobingizni yozing'}"></textarea></label>
      <div class="row" style="justify-content:flex-end;gap:10px"><span class="counter" id="reply-count"></span><button class="btn acc" style="height:40px;border-radius:999px">Javob</button></div></form>` : `<a href="/kirish" data-link class="btn acc full">Javob yozish uchun kiring</a>`}
    <div class="card" style="padding:4px 16px">${threadOrder(p.replies).map(r => { const a = user(r.uid), par = r.parent && p.replies.find(x => x.id === r.parent), pa = par && user(par.uid); const real = !String(r.id).startsWith('tmp'); return `<div class="li${r.parent ? ' sub' : ''}" id="r-${r.id}" style="align-items:flex-start">${avatar(a, r.parent ? 32 : 38)}<span style="flex:1;min-width:0"><span><a href="/@${esc(a.u)}" data-link style="text-decoration:none" class="name">${NM(a)}</a>${founderPill(a)} <span class="muted">· ${ago(r.t)}</span></span>
      ${r.parent ? `<button class="rquote" data-act="jumpr" data-r="${r.parent}">↩ ${par ? `<b>@${esc(pa.u)}</b> ${esc(par.text.slice(0, 60))}` : 'o‘chirilgan komment'}</button>` : ''}
      <p class="txt" style="font-size:15px">${linkify(r.text)}</p>
      <span class="row" style="gap:14px;margin-top:2px">${u && real ? `<button class="link-btn" style="font-size:13px" data-act="replyto" data-id="${p.id}" data-r="${r.id}">↩ Javob berish</button>` : ''}${u && (r.uid === u.id || isAdmin()) && real ? `<button class="link-btn" style="font-size:13px;color:var(--mute)" data-act="delreply" data-id="${p.id}" data-r="${r.id}">O‘chirish</button>` : ''}</span></span></div>`; }).join('') || '<p class="muted">Birinchi bo‘lib javob yozing.</p>'}</div>
  </div></div>`;
}
after.post = () => bindCounter('#reply-text', '#reply-count', LIMIT.reply);
// Kommentlar: har bir javob o'z kommenti ostida (vaqt bo'yicha)
function threadOrder(list) {
  const byId = new Map(list.map(r => [r.id, r])), root = r => { let x = r, n = 0; while (x.parent && byId.has(x.parent) && n++ < 50) x = byId.get(x.parent); return x; };
  const roots = list.filter(r => root(r) === r), out = [];
  roots.forEach(rt => { out.push(rt); list.filter(r => r !== rt && root(r) === rt).forEach(r => out.push(r)); });
  return out;
}
let RTO = null; // kommentga javob: { post, id, uid, text }
let SEARCH_TAB = 'people', SEARCH_Q = '';
function search() {
  return `<div class="shell">${backBar('Qidiruv', SEARCH_TAB === 'people' ? 'Odamlar' : 'Guruhlar')}
  <div class="pad stack"><div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))" role="tablist">
    <button type="button" class="${SEARCH_TAB === 'people' ? 'on' : ''}" data-act="stab" data-v="people" role="tab" aria-selected="${SEARCH_TAB === 'people'}">Odamlar</button>
    <button type="button" class="${SEARCH_TAB === 'groups' ? 'on' : ''}" data-act="stab" data-v="groups" role="tab" aria-selected="${SEARCH_TAB === 'groups'}">Guruhlar</button></div>
  <label class="card row"><span class="sr">Qidiruv</span>${I.search}<input id="q" class="inp" style="border:0;height:40px;padding:0" placeholder="${SEARCH_TAB === 'people' ? 'Ism yoki @username' : 'Guruh nomi, bo‘lim yoki tavsif'}" autocomplete="off" autocapitalize="none" value="${esc(SEARCH_Q)}"></label>
  ${SEARCH_TAB === 'people' ? `<button class="btn ink full rnd-btn" data-act="rnduser">🎲 Random odam topish</button>` : ''}
  <div class="card" style="padding:4px 16px" id="results"></div></div></div>`;
}
let RND = null;
after.search = () => {
  const q = $('#q'), r = $('#results'), u = me();
  const draw = () => {
    const v = q.value.trim().toLowerCase().replace(/^@/, ''); SEARCH_Q = q.value;
    if (SEARCH_TAB === 'groups') {
      const gl = DB.chats.filter(c => c.type === 'group' && (c.access !== 'closed' || c.members.includes(u.id)) && (!v || [c.name, c.desc, c.cat].join(' ').toLowerCase().includes(v))).slice(0, 30);
      r.innerHTML = gl.map(c => `<a href="/g/${c.id}" data-link class="li"><span class="gav" style="background:${c.color}">${esc(c.name[0])}</span><span style="flex:1"><b>${esc(c.name)}</b><span class="muted" style="display:block">${esc(c.cat)} · ${c.members.length} a‘zo · ${ACCESS[c.access]}${c.members.includes(u.id) ? ' · siz a‘zosiz' : ''}</span></span></a>`).join('') || '<p class="muted" style="padding:10px 0">Bunday guruh topilmadi.</p>';
      return;
    }
    // Bo'sh qidiruvda hamma ko'rsatilmaydi: faqat yozilganda yoki "Random" bosilganda
    const list = v ? DB.users.filter(x => x.id !== u.id && !x.blocked && (x.u.includes(v) || x.name.toLowerCase().includes(v))).slice(0, 30) : RND ? [user(RND)].filter(Boolean) : [];
    if (!v && !list.length) { r.innerHTML = '<p class="muted" style="padding:12px 0;text-align:center">Ism yoki @username yozing, yoki 🎲 Random tugmasini bosing</p>'; return; }
    r.innerHTML = list.map(x => `<div class="li"><a href="/@${esc(x.u)}" data-link class="row" style="flex:1;text-decoration:none">${avatar(x, 44)}<span><b>${NM(x)}</b>${founderPill(x)}<span class="muted" style="display:block">@${esc(x.u)} · ${followers(x.id).length} kuzatuvchi</span></span></a>
      <button class="btn ${isFollowing(u.id, x.id) ? 'ghost' : 'ink'}" style="height:38px;font-size:13px;border-radius:999px" data-act="follow" data-id="${x.id}">${isFollowing(u.id, x.id) ? 'Kuzatilmoqda' : 'Kuzatish'}</button></div>`).join('') || '<p class="muted" style="padding:10px 0">Bunday odam topilmadi.</p>';
  };
  q.addEventListener('input', draw); draw(); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
};
function notifs() {
  const u = me(), list = DB.notifs.filter(n => n.to === u.id).sort((a, b) => b.t - a.t);
  const html = `<div class="shell">${backBar('Bildirishnomalar', `${list.filter(n => !n.read).length} ta yangi`)}
  <div class="pad"><div class="card" style="padding:4px 16px">${list.map(n => `<a href="${esc(n.link)}" data-link class="li" style="${n.read ? '' : 'font-weight:600'}"><span style="flex:1">${esc(n.text).replace(/(^|[^\w/])@([a-z0-9._]{3,20})/gi, '$1<b>@$2</b>')}<span class="muted" style="display:block">${ago(n.t)}</span></span>${n.read ? '' : '<span class="dot" style="min-width:10px;height:10px;padding:0"></span>'}</a>`).join('') || '<p class="muted">Hozircha bildirishnoma yo‘q. Sizni belgilashsa yoki javob yozishsa, shu yerda chiqadi.</p>'}</div></div></div>`;
  if (list.some(n => !n.read)) { list.forEach(n => n.read = true); api('act', { method: 'POST', body: { t: 'notifread' } }); }
  return html;
}
function tag(t) {
  const posts = DB.posts.filter(p => alive(p) && new RegExp('#' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}0-9_])', 'iu').test(p.text)).sort((a, b) => b.t - a.t);
  const tl = t.toLowerCase(), on = SESSION && (SESSION.tags || []).includes(tl);
  return `<div class="shell">${backBar('#' + esc(t), `${posts.length} post`)}<div class="pad stack">
    ${SESSION ? `<button class="btn ${on ? 'ghost' : 'acc'} full" data-act="tagfollow" data-id="${esc(tl)}">${on ? '✓ Kuzatilmoqda — bekor qilish' : '🏷 #' + esc(t) + ' tegini kuzatish'}</button>` : ''}
    ${posts.map(p => postCard(p)).join('') || '<div class="card muted">Bu heshteg bilan post yo‘q.</div>'}</div></div>`;
}
function settings() {
  const u = me(), sw = (act2, on, label) => `<button class="switch${on ? ' on' : ''}" data-act="${act2}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button>`;
  const row = (title, sub, right) => `<div class="li set-row"><span style="flex:1;min-width:0"><b>${title}</b>${sub ? `<span class="muted" style="display:block">${sub}</span>` : ''}</span>${right}</div>`;
  const S = SESSION || {}, fs = DB.fs || 'md', dmw = S.dmFrom || 'all';
  return `<div class="shell">${backBar('Sozlamalar')}
  <div class="pad stack">
    <div class="card"><div class="row" style="gap:14px">
      <button class="av-edit" data-act="editprofile" aria-label="Profil rasmini almashtirish">${avatar(u, 72)}<span class="cam" aria-hidden="true">📷</span></button>
      <span style="flex:1;min-width:0"><b style="font-family:var(--head);font-size:18px;display:block">${NM(u)}${founderPill(u)}</b><span class="muted">@${esc(u.u)}</span>
        <span style="display:block;font-size:14px;margin-top:4px;color:${u.bio ? 'var(--ink)' : 'var(--mute)'}">${u.bio ? esc(u.bio) : 'Bio yozilmagan'}</span></span></div>
      <div class="row" style="gap:8px;margin-top:12px"><button class="btn ghost" style="flex:1;height:42px" data-act="editprofile">✏️ Tahrirlash</button><a href="/@${esc(u.u)}" data-link class="btn ghost" style="flex:1;height:42px">👤 Profilim</a></div></div>

    ${!u.star ? starPromo() : ''}
    <h3 class="set-h">Ko‘rinish</h3>
    <div class="card" style="padding:2px 16px">
      <div class="li set-row" style="flex-wrap:wrap"><span style="flex:1;min-width:160px"><b>🔤 Yozuv</b><span class="muted" style="display:block">Post va xabarlarni lotin yoki kirillda o‘qish</span></span>
        <div class="seg" style="grid-template-columns:repeat(3,64px)">${[['', 'Asl'], ['lat', 'Lotin'], ['cyr', 'Кирилл']].map(([k, l]) => `<button type="button" class="${(DB.script || '') === k ? 'on' : ''}" data-act="setscript" data-v="${k}" aria-pressed="${(DB.script || '') === k}">${l}</button>`).join('')}</div></div>
      ${row('🌙 Tungi rejim', 'Qorong‘i ko‘rinish, ko‘zni charchatmaydi', sw('theme', DB.theme === 'dark', 'Tungi rejim'))}
      <div class="li set-row" style="flex-wrap:wrap"><span style="flex:1;min-width:160px"><b>🔠 Matn o‘lchami</b><span class="muted" style="display:block">Postlar va xabarlar</span></span>
        <div class="seg" style="grid-template-columns:repeat(3,64px)">${[['sm', 'A-'], ['md', 'A'], ['lg', 'A+']].map(([k, l]) => `<button type="button" class="${fs === k ? 'on' : ''}" data-act="fs" data-v="${k}" aria-pressed="${fs === k}">${l}</button>`).join('')}</div></div>
    </div>

    <h3 class="set-h">Maxfiylik</h3>
    <div class="card" style="padding:2px 16px">
      <div class="li set-row" style="flex-wrap:wrap"><span style="flex:1;min-width:160px"><b>✉️ Menga kim yoza oladi</b><span class="muted" style="display:block">Shaxsiy xabarlar</span></span>
        <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr));min-width:200px">${[['all', 'Hamma'], ['fol', 'Kuzatganlarim']].map(([k, l]) => `<button type="button" class="${dmw === k ? 'on' : ''}" data-act="dmfrom" data-v="${k}" aria-pressed="${dmw === k}">${l}</button>`).join('')}</div></div>
      ${row('🔔 Bildirishnomalar', 'Javob, belgilash va kuzatuvlar haqida', sw('notif', !S.notifOff, 'Bildirishnomalar'))}
      ${row('📲 Telefonga push', pushState() === 'on' ? 'Yoqilgan: xabarlar telefoningizga keladi' : pushState() === 'ios' ? 'iPhone’da avval ilovani o‘rnating' : pushState() === 'no' ? 'Bu brauzerda ishlamaydi' : 'Ilova yopiq bo‘lsa ham xabar keladi', pushState() === 'no' ? '' : sw(pushState() === 'on' ? 'pushoff' : 'pushon', pushState() === 'on', 'Telefonga push'))}
    </div>

    ${starSettings(u)}
    <h3 class="set-h">Akkaunt</h3>
    <div class="card" style="padding:2px 16px">
      ${row('📧 Gmail', esc(S.email || '—'), '<span class="tag green">Google ✓</span>')}
      ${row('🏅 Raqamingiz', `Lahzamdagi #${realUsers().findIndex(x => x.id === u.id) + 1}-foydalanuvchi`, u.owner ? OWNER_PILL : isFounder(u) ? '<span class="founder">Asoschi</span>' : '')}
      ${row('📅 Qo‘shilgan sana', uzDate(u.joined, true), '')}
      ${isOwnerSession() ? '' : `<button class="li set-row" style="width:100%;text-align:left" data-act="delme"><span style="flex:1"><b style="color:var(--danger,#E8423A)">🗑 Akkauntni o‘chirish</b><span class="muted" style="display:block">Hamma ma’lumotlaringiz butunlay o‘chadi</span></span>›</button>`}
    </div>

    <h3 class="set-h">Lahzam</h3>
    <div class="card" style="padding:2px 16px">
      <a href="/yangiliklar" data-link class="li set-row"><span style="flex:1"><b>✨ Lahzam Updates</b><span class="muted" style="display:block">Ilovada nimalar yangilandi</span></span>${unreadUpdates() ? `<span class="dot">${unreadUpdates()}</span>` : '›'}</a>
      ${standalone() ? '' : `<button class="li set-row" style="width:100%;text-align:left" data-act="install"><span style="flex:1"><b>📲 Ilovani o‘rnatish</b><span class="muted" style="display:block">Lahzam telefon ekraningizda alohida ilova bo‘ladi</span></span>›</button>`}
      <a href="/oyinlar" data-link class="li set-row"><span style="flex:1"><b>🎮 O‘yinlar</b><span class="muted" style="display:block">Flappy, Tetris va 2048</span></span>›</a>
      <button class="li set-row" style="width:100%;text-align:left" data-act="opensaved"><span style="flex:1"><b>🔖 Saqlangan xabarlar</b><span class="muted" style="display:block">Faqat siz ko‘radigan shaxsiy chat</span></span>›</button>
      <a href="/shartlar" data-link class="li set-row"><span style="flex:1"><b>📄 Foydalanish shartlari</b></span>›</a>
      <a href="/maxfiylik" data-link class="li set-row"><span style="flex:1"><b>🔒 Maxfiylik siyosati</b></span>›</a>
      <a href="/qoidalar" data-link class="li set-row"><span style="flex:1"><b>🤝 Jamiyat qoidalari</b></span>›</a>
      <a href="/reyting" data-link class="li set-row"><span style="flex:1"><b>🏆 Foydali reytingi</b><span class="muted" style="display:block">Eng ko‘p ⭐ olganlar</span></span>›</a>
      <button class="li set-row" style="width:100%;text-align:left" data-act="sharelahzam"><span style="flex:1"><b>💌 Do‘stlarni taklif qilish</b><span class="muted" style="display:block">Birinchi 50 kishi “Asoschi” bo‘ladi</span></span>›</button>
    </div>

    ${isOwnerSession() ? '<a href="/musoojon" data-link class="btn ink full">Admin panel 🔐</a>' : ''}
    <button class="btn ghost full" data-act="logout">Chiqish</button>
    <button class="btn ghost full" data-act="reset">🔄 Qayta yuklash (keshni tozalash)</button>
    <p class="muted" style="text-align:center;margin:0">Lahzam v${VERSION} · Har lahza yoningizda!</p>
  </div></div>`;
}
function notFound() { return `<div class="shell">${backBar('Topilmadi')}<div class="pad"><div class="card"><p>Bu sahifa mavjud emas yoki o‘chirilgan.</p><a href="/" data-link class="btn acc">Bosh sahifaga</a></div></div></div>`; }


/* Lahzam Updates: ega yozadi, hamma o'qiydi (serverda) */
let UPD = { list: null, p: null, failed: false };
const unreadUpdates = () => UPD.list ? UPD.list.filter(x => Date.parse(x.createdAt) > (DB.updSeen || 0)).length : 0;
function loadUpdates() {
  if (!UPD.p) UPD.p = api('updates').then(r => { if (r.ok) UPD.list = r.updates; else UPD.failed = true; });
  return UPD.p;
}
function updates() {
  const u = me(), list = UPD.list;
  const fmtD = t => uzDate(t, true);
  const writer = isAdmin() ? `<form class="card stack" data-form="update" style="gap:10px"><b style="font-family:var(--head);font-size:16px">Yangilik yozish ✍️</b>
      <label><span class="sr">Sarlavha</span><input class="inp" id="up-t" maxlength="80" required placeholder="Masalan: Endi rasm yuborsa bo‘ladi 📸"></label>
      <label><span class="sr">Matn</span><textarea class="inp" id="up-b" maxlength="2000" style="height:120px;padding:12px 16px" placeholder="Nima yangilandi? Har bir o‘zgarishni yangi qatordan yozing"></textarea></label>
      <button class="btn acc full">E‘lon qilish</button></form>`
    : isOwnerSession() ? `<a href="/musoojon" data-link class="card" style="display:block;text-decoration:none;background:#121212;color:#fff"><b>Yangilik yozish uchun admin frazani kiriting 🔐</b><span style="display:block;color:#bbb;font-size:13px;margin-top:4px">Admin panelga o‘tish →</span></a>` : '';
  const items = list === null ? `<div class="card muted">${UPD.failed ? 'Yuklab bo‘lmadi. Internetni tekshiring.' : 'Yuklanmoqda…'}</div>`
    : list.map(x => `<article class="card stack upd" style="gap:6px"><div class="row" style="justify-content:space-between"><span class="tag">${fmtD(x.createdAt)}</span>${isAdmin() ? `<button class="link-btn" style="font-size:13px;color:var(--danger)" data-act="delupdate" data-id="${x.id}">O‘chirish</button>` : ''}</div>
        <h2 style="font-family:var(--head);font-size:18px;margin:0">${esc(x.title)}</h2>${x.body ? `<p class="txt" style="font-size:15px">${linkify(x.body)}</p>` : ''}</article>`).join('') || '<div class="card muted">Hozircha yangilik yo‘q. Tez orada shu yerda Lahzamdagi o‘zgarishlar chiqadi ✨</div>';
  if (list) DB.updSeen = now();
  return `<div class="shell">${header(`<div style="margin-top:12px"><div class="title-h" style="margin:0">Lahzam Updates ✨</div><div class="sub-h">Ilovada nimalar yangilandi</div></div>`)}
  <div class="pad stack">${writer}${items}</div>${u ? dock('updates') : ''}</div>`;
}
after.updates = () => { if (UPD.list === null && !UPD.failed) loadUpdates().then(() => route()[0] === 'updates' && (UPD.list || UPD.failed) && render()); };

/* Foydali reytingi */
let LB_TAB = 'week';
function leaders() {
  const u = me(), since = LB_TAB === 'week' ? now() - 7 * DAY : 0;
  const rows = realUsers().filter(x => !x.blocked).map(x => ({ x, n: foydaliCount(x.id, since) })).filter(r => r.n > 0).sort((a, b) => b.n - a.n || a.x.id - b.x.id);
  const mine = rows.findIndex(r => r.x.id === u.id), medal = i => ['🥇', '🥈', '🥉'][i] || `<b class="rank">${i + 1}</b>`;
  const podium = rows.slice(0, 3);
  return `<div class="shell">${backBar('Foydali reytingi 🏆', LB_TAB === 'week' ? 'Oxirgi 7 kun' : 'Butun vaqt')}
  <div class="pad stack">
    <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))" role="tablist">
      <button type="button" class="${LB_TAB === 'week' ? 'on' : ''}" data-act="lbtab" data-v="week" role="tab" aria-selected="${LB_TAB === 'week'}">Shu hafta</button>
      <button type="button" class="${LB_TAB === 'all' ? 'on' : ''}" data-act="lbtab" data-v="all" role="tab" aria-selected="${LB_TAB === 'all'}">Umumiy</button></div>
    ${podium.length ? `<div class="podium">${[1, 0, 2].filter(i => podium[i]).map(i => `<a href="/@${esc(podium[i].x.u)}" data-link class="pod p${i + 1}">${avatar(podium[i].x, i === 0 ? 76 : 60)}<b>${esc(podium[i].x.name.split(' ')[0])}</b><span>⭐ ${podium[i].n}</span><i>${['🥇', '🥈', '🥉'][i]}</i></a>`).join('')}</div>` : ''}
    <div class="card" style="background:#121212;color:#fff"><b>${mine >= 0 ? `Siz ${mine + 1}-o‘rindasiz · ⭐ ${rows[mine].n}` : 'Siz hali reytingda yo‘qsiz'}</b>
      <p style="margin:6px 0 0;color:#ccc;font-size:14px">Guruhlarda foydali javob yozing. Boshqalar xabaringizga ⭐ bossa, reytingga chiqasiz. Har bir odamning ⭐ si bir marta hisoblanadi.</p></div>
    <div class="card" style="padding:4px 16px">${rows.map((r, i) => `<a href="/@${esc(r.x.u)}" data-link class="li${r.x.id === u.id ? ' me-row' : ''}"><span style="width:30px;text-align:center;font-size:20px">${medal(i)}</span>${avatar(r.x, 42)}<span style="flex:1"><b>${NM(r.x)}</b>${founderPill(r.x)}<span class="muted" style="display:block">@${esc(r.x.u)}</span></span><b style="font-size:16px">⭐ ${r.n}</b></a>`).join('') || `<p class="muted">${LB_TAB === 'week' ? 'Bu hafta hali hech kim ⭐ olmadi. Birinchi bo‘ling!' : 'Hali hech kim ⭐ olmadi.'}</p>`}</div>
  </div>${dock('')}</div>`;
}

/* admin /musoojon */
function admin() {
  if (isOwnerSession() && !ADM.verified) {
    const setup = ADM.checked && !ADM.configured;
    return `<div class="shell">${backBar('Admin', '2-bosqichli himoya')}<div class="pad"><form class="card stack" data-form="phrase" style="gap:12px">
      <b style="font-family:var(--head);font-size:18px">${!ADM.checked ? 'Tekshirilmoqda…' : setup ? 'Sirli frazani o‘rnating 🔐' : 'Sirli frazani kiriting 🔐'}</b>
      ${!ADM.checked ? '' : `<p class="muted" style="margin:0">${setup ? 'Bu admin panelning ikkinchi qulfi. Kamida 12 belgi: bir nechta so‘zdan iborat, faqat siz biladigan ibora tanlang. Fraza hech qayerda ochiq saqlanmaydi, uni tiklab bo‘lmaydi: yodda tuting.' : 'Google bilan kirdingiz. Endi faqat siz biladigan frazani yozing.'}</p>
      <div class="field"><label for="ph1">Sirli fraza</label><input class="inp" id="ph1" type="password" required minlength="${setup ? 12 : 1}" maxlength="200" autocomplete="off"></div>
      ${setup ? '<div class="field"><label for="ph2">Yana bir marta</label><input class="inp" id="ph2" type="password" required maxlength="200" autocomplete="off"></div>' : ''}
      <div class="hint bad" id="ph-hint"></div>
      <button class="btn acc full">${setup ? 'O‘rnatish' : 'Kirish'}</button>`}
    </form></div></div>`;
  }
  if (!isAdmin()) return `<div class="shell">${backBar('Admin')}<div class="pad"><div class="card stack"><b style="font-family:var(--head);font-size:18px">Ruxsat yo‘q 🔒</b><p class="muted" style="margin:0">Admin panelga faqat Lahzam egasi o‘z Gmail'i bilan kirgan holda kira oladi.</p>${me() ? '<a href="/" data-link class="btn ghost">Bosh sahifaga</a>' : '<a href="/kirish" data-link class="btn acc">Kirish</a>'}</div></div></div>`;
  const t = now(), users = realUsers();
  const msgs = DB.chats.reduce((n, c) => n + c.msgs.length, 0);
  const activeToday = new Set([...DB.posts.filter(p => t - p.t < DAY).map(p => p.uid), ...DB.chats.flatMap(c => c.msgs.filter(m => !m.sys && t - m.t < DAY).map(m => m.uid))]).size;
  const reported = DB.posts.filter(p => p.reports).sort((a, b) => b.reports - a.reports);
  const topGroups = DB.chats.filter(c => c.type === 'group' && (c.access !== 'closed' || c.members.includes(me().id))).map(c => ({ c, n: c.msgs.filter(m => t - m.t < 7 * DAY).length })).sort((a, b) => b.n - a.n);
  return `<div class="shell wide" style="padding:20px 16px 60px">
    <div class="row" style="justify-content:space-between;margin-bottom:16px"><div class="row">${I.logo('#FF5A1F', '#121212', 34)}<div><b style="font-family:var(--head);font-size:22px">Lahzam admin</b><div class="muted">Moderator paneli va statistika</div></div></div>
      <div class="row" style="gap:8px"><button class="btn ghost" style="height:40px" data-act="admrefresh">↻ Yangilash</button><a href="/" data-link class="btn ghost" style="height:40px">Saytga qaytish</a></div></div>
    <p class="card" style="background:#E3F4EC;color:#0F5A43;margin:0 0 14px">✅ Hamma ma‘lumot serverda: postlar, guruhlar, chatlar va akkauntlar. Bloklash va o‘chirish hamma uchun darhol amal qiladi.</p>
    <div class="grid4">
      <div class="kpi"><span class="muted">Jami foydalanuvchi</span><b>${users.length}</b></div>
      <div class="kpi"><span class="muted">Bugun qo‘shilgan</span><b>${users.filter(u => t - u.joined < DAY).length}</b></div>
      <div class="kpi"><span class="muted">Bugun faol</span><b>${activeToday}</b></div>
      <div class="kpi"><span class="muted">Postlar</span><b>${DB.posts.length}</b></div>
      <div class="kpi"><span class="muted">Xabarlar</span><b>${msgs}</b></div>
      <div class="kpi"><span class="muted">Asoschi o‘rinlari</span><b>${Math.max(0, 50 - users.length)}</b><span class="muted">50 tadan qoldi</span></div>
    </div>
    <h2 style="font-family:var(--head);font-size:18px;margin:24px 0 10px">Server</h2>
    <div id="srv-stats" class="grid4"><div class="kpi"><span class="muted">Yuklanmoqda…</span></div></div>
    <label class="card row" style="margin-top:14px;position:sticky;top:8px;z-index:5"><span class="sr">Admin qidiruv</span>${I.search}<input id="adm-q" class="inp" style="border:0;height:40px;padding:0" placeholder="Foydalanuvchi, Gmail yoki guruh qidirish…" autocomplete="off" autocapitalize="none"></label>
    <h2 style="font-family:var(--head);font-size:18px;margin:24px 0 10px">Shikoyatlar</h2>
    <div class="card scroll"><table><thead><tr><th>Post</th><th>Muallif</th><th>Shikoyat</th><th>Holat</th><th>Amal</th></tr></thead><tbody>
      ${reported.map(p => `<tr><td style="max-width:320px">${esc(p.text.slice(0, 120))}</td><td>@${esc(user(p.uid).u)}</td><td>${p.reports}</td><td>${p.hidden ? '<span class="tag red">yashirilgan</span>' : '<span class="tag green">ko‘rinadi</span>'}</td>
        <td class="row" style="gap:6px;flex-wrap:wrap"><button class="pill" data-act="adm-hide" data-id="${p.id}">${p.hidden ? 'Qaytarish' : 'Yashirish'}</button><button class="pill" data-act="adm-warn" data-u="${p.uid}">Ogohlantirish</button><button class="pill" style="color:var(--danger)" data-act="adm-block" data-u="${p.uid}">${user(p.uid).blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Shikoyat yo‘q 🎉</td></tr>'}
    </tbody></table></div>
    <h2 style="font-family:var(--head);font-size:18px;margin:24px 0 10px">Spam jurnali</h2>
    <div class="card scroll"><table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Sabab</th></tr></thead><tbody>
      ${DB.spam.slice(-30).reverse().map(s => `<tr><td>${ago(s.t)}</td><td>@${esc(user(s.uid).u)}</td><td>${esc(s.reason)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Hozircha toza.</td></tr>'}
    </tbody></table></div>
    <h2 style="font-family:var(--head);font-size:18px;margin:24px 0 10px">Foydalanuvchilar</h2>
    <div class="card scroll" id="srv-users"><p class="muted">Yuklanmoqda…</p></div>
    <h2 style="font-family:var(--head);font-size:18px;margin:24px 0 10px">Guruhlar (7 kunlik faollik)</h2>
    <div class="card">${topGroups.map(({ c, n }) => `<div class="li" data-q="${esc([c.name, c.cat, c.desc].join(' ').toLowerCase())}"><span class="gav" style="background:${c.color};width:40px;height:40px;border-radius:12px">${esc(c.name[0])}</span><span style="flex:1"><a href="/g/${c.id}" data-link style="text-decoration:none"><b>${esc(c.name)}</b></a><span class="muted" style="display:block">${esc(c.cat)} · ${c.members.length} a‘zo · ${ACCESS[c.access]} · ${n} xabar</span></span>
      <div class="row" style="gap:6px">${c.access === 'open' && c.full ? `<a class="pill" href="/c/${c.id}" data-link>Kirish</a>` : '<span class="tag" title="Shaxsiy guruh yozishmalari admin uchun ham yopiq">🔒 Shaxsiy</span>'}<button class="pill" style="color:var(--danger)" data-act="delgroup" data-id="${c.id}">O‘chirish</button></div></div>`).join('') || '<p class="muted">Guruh yo‘q.</p>'}</div>
  </div>`;
}

const fmtBytes = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
function admFilter() {
  const q = ($('#adm-q') && $('#adm-q').value || '').trim().toLowerCase();
  document.querySelectorAll('[data-q]').forEach(el => { el.hidden = !!q && !el.dataset.q.includes(q); });
}
after.admin = async () => {
  if (isOwnerSession() && !ADM.checked) { await refreshAdm(); if (route()[0] === 'admin') render(); return; }
  const aq = $('#adm-q'); if (aq) aq.addEventListener('input', admFilter);
  const stT = setTimeout(() => { const el = $('#srv-stats'); if (el && /Yuklanmoqda/.test(el.textContent)) el.innerHTML = '<div class="kpi"><span class="muted">Statistika kechikyapti… sahifani yangilang</span></div>'; }, 12000);
  const statsP = ADM.st && Date.now() - ADM.stAt < 60000 ? Promise.resolve(ADM.st) : api('admin/users?stats=1').then(st => { if (st.ok) { ADM.st = st; ADM.stAt = Date.now(); } return st; });
  statsP.then(st => { clearTimeout(stT);
    const el = $('#srv-stats'); if (!el || !st.ok) { if (el) el.innerHTML = '<div class="kpi"><span class="muted">Statistika yuklanmadi</span></div>'; return; }
    const bar = (title, used, limit, extra = '') => { const pct = Math.min(100, used / limit * 100), col = pct > 85 ? 'var(--danger)' : pct > 60 ? '#D97706' : 'var(--ok)';
      return `<div class="kpi" style="grid-column:1/-1"><span class="muted">${title}</span><b>${fmtBytes(used)} <span class="muted" style="font-size:15px;font-family:var(--font)">/ ${fmtBytes(limit)} · ${pct.toFixed(pct < 1 ? 2 : 1)}%</span></b>
      <div style="height:12px;background:var(--soft);border-radius:99px;overflow:hidden;margin-top:8px" role="progressbar" aria-valuenow="${pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100"><i style="display:block;height:100%;width:${Math.max(pct, 1)}%;background:${col};border-radius:99px"></i></div>
      <span class="muted" style="font-size:12px">${extra}${pct > 85 ? 'Diqqat: joy tugayapti, tarifni oshirish kerak bo‘ladi' : 'Joy yetarli ✅'}</span></div>`; };
    const R2 = st.r2;
    el.innerHTML = bar('Baza (Neon) hajmi', st.dbBytes, st.limitBytes)
      + (R2 && !R2.error ? bar('Rasmlar (Cloudflare R2)', R2.bytes, R2.limitBytes, `${R2.count}${R2.more ? '+' : ''} ta fayl · `)
        : `<div class="kpi" style="grid-column:1/-1"><span class="muted">Rasmlar (Cloudflare R2)</span><b style="font-size:18px">${R2 ? '⚠️ Ulanmadi' : 'Sozlanmagan'}</b><span class="muted" style="font-size:12px">${R2 ? 'Vercel’dagi R2 kalitlarini tekshiring: ' + esc(R2.error) : 'Vercel’da R2_* kalitlari yo‘q'}</span></div>`) + `
      <div class="kpi"><span class="muted">Ro‘yxatdan o‘tganlar</span><b>${st.users}</b></div>
      <div class="kpi"><span class="muted">Oxirgi 24 soatda</span><b>${st.today}</b></div>
      <div class="kpi"><span class="muted">Bloklangan</span><b>${st.blocked}</b></div>
      <div class="kpi"><span class="muted">Bloklangan Gmail</span><b>${st.banned}</b></div>`;
  });
  const box = $('#srv-users'); if (!box) return;
  const r = await api('admin/users');
  if (!$('#srv-users')) return;
  if (r.status === 401) { ADM.verified = false; render(); return; }
  if (!r.ok) { box.innerHTML = '<p class="muted">Serverdan yuklab bo‘lmadi.</p>'; return; }
  box.innerHTML = `<table><thead><tr><th>#</th><th>Username</th><th>Ism</th><th>Gmail</th><th>Holat</th><th>Amal</th></tr></thead><tbody>${r.users.map((x, i) => `<tr data-q="${esc([x.username, x.name, x.email].join(' ').toLowerCase())}"><td>${i + 1}</td><td>@${esc(x.username)}</td><td>${esc(x.name)}</td><td class="muted">${esc(x.email || '')}</td><td>${x.is_blocked ? '<span class="tag red">bloklangan</span>' : '<span class="tag green">faol</span>'}</td>
    <td>${x.email === OWNER_EMAIL ? '<span class="tag green">Ega</span>' : `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="pill" data-act="srv" data-a="${x.is_blocked ? 'unblock' : 'block'}" data-id="${x.id}">${x.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button><button class="pill" style="color:var(--danger)" data-act="srv" data-a="delete" data-id="${x.id}">O‘chirish</button><button class="pill star-adm" data-act="admstar" data-a="star" data-m="1" data-id="${x.id}">⭐ +1 oy</button><button class="pill star-adm" data-act="admstar" data-a="star" data-m="3" data-id="${x.id}">⭐ +3 oy</button>${x.star_until ? `<button class="pill" data-act="admstar" data-a="unstar" data-id="${x.id}">Yulduzni olish</button><span class="muted" style="font-size:12px">⭐ ${uzDate(new Date(x.star_until).getTime(), true)} gacha</span>` : ''}</div>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Hali hech kim yo‘q.</td></tr>'}</tbody></table>
    ${r.banned.length ? `<p class="muted" style="margin:10px 0 4px">Bloklangan Gmail'lar:</p>${r.banned.map(e => `<div class="li"><span style="flex:1">${esc(e)}</span><button class="pill" data-act="adm-unban" data-e="${esc(e)}">Blokdan chiqarish</button></div>`).join('')}` : ''}`;
  admFilter();
};

/* ---------------- modals ---------------- */
function sheet(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="scrim" data-act="close-sheet"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = root.querySelector('input,textarea,button'); f && f.focus();
}
const closeSheet = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.consent')) closeSheet(); });
document.addEventListener('input', e => { if (e.target.id === 'pb') { const v = e.target.value, bp = bioProblem(v.trim()); $('#pb-n').textContent = v.length + '/' + (me().star ? 200 : 100); $('#pb-h').textContent = bp ? '❌ ' + bp : ''; } if (e.target.id === 'lp' || e.target.id === 'lu') { $('#lp') && $('#lp').classList.remove('inp-bad'); } });
// Xabarni chapga sursangiz javob berish (Telegram'dagidek)
(() => {
  let el = null, sx = 0, sy = 0, dx = 0, lock = null;
  document.addEventListener('touchstart', e => { const m = e.target.closest('.m[data-msg]'); if (!m || !CH.cid || e.touches.length > 1 || String(m.dataset.msg).startsWith('tmp') || e.target.closest('.xo-board,.mimg')) return; el = m; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; lock = null; }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!el) return; const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
    if (lock == null && Math.abs(x) + Math.abs(y) > 10) lock = Math.abs(x) > Math.abs(y) * 1.3 && x < 0 ? 'x' : 'y';
    if (lock !== 'x') return; dx = Math.max(-80, Math.min(0, x)); el.style.transform = `translateX(${dx}px)`; el.classList.toggle('sw-ok', dx < -55);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!el) return; const m = el, ok = dx < -55; el = null; m.style.transition = 'transform .2s ease'; m.style.transform = ''; setTimeout(() => { m.style.transition = ''; m.classList.remove('sw-ok'); }, 220);
    if (ok) { navigator.vibrate && navigator.vibrate(10); CH.reply = m.dataset.msg; CH.edit = null; render(); }
  });
})();
// Xabarni ikki marta bossangiz ❤️ reaksiya qo'yiladi (Telegram'dagidek)
document.addEventListener('dblclick', e => {
  const mEl = e.target.closest('.m[data-msg]'); if (!mEl || e.target.closest('button,a,input') || !CH.cid || String(mEl.dataset.msg).startsWith('tmp')) return;
  const b = document.createElement('button'); b.hidden = true; Object.assign(b.dataset, { act: 'react', c: CH.cid, m: mEl.dataset.msg, e: '❤️' });
  mEl.appendChild(b); b.click(); b.remove(); getSelection && getSelection().removeAllRanges();
});

/* ---------------- actions ---------------- */
document.addEventListener('click', async e => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); closeSheet(); go(a.getAttribute('href')); return; }
  const el = e.target.closest('[data-act]'); if (!el) { document.querySelectorAll('.rx-bar').forEach(b => b.remove()); return; }
  const act = el.dataset.act, id = el.dataset.id, u = me();
  if (act === 'close-sheet') { if (e.target === el) closeSheet(); return; }
  e.preventDefault();
  const P = () => DB.posts.find(p => p.id === id);
  switch (act) {
    case 'back': if (history.length > 1) history.back(); else go('/'); break;
    case 'auth-login': AUTH.step = 'login'; render(); break;
    case 'auth-start': AUTH.step = 'start'; render(); break;
    case 'compose': if (location.pathname !== '/') go('/'); setTimeout(() => { const t = $('#post-text'); t && (t.focus(), t.scrollIntoView({ block: 'center' })); }, 30); break;
    case 'intro': { const t = $('#post-text'); t.value = `Salom! Men ${u.name}. `; t.dispatchEvent(new Event('input')); t.focus(); break; }
    case 'like': { if (!u) return go('/kirish'); const p = P(); if (!p) break; const i = p.likes.indexOf(u.id); if (i >= 0) p.likes.splice(i, 1); else p.likes.push(u.id); render(); server({ t: 'like', post: id }); break; }
    case 'sharepost': { const url = location.origin + '/p/' + id; try { await navigator.clipboard.writeText(url); toast('Havola nusxalandi'); } catch (err) { sheet(`<h2>Havola</h2><input class="inp" readonly value="${esc(url)}"><button class="btn ghost full" style="margin-top:10px" data-act="close-sheet-btn">Yopish</button>`); } break; }
    case 'copy': try { await navigator.clipboard.writeText(el.dataset.text); toast('Nusxalandi'); } catch (err) { toast(el.dataset.text); } break;
    case 'sendpost': {
      if (!u) return go('/kirish');
      const sv = DB.chats.find(c => isSaved(c) && c.members.includes(u.id));
      const list = DB.chats.filter(c => c.members.includes(u.id) && !isSaved(c)).sort((a, b) => (b.msgs.at(-1)?.t || 0) - (a.msgs.at(-1)?.t || 0));
      const svBtn = `<button class="li" style="width:100%;text-align:left" data-act="sendto" data-id="${id}" data-c="${sv ? sv.id : 'saved'}">${savedAv(40)}<b>Saqlangan xabarlar</b></button>`;
      sheet(`<h2>Chatga yuborish</h2><div class="card" style="padding:4px 16px">${svBtn}${list.map(c => `<button class="li" style="width:100%;text-align:left" data-act="sendto" data-id="${id}" data-c="${c.id}">${chatAv(c, u, 40)}<b>${esc(chatName(c, u))}</b></button>`).join('') || '<p class="muted">Hali chat yo‘q.</p>'}</div>`);
      break;
    }
    case 'sendto': {
      const p = P(); if (!p || !guard('msg', 'post')) return; let cid = el.dataset.c;
      if (cid === 'saved') { const r = await api('act', { method: 'POST', body: { t: 'saved' } }); if (!r.chat) { toast(r.message || 'Bo‘lmadi', true); break; } cid = r.chat; }
      closeSheet(); const r2 = await server({ t: 'msg', chat: cid, body: `[post:${String(p.id).replace('p', '')}]\n${p.text.slice(0, 120)}` }, cid === el.dataset.c ? 'Yuborildi ↪️' : 'Saqlandi 🔖'); break;
    }
    case 'editpost': {
      const p = P(); if (!p || p.uid !== u.id) break;
      sheet(`<h2>Postni tahrirlash ✏️</h2><form class="stack" data-form="editpost" data-id="${id}"><textarea class="inp" id="ep-t" maxlength="500" style="height:140px;padding:12px 16px">${esc(p.text)}</textarea>
        <button class="btn acc full">Saqlash</button><button type="button" class="btn ghost full" data-act="close-sheet-btn">Bekor qilish</button></form>`); break;
    }
    case 'postmenu': {
      const p = P(); if (!p) break; const own = u && (p.uid === u.id || isAdmin());
      sheet(`<h2>Post</h2><div class="stack">${u && !p.lahza && !p.sched ? `<button class="btn ghost full" data-act="quotepost" data-id="${id}">🔁 Iqtibos bilan ulashish</button>` : ''}${u && p.uid === u.id ? `<button class="btn ghost full" data-act="editpost" data-id="${id}">✏️ Tahrirlash</button>` : ''}${u && p.uid === u.id && u.star ? `<button class="btn ghost full" data-act="pinpost" data-id="${id}">${u.pin === id ? '📌 Profildan olib tashlash' : '📌 Profilga qadash'}</button>` : ''}${own ? `<button class="btn ghost full" style="color:var(--danger)" data-act="delpost" data-id="${id}">O‘chirish</button>` : p.reported ? '<p class="muted" style="margin:0">Shikoyatingiz qabul qilingan ✅</p>' : `<button class="btn ghost full" data-act="report" data-id="${id}">Shikoyat qilish</button>`}<button class="btn ghost full" data-act="sharepost" data-id="${id}">Havolani nusxalash</button></div>`);
      break;
    }
    case 'delpost': { const p = P(); if (!p || !(p.uid === u.id || isAdmin())) break; DB.posts = DB.posts.filter(x => x.id !== id); closeSheet(); server({ t: 'delpost', post: id }, 'O‘chirildi'); if (route()[0] === 'post') go('/'); else render(); break; }
    case 'delreply': { const p = P(); if (!p) break; p.replies = p.replies.filter(r => r.id !== el.dataset.r || !(r.uid === u.id || isAdmin())); render(); server({ t: 'delreply', reply: el.dataset.r }, 'Javob o‘chirildi'); break; }
    case 'delgroup': {
      const c = DB.chats.find(x => x.id === id); if (!c || !(isAdmin() || c.admin === u.id)) break;
      if (!confirmInline(el, 'Rostdan o‘chirilsinmi? Yana bosing')) break;
      DB.chats = DB.chats.filter(x => x.id !== id); server({ t: 'delgroup', chat: id }, 'Guruh o‘chirildi');
      if (route()[0] === 'admin') render(); else go('/guruhlar'); break;
    }
    case 'ph-clear': { PHOTO = null; const pv = $('#ph-prev'); const tg = user(+el.dataset.u); if (pv && tg) pv.innerHTML = avatar({ ...tg, photo: null }, 64); el.remove(); break; }
    case 'report': {
      if (!u) return go('/kirish'); const p = P(); if (!p) break;
      sheet(`<h2>🚩 Shikoyat sababi</h2><div class="stack" style="gap:8px">${[['spam', '📢 Spam yoki reklama'], ['haqorat', '🤬 Haqorat yoki bezorilik'], ['18', '🔞 Behayo kontent'], ['yolgon', '❌ Yolg‘on ma’lumot'], ['boshqa', '❔ Boshqa']].map(([k, l]) => `<button class="btn ghost full" style="justify-content:flex-start" data-act="reportgo" data-id="${id}" data-r="${k}">${l}</button>`).join('')}</div>`); break;
    }
    case 'reportgo': { const p = P(); if (!p) break; p.reported = true; closeSheet(); server({ t: 'report', post: id, reason: el.dataset.r }, 'Rahmat! Shikoyatingiz moderatorga yuborildi 🚩'); break; }
    case 'follow': {
      if (!u) return go('/kirish'); const t = +id; if (t === u.id) return;
      const i = DB.follows.findIndex(f => f[0] === u.id && f[1] === t);
      if (i >= 0) DB.follows.splice(i, 1); else DB.follows.push([u.id, t]);
      server({ t: 'follow', user: t });
      if (el.closest('.sheet')) { el.className = 'btn ' + (isFollowing(u.id, t) ? 'ghost' : 'ink'); el.textContent = isFollowing(u.id, t) ? 'Kuzatilmoqda' : 'Kuzatish'; save(); break; }
      if (route()[0] === 'search') { save(); after.search(); } else render(); break;
    }
    case 'dm': {
      const t = +id, ex = DB.chats.find(x => x.type === 'dm' && x.members.includes(u.id) && x.members.includes(t));
      if (ex) { go('/c/' + ex.id); break; }
      el.disabled = true; const r = await server({ t: 'dm', user: t }); el.disabled = false;
      if (r.chat) { await sync(true); go('/c/' + r.chat); }
      break;
    }
    case 'allposts': SHOW_ALL = true; render(); break;
    case 'editprofile': {
      const tg = u; if (!tg) break;
      PHOTO = undefined;
      sheet(`<h2>Profilni tahrirlash</h2><form class="stack" data-form="profile" data-u="${tg.id}">
      <div class="field"><span style="font-size:14px;font-weight:700">Profil rasmi</span><div class="row" style="flex-wrap:wrap"><span id="ph-prev">${avatar(tg, 64)}</span>
        <label class="btn ghost" style="height:42px;cursor:pointer;position:relative">📷 Rasm tanlash<input type="file" accept="image/*" id="ph-file" class="sr"></label>
        ${tg.photo ? `<button type="button" class="btn ghost" style="height:42px;color:var(--danger)" data-act="ph-clear" data-u="${tg.id}">Olib tashlash</button>` : ''}</div></div>
      <div class="field"><label for="pn">Ism</label><input class="inp" id="pn" maxlength="40" required value="${esc(tg.name)}"></div>
      <div class="field"><label for="pb">Bio</label><textarea class="inp" id="pb" maxlength="${tg.star ? 200 : 100}" style="height:96px;padding:12px 16px" placeholder="O‘zingiz haqingizda qisqacha">${esc(tg.bio || '')}</textarea><div class="row" style="justify-content:space-between"><span class="hint bad" id="pb-h"></span><span class="hint" id="pb-n">${(tg.bio || '').length}/${tg.star ? 200 : 100}</span></div><span class="muted" style="font-size:12px">Ko‘pi bilan ${tg.star ? 200 : 100} belgi va 3 qator · havola va telefon raqam mumkin emas</span></div>
      <div class="field"><span style="font-size:14px;font-weight:700">Rang</span><div class="row" style="flex-wrap:wrap">${COLORS.map(c => `<label style="cursor:pointer"><input type="radio" name="pc" value="${c}" class="sr" ${c === tg.color ? 'checked' : ''}><span class="av swatch" style="width:40px;height:40px;background:${c}"></span></label>`).join('')}</div></div>
      <button class="btn acc full">Saqlash</button></form>`); break;
    }
    case 'qr': {
      const url = `${location.origin}/@${u.u}`;
      sheet(`<h2>Mening QR kodim</h2><p class="muted" style="margin-top:-6px">Buni faqat siz ko‘rasiz. Do‘stingiz skanerlasa, profilingiz ochiladi.</p><div class="card" style="display:flex;justify-content:center" id="qr-box">Yuklanmoqda…</div><p style="text-align:center;font-weight:700">${esc(location.host)}/@${esc(u.u)}</p><button class="btn ghost full" data-act="copy" data-text="${esc(url)}">Havolani nusxalash</button>`);
      loadQR(url); break;
    }
    case 'theme': { DB.theme = DB.theme === 'dark' ? 'light' : 'dark'; save(); closeSheet(); const y = scrollY; render(); scrollTo(0, y); break; }
    case 'logout': $('#modal-root').innerHTML = ''; el.disabled = true; try { localStorage.setItem('lahzam_noauto', '1'); window.google && google.accounts && google.accounts.id.disableAutoSelect(); } catch (e) {} await api(el.dataset.all ? 'auth/me?all=1' : 'auth/me', { method: 'DELETE' }); ADM = { checked: false, configured: false, verified: false }; adoptSession(null); AUTH = { step: 'start' }; save(); $('#modal-root').innerHTML = ''; go('/kirish'); toast('Akkauntdan chiqdingiz 👋'); break;
    case 'reset': { const keep = DB; DB = Object.assign(fresh(keep), { me: keep.me, sess: keep.sess, users: keep.users.filter(x => x.id === keep.me) }); SYNC.sig = ''; save(); toast('Yangilanmoqda…'); await sync(true); render(); break; }
    case 'newgroup': sheet(`<h2>Yangi guruh</h2><form class="stack" data-form="group">
      <div class="field"><label for="gn">Nomi</label><input class="inp" id="gn" required maxlength="40" placeholder="Masalan: SAT tayyorgarlik"></div>
      <div class="field"><label for="gd">Tavsif</label><input class="inp" id="gd" maxlength="160" placeholder="Guruh nima haqida?"></div>
      <div class="field"><label for="gc">Katalog bo‘limi</label><select class="inp" id="gc">${CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><span style="font-size:14px;font-weight:700">Kim qo‘shila oladi?</span><div class="seg" role="radiogroup">${Object.entries(ACCESS).map(([k, v], i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-act="seg" data-v="${k}" role="radio" aria-checked="${i === 0}">${v}</button>`).join('')}</div>
        <div class="muted" id="acc-hint">Hamma uchun: katalogdan topib, darhol qo‘shilsa bo‘ladi.</div></div>
      <button class="btn acc full">Guruh ochish</button></form>`); break;
    case 'seg': {
      el.parentElement.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
      $('#acc-hint').textContent = { open: 'Hamma uchun: katalogdan topib, darhol qo‘shilsa bo‘ladi.', ask: 'Ruxsatli: qo‘shilish so‘rovini siz tasdiqlaysiz.', closed: 'Yopiq: katalogda ko‘rinmaydi, faqat taklif bilan.' }[el.dataset.v];
      break;
    }
    case 'join': {
      el.disabled = true; const r = await server({ t: 'join', chat: id }); el.disabled = false;
      if (r.status === 'pending') { toast('So‘rov yuborildi ✅'); render(); }
      else if (r.status === 'member') { await sync(true); go('/c/' + id); }
      break;
    }
    case 'approve': { const c = DB.chats.find(x => x.id === id), p = +el.dataset.u; if (!c) break; c.pending = c.pending.filter(x => x !== p); c.members.push(p); render(); server({ t: 'approve', chat: id, user: p }, 'Qabul qilindi'); break; }
    case 'leave': { const c = DB.chats.find(x => x.id === id); if (!c) break; if (c.admin === u.id) { toast('Admin guruhdan chiqa olmaydi'); break; } c.members = c.members.filter(x => x !== u.id); server({ t: 'leave', chat: id }, 'Guruhdan chiqdingiz'); go('/guruhlar'); break; }
    case 'rxbar': {
      document.querySelectorAll('.rx-bar').forEach(b => b.remove());
      const box = el.closest('.m'); const bar = document.createElement('div'); bar.className = 'rx-bar';
      bar.innerHTML = REACTS.map(r => `<button data-act="react" data-c="${el.dataset.c}" data-m="${el.dataset.m}" data-e="${r}" aria-label="${r}">${r}</button>`).join('');
      if (box.getBoundingClientRect().top < 150) bar.classList.add('below');
      box.appendChild(bar); break;
    }
    case 'react': {
      const c = DB.chats.find(x => x.id === el.dataset.c), m = c && c.msgs.find(x => x.id === el.dataset.m), e2 = el.dataset.e; if (!m) break;
      m.reacts = m.reacts || {};
      const had = (m.reacts[e2] || []).includes(u.id);
      Object.keys(m.reacts).forEach(k => m.reacts[k] = m.reacts[k].filter(x => x !== u.id));
      if (!had) (m.reacts[e2] = m.reacts[e2] || []).push(u.id);
      document.querySelectorAll('.rx-bar').forEach(b => b.remove());
      { const box = $('#msgs'), y = scrollY; if (box && route()[0] === 'chat') { box.innerHTML = msgList(c); scrollTo(0, y); } else render(); }
      if (!m.tmp) server({ t: 'react', msg: m.id, emoji: e2 }); break;
    }
    case 'play': {
      const c = DB.chats.find(x => x.id === id); if (!c) break;
      Flappy.open({ record: c.record && c.record.score, recordBy: c.record && user(c.record.uid).u, onEnd: score => {
        if (score > 0 && (!c.record || score > c.record.score) && c.members.includes(u.id)) {
          c.record = { score, uid: u.id };
          server({ t: 'flappy', chat: c.id, score });
          toast(`Yangi rekord: ${score} 🏆`);
          return { record: score, recordBy: u.u };
        }
        return null;
      } });
      break;
    }
    case 'playtet': {
      const c = DB.chats.find(x => x.id === id); if (!c) break;
      Tetris.open({ record: c.trecord && c.trecord.score, recordBy: c.trecord && user(c.trecord.uid).u, onEnd: score => {
        if (score > 0 && (!c.trecord || score > c.trecord.score) && c.members.includes(u.id)) {
          c.trecord = { score, uid: u.id }; server({ t: 'tetris', chat: c.id, score }); toast(`Yangi Tetris rekordi: ${score} 🏆`);
          return { record: score, recordBy: u.u };
        }
        return null;
      } });
      break;
    }
    case 'playmn': {
      const c = DB.chats.find(x => x.id === id); if (!c) break;
      Mines.open({ record: c.mrecord && c.mrecord.score, recordBy: c.mrecord && user(c.mrecord.uid).u, onEnd: score => {
        if (score > 0 && (!c.mrecord || score > c.mrecord.score) && c.members.includes(u.id)) {
          c.mrecord = { score, uid: u.id }; server({ t: 'mines', chat: c.id, score }); toast(`Yangi Mina rekordi: ${score} 🏆`);
          return { record: score, recordBy: u.u };
        }
        return null;
      } });
      break;
    }
    case 'play48': {
      const c = DB.chats.find(x => x.id === id); if (!c) break;
      G2048.open({ record: c.grecord && c.grecord.score, recordBy: c.grecord && user(c.grecord.uid).u, onEnd: score => {
        if (score > 0 && (!c.grecord || score > c.grecord.score) && c.members.includes(u.id)) {
          c.grecord = { score, uid: u.id }; server({ t: '2048', chat: c.id, score }); toast(`Yangi 2048 rekordi: ${score} 🏆`);
          return { record: score, recordBy: u.u };
        }
        return null;
      } });
      break;
    }
    case 'opensaved': {
      const ex = DB.chats.find(c => isSaved(c) && c.members.includes(u.id)); if (ex) { go('/c/' + ex.id); break; }
      const r = await api('act', { method: 'POST', body: { t: 'saved' } }); if (r.chat) { await sync(true); go('/c/' + r.chat); } else toast(r.message || 'Ochib bo‘lmadi', true); break;
    }
    case 'm-save': {
      closeSheet(); let sv = DB.chats.find(c => isSaved(c) && c.members.includes(u.id));
      if (!sv) { const r = await api('act', { method: 'POST', body: { t: 'saved' } }); if (!r.chat) { toast(r.message || 'Saqlab bo‘lmadi', true); break; } await sync(true); sv = DB.chats.find(c => c.id === r.chat); }
      if (sv) await server({ t: 'fwd', msg: el.dataset.m, chat: sv.id }, 'Saqlandi 🔖'); break;
    }
    case 'oldmsg': {
      const r = await api('act', { method: 'POST', body: { t: 'mctx', chat: el.dataset.c, msg: el.dataset.m } }); if (!r.ok) { toast(r.message || 'Topilmadi', true); break; }
      sheet(`<h2>Eski xabar</h2><div class="ctx-list">${r.list.map(m => { const a = user(m.uid) || { name: '—' }, st = window.Stickers && (Stickers.re.exec(m.text || '') || [])[1];
        return `<div class="ctx${m.id === el.dataset.m ? ' hit' : ''}"><b>${esc(a.name)}</b> <span class="muted">${uzDate(m.t)} ${clock(m.t)}</span><div>${m.img ? '📷 ' : ''}${st ? '🎨 Stiker' : linkify(m.text || '')}</div></div>`; }).join('')}</div>`);
      setTimeout(() => { const h = document.querySelector('.ctx.hit'); h && h.scrollIntoView({ block: 'center' }); }, 30); break;
    }
    case 'gfake': { if (window.google && google.accounts && GCFG) { try { google.accounts.id.prompt(); } catch (err) {} } else { toast('Google ulanmoqda, bir soniya…'); initGoogle(); } break; }
    case 'gban': {
      const c = DB.chats.find(x => x.id === id), t2 = +el.dataset.u, w = user(t2); if (!c || !w) break;
      if (!confirmInline(el, 'Rostdan? Yana bosing')) break;
      const r = await server({ t: 'ban', chat: c.id, user: t2 }, `@${w.u} guruhdan chetlatildi 🚫`); if (r.ok) { c.members = c.members.filter(x => x !== t2); c.banned = [...(c.banned || []), t2]; render(); } break;
    }
    case 'gunban': { const c = DB.chats.find(x => x.id === id), t2 = +el.dataset.u; if (!c) break; const r = await server({ t: 'unban', chat: c.id, user: t2 }, 'Qaytarildi: endi qayta qo‘shila oladi'); if (r.ok) { c.banned = (c.banned || []).filter(x => x !== t2); render(); } break; }
    case 'glock': { const a = $('#agree'); toast('Avval rozilik belgisini qo‘ying ☑️', true); if (a) { const l = a.closest('.agree'); l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake'); a.focus(); } break; }
    case 'agree-go': {
      if (!$('#agree3') || !$('#agree3').checked) break; el.disabled = true;
      const r = await api('act', { method: 'POST', body: { t: 'agree', agree: true } });
      if (!r.ok) { el.disabled = false; toast(r.message || 'Bajarilmadi', true); break; }
      SESSION.termsOk = true; DB.sess = SESSION; save(); $('#modal-root').innerHTML = ''; toast('Rahmat! Xush kelibsiz 👋'); render(); break;
    }
    case 'logoutask': sheet(`<h2>Akkauntdan chiqasizmi? 👋</h2><p class="muted" style="margin:-4px 0 14px">Qayta kirish uchun Google yoki username va parol kerak bo‘ladi.</p>
      <div class="stack" style="gap:8px"><button class="btn full" style="background:var(--danger,#E8423A);color:#fff" data-act="logout">Ha, chiqish</button><button class="btn ghost full" data-act="logout" data-all="1">🔒 Barcha qurilmalardan chiqish</button><button class="btn ghost full" data-act="close-sheet-btn">Bekor qilish</button></div>`); break;
    case 'solo': { const g = GAMES.find(x => x.k === id); if (g) g.open({ solo: true, onEnd: () => null }); break; }
    case 'gamesend': {
      const g = GAMES.find(x => x.k === id); if (!g || !u) break;
      const list = DB.chats.filter(c => c.members.includes(u.id) && !isSaved(c)).sort((a, b) => (b.msgs.at(-1)?.t || 0) - (a.msgs.at(-1)?.t || 0));
      sheet(`<h2>${g.name}ni qayerga yuboramiz?</h2><div class="card" style="padding:4px 16px">${list.map(c => `<button class="li" style="width:100%;text-align:left" data-act="gamesendto" data-id="${g.k}" data-c="${c.id}">${chatAv(c, u, 40)}<b>${esc(chatName(c, u))}</b></button>`).join('') || '<p class="muted">Hali chat yo‘q. Avval biror guruhga qo‘shiling yoki kimgadir yozing.</p>'}</div>`); break;
    }
    case 'gamesendto': {
      const g = GAMES.find(x => x.k === id), c = DB.chats.find(x => x.id === el.dataset.c); if (!g || !c || !guard('msg', g.tag)) break;
      closeSheet(); c.msgs.push({ id: 'tmp' + uid(), tmp: true, uid: u.id, text: g.tag, t: now(), reacts: {}, ...(g.k === 'xo' ? { xo: { x: u.id, o: null, b: '.........', t: 'x', w: null } } : { game: true }) });
      await server({ t: 'msg', chat: c.id, body: g.tag }, `${g.name} yuborildi 🎮`); go('/c/' + c.id); break;
    }
    case 'delme': sheet(`<h2>Akkauntni o‘chirish 🗑</h2>
      <p style="margin:-4px 0 10px">Akkauntingiz <b>butunlay</b> o‘chadi: postlar, javoblar, xabarlar, reaksiyalar, kuzatuvlar va profil. Buni <b>qaytarib bo‘lmaydi</b>.</p>
      <form class="stack" data-form="delme"><div class="field"><label for="dm-c">Tasdiqlash uchun username’ingizni yozing: <b>${esc(u.u)}</b></label><input class="inp" id="dm-c" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
      <div class="hint bad" id="dm-h"></div><button class="btn full" style="background:var(--danger,#E8423A);color:#fff">Butunlay o‘chirish</button><button type="button" class="btn ghost full" data-act="close-sheet-btn">Bekor qilish</button></form>`); break;
    case 'rnduser': {
      const pool = DB.users.filter(x => !x.system && !x.blocked && x.id !== u.id && x.id !== RND);
      if (!pool.length) { toast('Hozircha boshqa odam yo‘q'); break; }
      RND = pool[Math.floor(Math.random() * pool.length)].id; const q = $('#q'); if (q) q.value = ''; SEARCH_Q = '';
      el.classList.remove('spin'); void el.offsetWidth; el.classList.add('spin'); after.search(); break;
    }
    case 'starcolor': patchMe({ starColor: el.dataset.v }, 'Rang saqlandi ✨'); break;
    case 'cover': patchMe({ cover: el.dataset.g === '0' ? null : 'g' + el.dataset.g + (+el.dataset.p ? '.p' + el.dataset.p : '') }); break;
    case 'hideonline': patchMe({ hideOnline: !(SESSION && SESSION.hideOnline) }); break;
    case 'hideread': patchMe({ hideRead: !(SESSION && SESSION.hideRead) }); break;
    case 'pinpost': { closeSheet(); const unpin = u.pin === id; patchMe({ pinned: unpin ? null : id }, unpin ? 'Profildan olib tashlandi' : 'Profilga qadaldi 📌'); break; }
    case 'chun': sheet(`<h2>🔤 Username’ni almashtirish</h2><form class="stack" data-form="chun"><div class="field"><label for="cu">Yangi username</label><div style="position:relative"><span style="position:absolute;left:16px;top:14px;color:var(--mute);font-weight:700">@</span><input class="inp" id="cu" style="padding-left:34px" maxlength="15" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(u.u)}"></div><div class="hint" id="cu-h">3–15 belgi · oyiga bir marta almashtirish mumkin</div></div><button class="btn acc full">Saqlash</button></form>`); break;
    case 'admstar': { const r = await api('admin/users', { method: 'POST', body: { action: el.dataset.a, id: +id, months: +el.dataset.m || undefined } }); if (r.status === 401) { ADM.verified = false; render(); break; } toast(r.ok ? (el.dataset.a === 'star' ? `⭐ ${el.dataset.m} oyga Yulduz berildi` : 'Yulduz olib tashlandi') : (r.message || 'Bajarilmadi'), !r.ok); if (r.ok) { await sync(true); render(); } break; }
    case 'schedmsg': {
      if (!u.star) { closeSheet(); go('/yulduz'); toast('Keyinroq yuborish ⭐ Yulduz a’zolari uchun'); break; }
      const d = new Date(Date.now() + 3600e3), pad = n => String(n).padStart(2, '0'), v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const cur = ($('#msg-in') && $('#msg-in').value) || '';
      sheet(`<h2>⏰ Keyinroq yuborish</h2><form class="stack" data-form="sched" data-id="${id}"><div class="field"><label for="sc-t">Xabar</label><textarea class="inp" id="sc-t" maxlength="2000" style="height:100px;padding:12px 16px" required>${esc(cur)}</textarea></div>
        <div class="field"><label for="sc-d">Qachon yuborilsin</label><input class="inp" id="sc-d" type="datetime-local" value="${v}" required></div><div class="hint bad" id="sc-h"></div>
        <button class="btn acc full">Rejalashtirish</button><p class="muted" style="margin:0;font-size:13px">Belgilangan vaqtgacha xabarni faqat siz ko‘rasiz. Bekor qilish uchun xabarni o‘chiring.</p></form>`); break;
    }
    case 'appicon': {
      await patchMe({ appIcon: el.dataset.v || null }); applyIcon();
      // sahifa avtomatik qayta yuklanadi: brauzer yangi manifest va ikonkani darhol oladi
      try { sessionStorage.setItem('lahzam_icon_done', '1'); } catch (err) {}
      closeSheet(); toast('Ikonka tanlandi ✅ Yangilanmoqda…'); setTimeout(() => location.reload(), 700); break;
    }
    case 'restats': STATS = null; render(); break;
    case 'script': { DB.script = DB.script === 'cyr' ? 'lat' : DB.script === 'lat' ? '' : 'cyr'; save(); closeSheet(); const y = scrollY; render(); scrollTo(0, y); toast(DB.script === 'cyr' ? 'Матнлар кириллда' : DB.script === 'lat' ? 'Matnlar lotinda' : 'Matnlar asl holida'); break; }
    case 'setscript': { DB.script = el.dataset.v || ''; save(); const y = scrollY; render(); scrollTo(0, y); break; }
    case 'tnew': sheet(`<h2>🏁 Turnir boshlash</h2><p class="muted" style="margin:-4px 0 10px">Belgilangan vaqt ichida eng ko‘p ochko yiqqan a’zo g‘olib bo‘ladi. Natija chatga e’lon qilinadi.</p>
      <form class="stack" data-form="tnew" data-id="${id}"><div class="field"><span style="font-size:14px;font-weight:700">O‘yin</span><div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))">${GAMES.filter(g => !g.duo).map((g, i) => `<label class="tn-opt"><input type="radio" name="tg" value="${g.k}" ${i ? '' : 'checked'}><span>${g.name}</span></label>`).join('')}</div></div>
      <div class="field"><span style="font-size:14px;font-weight:700">Davomiyligi</span><div class="seg" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[5, 10, 30, 60].map((n, i) => `<label class="tn-opt"><input type="radio" name="tm" value="${n}" ${i === 1 ? 'checked' : ''}><span>${n} daq</span></label>`).join('')}</div></div>
      <button class="btn acc full">Boshlash 🏁</button></form>`); break;
    case 'tplay': {
      const c = DB.chats.find(x => x.id === id); if (!c || !c.tour) break; const T = c.tour, g = GAMES.find(x => x.k === T.game);
      const mine = (T.sc.find(r => r.u === u.id) || {}).s || 0, lead = T.sc[0];
      g.open({ record: lead && lead.s, recordBy: lead && (user(lead.u) || {}).u, onEnd: score => {
        if (score > 0 && score > mine && T.ends > now()) { api('act', { method: 'POST', body: { t: 'tscore', tid: T.id, score } }).then(() => sync(true)); const r = T.sc.find(x => x.u === u.id); if (r) r.s = score; else T.sc.push({ u: u.id, s: score }); T.sc.sort((a, b) => b.s - a.s); toast(`Turnir natijangiz: ${score} 🏁`); }
        return lead && score > lead.s ? { record: score, recordBy: u.u } : null;
      } });
      break;
    }
    case 'topmenu': {
      const li = (href, ico, t, sub = '') => `<a href="${href}" data-link class="li"><span class="perk-i">${ico}</span><span style="flex:1"><b>${t}</b>${sub ? `<span class="muted" style="display:block;font-size:13px">${sub}</span>` : ''}</span>›</a>`;
      sheet(`<h2>Menyu</h2><div class="card" style="padding:4px 16px;margin-bottom:10px">
        <button class="li" style="width:100%;text-align:left" data-act="theme"><span class="perk-i">${DB.theme === 'dark' ? '☀️' : '🌙'}</span><span style="flex:1"><b>${DB.theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}</b></span></button>
        <button class="li" style="width:100%;text-align:left" data-act="script"><span class="perk-i" style="font-weight:800;font-size:14px">A/Я</span><span style="flex:1"><b>Yozuv: ${DB.script === 'cyr' ? 'Кирилл' : DB.script === 'lat' ? 'Lotin' : 'Asl holida'}</b><span class="muted" style="display:block;font-size:13px">Bosib almashtiring: Кирилл → Lotin → Asl</span></span></button></div>
        <div class="card" style="padding:4px 16px">${li('/reyting', '🏆', 'Foydali reytingi')}${li('/oyinlar', '🎮', 'O‘yinlar', 'Flappy, Tetris, 2048')}${li('/yulduz', '⭐', 'Yulduz')}${li('/yangiliklar', '✨', 'Lahzam Updates')}${li('/sozlamalar', '⚙️', 'Sozlamalar')}</div>`); break;
    }
    case 'admrefresh': { ADM.st = null; await sync(true); render(); toast('Yangilandi ✅'); break; }
    case 'install': if (DEFER) doInstall(); else showInstall(true); break;
    case 'pushon': { try { localStorage.setItem('lahzam_push_asked', '1'); } catch (err) {} const r = await pushEnable(true); toast(r === 'ok' ? 'Bildirishnomalar yoqildi 🔔' : r === 'ios' ? 'iPhone’da avval Lahzam’ni ekranga o‘rnating 📲' : r === 'denied' ? 'Brauzer sozlamalarida Lahzam’ga ruxsat bering' : 'Bu brauzer push’ni qo‘llamaydi', r !== 'ok'); closeSheet(); render(); break; }
    case 'pushoff': { await pushDisable(); toast('Push o‘chirildi'); render(); break; }
    case 'pushlater': closeSheet(); break;
    case 'pushnever': try { localStorage.setItem('lahzam_push_never', '1'); } catch (err) {} closeSheet(); break;
    case 'inst-go': doInstall(); break;
    case 'inst-fab-x': FAB_OFF = true; instFab(); break;
    case 'inst-copy': { try { await navigator.clipboard.writeText(location.origin); toast('Havola nusxalandi'); } catch (err) { toast(location.origin); } break; }
    case 'inst-close': instDone(); closeSheet(); setTimeout(maybeAskPush, 800); break;
    case 'adm-hide': { if (!isAdmin()) break; const p = P(); if (!p) break; p.hidden = !p.hidden; render(); server({ t: 'hide', post: id }); break; }
    case 'adm-warn': { if (!isAdmin()) break; server({ t: 'warn', user: +el.dataset.u }, 'Ogohlantirish yuborildi'); break; }
    case 'adm-block': {
      if (!isAdmin()) break; const t = user(+el.dataset.u); if (!t || t.system || t.ghost || t.id === u.id) break;
      const r = await api('admin/users', { method: 'POST', body: { action: t.blocked ? 'unblock' : 'block', id: t.id } });
      if (r.status === 401) { ADM.verified = false; render(); break; }
      if (!r.ok) { toast(r.message || 'Serverda bajarilmadi', true); break; }
      toast(t.blocked ? 'Blokdan chiqarildi' : 'Bloklandi: Gmail ham bloklandi'); await sync(true); render(); break;
    }
    case 'adm-unban': { if (!isAdmin()) break; const r = await api('admin/users', { method: 'POST', body: { action: 'unban', email: el.dataset.e } }); if (!r.ok) { toast('Serverda bajarilmadi', true); break; } toast('Gmail blokdan chiqarildi'); await sync(true); render(); break; }
    case 'adm-del': {
      if (!isAdmin()) break; const t = user(+el.dataset.u); if (!t || t.system || t.ghost || t.id === u.id) break;
      if (!confirmInline(el, 'Rostdan? Yana bosing')) break;
      const r = await api('admin/users', { method: 'POST', body: { action: 'delete', id: t.id } });
      if (!r.ok) { toast(r.message || 'Serverda bajarilmadi', true); break; }
      toast(`@${t.u} o‘chirildi`); await sync(true);
      if (route()[0] === 'profile') go('/musoojon'); else render(); break;
    }
    case 'srv': {
      if (!isAdmin()) break; const a2 = el.dataset.a;
      if (a2 === 'delete' && !confirmInline(el, 'Rostdan? Yana bosing')) break;
      const r = await api('admin/users', { method: 'POST', body: { action: a2, id: +id } });
      if (r.status === 401) { ADM.verified = false; render(); break; }
      if (!r.ok) { toast(r.message || 'Serverda bajarilmadi', true); break; }
      toast(a2 === 'delete' ? 'O‘chirildi' : a2 === 'block' ? 'Bloklandi: Gmail ham bloklandi' : 'Blokdan chiqarildi'); await sync(true); render(); break;
    }
    case 'msgmenu': {
      const c = DB.chats.find(x => x.id === el.dataset.c), m = c && c.msgs.find(x => x.id === el.dataset.m); if (!m) break;
      const mine = m.uid === u.id, canDel = canDelMsg(c, m), plain = !m.game && !m.poll;
      const B = (act2, label, extra = '') => `<button class="btn ghost full" style="justify-content:flex-start;${extra}" data-act="${act2}" data-c="${c.id}" data-m="${m.id}">${label}</button>`;
      sheet(`<h2>Xabar</h2><p class="muted" style="margin:-6px 0 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(msgPreview(m))}</p><div class="stack" style="gap:8px">
        ${B('m-reply', '↩️ Javob berish')}${m.text ? B('m-copy', '📋 Nusxa olish') : ''}${mine && plain && m.text && !m.tmp ? B('m-edit', '✏️ Tahrirlash') : ''}
        ${!m.game && !m.tmp ? B('m-fwd', '↪️ Uzatish') : ''}${!m.game && !m.tmp && !isSaved(c) ? B('m-save', '🔖 Saqlash') : ''}${canPin(c) && !m.tmp ? B('m-pin', c.pin === m.id ? '📌 Qadashni olib tashlash' : '📌 Qadash') : ''}
        ${canDel ? B('delmsg', '🗑 O‘chirish', 'color:var(--danger)') : ''}</div>`);
      break;
    }
    case 'readers': {
      const c = DB.chats.find(x => x.id === el.dataset.c), m = c && c.msgs.find(x => x.id === el.dataset.m); if (!m) break;
      const r = readersOf(c, m).map(id => user(id)).filter(Boolean);
      sheet(`<h2>👁 O‘qiganlar (${r.length})</h2><div class="card" style="padding:4px 16px">${r.map(x => `<a href="/@${esc(x.u)}" data-link class="li">${avatar(x, 40)}<span style="flex:1"><b>${esc(x.name)}</b><span class="muted" style="display:block">${clock(c.read[x.id])} da o‘qidi</span></span></a>`).join('')}</div>`); break;
    }
    case 'm-reply': CH.reply = el.dataset.m; CH.edit = null; closeSheet(); render(); break;
    case 'm-edit': CH.edit = el.dataset.m; CH.reply = null; closeSheet(); render(); break;
    case 'cancelbar': CH.reply = null; CH.edit = null; render(); break;
    case 'm-copy': { const m = DB.chats.find(x => x.id === el.dataset.c).msgs.find(x => x.id === el.dataset.m); closeSheet(); try { await navigator.clipboard.writeText(m.text); toast('Nusxa olindi'); } catch (err) { toast('Nusxa olib bo‘lmadi', true); } break; }
    case 'm-pin': { const c = DB.chats.find(x => x.id === el.dataset.c); if (!c || !canPin(c)) break; const next = c.pin === el.dataset.m ? null : el.dataset.m; c.pin = next; closeSheet(); render(); server({ t: 'pin', chat: c.id, msg: next }, next ? 'Qadaldi 📌' : 'Olib tashlandi'); break; }
    case 'm-fwd': {
      const list = DB.chats.filter(x => x.members.includes(u.id));
      sheet(`<h2>Kimga uzatamiz?</h2><div class="card" style="padding:4px 16px">${list.map(x => `<button class="li" style="width:100%;text-align:left" data-act="fwdto" data-c="${el.dataset.c}" data-m="${el.dataset.m}" data-to="${x.id}">${chatAv(x, u, 40)}<b>${esc(chatName(x, u))}</b></button>`).join('')}</div>`);
      break;
    }
    case 'fwdto': {
      const to = DB.chats.find(x => x.id === el.dataset.to); if (!to || !guard('msg', 'uzatish')) break;
      closeSheet(); const r = await server({ t: 'fwd', msg: el.dataset.m, chat: to.id }, 'Uzatildi ↪️');
      if (r.ok) { await sync(true); go('/c/' + to.id); } break;
    }
    case 'jump': {
      if (CH.q) { CH.q = ''; CH.search = false; render(); }
      const t = document.getElementById('m-' + el.dataset.m); if (!t) { toast('Bu xabar o‘chirilgan'); break; }
      t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1400); return;
    }
    case 'chatsearch': CH.search = !CH.search; CH.q = ''; CH.srv = null; render(); break;
    case 'attach': sheet(`<h2>Biriktirish</h2><div class="stack" style="gap:8px">
        <button class="btn ghost full" style="justify-content:flex-start" data-act="pickimg">📷 Rasm yuborish</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="newpoll" data-id="${id}">📊 So‘rovnoma</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="sendflappy" data-id="${id}">🐤 Flappy o‘yini</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="sendtetris" data-id="${id}">🧱 Tetris</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="send2048" data-id="${id}">🔢 2048</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="sendmines" data-id="${id}">💣 Mina</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="sendxo" data-id="${id}">❌⭕ X/O (do‘stingiz bilan)</button>
        <button class="btn ghost full" style="justify-content:flex-start" data-act="stickers" data-id="${id}">🎨 Stikerlar</button>
        ${(DB.chats.find(x => x.id === id) || {}).type === 'group' ? `<button class="btn ghost full" style="justify-content:flex-start" data-act="tnew" data-id="${id}">🏁 Turnir boshlash</button>` : ''}
        <button class="btn ghost full" style="justify-content:flex-start" data-act="schedmsg" data-id="${id}">⏰ Keyinroq yuborish ${u.star ? '' : '<span class="tag" style="margin-left:auto">⭐ Yulduz</span>'}</button></div>`); break;
    case 'sendmines': { closeSheet(); const i = $('#msg-in'); i.value = '@mines'; i.form.requestSubmit(); break; }
    case 'sendxo': { closeSheet(); const i = $('#msg-in'); if (!i) break; i.value = '@xo'; i.form.requestSubmit(); break; }
    case 'xomove': {
      const c = DB.chats.find(x => x.id === el.dataset.c), m = c && c.msgs.find(x => x.id === el.dataset.m), i = +el.dataset.i; if (!m || !m.xo || m.xo.w || XOQ.busy) break;
      const G = m.xo, prev = JSON.stringify(G);
      if (G.t === 'o' && G.o == null) G.o = u.id;
      G.b = G.b.slice(0, i) + G.t + G.b.slice(i + 1); const r0 = XO.winner(G.b); G.w = r0 ? r0.w : null; G.t = G.t === 'x' ? 'o' : 'x';
      navigator.vibrate && navigator.vibrate(12); xoPatch(c, m); XOQ.busy = true;
      const r = await api('act', { method: 'POST', body: { t: 'xomove', msg: m.id, cell: i } }); XOQ.busy = false;
      if (r.ok && r.xo) m.xo = r.xo; else { m.xo = JSON.parse(prev); toast(r.message || 'Bo‘lmadi', true); }
      xoPatch(c, m); xoPoll(); if (m.xo.w) setTimeout(() => sync(true), 400); break;
    }
    case 'send2048': { closeSheet(); const i = $('#msg-in'); i.value = '@2048'; i.form.requestSubmit(); break; }
    case 'stickers': sheet(`<h2>Lahzam stikerlari 🎨</h2><div class="stk-grid">${Stickers.list.map(k => `<button class="stk-pick" data-act="sendstk" data-id="${id}" data-k="${k}" aria-label="${esc(Stickers.label(k))}">${Stickers.svg(k)}</button>`).join('')}</div>`); break;
    case 'sendstk': {
      const c = DB.chats.find(x => x.id === id), k = el.dataset.k; if (!c || !Stickers.list.includes(k) || !guard('msg', 'stiker')) break;
      closeSheet(); const body = `[s:${k}]`, replyTo = CH.reply && !String(CH.reply).startsWith('tmp') ? CH.reply : null; CH.reply = null;
      c.msgs.push({ id: 'tmp' + uid(), tmp: true, uid: u.id, text: body, t: now(), reacts: {}, ...(replyTo ? { replyTo } : {}) }); render();
      server({ t: 'msg', chat: c.id, body, replyTo }); break;
    }
    case 'pickimg': closeSheet(); $('#img-file') && $('#img-file').click(); break;
    case 'sendflappy': { closeSheet(); const i = $('#msg-in'); i.value = '@flappy'; i.form.requestSubmit(); break; }
    case 'sendtetris': { closeSheet(); const i = $('#msg-in'); i.value = '@tetris'; i.form.requestSubmit(); break; }
    case 'newpoll': sheet(`<h2>So‘rovnoma 📊</h2><form class="stack" data-form="poll" data-id="${id}">
        <div class="field"><label for="pq">Savol</label><input class="inp" id="pq" required maxlength="200" placeholder="Masalan: Shanba qayerda uchrashamiz?"></div>
        <div class="field"><span style="font-size:14px;font-weight:700">Variantlar</span>${[1, 2, 3, 4].map(i => `<input class="inp po" maxlength="80" ${i < 3 ? 'required' : ''} placeholder="${i}-variant${i > 2 ? ' (ixtiyoriy)' : ''}">`).join('')}</div>
        <button class="btn acc full">Yuborish</button></form>`); break;
    case 'vote': {
      const c = DB.chats.find(x => x.id === el.dataset.c), m = c && c.msgs.find(x => x.id === el.dataset.m), i = +el.dataset.i; if (!m || m.tmp) break;
      const had = m.poll.opts[i].v.includes(u.id);
      m.poll.opts.forEach(o => o.v = o.v.filter(x => x !== u.id)); if (!had) m.poll.opts[i].v.push(u.id);
      const y = window.scrollY; render(); window.scrollTo(0, y); server({ t: 'vote', msg: m.id, opt: i }); break;
    }
    case 'viewimg': { const m = DB.chats.find(x => x.id === el.dataset.c).msgs.find(x => x.id === el.dataset.m); sheet(`<img src="${esc(m.img)}" alt="Rasm" style="width:100%;border-radius:16px;display:block"><button class="btn ghost full" style="margin-top:10px" data-act="close-sheet-btn">Yopish</button>`); break; }
    case 'delmsg': {
      const c = DB.chats.find(x => x.id === el.dataset.c); if (!c) break;
      const m = c.msgs.find(x => x.id === el.dataset.m); if (!m || !canDelMsg(c, m)) break;
      if (!confirmInline(el, 'O‘chirilsinmi? ✓')) break;
      c.msgs = c.msgs.filter(x => x.id !== m.id); if (c.pin === m.id) c.pin = null; closeSheet(); render(); if (!m.tmp) server({ t: 'delmsg', msg: m.id }, 'Xabar o‘chirildi'); break;
    }
    case 'stab': SEARCH_TAB = el.dataset.v; render(); break;
    case 'fs': DB.fs = el.dataset.v; render(); break;
    case 'dmfrom': { const r = await api('auth/me', { method: 'PATCH', body: { dmFrom: el.dataset.v } }); if (r.user) { SESSION = r.user; DB.sess = SESSION; toast('Saqlandi'); } else toast('Saqlab bo‘lmadi', true); render(); break; }
    case 'notif': { const r = await api('auth/me', { method: 'PATCH', body: { notifOff: !(SESSION && SESSION.notifOff) } }); if (r.user) { SESSION = r.user; DB.sess = SESSION; } else toast('Saqlab bo‘lmadi', true); render(); break; }
    case 'rr': { const r = await api('auth/me', { method: 'PATCH', body: { rrOff: !(SESSION && SESSION.rrOff) } }); if (r.user) { SESSION = r.user; DB.sess = SESSION; } else toast('Saqlab bo‘lmadi', true); render(); break; }
    case 'sharelahzam': { const url = location.origin; try { if (navigator.share) await navigator.share({ title: 'Lahzam', text: 'Lahzam — Har lahza yoningizda! Qo‘shil:', url }); else { await navigator.clipboard.writeText(url); toast('Havola nusxalandi 💌'); } } catch (err) {} break; }
    case 'lbtab': LB_TAB = el.dataset.v; render(); break;
    case 'delupdate': {
      if (!isAdmin() || !confirmInline(el, 'O‘chirilsinmi? Yana bosing')) break;
      const r = await api('updates', { method: 'DELETE', body: { id: +id } });
      if (r.status === 401) { ADM.verified = false; render(); break; }
      if (!r.ok) { toast('O‘chirib bo‘lmadi', true); break; }
      UPD.list = UPD.list.filter(x => x.id !== +id); toast('O‘chirildi'); render(); break;
    }
    case 'qall': sheet(qSheet()); break;
    case 'hometab': HOMETAB = id; render(); break;
    case 'sughide': { let h = []; try { h = JSON.parse(localStorage.getItem('lahzam_sug_hide') || '[]'); } catch (err) {} h.push(+id); try { localStorage.setItem('lahzam_sug_hide', JSON.stringify(h.slice(-200))); } catch (err) {} render(); break; }
    case 'tagfollow': { if (!SESSION) return go('/kirish'); const cur = SESSION.tags || [], on = cur.includes(id); SESSION.tags = on ? cur.filter(x => x !== id) : [...cur, id]; render(); toast(on ? 'Teg kuzatilmaydi' : `🏷 #${id} kuzatilmoqda — bosh sahifada “Teglarim”da chiqadi`);
      const r = await api('act', { method: 'POST', body: { t: 'tagfollow', tag: id } }); if (r.ok) SESSION.tags = r.tags; else { SESSION.tags = cur; toast(r.message || 'Bo‘lmadi', true); render(); } break; }
    case 'pvote': { if (!u) return go('/kirish'); const p = P(); if (!p || !p.poll) break; const i = +el.dataset.i, had = p.poll.opts[i].v.includes(u.id);
      p.poll.opts.forEach(o => { const j = o.v.indexOf(u.id); if (j > -1) o.v.splice(j, 1); }); if (!had) p.poll.opts[i].v.push(u.id);
      navigator.vibrate && navigator.vibrate(10); render(); server({ t: 'pvote', post: id, opt: i }); break; }
    case 'cmppoll': { const ta = $('#post-text'); if (ta) DRAFT_KEEP = ta.value; CMP.poll = CMP.poll ? null : { q: '', opts: ['', ''] }; render(); break; }
    case 'ppadd': { CMP.poll.q = $('#pp-q').value; CMP.poll.opts = [...document.querySelectorAll('.pp-o')].map(x => x.value); CMP.poll.opts.push(''); const ta = $('#post-text'); if (ta) DRAFT_KEEP = ta.value; render(); break; }
    case 'cmpunquote': CMP.quote = null; render(); break;
    case 'quotepost': { closeSheet(); CMP.quote = id; if (route()[0] !== 'home') go('/'); else render(); setTimeout(() => { const ta = $('#post-text'); if (ta) { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); ta.focus(); } }, 80); break; }
    case 'cmpsched': { if (CMP.at) { CMP.at = null; render(); break; } const d = new Date(Date.now() + 3600e3); const v = new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
      sheet(`<h2>⏰ Postni rejalashtirish</h2><form class="stack" data-form="psched"><input class="inp" type="datetime-local" id="ps-at" value="${v}" required><p class="muted" style="margin:0;font-size:13px">Post shu vaqtda hammaga ko‘rinadi. Ungacha faqat siz ko‘rasiz.</p><button class="btn acc full">Tanlash</button></form>`); break; }
    case 'proflink': { const url = location.origin + '/@' + u.u;
      sheet(`<h2>🔗 Profil havolangiz</h2><div class="plink" style="--pc:${u.color || '#FF5A1F'}">${avatar(u, 64)}<b>${esc(u.name)}</b><span>@${esc(u.u)}</span><code>${esc(url.replace(/^https?:\/\//, ''))}</code></div>
        <div class="stack" style="gap:8px;margin-top:12px"><button class="btn acc full" data-act="copy" data-text="${esc(url)}">📋 Havolani nusxalash</button><button class="btn ghost full" data-act="shareprof">📤 Ulashish</button>
        <p class="muted" style="margin:0;font-size:13px;text-align:center">Instagram, Telegram bio yoki istalgan joyga qo‘ying: bosgan odam profilingizni ko‘radi va Lahzam’ga qo‘shiladi ✨</p></div>`); break; }
    case 'shareprof': { const url = location.origin + '/@' + u.u; try { if (navigator.share) await navigator.share({ title: u.name + ' · Lahzam', text: 'Meni Lahzam’da kuzating 👋', url }); else { await navigator.clipboard.writeText(url); toast('Havola nusxalandi 💌'); } } catch (err) {} break; }
    case 'mute': { const c = DB.chats.find(x => x.id === id); if (!c) break; c.muted = !c.muted; render(); toast(c.muted ? '🔕 Bildirishnomalar o‘chirildi' : '🔔 Bildirishnomalar yoqildi'); server({ t: 'mute', chat: id, on: c.muted }); break; }
    case 'lzopen': { LZ.q = lzGroups(); LZ.ui = Math.max(0, LZ.q.findIndex(g => g.uid === +id || String(g.uid) === id)); const g = LZ.q[LZ.ui]; LZ.pi = Math.max(0, g ? g.ps.findIndex(p => !LZ.seen.has(p.id)) : 0); lzShow(); break; }
    case 'lznext': lzNext(); break;
    case 'lzprev': lzPrev(); break;
    case 'lzclose': lzClose(); break;
    case 'lzgo': lzClose(); go(el.dataset.href); break;
    case 'lzlike': { const p = DB.posts.find(x => x.id === id); if (!p) break; const i = p.likes.indexOf(u.id); if (i >= 0) p.likes.splice(i, 1); else { p.likes.push(u.id); navigator.vibrate && navigator.vibrate(15); } el.className = 'lz-like' + (i < 0 ? ' on' : ''); el.textContent = `${i < 0 ? '❤️' : '🤍'} ${p.likes.length || ''}`; server({ t: 'like', post: id }); break; }
    case 'lzadd': {
      { const lim = u.star ? 8 : 1, n = DB.posts.filter(p => p.uid === u.id && p.lahza && now() - p.t < DAY).length;
        if (n >= lim) { if (u.star) toast('Bugun 8 ta Lahza joyladingiz — ertaga yana ✨', true); else sheet(`<h2>⏳ Bugungi Lahza joylandi</h2><p class="muted" style="margin:0 0 14px">Oddiy akkauntda kuniga <b>1 ta</b> Lahza joylash mumkin. ⭐ Yulduz a’zolari kuniga <b>8 tagacha</b> Lahza joylaydi.</p><a href="/yulduz" data-link class="btn acc full">⭐ Yulduz haqida</a><button class="btn ghost full" style="margin-top:8px" data-act="close-sheet-btn">Keyinroq</button>`); break; } } const lz = $('#post-lahza'), ta = $('#post-text'); if (lz && !lz.checked) { lz.checked = true; lz.dispatchEvent(new Event('change', { bubbles: true })); } if (ta) { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); ta.focus(); ta.placeholder = '⏳ 24 soatlik lahzangizni yozing yoki rasm qo‘shing…'; } break; }
    case 'glbtab': GLB.tab = id; render(); break;
    case 'glbgame': GLB.g = id; render(); break;
    case 'qedit': sheet(`<h2>Kun savolini o‘zgartirish ✏️</h2><form class="stack" data-form="qset"><textarea class="inp" id="qs-t" maxlength="160" style="height:110px;padding:12px 16px" placeholder="Bugungi savol…">${esc(qText())}</textarea><p class="muted" style="margin:0;font-size:13px">Faqat bugungi savol o‘zgaradi. Bo‘sh qoldirsangiz, avtomatik savol qaytadi.</p><button class="btn full">Saqlash</button></form>`); break;
    case 'qlike': { const a = (DB.daily || []).find(x => x.id === el.dataset.id); if (a) { a.liked = !a.liked; a.likes = (a.likes || 0) + (a.liked ? 1 : -1); if ($('#modal-root .sheet')) sheet(qSheet()); } api('act', { method: 'POST', body: { t: 'qlike', id: el.dataset.id } }).then(() => sync(true)); break; }
    case 'qdel': { DB.daily = (DB.daily || []).filter(x => x.id !== el.dataset.id); closeSheet(); render(); server({ t: 'qdel', id: el.dataset.id }); break; }
    case 'cd-ins': { const ta = $('#post-text'); if (!ta) break; const v = el.dataset.v, pre = ta.value && !/\s$/.test(ta.value) ? ' ' : ''; ta.value += pre + v; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.dispatchEvent(new Event('input', { bubbles: true })); break; }
    case 'postimg-x': POSTIMG = null; $('#post-prev').innerHTML = ''; break;
    case 'viewpimg': { const p = P(); if (p && p.img) sheet(`<img src="${esc(p.img)}" alt="Post rasmi" style="width:100%;border-radius:16px;display:block"><button class="btn ghost full" style="margin-top:10px" data-act="close-sheet-btn">Yopish</button>`); break; }
    case 'follist': {
      const pid = +id, isFl = el.dataset.v === 'fl', ids = isFl ? followers(pid) : following(pid), who = user(pid);
      const list = ids.map(user).filter(x => x && !x.ghost && !x.blocked);
      sheet(`<h2>${isFl ? 'Kuzatuvchilar' : 'Kuzatmoqda'} · ${list.length}</h2><p class="muted" style="margin:-6px 0 10px">@${esc(who.u)}</p><div class="card" style="padding:4px 16px">${list.map(x => `<div class="li"><a href="/@${esc(x.u)}" data-link class="row" style="flex:1;text-decoration:none;min-width:0">${avatar(x, 42)}<span style="min-width:0"><b>${esc(x.name)}</b>${founderPill(x)}<span class="muted" style="display:block">@${esc(x.u)}</span></span></a>${u && x.id !== u.id && !x.system ? `<button class="btn ${isFollowing(u.id, x.id) ? 'ghost' : 'ink'}" style="height:36px;font-size:13px;border-radius:999px" data-act="follow" data-id="${x.id}">${isFollowing(u.id, x.id) ? 'Kuzatilmoqda' : 'Kuzatish'}</button>` : ''}</div>`).join('') || `<p class="muted">${isFl ? 'Hali hech kim kuzatmayapti.' : 'Hali hech kimni kuzatmayapti.'}</p>`}</div>`);
      break;
    }
    case 'replyto': { const p = P(), r = p && p.replies.find(x => x.id === el.dataset.r); if (!r) break; RTO = { post: p.id, id: r.id, uid: r.uid, text: r.text }; render(); const t = $('#reply-text'); if (t) { t.focus(); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } break; }
    case 'replyto-x': RTO = null; render(); break;
    case 'jumpr': { const t = document.getElementById('r-' + el.dataset.r); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1400); } return; }
    case 'close-sheet-btn': closeSheet(); break;
  }
  save();
});
function confirmInline(el, msg) { if (el.dataset.sure) return true; el.dataset.sure = '1'; el.textContent = msg; setTimeout(() => delete el.dataset.sure, 4000); return false; }
function loadQR(url) {
  const drawQR = () => { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); const box = $('#qr-box'); if (box) box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }).replace('<svg', '<svg style="width:220px;height:220px" role="img" aria-label="Profil QR kodi"'); };
  if (window.qrcode) return drawQR();
  const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  s.onload = drawQR; s.onerror = () => { const b = $('#qr-box'); if (b) b.textContent = 'QR kodni yuklab bo‘lmadi. Havolani nusxalang.'; };
  document.head.appendChild(s);
}

document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const kind = f.dataset.form, u = me();
  if (kind === 'phrase') {
    const ph1 = $('#ph1').value, ph2 = $('#ph2') ? $('#ph2').value : undefined, btn = f.querySelector('button.btn');
    if (ph2 !== undefined && ph1 !== ph2) { $('#ph-hint').textContent = 'Ikkala fraza bir xil emas'; return; }
    btn.disabled = true;
    const r = await api('admin/2fa', { method: 'POST', body: { phrase: ph1, confirm: ph2 } });
    btn.disabled = false;
    if (!r.ok) { $('#ph-hint').textContent = r.message || 'Bo‘lmadi'; $('#ph1').value = ''; return; }
    ADM = { checked: true, configured: true, verified: true }; render(); toast('Admin panel ochildi 🔓'); return;
  }
  if (kind === 'poll') {
    const c = DB.chats.find(x => x.id === f.dataset.id); if (!c || !c.members.includes(u.id)) return;
    const q = $('#pq').value.trim(), opts = [...f.querySelectorAll('.po')].map(i => i.value.trim()).filter(Boolean);
    if (!q || opts.length < 2) { toast('Savol va kamida 2 ta variant yozing', true); return; }
    if (!guard('msg', q)) return save();
    c.msgs.push({ id: 'tmp' + uid(), tmp: true, uid: u.id, text: '', poll: { q, opts: opts.map(t => ({ t, v: [] })) }, t: now(), reacts: {} });
    closeSheet(); render(); server({ t: 'msg', chat: c.id, poll: { q, opts } }); return;
  }
  if (kind === 'update') {
    const btn = f.querySelector('button.btn'); btn.disabled = true;
    const r = await api('updates', { method: 'POST', body: { title: $('#up-t').value, body: $('#up-b').value } });
    btn.disabled = false;
    if (r.status === 401) { ADM.verified = false; go('/musoojon'); return; }
    if (!r.update) { toast(r.message || 'E‘lon qilib bo‘lmadi', true); return; }
    UPD.list = [r.update, ...(UPD.list || [])]; render(); toast('E‘lon qilindi 🎉'); return;
  }
  if (kind === 'signup') {
    const un = $('#un').value.trim(), nm = $('#nm').value.trim(), pw = $('#pw') ? $('#pw').value : '';
    const btn = $('#su-btn'); btn.disabled = true;
    if (!$('#agree2').checked) { $('#su-hint').textContent = 'Avval 13 yoshdan kattaligingizni va shartlarga rozilikni belgilang'; btn.disabled = false; return; }
    const r = await api('auth/signup', { method: 'POST', body: { ticket: AUTH.ticket, username: un, name: nm, password: pw, agree: true } });
    if (!r.user) { btn.disabled = false; $('#su-hint').textContent = r.message || 'Ro‘yxatdan o‘tib bo‘lmadi'; if (r.error === 'ticket') { AUTH = { step: 'start' }; render(); } return; }
    adoptSession(r.user); AUTH = { step: 'start' };
    save(); go('/'); toast('Xush kelibsiz 👋 Har lahza yoningizda!'); sync(true); return;
  }
  if (kind === 'editpost') {
    const p = DB.posts.find(x => x.id === f.dataset.id || x.id === 'p' + f.dataset.id), t = $('#ep-t').value.trim(); if (!p || !t) return;
    const r = await server({ t: 'editpost', post: p.id, body: t }, 'Saqlandi ✅'); if (r.ok) { p.text = t; p.edited = true; closeSheet(); render(); } return;
  }
  if (kind === 'tnew') {
    const game = (f.querySelector('input[name=tg]:checked') || {}).value, mins = +(f.querySelector('input[name=tm]:checked') || {}).value;
    const r = await server({ t: 'tstart', chat: f.dataset.id, game, mins }, 'Turnir boshlandi! 🏁'); if (r.ok) { closeSheet(); await sync(true); render(); } return;
  }
  if (kind === 'qans') {
    const v = $('#q-in').value.trim(); if (v.length < 2) return toast('Javob juda qisqa');
    DB.daily = [{ id: 'qtmp', uid: u.id, text: v, t: now(), likes: 0 }, ...(DB.daily || [])]; render();
    server({ t: 'qans', text: v }, 'Javobingiz qo‘shildi ✨'); return;
  }
  if (kind === 'qset') {
    const v = $('#qs-t').value.trim(); if (v && v.length < 5) return toast('Savol juda qisqa');
    DB.dq = v || null; closeSheet(); render(); server({ t: 'qset', text: v }, 'Kun savoli yangilandi ✨'); return;
  }
  if (kind === 'psched') {
    const t = new Date($('#ps-at').value).getTime(); if (!(t > now() + 60e3)) return toast('Kamida 1 daqiqa keyingi vaqtni tanlang', true);
    const ta = $('#post-text'); if (ta) DRAFT_KEEP = ta.value; CMP.at = t; closeSheet(); render(); return;
  }
  if (kind === 'sched') {
    const c = DB.chats.find(x => x.id === f.dataset.id), text = $('#sc-t').value.trim(), ts = new Date($('#sc-d').value).getTime(), h = $('#sc-h');
    if (!c || !text) return; if (!(ts > Date.now() + 50e3)) { h.textContent = '❌ Kelajakdagi vaqtni tanlang'; return; }
    const r = await api('act', { method: 'POST', body: { t: 'msg', chat: c.id, body: text, at: ts } });
    if (!r.ok) { h.textContent = '❌ ' + (r.message || 'Bo‘lmadi'); return; }
    closeSheet(); const mi = $('#msg-in'); if (mi) mi.value = ''; toast(`⏰ ${clock(ts)} da yuboriladi`); await sync(true); render(); return;
  }
  if (kind === 'chun') {
    const v = $('#cu').value.trim().toLowerCase(), h = $('#cu-h'); if (v === me().u) { closeSheet(); return; }
    const [msg, ok] = checkUsername(v, true); if (!ok) { h.textContent = '❌ ' + msg; h.className = 'hint bad shake'; return; }
    const r = await patchMe({ username: v }); if (r.user) { closeSheet(); toast(`Endi siz @${v} ✅`); go('/@' + v); } else { h.textContent = '❌ ' + (r.message || 'Bo‘lmadi'); h.className = 'hint bad shake'; }
    return;
  }
  if (kind === 'delme') {
    const h = $('#dm-h'), v = $('#dm-c').value.trim().toLowerCase(); h.classList.remove('shake');
    if (v !== me().u) { h.textContent = '❌ Username mos kelmadi'; void h.offsetWidth; h.classList.add('shake'); return; }
    const r = await api('act', { method: 'POST', body: { t: 'deleteme', confirm: v } });
    if (!r.ok) { h.textContent = '❌ ' + (r.message || 'O‘chirib bo‘lmadi'); void h.offsetWidth; h.classList.add('shake'); return; }
    try { localStorage.setItem('lahzam_noauto', '1'); } catch (e) {}
    $('#modal-root').innerHTML = ''; adoptSession(null); AUTH = { step: 'start' }; save(); go('/kirish'); toast('Akkauntingiz o‘chirildi. Xayr 👋'); return;
  }
  if (kind === 'login') {
    const btn = f.querySelector('button.btn.acc, button[type=submit], button:not([type=button])'), hint = $('#li-hint'), old = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Tekshirilmoqda…'; } hint.classList.remove('shake');
    const r = await api('auth/login', { method: 'POST', body: { username: $('#lu').value.trim(), password: $('#lp').value } });
    if (btn) { btn.disabled = false; btn.textContent = old; }
    if (!r.user) {
      // har safar xato bo'lganda yozuv silkinadi: foydalanuvchi sayt qotib qolgan deb o'ylamasin
      hint.textContent = '❌ ' + (r.message || 'Kirib bo‘lmadi'); void hint.offsetWidth; hint.classList.add('shake');
      $('#lp').classList.add('inp-bad'); $('#lp').select(); if (navigator.vibrate) navigator.vibrate(120); return;
    }
    adoptSession(r.user); AUTH = { step: 'start' }; save(); go('/'); sync(true); return;
  }
  if (kind === 'post') {
    const ta = $('#post-text'), text = ta.value, img = POSTIMG;
    let poll = null;
    if (CMP.poll) { const q = $('#pp-q').value.trim(), opts = [...document.querySelectorAll('.pp-o')].map(x => x.value.trim()).filter(Boolean); if (!q || opts.length < 2) return toast('So‘rovnomaga savol va kamida 2 variant yozing', true); poll = { q, opts }; }
    const quote = CMP.quote, at = CMP.at;
    if (/(^|[^\w])@everyone(?![\w])/i.test(text) && !isOwnerSession()) return toast('Ochiq maydonda @everyone faqat Lahzam jamoasi uchun', true);
    if (!guard('post', text.trim() || (img ? 'rasm' : '') || (poll ? poll.q : '') || (quote ? 'iqtibos' : ''))) return save();
    const lahza = $('#post-lahza').checked, tmp = { id: 'tmp' + uid(), uid: u.id, text: text.trim(), img, t: at || now(), lahza, likes: [], views: 1, seen: true, replies: [], quote: quote || undefined, sched: at || undefined, poll: poll ? { q: poll.q, opts: poll.opts.map(t => ({ t, v: [] })) } : undefined };
    DB.posts.unshift(tmp); ta.value = ''; POSTIMG = null; CMP.poll = null; CMP.quote = null; CMP.at = null; render(); toast(at ? '⏰ Rejalashtirildi' : img ? 'Rasm yuklanmoqda…' : 'Joylandi ✅');
    const r = await server({ t: 'post', body: tmp.text, lahza, img, poll, quote, at }, img ? 'Joylandi ✅' : '');
    if (!r.ok) { DB.posts = DB.posts.filter(x => x !== tmp); render(); }
    return;
  }
  if (kind === 'reply') {
    const p = DB.posts.find(x => x.id === f.dataset.id), ta = $('#reply-text'), text = ta.value; if (!p) return;
    if (!guard('reply', text)) return save();
    const parent = RTO && RTO.post === p.id ? RTO.id : undefined; RTO = null;
    p.replies.push({ id: 'tmp' + uid(), uid: u.id, text: text.trim(), t: now(), parent });
    render(); server({ t: 'reply', post: p.id, body: text.trim(), parent }); return;
  }
  if (kind === 'msg') {
    const c = DB.chats.find(x => x.id === f.dataset.id), inp = $('#msg-in'), text = inp.value; if (!c) return;
    if (CH.edit) {
      const m = c.msgs.find(x => x.id === CH.edit); CH.edit = null;
      if (m && m.uid === u.id && text.trim() && text.trim().length <= LIMIT.msg && m.text !== text.trim()) { m.text = text.trim(); m.edited = true; server({ t: 'edit', msg: m.id, body: m.text }, 'Tahrirlandi'); }
      render(); return;
    }
    if (!c.members.includes(u.id)) { toast('Yozish uchun guruhga qo‘shiling', true); return; }
    if (!guard('msg', text)) return save();
    if (c.type === 'group' && /(^|[^\w])@everyone(?![\w])/i.test(text) && !(isAdmin() || c.admin === u.id)) { toast('Faqat guruh admini @everyone ishlata oladi', true); return; }
    const isXo = /@xo(?!\w)/i.test(text), game = !isXo && /@(flappy|tetris|2048|mines)(?!\w)/i.test(text), replyTo = CH.reply && !String(CH.reply).startsWith('tmp') ? CH.reply : null;
    c.msgs.push({ id: 'tmp' + uid(), tmp: true, uid: u.id, text: text.trim(), t: now(), reacts: {}, game, ...(isXo ? { xo: { x: u.id, o: null, b: '.........', t: 'x', w: null } } : {}), ...(replyTo ? { replyTo } : {}) });
    CH.reply = null; inp.value = '';
    render(); setTimeout(() => $('#msg-in') && $('#msg-in').focus(), 0);
    server({ t: 'msg', chat: c.id, body: text.trim(), replyTo }); return;
  }
  if (kind === 'profile') {
    const tg = u; if (!tg) return;
    const name = $('#pn').value.trim() || tg.name, bio = $('#pb').value.replace(/\n{2,}/g, '\n').trim();
    { const bp = bio !== (tg.bio || '') && bioProblem(bio), h = $('#pb-h'); if (bp) { h.textContent = '❌ ' + bp; h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake'); return; } }
    const c = f.querySelector('input[name=pc]:checked'), color = c ? c.value : tg.color;
    const btn = f.querySelector('button.btn.acc'); btn.disabled = true; btn.textContent = 'Saqlanmoqda…';
    const body = { name, bio, color }; if (PHOTO !== undefined) body.photo = PHOTO || null;
    const r = await api('auth/me', { method: 'PATCH', body });
    if (!r.user) { btn.disabled = false; btn.textContent = 'Saqlash'; toast(r.message || 'Saqlab bo‘lmadi', true); return; }
    SESSION = r.user; DB.sess = SESSION;
    Object.assign(tg, { name, bio, color }); if (PHOTO !== undefined) tg.photo = PHOTO || null;
    PHOTO = undefined;
    closeSheet(); render(); toast('Saqlandi ✅'); sync(true); return;
  }
  if (kind === 'group') {
    const name = $('#gn').value.trim(); if (!name) return;
    const btn = f.querySelector('button.btn.acc'); btn.disabled = true;
    const r = await server({ t: 'group', name, desc: $('#gd').value.trim(), cat: $('#gc').value, access: f.querySelector('.seg .on').dataset.v });
    btn.disabled = false;
    if (r.chat) { closeSheet(); await sync(true); go('/c/' + r.chat); }
    return;
  }
});

let POSTIMG = null; // postga tanlangan rasm (siqilgan)
let PHOTO; // undefined: o'zgarmagan, null: olib tashlandi, string: yangi rasm
document.addEventListener('change', async e => {
  if (e.target.id === 'img-file') {
    const file = e.target.files[0], f = e.target.form; e.target.value = ''; if (!file || !f) return;
    if (!/^image\//.test(file.type)) { toast('Faqat rasm tanlang', true); return; }
    const c = DB.chats.find(x => x.id === f.dataset.id), u = me(), cap = $('#msg-in').value.trim();
    if (!guard('msg', cap || 'rasm')) return save();
    let img; try { img = await compressImage(file); } catch (err) { toast('Rasmni ochib bo‘lmadi', true); return; }
    const replyTo = CH.reply && !String(CH.reply).startsWith('tmp') ? CH.reply : null;
    c.msgs.push({ id: 'tmp' + uid(), tmp: true, uid: u.id, text: cap, img, t: now(), reacts: {} });
    CH.reply = null; $('#msg-in').value = ''; render(); toast('Rasm yuborilmoqda…');
    const r = await server({ t: 'msg', chat: c.id, img, body: cap, replyTo });
    if (r.ok) toast('Rasm yuborildi 📷'); return;
  }
  if (e.target.id === 'post-img') {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Faqat rasm tanlang', true); return; }
    try { POSTIMG = await compressImage(file); } catch (err) { toast('Rasmni ochib bo‘lmadi', true); return; }
    const pv = $('#post-prev'); if (pv) pv.innerHTML = `<div class="pprev"><img src="${POSTIMG}" alt="Tanlangan rasm"><button type="button" data-act="postimg-x" aria-label="Rasmni olib tashlash">✕</button></div>`;
    return;
  }
  if (e.target.id !== 'ph-file') return;
  const file = e.target.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Faqat rasm fayli tanlang', true); return; }
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
    PHOTO = c.toDataURL('image/jpeg', 0.82); URL.revokeObjectURL(url);
    const pv = $('#ph-prev'); if (pv) pv.innerHTML = `<span class="av" style="width:64px;height:64px"><img src="${PHOTO}" alt="" style="width:100%;height:100%;object-fit:cover"></span>`;
  };
  img.onerror = () => toast('Rasmni ochib bo‘lmadi', true);
  img.src = url;
});

SESSION = DB.sess || null;
if (!SESSION) { DB.me = null; loadGsi(); }
/* ---------- Ilovani o'rnatish (Android, iPhone/iPad, Mac, Windows) ---------- */
const UA = navigator.userAgent, IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(UA), MAC = /Macintosh/.test(UA) && !IOS, INAPP = /Telegram|FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|wv\)/i.test(UA);
const SAFARI = /Safari/.test(UA) && !/Chrome|CriOS|FxiOS|EdgiOS|Edg\/|OPR|SamsungBrowser/.test(UA), FIREFOX = /Firefox|FxiOS/.test(UA), SAMSUNG = /SamsungBrowser/.test(UA);
const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
let DEFER = null;
// Android/Chrome: brauzer "o'rnatish mumkin" deganda haqiqiy O'rnatish tugmasi chiqadi
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); DEFER = e; instFab();
  if (document.querySelector('.inst-sheet')) showInstall(true); else if (!instSeen()) showInstall(false);
});
addEventListener('appinstalled', () => { instDone(); DEFER = null; instFab(); if (document.querySelector('.inst-sheet')) closeSheet(); toast('Lahzam o‘rnatildi 🎉'); setTimeout(maybeAskPush, 1500); });
let FAB_OFF = false;
function instFab() {
  let b = document.getElementById('inst-fab');
  if (!DEFER || standalone() || FAB_OFF) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div'); b.id = 'inst-fab';
  b.innerHTML = `<button class="inst-fab-go" data-act="inst-go">📲 Lahzam’ni o‘rnatish</button><button class="inst-fab-x" data-act="inst-fab-x" aria-label="Yopish">✕</button>`;
  document.body.appendChild(b);
}
async function doInstall() {
  if (!DEFER) { showInstall(true); return; }
  const d = DEFER; DEFER = null; instFab(); d.prompt();
  const ch = await d.userChoice.catch(() => ({}));
  if (ch.outcome === 'accepted') { instDone(); closeSheet(); toast('Lahzam o‘rnatilmoqda 📲'); }
  else { closeSheet(); toast('Keyinroq Sozlamalar → “Ilovani o‘rnatish”dan o‘rnatsangiz bo‘ladi'); }
}
const instKey = 'lahzam_install_seen';
function instDone() { try { localStorage.setItem(instKey, '1'); } catch (e) {} }
const instSeen = () => { try { return localStorage.getItem(instKey) === '1'; } catch (e) { return true; } };
const stp = (n, html) => `<li><span class="inst-n">${n}</span><span>${html}</span></li>`;
function installSteps() {
  if (DEFER) return `<button class="btn acc full inst-big" data-act="inst-go">📲 O‘rnatish</button><p class="muted" style="text-align:center;margin:8px 0 0">Bir bosishda telefon yoki kompyuteringizga o‘rnatiladi</p>`;
  const shareIco = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  if (IOS && INAPP) return `<ol class="inst-steps">${stp(1, 'Bu oyna Telegram/Instagram ichida ochilgan, bu yerdan o‘rnatib bo‘lmaydi')}${stp(2, 'Pastdagi tugma bilan havolani nusxalang')}${stp(3, '<b>Safari</b>’ni ochib, havolani joylashtiring va shu oynani qayta oching')}</ol><button class="btn ghost full" data-act="inst-copy">📋 Havolani nusxalash</button>`;
  if (IOS) return `<ol class="inst-steps">${stp(1, `${/CriOS|EdgiOS|FxiOS/.test(UA) ? 'Manzil qatoridagi' : 'Pastdagi'} <b>Ulashish</b> ${shareIco} tugmasini bosing`)}${stp(2, 'Ro‘yxatni pastga surib, <b>“Bosh ekranga qo‘shish”</b> (Add to Home Screen) ni tanlang')}${stp(3, 'Yuqori o‘ng burchakdagi <b>“Qo‘shish”</b> (Add) ni bosing')}</ol>`;
  if (ANDROID && INAPP) return `<ol class="inst-steps">${stp(1, 'Yuqoridagi <b>⋮</b> menyuni bosing')}${stp(2, '<b>“Brauzerda ochish”</b> (Open in Chrome) ni tanlang')}${stp(3, 'Chrome’da shu oyna yana chiqadi, <b>O‘rnatish</b>ni bosing')}</ol><button class="btn ghost full" data-act="inst-copy">📋 Havolani nusxalash</button>`;
  if (ANDROID && SAMSUNG) return `<ol class="inst-steps">${stp(1, 'Pastdagi <b>☰</b> menyuni bosing')}${stp(2, '<b>“Sahifani qo‘shish”</b> → <b>“Bosh ekran”</b> ni tanlang')}${stp(3, '<b>“Qo‘shish”</b> ni bosing')}</ol>`;
  if (ANDROID && FIREFOX) return `<ol class="inst-steps">${stp(1, 'Yuqoridagi <b>⋮</b> menyuni bosing')}${stp(2, '<b>“O‘rnatish”</b> (Install) ni tanlang')}${stp(3, '<b>“Qo‘shish”</b> ni bosing')}</ol>`;
  if (ANDROID) return `<ol class="inst-steps">${stp(1, 'Yuqori o‘ngdagi <b>⋮</b> menyuni bosing')}${stp(2, '<b>“Ilovani o‘rnatish”</b> yoki <b>“Bosh ekranga qo‘shish”</b> ni tanlang')}${stp(3, '<b>“O‘rnatish”</b> ni bosing')}</ol>`;
  if (MAC && SAFARI) return `<ol class="inst-steps">${stp(1, 'Yuqoridagi menyudan <b>Fayl</b> (File) ni oching')}${stp(2, '<b>“Dock’ga qo‘shish”</b> (Add to Dock) ni tanlang')}${stp(3, '<b>“Qo‘shish”</b> ni bosing. Lahzam Dock’da paydo bo‘ladi')}</ol>`;
  if (FIREFOX) return `<ol class="inst-steps">${stp(1, 'Firefox kompyuterda ilova o‘rnatishni qo‘llamaydi')}${stp(2, 'Lahzam’ni <b>Chrome</b> yoki <b>Edge</b>’da oching')}${stp(3, 'Manzil qatoridagi <b>⊕ O‘rnatish</b> belgisini bosing')}</ol><button class="btn ghost full" data-act="inst-copy">📋 Havolani nusxalash</button>`;
  return `<ol class="inst-steps">${stp(1, 'Manzil qatorining o‘ng tomonidagi <b>⊕ O‘rnatish</b> belgisini bosing')}${stp(2, 'Ko‘rinmasa: <b>⋮</b> menyu → <b>“Lahzam’ni o‘rnatish”</b> (Edge’da: Ilovalar → O‘rnatish)')}${stp(3, '<b>“O‘rnatish”</b> ni bosing')}</ol>`;
}
function showInstall(force) {
  if (standalone()) { if (force) toast('Lahzam allaqachon o‘rnatilgan ✅'); return; }
  if (!force && (instSeen() || $('#modal-root').innerHTML)) return;
  sheet(`<div class="inst-sheet"><div class="inst-hero">${I.logo('#FF5A1F', '#121212', 56)}<div><b>Lahzam’ni o‘rnating</b><span>Telegram kabi alohida ilova: tez ochiladi, xabarlar telefonga keladi 🔔</span></div></div>
    ${installSteps()}<button class="btn ghost full" style="margin-top:10px" data-act="inst-close">${DEFER ? 'Keyinroq' : 'Tushunarli'}</button></div>`);
  if (!force) instDone(); // faqat bir marta o'zi chiqadi; keyin Sozlamalar → "Ilovani o'rnatish"
}
/* ---------- Push bildirishnomalar ---------- */
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function pushState() { if (IOS && !standalone()) return 'ios'; if (!PUSH_OK) return 'no'; let v = null; try { v = localStorage.getItem('lahzam_push'); } catch (e) {} return Notification.permission === 'granted' && v === '1' ? 'on' : 'off'; }
const u8 = b64 => { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function pushEnable(ask) {
  if (IOS && !standalone()) return 'ios'; if (!PUSH_OK) return 'no';
  let perm = Notification.permission; if (perm === 'default' && ask) perm = await Notification.requestPermission();
  try { localStorage.setItem('lahzam_push_asked', '1'); } catch (e) {}
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  try {
    const cfg = await api('auth/config'); if (!cfg.vapid) return 'no';
    const reg = await navigator.serviceWorker.ready, key = u8(cfg.vapid); let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).join() !== key.join()) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const r = await api('act', { method: 'POST', body: { t: 'pushsub', sub: sub.toJSON() } }); if (!r.ok) return 'no';
    try { localStorage.setItem('lahzam_push', '1'); } catch (e) {} return 'ok';
  } catch (e) { return 'no'; }
}
async function pushDisable() {
  try { localStorage.setItem('lahzam_push', '0'); const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { await api('act', { method: 'POST', body: { t: 'pushoff', endpoint: sub.endpoint } }); await sub.unsubscribe(); } } catch (e) {}
}
// Ilovada (o'rnatilgan) bildirishnomaga ruxsat har ochilganda so'raladi, "Qayta ko'rsatilmasin" bosilmaguncha
let PUSH_TRY = 0;
function maybeAskPush() {
  if (!SESSION || !PUSH_OK || (IOS && !standalone())) return;
  let never = null, off = null; try { never = localStorage.getItem('lahzam_push_never'); off = localStorage.getItem('lahzam_push') === '0'; } catch (e) {}
  if (Notification.permission === 'granted') { if (!off) pushEnable(false); return; } // obunani jimgina yangilab turamiz
  if (never || !standalone() && localStorage.getItem('lahzam_push_asked')) return;
  if ($('#modal-root').innerHTML || (SESSION && SESSION.termsOk === false)) { if (PUSH_TRY++ < 20) setTimeout(maybeAskPush, 4000); return; }
  const denied = Notification.permission === 'denied';
  sheet(`<div class="inst-sheet"><div class="inst-hero"><span style="font-size:44px">🔔</span><div><b>Bildirishnomalarga ruxsat bering</b><span>${denied ? 'Bildirishnomalar telefoningizda o‘chirilgan. Yoqish uchun: <b>Sozlamalar → Ilovalar → Lahzam → Bildirishnomalar → Yoqish</b>' : 'Kimdir yozsa, javobingizni yoqtirsa yoki X/O’da navbatingiz kelsa, telefoningizga darhol xabar keladi'}</span></div></div>
    <button class="btn acc full inst-big" data-act="pushon">${denied ? '🔔 Qayta tekshirish' : '🔔 Ruxsat berish'}</button><button class="btn ghost full" style="margin-top:10px" data-act="pushnever">Qayta ko‘rsatilmasin</button></div>`);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.go) { closeSheet(); go(e.data.go); } });
const WAIT_BIP = ANDROID && !INAPP && !FIREFOX; // bu brauzerlarda haqiqiy "O'rnatish" tugmasi bo'ladi
setTimeout(() => { if (standalone() || instSeen()) { maybeAskPush(); return; } if (!WAIT_BIP || DEFER) showInstall(false); }, 2500);
if (WAIT_BIP) setTimeout(() => { if (!standalone() && !instSeen() && !DEFER) showInstall(false); }, 15000);

render();
api('auth/me').then(async r => {
  if (r.status === 0) return; // internet yo'q: keshdagi holat qoladi
  const before = DB.me; adoptSession(r.user || null); save();
  if (isOwnerSession()) await refreshAdm();
  if (DB.me !== before) render();
  if (SESSION) await sync(true); else render();
  if (SESSION) { applyIcon(); setTimeout(() => { if (standalone() || instSeen()) maybeAskPush(); }, 3000); }
});
// Jonli yangilanish: chat ochiq bo'lsa har 3 soniyada, boshqa sahifalarda har 8 soniyada yangi narsalar o'zi keladi
setInterval(() => {
  if (!SESSION || document.visibilityState !== 'visible') return;
  const gap = route()[0] === 'chat' ? 3000 : 8000;
  if (now() - SYNC.last >= gap - 200) sync();
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SESSION) sync(); });
addEventListener('online', () => SESSION && sync(true));
loadUpdates().then(() => { if (!busy() && route()[0] !== 'chat') render(); });
// Har push'dan keyin: server build raqami o'zgarsa, ilova o'zini yangilaydi (yozayotgan bo'lsangiz, tugatishingizni kutadi)
let BUILD = null, buildReload = false;
async function checkBuild() {
  if (buildReload) return;
  const r = await api('auth/config'); if (!r.ok || !r.build) return;
  if (!BUILD) { BUILD = r.build; return; }
  if (r.build !== BUILD) buildReload = true; // jimgina: keyingi sahifa almashishida yoki ilovaga qaytganda yangilanadi
}
// Yangi versiya tayyor bo'lsa: chatda emas, yozmayotgan paytda, sezdirmasdan yuklaymiz
function quietUpdate(path) {
  if (!buildReload || busy() || (route()[0] === 'chat' && !path)) return false;
  buildReload = false; updScreen(path); return true;
}
// Yangilanish ekrani: "vX.Y.Z yuklanmoqda…" (yangi versiya raqami app.js'dan olinadi)
async function updScreen(path) {
  let v = '';
  showUpd('');
  try { const t = await (await fetch('/app.js?u=' + Date.now(), { cache: 'no-store' })).text(); v = (/VERSION = '([\d.]+)'/.exec(t) || [])[1] || ''; } catch (e) {}
  try { sessionStorage.setItem('lahzam_upd', v || '1'); } catch (e) {}
  showUpd(v);
  setTimeout(() => { if (path) location.href = path; else location.reload(); }, 700);
}
function showUpd(v) {
  let o = document.getElementById('upd-ov');
  if (!o) { o = document.createElement('div'); o.id = 'upd-ov'; document.body.appendChild(o); }
  o.innerHTML = `<div class="upd-box"><div class="upd-logo">${I.logo('#fff', '#121212', 54)}</div><b>${v ? 'v' + v + ' yuklanmoqda' : 'Yangi versiya yuklanmoqda'}</b><span>Bu bir necha soniya vaqt oladi</span><i class="upd-bar"><em></em></i></div>`;
}
// yangilangandan keyin: ekran sekin yo'qoladi
setTimeout(() => { const o = document.getElementById('upd-ov'); let v = null; try { v = sessionStorage.getItem('lahzam_upd'); sessionStorage.removeItem('lahzam_upd'); } catch (e) {}
  if (o) { o.classList.add('done'); setTimeout(() => o.remove(), 500); if (v && v.length > 1) toast(`Lahzam v${v} ga yangilandi ✨`); } }, 600);
setTimeout(() => { let f = null; try { f = sessionStorage.getItem('lahzam_icon_done'); sessionStorage.removeItem('lahzam_icon_done'); } catch (e) {} if (f && SESSION) iconHelp(); }, 1200);
checkBuild(); setInterval(() => document.visibilityState === 'visible' && checkBuild(), 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') quietUpdate(); else checkBuild(); });
// Avtomatik yangilanish: yangi versiya chiqsa, telefon o'zi aniqlaydi va sahifani yangilaydi
if ('serviceWorker' in navigator) addEventListener('load', () => {
  const hadSW = !!navigator.serviceWorker.controller; let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadSW || reloading) return; reloading = true;
    buildReload = true; // yangi servis-worker: sezdirmasdan, keyingi sahifa almashishida yangilanadi
  });
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    setInterval(check, 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => {});
});
})();
