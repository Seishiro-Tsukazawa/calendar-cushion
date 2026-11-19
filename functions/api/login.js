import { verifyGoogleIdToken, createSession, sessionCookie } from '../../lib/auth.js';
import { json } from '../../lib/events.js';
import { safeEqual, clientIp, isBlocked, addHit } from '../../lib/password.js';

const MAX_PER_IP = 10; // 1時間あたり（招待コードの間違いも含む）

// Googleでのログイン。初めてのアカウントは、招待コードを添えて登録する
export async function onRequestPost({ request, env }) {
  if (!env.EVENTS || !env.GOOGLE_CLIENT_ID) return json({ error: 'config' }, 500);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin' }, 403);
  if (request.headers.get('X-Requested-With') !== 'cushion') return json({ error: 'header' }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'body' }, 400); }
  let user;
  try { user = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID); }
  catch (e) { return json({ error: 'verify' }, 401); }

  const regKey = 'g:' + user.sub;
  if (!(await env.EVENTS.get(regKey))) {
    if (!env.INVITE_CODE) return json({ error: 'disabled' }, 503);
    const ipKey = `rl:reg:${clientIp(request)}`;
    if (await isBlocked(env, ipKey, MAX_PER_IP)) return json({ error: 'toomany' }, 429);
    if (typeof body.invite !== 'string' || !body.invite.trim()) return json({ error: 'invite_required' }, 403);
    if (!safeEqual(body.invite.trim(), env.INVITE_CODE.trim())) {
      await addHit(env, ipKey, 3600);
      return json({ error: 'invite' }, 403);
    }
    await env.EVENTS.put(regKey, JSON.stringify({ email: user.email, created: Date.now() }));
  }
  const token = await createSession(env, user);
  return json({ email: user.email, name: user.name }, 200, { 'Set-Cookie': sessionCookie(token) });
}
