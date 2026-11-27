// Web Push (RFC 8291 shifrlash + RFC 8292 VAPID) — tashqi kutubxonasiz, faqat node:crypto
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign as cSign } from 'node:crypto';

const b64u = b => Buffer.from(b).toString('base64url');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

// VAPID kaliti SESSION_SECRET'dan hosil qilinadi: alohida maxfiy kalit saqlash shart emas
let VAPID = null;
export function vapid() {
  if (VAPID) return VAPID;
  const s = process.env.SESSION_SECRET; if (!s) throw new Error('SESSION_SECRET missing');
  const d = hmac(s, 'lahzam-vapid-v1'), ec = createECDH('prime256v1'); ec.setPrivateKey(d);
  const pub = ec.getPublicKey();
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  return (VAPID = { publicKey: b64u(pub), key });
}
function jwt(endpoint) {
  const { key } = vapid(), aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:musoxonshovkatov@gmail.com' }));
  const sig = cSign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}
// aes128gcm: brauzer uchun xabarni shifrlaymiz (faqat qabul qiluvchi ocha oladi)
export function encrypt(payload, p256dh, authSecret, _as = null, _salt = null) {
  const ua = Buffer.from(p256dh, 'base64url'), auth = Buffer.from(authSecret, 'base64url');
  const ec = createECDH('prime256v1'); if (_as) ec.setPrivateKey(Buffer.from(_as, 'base64url')); else ec.generateKeys();
  const as = ec.getPublicKey(), shared = ec.computeSecret(ua), salt = _salt ? Buffer.from(_salt, 'base64url') : randomBytes(16);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([as.length]), as, ct]);
}
async function sendOne(sub, data) {
  const body = encrypt(JSON.stringify(data), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST', body, signal: AbortSignal.timeout(5000),
    headers: { TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: `vapid t=${jwt(sub.endpoint)}, k=${vapid().publicKey}` }
  });
  return r.status;
}
// Foydalanuvchilarga push: ilova hozir ochiq bo'lganlarga yubormaymiz (ular ilovaning o'zida ko'radi)
export async function pushTo(db, ids, data) {
  ids = [...new Set(ids.map(Number))].filter(Boolean); if (!ids.length) return;
  try {
    const subs = await db`select s.id, s.endpoint, s.p256dh, s.auth from push_subs s join users u on u.id = s.user_id
      where s.user_id = any(${ids}::bigint[]) and not u.is_system and (${!!data.always} or u.last_seen is null or u.last_seen < now() - interval '12 seconds') limit 300`;
    const dead = [];
    await Promise.all(subs.map(s => sendOne(s, data).then(st => { if (st === 404 || st === 410) dead.push(Number(s.id)); }).catch(() => {})));
    if (dead.length) await db`delete from push_subs where id = any(${dead}::bigint[])`;
  } catch (e) {}
}
