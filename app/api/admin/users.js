import { sql, requireAdmin, isOwnerEmail, send, sameOrigin } from '../_lib.js';
// Faqat ega (musoxonshovkatov@gmail.com) uchun: GET — ro'yxat; POST { action, id } — block | unblock | delete
export default async function handler(req, res) {
  try {
    const a = await requireAdmin(req);
    if (a.error === 403) return send(res, 403, { error: 'forbidden' });
    if (a.error === 401) return send(res, 401, { error: 'phrase', message: 'Sirli frazani kiriting' });
    const db = sql();
    if (req.method === 'GET' && (req.query || {}).stats) {
      // baza hajmi va akkaunt statistikasi (Neon bepul tarifi: 0.5 GB)
      const [r] = await db`select pg_database_size(current_database())::bigint as bytes,
        (select count(*)::int from users where not is_system) as users,
        (select count(*)::int from users where not is_system and created_at > now() - interval '1 day') as today,
        (select count(*)::int from users where is_blocked) as blocked,
        (select count(*)::int from banned_emails) as banned`;
      return send(res, 200, { dbBytes: Number(r.bytes), limitBytes: 512 * 1024 * 1024, users: r.users, today: r.today, blocked: r.blocked, banned: r.banned });
    }
    if (req.method === 'GET') {
      const users = await db`select id, username, name, email, is_blocked, created_at from users where not is_system order by id`;
      const banned = await db`select email from banned_emails order by created_at desc`;
      return send(res, 200, { users: users.map(u => ({ ...u, id: Number(u.id) })), banned: banned.map(b => b.email) });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    const { action, id, email } = req.body || {};
    if (!['block', 'unblock', 'delete', 'unban'].includes(action)) return send(res, 400, { error: 'action' });
    if (action === 'unban') { await db`delete from banned_emails where email = ${String(email || '').toLowerCase()}`; await db`update users set is_blocked = false where email = ${String(email || '').toLowerCase()}`; return send(res, 200, { ok: true }); }
    const [t] = await db`select * from users where id = ${Number(id)} and not is_system`;
    if (!t) return send(res, 404, { error: 'not_found' });
    if (isOwnerEmail(t.email)) return send(res, 400, { error: 'owner' });
    if (action === 'block') {
      await db`update users set is_blocked = true where id = ${t.id}`;
      if (t.email) await db`insert into banned_emails (email) values (${t.email}) on conflict do nothing`;
    } else if (action === 'unblock') {
      await db`update users set is_blocked = false where id = ${t.id}`;
      if (t.email) await db`delete from banned_emails where email = ${t.email}`;
    } else if (action === 'delete') {
      await db`delete from users where id = ${t.id}`;
    } else return send(res, 400, { error: 'action' });
    send(res, 200, { ok: true });
  } catch { send(res, 500, { error: 'server' }); }
}
