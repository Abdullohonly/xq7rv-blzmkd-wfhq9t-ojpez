import { createHash } from 'node:crypto';
import { sql, currentUser, isOwnerEmail, hasAdminPass, rateLimit, tooMany, send, sameOrigin } from './_lib.js';
import { r2PutDataUrl } from './_r2.js';
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
  await db`insert into notifications (user_id, body, link) select ${to}, ${body}, ${link} from users where id = ${to} and not notif_off and not is_system`;
}
async function notifyMentions(db, text, from, fromName, where, link, only) {
  for (const n of mentions(text)) {
    if (n === 'flappy') continue;
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

    switch (t) {
      /* ---------- Ochiq maydon ---------- */
      case 'post': {
        const body = str(b.body, 500); let img = null;
        if (b.img != null) { if (typeof b.img !== 'string' || b.img.length > 400000 || !IMG_RE.test(b.img)) return bad(res, 'Rasm juda katta yoki noto‘g‘ri'); img = (await r2PutDataUrl(b.img, 'p').catch(() => null)) || b.img; }
        if (!body && !img) return bad(res, 'Avval biror narsa yozing');
        if (!(await rateLimit('post:' + uid, 10, 3600))) return send(res, 429, { error: 'rate', message: 'Soatiga ko‘pi bilan 10 ta post' });
        const hash = createHash('sha256').update(body.toLowerCase().replace(/\s+/g, ' ') + (img ? '|' + img.slice(-40) : '')).digest('hex');
        const [dup] = body ? await db`select 1 from posts where user_id = ${uid} and body_hash = ${hash} and created_at > now() - interval '1 day'` : [];
        if (dup) return bad(res, 'Bu matnni 24 soat ichida allaqachon joylagansiz');
        const [p] = await db`insert into posts (user_id, body, body_hash, is_lahza, img) values (${uid}, ${body}, ${hash}, ${!!b.lahza}, ${img}) returning id`;
        await db`insert into post_views (post_id, user_id) values (${p.id}, ${uid}) on conflict do nothing`;
        await notifyMentions(db, body, uid, me.username, 'postda', `/p/${p.id}`);
        return send(res, 200, { ok: true, id: 'p' + p.id });
      }
      case 'reply': {
        const pid = idOf(b.post, 'p'), body = str(b.body, 300); if (!pid || !body) return bad(res, 'Javob bo‘sh');
        if (!(await rateLimit('reply:' + uid, 30, 3600))) return send(res, 429, { error: 'rate', message: 'Soatiga ko‘pi bilan 30 ta javob' });
        const [p] = await db`select user_id from posts where id = ${pid} and not is_hidden`; if (!p) return bad(res, 'Post topilmadi', 404);
        await db`insert into replies (post_id, user_id, body) values (${pid}, ${uid}, ${body})`;
        await notify(db, Number(p.user_id), `@${me.username} postingizga javob yozdi`, `/p/${pid}`, uid);
        await notifyMentions(db, body, uid, me.username, 'javobda', `/p/${pid}`);
        return send(res, 200, { ok: true });
      }
      case 'like': {
        const pid = idOf(b.post, 'p'); if (!pid) return bad(res, 'post');
        const del = await db`delete from post_likes where post_id = ${pid} and user_id = ${uid} returning post_id`;
        if (!del.length) await db`insert into post_likes (post_id, user_id) select id, ${uid} from posts where id = ${pid} on conflict do nothing`;
        return send(res, 200, { ok: true });
      }
      case 'views': {
        const ids = (Array.isArray(b.posts) ? b.posts : []).slice(0, 100).map(x => idOf(x, 'p')).filter(Boolean);
        if (ids.length) await db`insert into post_views (post_id, user_id) select id, ${uid} from posts where id = any(${ids}::bigint[]) on conflict do nothing`;
        return send(res, 200, { ok: true });
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
        await db`insert into reports (post_id, reporter_id) select id, ${uid} from posts where id = ${pid} and user_id <> ${uid} on conflict do nothing`;
        await db`update posts set is_hidden = true where id = ${pid} and (select count(*) from reports where post_id = ${pid}) >= 5`;
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
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const [c] = await db`insert into chats (kind, name, description, category, access, color, admin_id) values ('group', ${name}, ${desc}, ${cat}, ${access}, ${color}, ${uid}) returning id`;
        await db`insert into chat_members (chat_id, user_id) values (${c.id}, ${uid})`;
        await db`insert into messages (chat_id, user_id, body, is_sys) values (${c.id}, null, ${'@' + me.username + ' guruhni yaratdi'}, true)`;
        return send(res, 200, { ok: true, chat: 'c' + c.id });
      }
      case 'join': {
        const cid = idOf(b.chat, 'c'); const c = cid && await chatOf(db, cid, uid);
        if (!c || c.kind !== 'group' || c.access === 'closed') return bad(res, 'Bu guruhga faqat taklif bilan qo‘shiladi', 403);
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
        let body = str(b.body, 2000), img = null, poll = null, fwd = null, replyTo = null, game = false;
        if (t === 'fwd') {
          const mid = idOf(b.msg, 'm');
          const [src] = await db`select m.* from messages m join chat_members a on a.chat_id = m.chat_id and a.user_id = ${uid} and a.status = 'member' where m.id = ${mid} and not m.is_game and not m.is_sys`;
          if (!src) return bad(res, 'Xabar topilmadi', 404);
          body = src.body; img = src.img; fwd = Number(src.fwd_user || src.user_id);
          if (src.poll) { const P = typeof src.poll === 'string' ? JSON.parse(src.poll) : src.poll; poll = { q: P.q, opts: P.opts }; }
        } else {
          if (b.img != null) { if (typeof b.img !== 'string' || b.img.length > 400000 || !IMG_RE.test(b.img)) return bad(res, 'Rasm juda katta yoki noto‘g‘ri'); img = b.img; const url = await r2PutDataUrl(img, 'm').catch(() => null); if (url) img = url; }
          if (b.poll) {
            const q = str(b.poll.q, 200), opts = (Array.isArray(b.poll.opts) ? b.poll.opts : []).map(o => str(o, 80)).filter(Boolean).slice(0, 4);
            if (!q || opts.length < 2) return bad(res, 'Savol va kamida 2 ta variant yozing'); poll = { q, opts }; body = '';
          }
          if (!body && !img && !poll) return bad(res, 'Avval biror narsa yozing');
          game = !poll && !img && /@flappy\b/i.test(body);
          const rt = idOf(b.replyTo, 'm');
          if (rt) { const [r] = await db`select id, user_id from messages where id = ${rt} and chat_id = ${cid}`; if (r) { replyTo = Number(r.id); await notify(db, Number(r.user_id), `@${me.username} xabaringizga javob berdi`, `/c/c${cid}`, uid); } }
        }
        const [m] = await db`insert into messages (chat_id, user_id, body, is_game, reply_to, img, poll, fwd_user)
          values (${cid}, ${uid}, ${body}, ${game}, ${replyTo}, ${img}, ${poll ? JSON.stringify(poll) : null}::jsonb, ${fwd}) returning id`;
        await db`update chat_members set last_read = now() where chat_id = ${cid} and user_id = ${uid}`;
        if (body && t === 'msg') {
          const mem = (await db`select user_id from chat_members where chat_id = ${cid} and status = 'member'`).map(r => Number(r.user_id));
          await notifyMentions(db, body, uid, me.username, c.kind === 'group' ? `“${c.name}” guruhida` : 'chatda', `/c/c${cid}`, mem);
        }
        return send(res, 200, { ok: true, id: 'm' + m.id });
      }
      case 'edit': {
        const mid = idOf(b.msg, 'm'), body = str(b.body, 2000); if (!mid || !body) return bad(res, 'Matn bo‘sh');
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
          const mem = await db`select user_id from chat_members where chat_id = ${cid} and status = 'member' and user_id <> ${uid}`;
          for (const r of mem) await notify(db, Number(r.user_id), `@${me.username} ${c.kind === 'group' ? '“' + c.name + '” guruhida' : 'chatingizda'} Flappy rekordini yangiladi: ${score}`, `/c/c${cid}`, uid);
        }
        return send(res, 200, { ok: true, record: up.length > 0 });
      }
      default: return bad(res, 'Noma’lum amal');
    }
  } catch (e) { send(res, 500, { error: 'server', message: 'Serverda xato, qayta urinib ko‘ring' }); }
}
