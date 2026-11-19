import { requireUser } from '../../../lib/guard.js';
import { json, listEvents, createEvent, normalizeEvent, MAX_EVENTS_PER_USER } from '../../../lib/events.js';

export async function onRequestGet({ request, env }) {
  const g = await requireUser(request, env);
  if (g.res) return g.res;
  return json({ events: await listEvents(env, g.user.sub), max: MAX_EVENTS_PER_USER });
}

export async function onRequestPost({ request, env }) {
  const g = await requireUser(request, env, { write: true });
  if (g.res) return g.res;
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'body' }, 400); }
  const ev = normalizeEvent(body);
  if (!ev) return json({ error: 'invalid' }, 400);
  const id = await createEvent(env, g.user.sub, ev);
  if (!id) return json({ error: 'limit', max: MAX_EVENTS_PER_USER }, 409);
  return json({ id }, 201);
}
