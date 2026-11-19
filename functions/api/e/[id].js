import { json, validId, readEvent } from '../../../lib/events.js';

// 公開用：QRから開かれるページが、イベントの内容を取りに来る
export async function onRequestGet({ env, params }) {
  if (!env.EVENTS || !validId(params.id)) return json({ error: 'notfound' }, 404);
  const rec = await readEvent(env, params.id);
  if (!rec) return json({ error: 'notfound' }, 404);
  return json(rec.ev, 200, { 'Cache-Control': 'public, max-age=20' });
}
