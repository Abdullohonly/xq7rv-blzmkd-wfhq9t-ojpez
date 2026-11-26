import { send } from '../_lib.js';
// GET /api/auth/config — brauzerga Google Client ID (maxfiy emas) beradi
export default function handler(req, res) {
  // build: har push'da o'zgaradi, ilova shunga qarab o'zini avtomatik yangilaydi
  send(res, 200, { googleClientId: process.env.GOOGLE_CLIENT_ID || null, build: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '').slice(0, 12) });
}
