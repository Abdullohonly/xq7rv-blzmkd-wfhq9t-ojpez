import { createHash } from 'node:crypto';
import { TERMS_VER, OWNER_EMAIL, isStar, clearSession, sql, currentUser, isOwnerEmail, hasAdminPass, rateLimit, tooMany, send, sameOrigin } from './_lib.js';
import { r2PutDataUrl } from './_r2.js';
import { pushTo } from './_push.js';
import { clean } from './_clean.js';
// POST /api/act — ilovadagi har bir amal: post, javob, layk, kuzatish, guruh, xabar, reaksiya, so'rovnoma...
// Har bir amalda: kim qilayotgani (sessiya), ruxsati (a'zo/admin/egasi) va chegaralar serverda tekshiriladi.
const REACTS = ['❤️', '👎', '⭐', '🫶', '😂', '😮', '😢', '🤲'];
const CATS = ['Ta‘lim', 'Sport', 'Kitoblar', 'Biznes', 'IT', 'Oila', 'Boshqa'];
const COLORS = ['#FFD9C7', '#C9E4FF', '#FFE3A3', '#BDEBD6', '#D9D0FF', '#FFC9DA', '#E8E2D8', '#CDEBF2'];
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const str = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const idOf = (v, prefix) => { const n = Number(String(v ?? '').replace(prefix, '')); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const bad = (res, message, status = 400) => send(res, status, { error: 'bad', message });
const mentions = t => [...new Set((t.match(/@([a-z0-9._]{3,20})/gi) || []).map(s => s.slice(1).toLowerCase()))].slice(0, 5);

async function notify(db, to, body, link, from) {
  if (!to || to === from) return;
  const ins = await db`insert into notifications (user_id, body, link) select ${to}, ${body}, ${link} from users where id = ${to} and not notif_off and not is_system returning id`;
  if (ins.length) await pushTo(db, [to], { title: 'Lahzam', body, url: link || '/', tag: 'n' + ins[0].id });
}
async function notifyMentions(db, text, from, fromName, where, link, only) {
  for (const n of mentions(text)) {
    if (n === 'flappy' || n === 'tetris') continue;
    const [t] = await db`select id from users where username = ${n}`;
    if (t && (!only || only.includes(Number(t.id)))) await notify(db, Number(t.id), `@${fromName} sizni ${where} belgiladi`, link, from);
  }
}
async function chatOf(db, id, uid) {
  const [c] = await db`select c.*, m.status as my_status from chats c left join chat_members m on m.chat_id = c.id and m.user_id = ${uid} where c.id = ${id}`;
  return c || null;
}
const isMember = c => c && c.my_status === 'member';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  try {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: 'auth', message: 'Avval kiring' });
    const db = sql(), uid = Number(me.id), b = req.body || {}, t = String(b.t || '');
    const admin = isOwnerEmail(me.email) && hasAdminPass(req, me);
    if (!(await rateLimit('act:' + uid, 240, 60))) return tooMany(res);

    if (t === 'stats') {
      // ⭐ Kengaytirilgan statistika: oxirgi 14 kun
      if (!isStar(me)) return send(res, 403, { error: 'star', message: 'Statistika faqat ⭐ Yulduz a’zolari uchun' });
      const [tot, views, fols, top] = await Promise.all([
        db`select (select count(*)::int from posts where user_id = ${uid}) as posts,
             (select count(*)::int from post_views v join posts p on p.id = v.post_id where p.user_id = ${uid}) as views,
             (select count(*)::int from post_likes l join posts p on p.id = l.post_id where p.user_id = ${uid}) as likes,
             (select count(*)::int from replies r join posts p on p.id = r.post_id where p.user_id = ${uid} and r.user_id <> ${uid}) as replies,
             (select count(*)::int from follows where followee_id = ${uid}) as followers`,
        db`select to_char(date_trunc('day', v.created_at at time zone 'Asia/Tashkent'), 'YYYY-MM-DD') as d, count(*)::int as n from post_views v join posts p on p.id = v.post_id
           where p.user_id = ${uid} and v.created_at > now() - interval '14 days' group by 1 order by 1`,
        db`select to_char(date_trunc('day', created_at at time zone 'Asia/Tashkent'), 'YYYY-MM-DD') as d, count(*)::int as n from follows
           where followee_id = ${uid} and created_at > now() - interval '14 days' group by 1 order by 1`,
        db`select p.id, p.body, (select count(*)::int from post_views v where v.post_id = p.id) as views, (select count(*)::int from post_likes l where l.post_id = p.id) as likes
           from posts p where p.user_id = ${uid} order by views desc, p.created_at desc limit 5`]);
      return send(res, 200, { ok: true, total: tot[0], views, fols, top: top.map(x => ({ id: 'p' + x.id, text: x.body, views: x.views, likes: x.likes })) });
    }
    if (t === 'deleteme') {
      // Foydalanuvchi o'z akkauntini butunlay o'chiradi: postlar, xabarlar, reaksiyalar ham o'chadi (cascade)
      if (isOwnerEmail(me.email)) return bad(res, 'Owner akkauntini o‘chirib bo‘lmaydi');
      if (String(b.confirm || '').trim().toLowerCase() !== me.username) return bad(res, 'Tasdiqlash uchun username’ingizni to‘g‘ri yozing');
      await db`delete from users where id = ${uid} and not is_system`;
      clearSession(res);
      return send(res, 200, { ok: true });
    }
    if (t === 'agree') {
      if (b.agree !== true) return bad(res, 'Rozilik belgilanmagan');
      await db`update users set terms_ver = ${TERMS_VER}, terms_at = now() where id = ${uid}`;
      return send(res, 200, { ok: true });
    }
    switch (t) {
      /* ---------- Ochiq maydon ---------- */
      case 'post': {
        const body = clean(str(b.body, isStar(me) ? 1500 : 500)); let img = null;
        if (b.img != null) { if (typeof b.img !== 'string' || b.img.length > 400000 || !IMG_RE.test(b.img)) return bad(res, 'Rasm juda katta yoki noto‘g‘ri'); img = (await r2PutDataUrl(b.img, 'p').catch(() => null)) || b.img; }
        if (!body && !img) return bad(res, 'Avval biror narsa yozing');
        if (!(await rateLimit('post:' + uid, 10, 3600))) return send(res, 429, { error: 'rate', message: 'Soatiga ko‘pi bilan 10 ta post' });
        // Yangi akkaunt birinchi haftada ko'pi bilan 7 ta post saqlay oladi (eskisini o'chirsa, joy bo'shaydi)
        if (!isOwnerEmail(me.email) && Date.now() - new Date(me.created_at).getTime() < 7 * 864e5) {
          const [{ n }] = await db`select count(*)::int as n from posts where user_id = ${uid}`;
          if (n >= 7) return send(res, 429, { error: 'newlimit', message: 'Yangi akkauntlar birinchi haftada ko‘pi bilan 7 ta post joylay oladi. Yozish uchun eski postlaringizni o‘chiring' });
        }
        const hash = createHash('sha256').update(body.toLowerCase().replace(/\s+/g, ' ') + (img ? '|' + img.slice(-40) : '')).digest('hex');
        const [dup] = body ? await db`select 1 from posts where user_id = ${uid} and body_hash = ${hash} and created_at > now() - interval '1 day'` : [];
        if (dup) return bad(res, 'Bu matnni 24 soat ichida allaqachon joylagansiz');
        const [p] = await db`insert into posts (user_id, body, body_hash, is_lahza, img) values (${uid}, ${body}, ${hash}, ${!!b.lahza}, ${img}) returning id`;
        await db`insert into post_views (post_id, user_id) values (${p.id}, ${uid}) on conflict do nothing`;
        await notifyMentions(db, body, uid, me.username, 'postda', `/p/${p.id}`);
        return send(res, 200, { ok: true, id: 'p' + p.id });
      }
      case 'reply': {
        const pid = idOf(b.post, 'p'), body = clean(str(b.body, 300)); if (!pid || !body) return bad(res, 'Javob bo‘sh');
        if (!(await rateLimit('reply:' + uid, 30, 3600))) return send(res, 429, { error: 'rate', message: 'Soatiga ko‘pi bilan 30 ta javob' });
        const [p] = await db`select user_id from posts where id = ${pid} and not is_hidden`; if (!p) return bad(res, 'Post topilmadi', 404);
        const parentId = idOf(b.parent, 'r');
        const [par] = parentId ? await db`select id, user_id from replies where id = ${parentId} and post_id = ${pid}` : [];
        await db`insert into replies (post_id, user_id, body, parent_id) values (${pid}, ${uid}, ${body}, ${par ? par.id : null})`;
        if (par && Number(par.user_id) !== Number(p.user_id)) await notify(db, Number(par.user_id), `@${me.username} kommentingizga javob yozdi`, `/p/${pid}`, uid);
        await notify(db, Number(p.user_id), `@${me.username} postingizga javob yozdi`, `/p/${pid}`, uid);
        await notifyMentions(db, body, uid, me.username, 'javobda', `/p/${pid}`);
        return send(res, 200, { ok: true });
      }
      case 'like': {
        const pid = idOf(b.post, 'p'); if (!pid) return bad(res, 'post');
        const del = await db`delete from post_likes where post_id = ${pid} and user_id = ${uid} returning post_id`;
        if (!del.length) {
          const [p] = await db`insert into post_likes (post_id, user_id) select id, ${uid} from posts where id = ${pid} on conflict do nothing returning (select user_id from posts where id = ${pid}) as owner`;
          const body = `@${me.username} postingizni yoqtirdi ❤️`, link = `/p/${pid}`;
          // bir odam layk bosib-o'chirib qayta bossa, bildirishnoma takrorlanmaydi
          if (p && Number(p.owner) !== uid) { const [ex] = await db`select 1 from notifications where user_id = ${p.owner} and body = ${body} and link = ${link}`; if (!ex) await notify(db, Number(p.owner), body, link, uid); }
        }
        return send(res, 200, { ok: true });
      }
      case 'views': {
        const ids = (Array.isArray(b.posts) ? b.posts : []).slice(0, 100).map(x => idOf(x, 'p')).filter(Boolean);
        if (ids.length) await db`insert into post_views (post_id, user_id) select id, ${uid} from posts where id = any(${ids}::bigint[]) on conflict do nothing`;
        return send(res, 200, { ok: true });
      }
      case 'editpost': {
        const pid = idOf(b.post, 'p'), body = clean(str(b.body, isStar(me) ? 1500 : 500)); if (!pid || !body) return bad(res, 'Matn bo‘sh bo‘lmasin');
        const up = await db`update posts set body = ${body}, edited = true where id = ${pid} and user_id = ${uid} and body <> ${body} returning id`;
        return send(res, 200, { ok: true, changed: up.length > 0 });
      }
      case 'delpost': {
        const pid = idOf(b.post, 'p'); if (!pid) return bad(res, 'post');
        await db`delete from posts where id = ${pid} and (user_id = ${uid} or ${admin})`;
        return send(res, 200, { ok: true });
      }
      case 'delreply': {
        const rid = idOf(b.reply, 'r'); if (!rid) return bad(res, 'reply');
        await db`delete from replies where id = ${rid} and (user_id = ${uid} or ${admin})`;
        return send(res, 200, { ok: true });
      }
      case 'report': {
        const pid = idOf(b.post, 'p'); if (!pid) return bad(res, 'post');
        const REASONS = { spam: 'Spam', haqorat: 'Haqorat', '18': 'Behayo kontent', yolgon: 'Yolg‘on ma’lumot', boshqa: 'Boshqa' }, why = REASONS[b.reason] || 'Boshqa';
        const ins = await db`insert into reports (post_id, reporter_id, reason) select id, ${uid}, ${why} from posts where id = ${pid} and user_id <> ${uid} on conflict do nothing returning post_id`;
        await db`update posts set is_hidden = true where id = ${pid} and (select count(*) from reports where post_id = ${pid}) >= 5`;
        if (ins.length) {
          // 🚩 Owner'ga darhol bildirishnoma va push
          const [own] = await db`select id from users where lower(email) = ${OWNER_EMAIL} limit 1`;
          const [pp] = await db`select p.body, u.username, (select count(*)::int from reports r where r.post_id = p.id) as n from posts p join users u on u.id = p.user_id where p.id = ${pid}`;
          if (own && pp) await notify(db, Number(own.id), `🚩 Shikoyat (${why}): @${me.username} → @${pp.username} posti${pp.n > 1 ? ` · jami ${pp.n} ta` : ''}: “${pp.body.slice(0, 60)}”`, `/p/${pid}`, uid);
        }
        return send(res, 200, { ok: true });
      }
      case 'hide': {
        if (!admin) return send(res, 403, { error: 'forbidden' });
        const pid = idOf(b.post, 'p'); if (!pid) return bad(res, 'post');
        await db`update posts set is_hidden = not is_hidden where id = ${pid}`;
        return send(res, 200, { ok: true });
      }
      case 'warn': {
        if (!admin) return send(res, 403, { error: 'forbidden' });
        const to = idOf(b.user); if (!to) return bad(res, 'user');
        await db`update users set warns = warns + 1 where id = ${to} and not is_system`;
        await db`insert into notifications (user_id, body, link) values (${to}, 'Moderator ogohlantirishi: iltimos, Lahzam qoidalariga amal qiling.', '/')`;
        return send(res, 200, { ok: true });
      }
      case 'follow': {
        const to = idOf(b.user); if (to == null || to === uid) return bad(res, 'user');
        const del = await db`delete from follows where follower_id = ${uid} and followee_id = ${to} returning followee_id`;
        if (!del.length) {
          const ins = await db`insert into follows (follower_id, followee_id) select ${uid}, id from users where id = ${to} on conflict do nothing returning followee_id`;
          if (ins.length) await notify(db, to, `@${me.username} sizni kuzata boshladi`, `/@${me.username}`, uid);
        }
        return send(res, 200, { ok: true });
      }
      case 'notifread': {
        await db`update notifications set is_read = true where user_id = ${uid} and not is_read`;
        return send(res, 200, { ok: true });
      }

      /* ---------- Guruhlar va shaxsiy chatlar ---------- */
      case 'dm': {
        const to = idOf(b.user); if (!to || to === uid) return bad(res, 'user');
        const [tu] = await db`select id, username, dm_from, is_system, is_blocked from users where id = ${to}`;
        if (!tu || tu.is_system || tu.is_blocked) return bad(res, 'Bu odamga yozib bo‘lmaydi');
        const [ex] = await db`select c.id from chats c where c.kind = 'dm'
          and exists(select 1 from chat_members a where a.chat_id = c.id and a.user_id = ${uid})
          and exists(select 1 from chat_members z where z.chat_id = c.id and z.user_id = ${to}) limit 1`;
        if (ex) return send(res, 200, { ok: true, chat: 'c' + ex.id });
        if (tu.dm_from === 'fol' && !admin) {
          const [f] = await db`select 1 from follows where follower_id = ${to} and followee_id = ${uid}`;
          if (!f) return bad(res, `@${tu.username} faqat o‘zi kuzatganlardan xabar oladi`, 403);
        }
        const [c] = await db`insert into chats (kind) values ('dm') returning id`;
        await db`insert into chat_members (chat_id, user_id) values (${c.id}, ${uid}), (${c.id}, ${to})`;
        return send(res, 200, { ok: true, chat: 'c' + c.id });
      }
      case 'group': {
        const name = str(b.name, 40), desc = str(b.desc, 160), cat = CATS.includes(b.cat) ? b.cat : 'Boshqa', access = ['open', 'ask', 'closed'].includes(b.access) ? b.access : 'open';
        if (!name) return bad(res, 'Guruh nomini yozing');
        if (!(await rateLimit('group:' + uid, 5, 86400))) return send(res, 429, { error: 'rate', message: 'Kuniga ko‘pi bilan 5 ta guruh' });
        if (!isOwnerEmail(me.email)) {
          const [{ n }] = await db`select count(*)::int as n from chats where kind = 'group' and admin_id = ${uid}`, max = isStar(me) ? 10 : 3;
          if (n >= max) return send(res, 403, { error: 'glimit', message: isStar(me) ? 'Ko‘pi bilan 10 ta guruh yarata olasiz' : 'Bepul akkaunt ko‘pi bilan 3 ta guruh yarata oladi. ⭐ Yulduz bilan 10 tagacha', star: !isStar(me) });
        }
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const [c] = await db`insert into chats (kind, name, description, category, access, color, admin_id) values ('group', ${name}, ${desc}, ${cat}, ${access}, ${color}, ${uid}) returning id`;
        await db`insert into chat_members (chat_id, user_id) values (${c.id}, ${uid})`;
        await db`insert into messages (chat_id, user_id, body, is_sys) values (${c.id}, null, ${'@' + me.username + ' guruhni yaratdi'}, true)`;
        return send(res, 200, { ok: true, chat: 'c' + c.id });
      }
      case 'join': {
        const cid = idOf(b.chat, 'c'); const c = cid && await chatOf(db, cid, uid);
        if (!c || c.kind !== 'group' || c.access === 'closed') return bad(res, 'Bu guruhga faqat taklif bilan qo‘shiladi', 403);
        if (c.my_status === 'banned') return bad(res, 'Guruh admini sizni bu guruhdan chetlatgan', 403);
        if (c.my_status) return send(res, 200, { ok: true, status: c.my_status });
        if (c.access === 'ask') {
          await db`insert into chat_members (chat_id, user_id, status) values (${cid}, ${uid}, 'pending') on conflict do nothing`;
          await notify(db, Number(c.admin_id), `@${me.username} “${c.name}” guruhiga qo‘shilmoqchi`, `/g/c${cid}`, uid);
          return send(res, 200, { ok: true, status: 'pending' });
        }
        await db`insert into chat_members (chat_id, user_id) values (${cid}, ${uid}) on conflict do nothing`;
        await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'@' + me.username + ' guruhga qo‘shildi'}, true)`;
        return send(res, 200, { ok: true, status: 'member' });
      }
      case 'ban': case 'unban': {
        const cid = idOf(b.chat, 'c'), who = idOf(b.user); const c = cid && await chatOf(db, cid, uid);
        if (!c || c.kind !== 'group' || !who || (Number(c.admin_id) !== uid && !admin)) return send(res, 403, { error: 'forbidden', message: 'Faqat guruh admini' });
        if (who === uid || who === Number(c.admin_id)) return bad(res, 'Adminni chetlatib bo‘lmaydi');
        const [w] = await db`select username from users where id = ${who}`; if (!w) return bad(res, 'user');
        if (t === 'ban') {
          await db`insert into chat_members (chat_id, user_id, status) values (${cid}, ${who}, 'banned') on conflict (chat_id, user_id) do update set status = 'banned', typing_at = null`;
          await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'🚫 @' + w.username + ' guruhdan chetlatildi'}, true)`;
        } else await db`delete from chat_members where chat_id = ${cid} and user_id = ${who} and status = 'banned'`;
        return send(res, 200, { ok: true });
      }
      case 'approve': {
        const cid = idOf(b.chat, 'c'), who = idOf(b.user); const c = cid && await chatOf(db, cid, uid);
        if (!c || !who || (Number(c.admin_id) !== uid && !admin)) return send(res, 403, { error: 'forbidden' });
        const up = await db`update chat_members set status = 'member', last_read = now() where chat_id = ${cid} and user_id = ${who} and status = 'pending' returning user_id`;
        if (up.length) {
          const [w] = await db`select username from users where id = ${who}`;
          await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'@' + (w ? w.username : '') + ' guruhga qo‘shildi'}, true)`;
          await notify(db, who, `“${c.name}” guruhiga qabul qilindingiz`, `/c/c${cid}`, uid);
        }
        return send(res, 200, { ok: true });
      }
      case 'leave': {
        const cid = idOf(b.chat, 'c'); const c = cid && await chatOf(db, cid, uid);
        if (!c || c.kind !== 'group') return bad(res, 'chat');
        if (Number(c.admin_id) === uid) return bad(res, 'Admin guruhdan chiqa olmaydi');
        await db`delete from chat_members where chat_id = ${cid} and user_id = ${uid}`;
        return send(res, 200, { ok: true });
      }
      case 'delgroup': {
        const cid = idOf(b.chat, 'c'); const c = cid && await chatOf(db, cid, uid);
        if (!c || c.kind !== 'group' || (!admin && Number(c.admin_id) !== uid)) return send(res, 403, { error: 'forbidden' });
        await db`delete from chats where id = ${cid}`;
        return send(res, 200, { ok: true });
      }
      case 'msg': case 'fwd': {
        const cid = idOf(b.chat, 'c'); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c)) return send(res, 403, { error: 'forbidden', message: 'Siz bu chat a‘zosi emassiz' });
        if (!(await rateLimit('msg:' + uid, 40, 60))) return send(res, 429, { error: 'rate', message: 'Shoshmang 🙂 Biroz dam olib yozing' });
        let body = t === 'fwd' ? '' : clean(str(b.body, 2000)), img = null, poll = null, fwd = null, replyTo = null, game = false;
        if (t === 'fwd') {
          const mid = idOf(b.msg, 'm');
          const [src] = await db`select m.* from messages m join chat_members a on a.chat_id = m.chat_id and a.user_id = ${uid} and a.status = 'member' where m.id = ${mid} and not m.is_game and not m.is_sys`;
          if (!src) return bad(res, 'Xabar topilmadi', 404);
          body = src.body; img = src.img; fwd = Number(src.fwd_user || src.user_id);
          if (src.poll) { const P = typeof src.poll === 'string' ? JSON.parse(src.poll) : src.poll; poll = { q: P.q, opts: P.opts }; }
        } else {
          if (b.img != null) { if (typeof b.img !== 'string' || b.img.length > 400000 || !IMG_RE.test(b.img)) return bad(res, 'Rasm juda katta yoki noto‘g‘ri'); img = b.img; const url = await r2PutDataUrl(img, 'm').catch(() => null); if (url) img = url; }
          if (b.poll) {
            const q = clean(str(b.poll.q, 200)), opts = (Array.isArray(b.poll.opts) ? b.poll.opts : []).map(o => clean(str(o, 80))).filter(Boolean).slice(0, 4);
            if (!q || opts.length < 2) return bad(res, 'Savol va kamida 2 ta variant yozing'); poll = { q, opts }; body = '';
          }
          if (!body && !img && !poll) return bad(res, 'Avval biror narsa yozing');
          game = !poll && !img && /@(flappy|tetris|2048)(?![\w])/i.test(body);
          const rt = idOf(b.replyTo, 'm');
          if (rt) { const [r] = await db`select id, user_id from messages where id = ${rt} and chat_id = ${cid}`; if (r) replyTo = Number(r.id); }
        }
        // ⭐ Keyinroq yuborish: xabar belgilangan vaqtgacha faqat yuboruvchiga ko'rinadi
        let at = null;
        if (b.at != null && t === 'msg') {
          if (!isStar(me)) return send(res, 403, { error: 'star', message: 'Keyinroq yuborish faqat ⭐ Yulduz a’zolari uchun' });
          const ts = Number(b.at); if (!Number.isFinite(ts) || ts < Date.now() + 50e3 || ts > Date.now() + 30 * 864e5) return bad(res, 'Vaqt 1 daqiqadan 30 kungacha bo‘lsin');
          at = new Date(ts);
        }
        const [m] = at ? await db`insert into messages (chat_id, user_id, body, is_game, reply_to, img, poll, fwd_user, created_at, scheduled)
          values (${cid}, ${uid}, ${body}, ${game}, ${replyTo}, ${img}, ${poll ? JSON.stringify(poll) : null}::jsonb, ${fwd}, ${at}, true) returning id`
          : await db`insert into messages (chat_id, user_id, body, is_game, reply_to, img, poll, fwd_user)
          values (${cid}, ${uid}, ${body}, ${game}, ${replyTo}, ${img}, ${poll ? JSON.stringify(poll) : null}::jsonb, ${fwd}) returning id`;
        if (at) return send(res, 200, { ok: true, id: 'm' + m.id, scheduled: true });
        await db`update chat_members set last_read = now() where chat_id = ${cid} and user_id = ${uid}`;
        // chat xabarlari bildirishnomalar ro'yxatiga tushmaydi, lekin telefonga push keladi
        const others = await db`select user_id from chat_members where chat_id = ${cid} and status = 'member' and user_id <> ${uid}`;
        await db`update chat_members set typing_at = null where chat_id = ${cid} and user_id = ${uid}`;
        if (others.length) {
          const st = /^\[s:[a-z0-9]+\]$/.test(body), pp = /^\[post:\d+\]\n?/.exec(body), prev = pp ? '📝 Post: ' + body.slice(pp[0].length) : poll ? '📊 ' + poll.q : img ? '📷 Rasm' + (body ? ': ' + body : '') : game ? '🎮 O‘yin' : st ? '🎨 Stiker' : body;
          const grp = c.kind === 'group', who = me.name || '@' + me.username;
          await pushTo(db, others.map(o => o.user_id), { title: grp ? c.name : who, body: (grp ? who + ': ' : '') + prev.slice(0, 160), url: '/c/c' + cid, tag: 'c' + cid });
        }
        return send(res, 200, { ok: true, id: 'm' + m.id });
      }
      case 'edit': {
        const mid = idOf(b.msg, 'm'), body = clean(str(b.body, 2000)); if (!mid || !body) return bad(res, 'Matn bo‘sh');
        await db`update messages set body = ${body}, edited = true where id = ${mid} and user_id = ${uid} and not is_game and poll is null and body <> ${body}`;
        return send(res, 200, { ok: true });
      }
      case 'delmsg': {
        const mid = idOf(b.msg, 'm'); if (!mid) return bad(res, 'msg');
        const [m] = await db`select m.chat_id, m.user_id, c.kind, c.admin_id from messages m join chats c on c.id = m.chat_id where m.id = ${mid}`;
        if (!m) return send(res, 200, { ok: true });
        const own = Number(m.user_id) === uid, gAdmin = m.kind === 'group' && (admin || Number(m.admin_id) === uid);
        if (!own && !gAdmin) return send(res, 403, { error: 'forbidden' });
        await db`update chats set pin_id = null where id = ${m.chat_id} and pin_id = ${mid}`;
        await db`delete from messages where id = ${mid}`;
        return send(res, 200, { ok: true });
      }
      case 'react': {
        const mid = idOf(b.msg, 'm'), emoji = String(b.emoji || ''); if (!mid || !REACTS.includes(emoji)) return bad(res, 'reaksiya');
        const [m] = await db`select m.id from messages m join chat_members a on a.chat_id = m.chat_id and a.user_id = ${uid} and a.status = 'member' where m.id = ${mid}`;
        if (!m) return send(res, 403, { error: 'forbidden' });
        const del = await db`delete from reactions where message_id = ${mid} and user_id = ${uid} and emoji = ${emoji} returning emoji`;
        if (!del.length) await db`insert into reactions (message_id, user_id, emoji) values (${mid}, ${uid}, ${emoji}) on conflict (message_id, user_id) do update set emoji = excluded.emoji`;
        return send(res, 200, { ok: true });
      }
      case 'vote': {
        const mid = idOf(b.msg, 'm'), opt = Number(b.opt);
        const [m] = await db`select m.poll from messages m join chat_members a on a.chat_id = m.chat_id and a.user_id = ${uid} and a.status = 'member' where m.id = ${mid} and m.poll is not null`;
        if (!m) return send(res, 403, { error: 'forbidden' });
        const P = typeof m.poll === 'string' ? JSON.parse(m.poll) : m.poll;
        if (!Number.isInteger(opt) || opt < 0 || opt >= P.opts.length) return bad(res, 'variant');
        const del = await db`delete from poll_votes where message_id = ${mid} and user_id = ${uid} and opt = ${opt} returning opt`;
        if (!del.length) await db`insert into poll_votes (message_id, user_id, opt) values (${mid}, ${uid}, ${opt}) on conflict (message_id, user_id) do update set opt = excluded.opt`;
        return send(res, 200, { ok: true });
      }
      case 'pin': {
        const cid = idOf(b.chat, 'c'); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || (c.kind === 'group' && Number(c.admin_id) !== uid && !admin)) return send(res, 403, { error: 'forbidden', message: 'Faqat guruh admini qadaydi' });
        const mid = b.msg ? idOf(b.msg, 'm') : null;
        if (mid) { const [m] = await db`select 1 from messages where id = ${mid} and chat_id = ${cid}`; if (!m) return bad(res, 'msg'); }
        await db`update chats set pin_id = ${mid} where id = ${cid}`;
        return send(res, 200, { ok: true });
      }
      case 'read': {
        const cid = idOf(b.chat, 'c'); if (!cid) return bad(res, 'chat');
        await db`update chat_members set last_read = now() where chat_id = ${cid} and user_id = ${uid} and status = 'member'`;
        return send(res, 200, { ok: true });
      }
      case 'flappy': {
        const cid = idOf(b.chat, 'c'), score = Number(b.score); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || !Number.isInteger(score) || score < 1 || score > 999) return bad(res, 'score');
        const up = await db`update chats set flappy_score = ${score}, flappy_user = ${uid} where id = ${cid} and coalesce(flappy_score, 0) < ${score} returning id`;
        if (up.length) {
          await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'@' + me.username + ' dan rekord ' + score + ' ta!'}, true)`;
        }
        return send(res, 200, { ok: true, record: up.length > 0 });
      }
      case '2048': {
        const cid = idOf(b.chat, 'c'), score = Number(b.score); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || !Number.isInteger(score) || score < 4 || score > 9999999) return bad(res, 'score');
        const up = await db`update chats set g2048_score = ${score}, g2048_user = ${uid} where id = ${cid} and coalesce(g2048_score, 0) < ${score} returning id`;
        if (up.length) await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'🔢 @' + me.username + ' 2048 rekordi: ' + score + ' ochko!'}, true)`;
        return send(res, 200, { ok: true, record: up.length > 0 });
      }
      case 'pushsub': {
        const s = b.sub || {}, ep = str(s.endpoint, 800), k = s.keys || {};
        if (!/^https:\/\//.test(ep) || !/^[A-Za-z0-9_-]{80,100}$/.test(k.p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(k.auth || '')) return bad(res, 'sub');
        await db`insert into push_subs (user_id, endpoint, p256dh, auth) values (${uid}, ${ep}, ${k.p256dh}, ${k.auth})
          on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
        await db`delete from push_subs where user_id = ${uid} and id not in (select id from push_subs where user_id = ${uid} order by created_at desc limit 5)`;
        return send(res, 200, { ok: true });
      }
      case 'pushoff': { await db`delete from push_subs where user_id = ${uid} and endpoint = ${str(b.endpoint, 800)}`; return send(res, 200, { ok: true }); }
      case 'typing': {
        const cid = idOf(b.chat, 'c'); if (!cid) return bad(res, 'chat');
        await db`update chat_members set typing_at = ${b.stop ? null : new Date()} where chat_id = ${cid} and user_id = ${uid} and status = 'member'`;
        return send(res, 200, { ok: true });
      }
      case 'saved': {
        const [ex] = await db`select c.id from chats c where c.kind = 'dm' and exists(select 1 from chat_members a where a.chat_id = c.id and a.user_id = ${uid})
          and (select count(*) from chat_members z where z.chat_id = c.id) = 1 limit 1`;
        if (ex) return send(res, 200, { ok: true, chat: 'c' + ex.id });
        const [c] = await db`insert into chats (kind) values ('dm') returning id`;
        await db`insert into chat_members (chat_id, user_id, status) values (${c.id}, ${uid}, 'member')`;
        return send(res, 200, { ok: true, chat: 'c' + c.id });
      }
      case 'msearch': {
        const cid = idOf(b.chat, 'c'), q = str(b.q, 100); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || q.length < 2) return send(res, 200, { ok: true, list: [] });
        const like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%';
        const rows = await db`select id, user_id, body, created_at from messages where chat_id = ${cid} and not is_sys and not is_game and (created_at <= now() or user_id = ${uid}) and body ilike ${like} order by created_at desc limit 60`;
        return send(res, 200, { ok: true, list: rows.map(r => ({ id: 'm' + r.id, uid: Number(r.user_id), text: r.body, t: new Date(r.created_at).getTime() })) });
      }
      case 'mctx': {
        const cid = idOf(b.chat, 'c'), mid = idOf(b.msg, 'm'); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || !mid) return bad(res, 'msg');
        const [at] = await db`select created_at from messages where id = ${mid} and chat_id = ${cid}`; if (!at) return bad(res, 'Xabar topilmadi', 404);
        const [before, after] = await Promise.all([
          db`select id, user_id, body, created_at, img is not null as has_img from messages where chat_id = ${cid} and created_at < ${at.created_at} and not is_sys order by created_at desc limit 12`,
          db`select id, user_id, body, created_at, img is not null as has_img from messages where chat_id = ${cid} and created_at >= ${at.created_at} and not is_sys order by created_at limit 13`]);
        const rows = [...before.reverse(), ...after];
        return send(res, 200, { ok: true, list: rows.map(r => ({ id: 'm' + r.id, uid: Number(r.user_id), text: r.body, img: r.has_img || undefined, t: new Date(r.created_at).getTime() })) });
      }
      case 'tstart': {
        // 🏁 Guruhda o'yin turniri: belgilangan vaqt ichida eng ko'p ochko yiqqan g'olib
        const cid = idOf(b.chat, 'c'), game = String(b.game || ''), mins = Number(b.mins); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || c.kind !== 'group') return bad(res, 'Turnir faqat guruhlarda');
        if (!['flappy', 'tetris', '2048'].includes(game) || ![5, 10, 30, 60].includes(mins)) return bad(res, 'O‘yin yoki vaqt noto‘g‘ri');
        const [act] = await db`select id from tournaments where chat_id = ${cid} and not done and ends_at > now() limit 1`;
        if (act) return bad(res, 'Bu guruhda turnir allaqachon ketyapti');
        const [tn] = await db`insert into tournaments (chat_id, game, ends_at, created_by) values (${cid}, ${game}, now() + make_interval(mins => ${mins}), ${uid}) returning id`;
        const gname = { flappy: 'Flappy', tetris: 'Tetris', '2048': '2048' }[game];
        await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'🏁 @' + me.username + ' ' + gname + ' turnirini boshladi! ' + mins + ' daqiqa ichida eng ko‘p ochko yiqqan g‘olib bo‘ladi'}, true)`;
        const others = await db`select user_id from chat_members where chat_id = ${cid} and status = 'member' and user_id <> ${uid}`;
        if (others.length) await pushTo(db, others.map(o => o.user_id), { title: c.name, body: `🏁 ${gname} turniri boshlandi! ${mins} daqiqa`, url: '/c/c' + cid, tag: 't' + tn.id });
        return send(res, 200, { ok: true, id: Number(tn.id) });
      }
      case 'tscore': {
        const tid = Number(b.tid), score = Number(b.score); if (!Number.isSafeInteger(tid) || !Number.isInteger(score) || score < 1 || score > 9999999) return bad(res, 'score');
        const [tn] = await db`select t.id from tournaments t join chat_members m on m.chat_id = t.chat_id and m.user_id = ${uid} and m.status = 'member' where t.id = ${tid} and not t.done and t.ends_at > now()`;
        if (!tn) return bad(res, 'Turnir tugagan');
        await db`insert into tourney_scores (tid, user_id, score) values (${tid}, ${uid}, ${score}) on conflict (tid, user_id) do update set score = greatest(tourney_scores.score, excluded.score)`;
        return send(res, 200, { ok: true });
      }
      case 'tetris': {
        const cid = idOf(b.chat, 'c'), score = Number(b.score); const c = cid && await chatOf(db, cid, uid);
        if (!isMember(c) || !Number.isInteger(score) || score < 1 || score > 999999) return bad(res, 'score');
        const up = await db`update chats set tetris_score = ${score}, tetris_user = ${uid} where id = ${cid} and coalesce(tetris_score, 0) < ${score} returning id`;
        if (up.length) await db`insert into messages (chat_id, user_id, body, is_sys) values (${cid}, null, ${'🧱 @' + me.username + ' Tetris rekordi: ' + score + ' ochko!'}, true)`;
        return send(res, 200, { ok: true, record: up.length > 0 });
      }
      default: return bad(res, 'Noma’lum amal');
    }
  } catch (e) { send(res, 500, { error: 'server', message: 'Serverda xato, qayta urinib ko‘ring' }); }
}
