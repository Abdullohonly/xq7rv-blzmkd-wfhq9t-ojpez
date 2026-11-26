// Cloudflare R2 (S3 mos) ga rasm yuklash: AWS Signature V4, qo'shimcha kutubxonasiz
import { createHash, createHmac, randomBytes } from 'node:crypto';
const sha256 = d => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function sigV4({ method, host, path, query = '', headers, payloadHash, accessKey, secret, region, service, amzDate }) {
  const date = amzDate.slice(0, 8);
  const all = { ...headers, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).map(h => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonHeaders = names.map(h => `${h}:${lower[h]}\n`).join('');
  const signed = names.join(';');
  const canon = [method, path.split('/').map(enc).join('/'), query, canonHeaders, signed, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canon)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + secret, date), region), service), 'aws4_request');
  const signature = createHmac('sha256', kSign).update(toSign).digest('hex');
  return { headers: { ...lower, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}` }, signature };
}

const E = () => process.env;
export const r2Ready = () => !!(E().R2_ACCOUNT_ID && E().R2_ACCESS_KEY_ID && E().R2_SECRET_ACCESS_KEY && E().R2_BUCKET && E().R2_PUBLIC_URL);
const TYPES = { jpeg: 'jpg', png: 'png', webp: 'webp' };

// dataURL (data:image/jpeg;base64,...) ni R2 ga yuklaydi va ochiq havolani qaytaradi; R2 sozlanmagan bo'lsa null
export async function r2PutDataUrl(dataUrl, prefix) {
  if (!r2Ready()) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const body = Buffer.from(m[2], 'base64');
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString('hex')}.${TYPES[m[1]]}`;
  const host = `${E().R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`, path = `/${E().R2_BUCKET.trim()}/${key}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const { headers } = sigV4({
    method: 'PUT', host, path, payloadHash: sha256(body), amzDate, region: 'auto', service: 's3',
    headers: { 'content-type': `image/${m[1]}`, 'cache-control': 'public, max-age=31536000, immutable' },
    accessKey: E().R2_ACCESS_KEY_ID.trim(), secret: E().R2_SECRET_ACCESS_KEY.trim()
  });
  delete headers.host;
  const r = await fetch(`https://${host}${path}`, { method: 'PUT', headers, body });
  if (!r.ok) throw new Error('r2 ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return `${E().R2_PUBLIC_URL.trim().replace(/\/+$/, '')}/${key}`;
}

// R2 bucket'dagi fayllar soni va umumiy hajmi (ListObjectsV2, 1000 tadan; ko'pi bilan 20 sahifa)
export async function r2Usage() {
  if (!r2Ready()) return null;
  const host = `${E().R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`, path = `/${E().R2_BUCKET.trim()}`;
  let bytes = 0, count = 0, token = null, pages = 0, more = true;
  while (more && pages < 20) {
    const q = { 'list-type': '2', 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
    const query = Object.keys(q).sort().map(k => `${enc(k)}=${enc(q[k])}`).join('&');
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const { headers } = sigV4({ method: 'GET', host, path, query, headers: {}, payloadHash: sha256(''), amzDate, region: 'auto', service: 's3', accessKey: E().R2_ACCESS_KEY_ID.trim(), secret: E().R2_SECRET_ACCESS_KEY.trim() });
    delete headers.host;
    const r = await fetch(`https://${host}${path}?${query}`, { headers });
    const xml = await r.text();
    if (!r.ok) throw new Error('r2 list ' + r.status + ' ' + (/<Code>([^<]+)<\/Code>/.exec(xml) || [])[1]);
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) { bytes += Number(m[1]); count++; }
    more = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml) || [])[1] || null;
    pages++; if (!token) more = false;
  }
  return { bytes, count, more, limitBytes: 10 * 1024 ** 3 };
}
