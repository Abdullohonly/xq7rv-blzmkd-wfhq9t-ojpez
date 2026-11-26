import { createHash } from 'node:crypto';
import { sql, currentUser, isOwnerEmail, hasAdminPass, send } from './_lib.js';
// GET /api/sync — ilova uchun hamma umumiy ma'lumot bitta so'rovda: odamlar, postlar, guruhlar, chatlar, bildirishnomalar
// Rasmlar bu yerga kirmaydi (og'ir): ular /api/img orqali alohida, keshlanib yuklanadi
const ms = t => new Date(t).getTime();
const photoUrl = (id, hash) => !hash ? null : hash.startsWith('https://') ? hash : `/api/img?u=${id}&v=${hash}`;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: 'auth' });
    const db = sql(), uid = Number(me.id);
    const admin = isOwnerEmail(me.email) && hasAdminPass(req, me);

    const [users, follows, posts, likes, replies, myReports, chats, members, notifs, stars] = await Promise.all([
      db`select id, username, name, bio, color, is_system, is_blocked, created_at, dm_from, rr_off, warns,
           case when photo is null then null when photo like 'https://%' then photo else substr(md5(photo), 1, 10) end as ph
         from users order by id limit 2000`,
      db`select follower_id, followee_id from follows limit 20000`,
      db`select p.id, p.user_id, p.body, p.is_lahza, p.is_hidden, p.created_at,
           (select count(*)::int from post_views v where v.post_id = p.id) as views,
           exists(select 1 from post_views v where v.post_id = p.id and v.user_id = ${uid}) as seen,
           (select count(*)::int from reports r where r.post_id = p.id) as reports
         from posts p
         where (${admin} or not p.is_hidden) and (not p.is_lahza or p.created_at > now() - interval '1 day')
         order by p.created_at desc limit 200`,
      db`select l.post_id, l.user_id from post_likes l join (select id from posts order by created_at desc limit 200) p on p.id = l.post_id`,
      db`select r.id, r.post_id, r.user_id, r.body, r.created_at from replies r join (select id from posts order by created_at desc limit 200) p on p.id = r.post_id order by r.created_at`,
      db`select post_id from reports where reporter_id = ${uid}`,
      db`select c.* from chats c
         where exists(select 1 from chat_members m where m.chat_id = c.id and m.user_id = ${uid})
            or (c.kind = 'group' and c.access in ('open', 'ask'))
         order by c.id limit 500`,
      db`select m.chat_id, m.user_id, m.status, m.last_read from chat_members m
         join chats c on c.id = m.chat_id
         where exists(select 1 from chat_members x where x.chat_id = c.id and x.user_id = ${uid}) or (c.kind = 'group' and c.access in ('open', 'ask'))`,
      db`select id, body, link, is_read, created_at from notifications where user_id = ${uid} order by created_at desc limit 60`,
      db`select m.user_id as receiver,
           count(distinct r.user_id)::int as total,
           count(distinct r.user_id) filter (where m.created_at > now() - interval '7 days')::int as week
         from reactions r join messages m on m.id = r.message_id join chats c on c.id = m.chat_id
         where r.emoji = '⭐' and c.kind = 'group' and r.user_id <> m.user_id
         group by m.user_id`
    ]);

    // Xabarlar: faqat a'zo bo'lgan chatlar (admin esa ochiq guruhlarni ham ko'radi)
    const mem = members.filter(m => Number(m.user_id) === uid && m.status === 'member').map(m => Number(m.chat_id));
    const peek = admin ? chats.filter(c => c.kind === 'group' && c.access === 'open').map(c => Number(c.id)) : [];
    const readable = [...new Set([...mem, ...peek])];
    let msgs = [], reacts = [], votes = [];
    if (readable.length) {
      msgs = await db`select * from (select id, chat_id, user_id, body, is_game, is_sys, reply_to, edited, (img is not null) as has_img, poll, fwd_user, created_at,
          row_number() over (partition by chat_id order by created_at desc) rn from messages where chat_id = any(${readable}::bigint[])) x where rn <= 300 order by created_at`;
      if (msgs.length) {
        const mids = msgs.map(m => Number(m.id));
        [reacts, votes] = await Promise.all([
          db`select message_id, user_id, emoji from reactions where message_id = any(${mids}::bigint[])`,
          db`select message_id, user_id, opt from poll_votes where message_id = any(${mids}::bigint[])`
        ]);
      }
    }

    const likeMap = {}, repMap = {};
    likes.forEach(l => (likeMap[l.post_id] = likeMap[l.post_id] || []).push(Number(l.user_id)));
    replies.forEach(r => (repMap[r.post_id] = repMap[r.post_id] || []).push({ id: 'r' + r.id, uid: Number(r.user_id), text: r.body, t: ms(r.created_at) }));
    const reported = new Set(myReports.map(r => Number(r.post_id)));
    const rxMap = {}, voteMap = {};
    reacts.forEach(r => { const m = (rxMap[r.message_id] = rxMap[r.message_id] || {}); (m[r.emoji] = m[r.emoji] || []).push(Number(r.user_id)); });
    votes.forEach(v => (voteMap[v.message_id] = voteMap[v.message_id] || []).push({ u: Number(v.user_id), o: v.opt }));
    const byChat = {};
    msgs.forEach(m => {
      const P = m.poll ? (typeof m.poll === 'string' ? JSON.parse(m.poll) : m.poll) : null;
      const out = { id: 'm' + m.id, uid: m.user_id == null ? null : Number(m.user_id), text: m.body, t: ms(m.created_at), reacts: rxMap[m.id] || {} };
      if (m.is_sys) out.sys = true;
      if (m.is_game) out.game = true;
      if (m.reply_to) out.replyTo = 'm' + m.reply_to;
      if (m.edited) out.edited = true;
      if (m.has_img) out.img = `/api/img?m=${m.id}`;
      if (m.fwd_user) out.fwd = Number(m.fwd_user);
      if (P) out.poll = { q: P.q, opts: P.opts.map((t, i) => ({ t, v: (voteMap[m.id] || []).filter(v => v.o === i).map(v => v.u) })) };
      (byChat[m.chat_id] = byChat[m.chat_id] || []).push(out);
    });
    const memByChat = {};
    members.forEach(m => (memByChat[m.chat_id] = memByChat[m.chat_id] || []).push(m));

    const payload = {
      me: Number(me.id), admin,
      users: users.filter(u => !u.is_blocked || admin || Number(u.id) === uid).map(u => ({
        id: Number(u.id), u: u.username, name: u.name, bio: u.bio, color: u.color, system: u.is_system || undefined,
        blocked: u.is_blocked || undefined, joined: ms(u.created_at), photo: photoUrl(u.id, u.ph),
        dmFrom: u.dm_from === 'fol' ? 'fol' : undefined, rrOff: u.rr_off || undefined, warns: admin ? u.warns : undefined
      })),
      follows: follows.map(f => [Number(f.follower_id), Number(f.followee_id)]),
      posts: posts.map(p => ({
        id: 'p' + p.id, uid: Number(p.user_id), text: p.body, t: ms(p.created_at), lahza: p.is_lahza || undefined, hidden: p.is_hidden || undefined,
        likes: likeMap[p.id] || [], views: p.views, seen: p.seen, replies: repMap[p.id] || [],
        reports: admin ? p.reports : undefined, reported: reported.has(Number(p.id)) || undefined
      })),
      chats: chats.map(c => {
        const ms2 = memByChat[c.id] || [], mine = ms2.find(m => Number(m.user_id) === uid);
        const isMember = !!mine && mine.status === 'member', canRead = readable.includes(Number(c.id));
        const read = {};
        if (isMember) ms2.filter(m => m.status === 'member').forEach(m => { read[m.user_id] = ms(m.last_read); });
        return {
          id: 'c' + c.id, type: c.kind, name: c.name, desc: c.description, cat: c.category, access: c.access, color: c.color,
          admin: c.admin_id == null ? null : Number(c.admin_id),
          members: ms2.filter(m => m.status === 'member').map(m => Number(m.user_id)),
          pending: (isMember && Number(c.admin_id) === uid) || (mine && mine.status === 'pending') ? ms2.filter(m => m.status === 'pending').map(m => Number(m.user_id)) : [],
          record: c.flappy_score ? { score: c.flappy_score, uid: Number(c.flappy_user) } : null,
          pin: c.pin_id ? 'm' + c.pin_id : null, read, msgs: canRead ? (byChat[c.id] || []) : [], full: canRead
        };
      }),
      notifs: notifs.map(n => ({ id: 'n' + n.id, text: n.body, link: n.link, read: n.is_read, t: ms(n.created_at) })),
      stars: Object.fromEntries(stars.map(s => [Number(s.receiver), { all: s.total, week: s.week }]))
    };
    // O'zgarmagan bo'lsa 304: telefon hech narsa yuklamaydi (trafik va tezlik)
    const body = JSON.stringify(payload), tag = '"' + createHash('sha1').update(body).digest('base64url') + '"';
    res.setHeader('ETag', tag); res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).end(body);
  } catch (e) { send(res, 500, { error: 'server' }); }
}
