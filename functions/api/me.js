import { requireUser } from '../../lib/guard.js';
import { json } from '../../lib/events.js';

export async function onRequestGet({ request, env }) {
  const g = await requireUser(request, env);
  if (g.res) return g.res;
  return json({ email: g.user.email, name: g.user.name });
}
