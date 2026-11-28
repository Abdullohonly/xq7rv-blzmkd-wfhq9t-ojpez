import { createHash } from 'node:crypto';
import { sql, currentUser, isOwnerEmail, hasAdminPass, send, OWNER_EMAIL, vpnBlocked, vpnRes, lvDay, lvAt, LV_WIN } from './_lib.js';
import { pushTo } from './_push.js';
// 🔔 Aqlli bildirishnomalar: cron kerak emas — vaqti kelgach birinchi sync bajaradi (kuniga bir marta, bazadagi qulf bilan)
const JOBS_DONE = new Set();
async function once(db, job, day) {
  const k = job + day; if (JOBS_DONE.has(k)) return false;
  const [r] = await db`insert into daily_jobs (job, day) values (${job}, ${day}::date) on conflict do nothing returning job`;
  JOBS_DONE.add(k); return !!r;
}
async function dailyJobs(db, day, lvState) {
  const hour = new Date(Date.now() + 5 * 36e5).getUTCHours();
  // 🔥 20:00 dan keyin: bugun Kun savoliga javob bermagan, seriyasi bor odamlarga eslatma
  if (hour >= 20 && await once(db, 'streak', day)) {
    const rows = await db`select id, streak from users where not is_system and not is_blocked and streak >= 1
      and streak_day = (now() at time zone 'Asia/Tashkent')::date - 1`;
    for (const r of rows) await pushTo(db, [Number(r.id)], { title: '🔥 Seriyangiz yonib ketmoqda!', body: `${r.streak} kunlik seriyangiz bugun tugaydi. Kun savoliga javob bering va olovni saqlang!`, url: '/', tag: 'sk' + day }).catch(() => {});
  }
  // 📬 Dushanba 09:00 dan keyin: o'tgan haftaning shaxsiy xulosasi (faqat bildirishnomaga obuna bo'lganlarga)
  const dow = new Date(Date.now() + 5 * 36e5).getUTCDay();
  if (dow === 1 && hour >= 9 && await once(db, 'weekly', day)) {
    const rows = await db`select u.id, u.streak, (u.streak_day >= (now() at time zone 'Asia/Tashkent')::date - 1) as sk_on,
        (select count(*)::int from posts p where p.user_id = u.id and p.created_at > now() - interval '7 days' and not p.is_hidden) as posts,
        (select count(*)::int from post_likes l join posts p on p.id = l.post_id where p.user_id = u.id and l.user_id <> u.id and p.created_at > now() - interval '7 days') as likes,
        (select count(*)::int from follows f where f.followee_id = u.id and f.created_at > now() - interval '7 days') as fols
      from users u where not u.is_system and not u.is_blocked and exists (select 1 from push_subs s where s.user_id = u.id)`;
    for (const r of rows) {
      const parts = [r.likes && `❤️ ${r.likes} like`, r.fols && `👥 ${r.fols} yangi obunachi`, r.posts && `✍️ ${r.posts} post`, r.sk_on && r.streak > 0 && `🔥 ${r.streak} kun seriya`].filter(Boolean);
      const body = parts.length ? `O‘tgan hafta: ${parts.join(', ')}. Yangi haftani zo‘r boshlang! 💪` : 'Yangi hafta boshlandi! Kun savoliga javob bering va 🔥 seriyani boshlang 💪';
      await pushTo(db, [Number(r.id)], { title: '📬 Haftalik xulosangiz', body, url: '/', tag: 'wk' + day }).catch(() => {});
    }
  }
  // 👀 Lahza vaqti tugagach: hali joylamaganlarga "N kishi joyladi"
  if (lvState === 2 && await once(db, 'lvrecap', day)) {
    const [{ n }] = await db`select count(*)::int as n from lv_posts where day = ${day}::date`;
    if (n > 0) {
      const top = await db`select u.name from lv_posts p join users u on u.id = p.user_id where p.day = ${day}::date order by p.late_min, p.created_at limit 1`;
      const ids = (await db`select id from users u where not is_system and not is_blocked and not exists (select 1 from lv_posts p where p.day = ${day}::date and p.user_id = u.id)`).map(r => Number(r.id));
      const who = top[0] ? String(top[0].name).split(' ')[0] : 'Kimdir';
      await pushTo(db, ids, { title: '👀 Bugungi lahzalar', body: n > 1 ? `${who} va yana ${n - 1} kishi lahzasini joyladi. Siznikini kutishyapti!` : `${who} bugungi lahzasini joyladi. Siznikini kutishyapti!`, url: '/', tag: 'lvr' + day }).catch(() => {});
    }
  }
}
// GET /api/sync — ilova uchun hamma umumiy ma'lumot bitta so'rovda: odamlar, postlar, guruhlar, chatlar, bildirishnomalar
// Rasmlar bu yerga kirmaydi (og'ir): ular /api/img orqali alohida, keshlanib yuklanadi
const ms = t => new Date(t).getTime();
// Rasmlar doim o'z domenimiz orqali (r2.dev ba'zi tarmoqlarda sekin/bloklangan bo'lishi mumkin)
const photoUrl = (id, hash) => hash ? `/api/img?u=${id}&v=${hash}` : null;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: 'auth' });
    if (!isOwnerEmail(me.email) && vpnBlocked(req)) return vpnRes(res);
    const db = sql(), uid = Number(me.id);
    const admin = isOwnerEmail(me.email) && hasAdminPass(req, me);

    // onlayn holat: har sync'da "oxirgi marta ko'rildi" yangilanadi (10 soniyada bir martadan ko'p emas)
    const seenQ = db`update users set last_seen = now() where id = ${uid} and (last_seen is null or last_seen < now() - interval '10 seconds')`;
    // ⚡ Yengil tekshiruv: bitta kichik so'rov bilan "biror narsa o'zgardimi?" barmoq izi (fingerprint).
    // O'zgarmagan bo'lsa og'ir so'rovlar umuman ishlamaydi — server CPU'si ~10 baravar kam sarflanadi.
    const [fpRow] = await db`select concat_ws(':', ${admin}::text, (now() at time zone 'Asia/Tashkent')::date::text,
      (select count(*) || '.' || coalesce(max(id), 0) || '.' || coalesce(sum(length(body)), 0) || '.' || count(*) filter (where is_hidden) || '.' || count(*) filter (where created_at > now()) || '.' || coalesce(sum(hashtext(coalesce(poll::text, ''))), 0) from posts),
      (select count(*) from post_likes), (select count(*) || '.' || coalesce(sum(opt), 0) from post_votes),
      (select count(*) || '.' || coalesce(max(id), 0) || '.' || coalesce(sum(length(body)), 0) from replies),
      (select count(*) || '.' || coalesce(max(id), 0) || '.' || count(*) filter (where edited) || '.' || coalesce(sum(length(coalesce(xo::text, ''))), 0) || '.' || count(*) filter (where created_at > now()) from messages),
      (select count(*) from reactions), (select count(*) || '.' || coalesce(sum(opt), 0) from poll_votes),
      (select count(*) || '.' || coalesce(sum(hashtext(concat_ws('|', status, last_read, muted))), 0) || '.' || count(*) filter (where typing_at > now() - interval '6 seconds') from chat_members),
      (select count(*) || '.' || count(*) filter (where is_read) from notifications where user_id = ${uid}),
      (select count(*) from follows),
      (select count(*) || '.' || coalesce(sum(hashtext(concat_ws('|', username, name, bio, color, star_color, cover, star_until, is_blocked, pinned_post, hide_online, hide_read, length(photo), right(photo, 24), warns, dm_from, rr_off, bday, streak, streak_day))), 0) from users),
      (select count(*) || '.' || coalesce(sum(hashtext(concat_ws('|', name, description, access, color, pin_id, flappy_score, tetris_score, g2048_score, mines_score, admin_id))), 0) from chats),
      (select count(*) from daily_answers), (select count(*) from daily_likes),
      (select coalesce(max(body), '') from daily_q where day = (now() at time zone 'Asia/Tashkent')::date),
      (select count(*) || '.' || coalesce(sum(score), 0) from tourney_scores), (select count(*) || '.' || count(*) filter (where done) from tournaments),
      (select count(*) from reports), (select coalesce(max(value), '') from app_flags where key = 'maint'),
      (select count(*) || '.' || coalesce(max(id), 0) from lv_posts where day = ${lvDay()}::date)) as f,
      (select max(value) from app_flags where key = 'maint') as maint`;
    // 🛠 Texnik ishlar: egasidan boshqa hamma uchun sayt yopiq
    if (fpRow.maint && !isOwnerEmail(me.email)) { res.setHeader('Cache-Control', 'no-store'); return send(res, 503, { error: 'maint', maint: fpRow.maint }); }
    // 📸 Lahza vaqti: vaqti kelganda birinchi sync hammaga bildirishnoma yuboradi (bir kunda bir marta)
    const lvD = lvDay(), lvT = lvAt(lvD), lvNow = Date.now(), lvState = lvNow < lvT ? 0 : lvNow < lvT + LV_WIN ? 1 : 2;
    if (lvState === 1) {
      const [first] = await db`insert into lv_sent (day) values (${lvD}::date) on conflict do nothing returning day`;
      if (first) { const all = await db`select id from users where not is_system and not is_blocked`;
        await pushTo(db, all.map(r => Number(r.id)), { title: '📸 Lahza vaqti!', body: '2 daqiqa ichida hozirgi lahzangizni suratga oling. Hamma bir vaqtda!', url: '/', tag: 'lv' + lvD, always: true }).catch(() => {}); }
    }
    await dailyJobs(db, lvD, lvState).catch(() => {});
    const fp = createHash('sha1').update(String(fpRow.f) + ':lv' + lvState).digest('base64url').slice(0, 16);
    if (req.query && req.query.fp === fp) { await seenQ.catch(() => {}); res.setHeader('Cache-Control', 'private, no-store'); return send(res, 200, { same: 1 }); }
    const [users, follows, posts, likes, replies, myReports, chats, members, notifs, stars, daily, dq, pvotes] = await Promise.all([
      db`select id, username, name, bio, color, is_system, is_blocked, created_at, dm_from, rr_off, warns, lower(email) = ${OWNER_EMAIL} as is_owner, coalesce(star_until > now(), false) or lower(email) = ${OWNER_EMAIL} as is_star, star_color, cover, pinned_post, hide_online, hide_read, bday,
           case when streak_day >= (now() at time zone 'Asia/Tashkent')::date - 1 then streak else 0 end as sk,
           case when photo is null then null else substr(md5(photo), 1, 10) end as ph,
           coalesce(last_seen > now() - interval '45 seconds', false) as online, (extract(epoch from date_trunc('minute', last_seen)) * 1000)::bigint as ls
         from users order by id limit 2000`,
      db`select follower_id, followee_id from follows limit 20000`,
      db`select p.id, p.user_id, p.body, p.is_lahza, p.is_hidden, p.created_at, p.edited, p.poll, p.quote_id,
           case when p.img like 'https://%' then p.img when p.img is not null then '' end as img_url,
           (select count(*)::int from post_views v where v.post_id = p.id) as views,
           exists(select 1 from post_views v where v.post_id = p.id and v.user_id = ${uid}) as seen,
           (select count(*)::int from reports r where r.post_id = p.id) as reports
         from posts p
         where (${admin} or not p.is_hidden) and (not p.is_lahza or p.created_at > now() - interval '1 day')
           and (p.created_at <= now() or p.user_id = ${uid})
         order by p.created_at desc limit 200`,
      db`select l.post_id, l.user_id from post_likes l join (select id from posts order by created_at desc limit 200) p on p.id = l.post_id`,
      db`select r.id, r.post_id, r.user_id, r.body, r.created_at, r.parent_id from replies r join (select id from posts order by created_at desc limit 200) p on p.id = r.post_id order by r.created_at`,
      db`select post_id from reports where reporter_id = ${uid}`,
      db`select c.* from chats c
         where exists(select 1 from chat_members m where m.chat_id = c.id and m.user_id = ${uid})
            or (c.kind = 'group' and c.access in ('open', 'ask'))
         order by c.id limit 500`,
      db`select m.chat_id, m.user_id, m.status, m.last_read, m.muted, coalesce(m.typing_at > now() - interval '6 seconds', false) as typing from chat_members m
         join chats c on c.id = m.chat_id
         where exists(select 1 from chat_members x where x.chat_id = c.id and x.user_id = ${uid}) or (c.kind = 'group' and c.access in ('open', 'ask'))`,
      db`select id, body, link, is_read, created_at from notifications where user_id = ${uid} and link not like '/c/%' order by created_at desc limit 60`,
      db`select m.user_id as receiver,
           count(distinct r.user_id)::int as total,
           count(distinct r.user_id) filter (where m.created_at > now() - interval '7 days')::int as week
         from reactions r join messages m on m.id = r.message_id join chats c on c.id = m.chat_id
         where r.emoji = '⭐' and c.kind = 'group' and r.user_id <> m.user_id
         group by m.user_id`,
      db`select d.id, d.user_id, d.body, d.created_at,
           (select count(*)::int from daily_likes l where l.answer_id = d.id) as likes,
           exists(select 1 from daily_likes l where l.answer_id = d.id and l.user_id = ${uid}) as liked
         from daily_answers d where d.day = (now() at time zone 'Asia/Tashkent')::date
         order by likes desc, d.created_at desc limit 100`,
      db`select body from daily_q where day = (now() at time zone 'Asia/Tashkent')::date`,
      db`select v.post_id, v.user_id, v.opt from post_votes v join (select id from posts where poll is not null order by created_at desc limit 200) p on p.id = v.post_id`
    ]);
    await seenQ.catch(() => {});
    // 🏁 Vaqti tugagan turnirlar yakunlanadi: g'olib chatga e'lon qilinadi (faqat bir marta)
    const ended = await db`update tournaments set done = true where not done and ends_at <= now() returning id, chat_id, game`;
    for (const tn of ended) {
      const top = await db`select u.username, s.score from tourney_scores s join users u on u.id = s.user_id where s.tid = ${tn.id} order by s.score desc limit 3`;
      const g = { flappy: 'Flappy', tetris: 'Tetris', '2048': '2048', mines: 'Mina' }[tn.game];
      const body = top.length ? `🏆 ${g} turniri tugadi! G‘olib: @${top[0].username} (${top[0].score} ochko)` + (top[1] ? ` · 🥈 @${top[1].username} (${top[1].score})` : '') + (top[2] ? ` · 🥉 @${top[2].username} (${top[2].score})` : '') : `🏁 ${g} turniri tugadi: hech kim o‘ynamadi`;
      await db`insert into messages (chat_id, user_id, body, is_sys) values (${tn.chat_id}, null, ${body}, true)`;
    }
    const tours = await db`select t.id, t.chat_id, t.game, t.ends_at, coalesce(json_agg(json_build_object('u', s.user_id, 's', s.score) order by s.score desc) filter (where s.user_id is not null), '[]') as sc
      from tournaments t left join tourney_scores s on s.tid = t.id where not t.done and t.ends_at > now() group by t.id`;
    const tourBy = Object.fromEntries(tours.map(x => [Number(x.chat_id), { id: Number(x.id), game: x.game, ends: ms(x.ends_at), sc: (typeof x.sc === 'string' ? JSON.parse(x.sc) : x.sc).map(r => ({ u: Number(r.u), s: Number(r.s) })) }]));

    // Xabarlar: faqat a'zo bo'lgan chatlar (admin esa ochiq guruhlarni ham ko'radi)
    const mem = members.filter(m => Number(m.user_id) === uid && m.status === 'member').map(m => Number(m.chat_id));
    const peek = admin ? chats.filter(c => c.kind === 'group' && c.access === 'open').map(c => Number(c.id)) : [];
    const readable = [...new Set([...mem, ...peek])];
    let msgs = [], reacts = [], votes = [];
    if (readable.length) {
      msgs = await db`select * from (select id, chat_id, user_id, body, is_game, is_sys, reply_to, edited, case when img like 'https://%' then img when img is not null then '' end as img_url, poll, fwd_user, xo, created_at,
          row_number() over (partition by chat_id order by created_at desc) rn from messages where chat_id = any(${readable}::bigint[]) and (created_at <= now() or user_id = ${uid})) x where rn <= 300 order by created_at`;
      if (msgs.length) {
        const mids = msgs.map(m => Number(m.id));
        [reacts, votes] = await Promise.all([
          db`select message_id, user_id, emoji from reactions where message_id = any(${mids}::bigint[])`,
          db`select message_id, user_id, opt from poll_votes where message_id = any(${mids}::bigint[])`
        ]);
      }
    }

    // ⭐ "o'qildi" belgisini yashirgan Yulduz a'zolari
    const hideRead = new Set(users.filter(x => x.is_star && x.hide_read).map(x => Number(x.id)));
    const likeMap = {}, repMap = {};
    likes.forEach(l => (likeMap[l.post_id] = likeMap[l.post_id] || []).push(Number(l.user_id)));
    replies.forEach(r => (repMap[r.post_id] = repMap[r.post_id] || []).push({ id: 'r' + r.id, uid: Number(r.user_id), text: r.body, t: ms(r.created_at), parent: r.parent_id ? 'r' + r.parent_id : undefined }));
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
      if (m.xo) { const X = typeof m.xo === 'string' ? JSON.parse(m.xo) : m.xo; out.xo = { x: Number(X.x), o: X.o == null ? null : Number(X.o), b: X.b, t: X.t, w: X.w }; }
      if (new Date(m.created_at) > new Date()) out.sched = true;
      if (m.reply_to) out.replyTo = 'm' + m.reply_to;
      if (m.edited) out.edited = true;
      if (m.img_url != null) out.img = `/api/img?m=${m.id}`;
      if (m.fwd_user) out.fwd = Number(m.fwd_user);
      if (P) out.poll = { q: P.q, opts: P.opts.map((t, i) => ({ t, v: (voteMap[m.id] || []).filter(v => v.o === i).map(v => v.u) })) };
      (byChat[m.chat_id] = byChat[m.chat_id] || []).push(out);
    });
    const memByChat = {};
    members.forEach(m => (memByChat[m.chat_id] = memByChat[m.chat_id] || []).push(m));

    let lv;
    if (lvState) {
      const lvRows = await db`select id, user_id, img, caption, late_min, created_at from lv_posts where day = ${lvD}::date order by late_min, created_at`;
      const mine = lvRows.some(r => Number(r.user_id) === uid);
      lv = { at: lvT, win: LV_WIN, mine, n: lvRows.length,
        posts: mine || admin ? lvRows.map(r => ({ id: 'v' + r.id, uid: Number(r.user_id), img: r.img, cap: r.caption || undefined, late: r.late_min || undefined, t: ms(r.created_at) })) : undefined };
    }
    const payload = {
      lv,
      me: Number(me.id), admin, maint: fpRow.maint || undefined,
      users: users.filter(u => !u.is_blocked || admin || Number(u.id) === uid).map(u => ({
        id: Number(u.id), u: u.username, name: u.name, bio: u.bio, color: u.color, system: u.is_system || undefined,
        blocked: u.is_blocked || undefined, joined: ms(u.created_at), photo: photoUrl(u.id, u.ph),
        owner: u.is_owner || undefined,
        star: u.is_star || undefined, starColor: u.is_star ? (u.star_color || 'tilla') : undefined, cover: u.is_star && u.cover ? u.cover : undefined, pin: u.is_star && u.pinned_post ? 'p' + u.pinned_post : undefined,
        // ⭐ Ko'rinmas rejim: onlayn holat va oxirgi ko'rilgan vaqt boshqalarga ko'rinmaydi
        on: u.online && Number(u.id) !== uid && !(u.is_star && u.hide_online) || undefined, ls: u.ls && !(u.is_star && u.hide_online && Number(u.id) !== uid) ? Number(u.ls) : undefined,
        bd: u.bday || undefined, sk: u.sk > 0 ? u.sk : undefined,
        dmFrom: u.dm_from === 'fol' ? 'fol' : undefined, rrOff: u.rr_off || undefined, warns: admin ? u.warns : undefined
      })),
      follows: follows.map(f => [Number(f.follower_id), Number(f.followee_id)]),
      posts: posts.map(p => { const P = p.poll ? (typeof p.poll === 'string' ? JSON.parse(p.poll) : p.poll) : null; return {
        id: 'p' + p.id, uid: Number(p.user_id), text: p.body, t: ms(p.created_at), edited: p.edited || undefined, lahza: p.is_lahza || undefined, hidden: p.is_hidden || undefined,
        img: p.img_url == null ? undefined : `/api/img?p=${p.id}`,
        likes: likeMap[p.id] || [], views: p.views, seen: p.seen, replies: repMap[p.id] || [],
        reports: admin ? p.reports : undefined, reported: reported.has(Number(p.id)) || undefined,
        poll: P ? { q: P.q, opts: P.opts.map((t, i) => ({ t, v: pvotes.filter(v => v.post_id == p.id && v.opt === i).map(v => Number(v.user_id)) })) } : undefined,
        quote: p.quote_id ? 'p' + p.quote_id : undefined, sched: ms(p.created_at) > Date.now() || undefined
      }; }),
      chats: chats.map(c => {
        const ms2 = memByChat[c.id] || [], mine = ms2.find(m => Number(m.user_id) === uid);
        const isMember = !!mine && mine.status === 'member', canRead = readable.includes(Number(c.id));
        const read = {};
        if (isMember) ms2.filter(m => m.status === 'member' && (Number(m.user_id) === uid || !hideRead.has(Number(m.user_id)))).forEach(m => { read[m.user_id] = ms(m.last_read); });
        return {
          id: 'c' + c.id, type: c.kind, name: c.name, desc: c.description, cat: c.category, access: c.access, color: c.color,
          admin: c.admin_id == null ? null : Number(c.admin_id),
          members: ms2.filter(m => m.status === 'member').map(m => Number(m.user_id)),
          banned: isMember && Number(c.admin_id) === uid ? ms2.filter(m => m.status === 'banned').map(m => Number(m.user_id)) : undefined,
          isBanned: mine && mine.status === 'banned' || undefined,
          pending: (isMember && Number(c.admin_id) === uid) || (mine && mine.status === 'pending') ? ms2.filter(m => m.status === 'pending').map(m => Number(m.user_id)) : [],
          record: c.flappy_score ? { score: c.flappy_score, uid: Number(c.flappy_user) } : null,
          trecord: c.tetris_score ? { score: c.tetris_score, uid: Number(c.tetris_user) } : null,
          tour: isMember ? tourBy[Number(c.id)] || null : null,
          mrecord: c.mines_score ? { score: c.mines_score, uid: Number(c.mines_user) } : null,
          grecord: c.g2048_score ? { score: c.g2048_score, uid: Number(c.g2048_user) } : null,
          typing: isMember ? ms2.filter(m => m.typing && Number(m.user_id) !== uid).map(m => Number(m.user_id)) : [],
          muted: mine && mine.muted || undefined,
          pin: c.pin_id ? 'm' + c.pin_id : null, read, msgs: canRead ? (byChat[c.id] || []) : [], full: canRead
        };
      }),
      dq: dq[0] ? dq[0].body : null,
      daily: daily.map(d => ({ id: 'q' + d.id, uid: Number(d.user_id), text: d.body, t: ms(d.created_at), likes: d.likes, liked: d.liked || undefined })),
      notifs: notifs.map(n => ({ id: 'n' + n.id, text: n.body, link: n.link, read: n.is_read, t: ms(n.created_at) })),
      stars: Object.fromEntries(stars.map(s => [Number(s.receiver), { all: s.total, week: s.week }])),
      fp
    };
    // O'zgarmagan bo'lsa 304: telefon hech narsa yuklamaydi (trafik va tezlik)
    const body = JSON.stringify(payload), tag = '"' + createHash('sha1').update(body).digest('base64url') + '"';
    res.setHeader('ETag', tag); res.setHeader('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).end(body);
  } catch (e) { send(res, 500, { error: 'server' }); }
}
