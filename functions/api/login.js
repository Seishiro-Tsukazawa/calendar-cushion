import { verifyGoogleIdToken, createSession, sessionCookie } from '../../lib/auth.js';
import { json } from '../../lib/events.js';

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
  const token = await createSession(env, user);
  return json({ email: user.email, name: user.name }, 200, { 'Set-Cookie': sessionCookie(token) });
}
