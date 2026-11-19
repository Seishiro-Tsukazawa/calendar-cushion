// イベントの検証・保存・取得
export const MAX_EVENTS_PER_USER = 100;

const ALERT_IDS = ['7d', '3d', '1d', '0d', '3h', '1h', '30m'];
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const REL_PATH_RE = /^[\w.\-\/]+$/;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

// 受け取った内容を、保存してよい形に整える。足りない必須項目があれば null
export function normalizeEvent(input) {
  if (!input || typeof input !== 'object') return null;
  const ev = {
    title: str(input.title, 200).trim(),
    start: str(input.start, 16),
    end: str(input.end, 16),
    loc: str(input.loc, 200).trim(),
    url: str(input.url, 500).trim(),
    banner: str(input.banner, 300).trim(),
    detail: str(input.detail, 3000).trim(),
    memo: str(input.memo, 3000).trim(),
    memoT: str(input.memoT, 30).replace(/[^\w-]/g, ''),
    nf: input.nf === true
  };
  if (Array.isArray(input.alerts)) ev.alerts = ALERT_IDS.filter(a => input.alerts.includes(a));
  if (!ev.title || !DT_RE.test(ev.start)) return null;
  if (ev.end && !DT_RE.test(ev.end)) ev.end = '';
  if (ev.url && !/^https?:\/\//i.test(ev.url)) ev.url = '';
  if (ev.banner && !(/^https:\/\//i.test(ev.banner) || (REL_PATH_RE.test(ev.banner) && !ev.banner.startsWith('/') && !ev.banner.includes('..')))) ev.banner = '';
  return ev;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newId(len = 8) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map(x => ALPHABET[x % ALPHABET.length]).join('');
}

export const validId = id => /^[A-Za-z0-9]{4,32}$/.test(id || '');

const meta = (ev, now) => ({ t: ev.title.slice(0, 80), s: ev.start, u: now });

export async function listEvents(env, sub) {
  const out = [];
  let cursor;
  do {
    const r = await env.EVENTS.list({ prefix: `o:${sub}:`, cursor, limit: 1000 });
    for (const k of r.keys) out.push({ id: k.name.split(':')[2], title: (k.metadata && k.metadata.t) || '', start: (k.metadata && k.metadata.s) || '', updated: (k.metadata && k.metadata.u) || 0 });
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.updated - a.updated);
}

export async function createEvent(env, sub, ev) {
  const existing = await env.EVENTS.list({ prefix: `o:${sub}:`, limit: MAX_EVENTS_PER_USER + 1 });
  if (existing.keys.length >= MAX_EVENTS_PER_USER) return null;
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    const id = newId();
    if (await env.EVENTS.get('e:' + id)) continue;
    await env.EVENTS.put('e:' + id, JSON.stringify({ owner: sub, ev, created: now, updated: now }));
    await env.EVENTS.put(`o:${sub}:${id}`, '1', { metadata: meta(ev, now) });
    return id;
  }
  throw new Error('id');
}

export async function readEvent(env, id) {
  return await env.EVENTS.get('e:' + id, 'json');
}

export async function updateEvent(env, id, rec, ev) {
  const now = Date.now();
  await env.EVENTS.put('e:' + id, JSON.stringify({ ...rec, ev, updated: now }));
  await env.EVENTS.put(`o:${rec.owner}:${id}`, '1', { metadata: meta(ev, now) });
}

export async function deleteEvent(env, id, rec) {
  await env.EVENTS.delete('e:' + id);
  await env.EVENTS.delete(`o:${rec.owner}:${id}`);
}
