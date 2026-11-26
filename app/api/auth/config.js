import { send } from '../_lib.js';
// GET /api/auth/config — brauzerga Google Client ID (maxfiy emas) beradi
export default function handler(req, res) {
  send(res, 200, { googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}
