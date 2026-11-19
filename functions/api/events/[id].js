import { requireUser } from '../../../lib/guard.js';
import { json, validId, readEvent, normalizeEvent, updateEvent, deleteEvent } from '../../../lib/events.js';

async function load(request, env, id, write) {
  const g = await requireUser(request, env, { write });
  if (g.res) return g;
  if (!validId(id)) return { res: json({ error: 'notfound' }, 404) };
  const rec = await readEvent(env, id);
  if (!rec || rec.owner !== g.user.sub) return { res: json({ error: 'notfound' }, 404) };
  return { rec };
}

export async function onRequestGet({ request, env, params }) {
  const r = await load(request, env, params.id, false);
  if (r.res) return r.res;
  return json({ id: params.id, ev: r.rec.ev, updated: r.rec.updated });
}

export async function onRequestPut({ request, env, params }) {
  const r = await load(request, env, params.id, true);
  if (r.res) return r.res;
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'body' }, 400); }
  const ev = normalizeEvent(body);
  if (!ev) return json({ error: 'invalid' }, 400);
  await updateEvent(env, params.id, r.rec, ev);
  return json({ id: params.id });
}

export async function onRequestDelete({ request, env, params }) {
  const r = await load(request, env, params.id, true);
  if (r.res) return r.res;
  await deleteEvent(env, params.id, r.rec);
  return json({ ok: true });
}
