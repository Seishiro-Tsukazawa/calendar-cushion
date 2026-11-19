import { destroySession, clearCookie } from '../../lib/auth.js';
import { json } from '../../lib/events.js';

export async function onRequestPost({ request, env }) {
  if (request.headers.get('X-Requested-With') !== 'cushion') return json({ error: 'header' }, 403);
  if (env.EVENTS) await destroySession(request, env);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
}
