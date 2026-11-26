import { send } from '../_lib.js';
import { vapid } from '../_push.js';
// GET /api/auth/config — brauzerga Google Client ID (maxfiy emas) beradi
export default function handler(req, res) {
  // build: har push'da o'zgaradi, ilova shunga qarab o'zini avtomatik yangilaydi
  let vk = null; try { vk = vapid().publicKey; } catch (e) {}
  send(res, 200, { vapid: vk, googleClientId: process.env.GOOGLE_CLIENT_ID || null, build: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '').slice(0, 12) });
}
