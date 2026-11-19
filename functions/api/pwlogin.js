import { createSession, sessionCookie } from '../../lib/auth.js';
import { json } from '../../lib/events.js';
import { normalizeUsername, USERNAME_RE, verifyPassword, clientIp, isBlocked, addHit } from '../../lib/password.js';

const WINDOW = 900; // 15分
const MAX_PER_USER = 5;
const MAX_PER_IP = 30;

export async function onRequestPost({ request, env }) {
  if (!env.EVENTS) return json({ error: 'config' }, 500);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin' }, 403);
  if (request.headers.get('X-Requested-With') !== 'cushion') return json({ error: 'header' }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'body' }, 400); }
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username) || password.length < 1 || password.length > 200) return json({ error: 'invalid' }, 401);

  const ipKey = `rl:ip:${clientIp(request)}`, userKey = `rl:u:${username}`;
  if (await isBlocked(env, ipKey, MAX_PER_IP) || await isBlocked(env, userKey, MAX_PER_USER)) return json({ error: 'toomany' }, 429);

  const rec = await env.EVENTS.get('u:' + username, 'json');
  if (!(await verifyPassword(password, rec))) {
    await addHit(env, ipKey, WINDOW);
    await addHit(env, userKey, WINDOW);
    return json({ error: 'invalid' }, 401);
  }
  await env.EVENTS.delete(userKey);
  const token = await createSession(env, { sub: 'pw_' + username, email: '', name: username });
  return json({ email: '', name: username }, 200, { 'Set-Cookie': sessionCookie(token) });
}
