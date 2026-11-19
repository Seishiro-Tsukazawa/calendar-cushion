// ユーザー名＋パスワードのログイン：ハッシュ化・照合・試行回数の制限
const enc = new TextEncoder();
const ITER = 100000; // Workersで使える上限
const toHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));

export const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
export const normalizeUsername = u => String(u || '').trim().toLowerCase();

export function checkPassword(pw, username) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 72) return 'length';
  if (pw.toLowerCase() === username) return 'same';
  return '';
}

async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export function safeEqual(a, b) {
  const x = a instanceof Uint8Array ? a : enc.encode(String(a));
  const y = b instanceof Uint8Array ? b : enc.encode(String(b));
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITER);
  return { salt: toHex(salt), hash: toHex(hash), iter: ITER };
}

// 保存されていない場合も同じ時間をかけて、ユーザー名の有無を悟られないようにする
const DUMMY = { salt: '00'.repeat(16), hash: '00'.repeat(32), iter: ITER };
export async function verifyPassword(password, rec) {
  const r = rec || DUMMY;
  const got = await derive(password, fromHex(r.salt), r.iter || ITER);
  return !!rec && safeEqual(got, fromHex(r.hash));
}

export const clientIp = request => request.headers.get('CF-Connecting-IP') || 'unknown';

export async function isBlocked(env, key, limit) {
  const v = await env.EVENTS.get(key);
  return !!v && Number(v) >= limit;
}
export async function addHit(env, key, ttl) {
  const v = Number(await env.EVENTS.get(key)) || 0;
  await env.EVENTS.put(key, String(v + 1), { expirationTtl: ttl });
}
