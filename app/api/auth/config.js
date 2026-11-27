import { send, sql } from '../_lib.js';
import { vapid } from '../_push.js';
// GET /api/auth/config — brauzerga Google Client ID (maxfiy emas) beradi
export default async function handler(req, res) {
  // build: har push'da o'zgaradi, ilova shunga qarab o'zini avtomatik yangilaydi
  let vk = null; try { vk = vapid().publicKey; } catch (e) {}
  let maint = null; try { const [m] = await sql()`select value from app_flags where key = 'maint'`; maint = m ? m.value : null; } catch (e) {}
  res.setHeader('Cache-Control', 'no-store');
  send(res, 200, { maint, vapid: vk, googleClientId: process.env.GOOGLE_CLIENT_ID || null, build: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '').slice(0, 12) });
}
