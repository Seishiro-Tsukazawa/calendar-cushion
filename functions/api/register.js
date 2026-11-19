import { createSession, sessionCookie } from '../../lib/auth.js';
import { json } from '../../lib/events.js';
import { normalizeUsername, USERNAME_RE, checkPassword, hashPassword, safeEqual, clientIp, isBlocked, addHit } from '../../lib/password.js';

const MAX_PER_IP = 10; // 1時間あたり（招待コードの間違いも含む）

export async function onRequestPost({ request, env }) {
  if (!env.EVENTS) return json({ error: 'config' }, 500);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin' }, 403);
  if (request.headers.get('X-Requested-With') !== 'cushion') return json({ error: 'header' }, 403);
  if (!env.INVITE_CODE) return json({ error: 'disabled' }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'body' }, 400); }

  const ipKey = `rl:reg:${clientIp(request)}`;
  if (await isBlocked(env, ipKey, MAX_PER_IP)) return json({ error: 'toomany' }, 429);
  if (typeof body.invite !== 'string' || !safeEqual(body.invite.trim(), env.INVITE_CODE.trim())) {
    await addHit(env, ipKey, 3600);
    return json({ error: 'invite' }, 403);
  }
  const username = normalizeUsername(body.username);
  if (!USERNAME_RE.test(username)) return json({ error: 'username' }, 400);
  const pwErr = checkPassword(body.password, username);
  if (pwErr) return json({ error: 'password' }, 400);
  if (await env.EVENTS.get('u:' + username)) return json({ error: 'taken' }, 409);

  const h = await hashPassword(body.password);
  await env.EVENTS.put('u:' + username, JSON.stringify({ ...h, created: Date.now() }));
  await addHit(env, ipKey, 3600);
  const token = await createSession(env, { sub: 'pw_' + username, email: '', name: username });
  return json({ email: '', name: username }, 201, { 'Set-Cookie': sessionCookie(token) });
}
