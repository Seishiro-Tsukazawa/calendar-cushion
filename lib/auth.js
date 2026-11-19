// Googleのログイン確認と、ログイン状態（セッション）の管理
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_DAYS = 30;
let jwksCache = null;
let jwksAt = 0;

const dec = new TextDecoder();
const enc = new TextEncoder();

function b64uToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getJwks(fetchFn) {
  if (jwksCache && Date.now() - jwksAt < 3600e3) return jwksCache;
  const r = await fetchFn(JWKS_URL);
  if (!r.ok) throw new Error('jwks');
  jwksCache = await r.json();
  jwksAt = Date.now();
  return jwksCache;
}

export function resetJwksCache() { jwksCache = null; jwksAt = 0; }

// GoogleのIDトークンを検証し、{ sub, email, name } を返す。不正なら例外
export async function verifyGoogleIdToken(token, clientId, fetchFn = fetch, nowMs = Date.now()) {
  if (!clientId) throw new Error('no client id');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('format');
  const [h, p, sig] = parts;
  const header = JSON.parse(dec.decode(b64uToBytes(h)));
  if (header.alg !== 'RS256') throw new Error('alg');
  const jwks = await getJwks(fetchFn);
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(sig), enc.encode(h + '.' + p));
  if (!ok) throw new Error('signature');
  const c = JSON.parse(dec.decode(b64uToBytes(p)));
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') throw new Error('iss');
  if (c.aud !== clientId) throw new Error('aud');
  if (!c.exp || c.exp * 1000 <= nowMs) throw new Error('exp');
  if (!c.sub || !c.email || c.email_verified !== true) throw new Error('claims');
  return { sub: String(c.sub), email: String(c.email), name: String(c.name || '') };
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function createSession(env, user) {
  const token = randomHex(32);
  await env.EVENTS.put('s:' + token, JSON.stringify(user), { expirationTtl: SESSION_DAYS * 86400 });
  return token;
}

export function sessionCookie(token) {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

function readSid(request) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/);
  return m ? m[1] : '';
}

export async function getSession(request, env) {
  const sid = readSid(request);
  if (!sid) return null;
  const v = await env.EVENTS.get('s:' + sid, 'json');
  return v && v.sub ? v : null;
}

export async function destroySession(request, env) {
  const sid = readSid(request);
  if (sid) await env.EVENTS.delete('s:' + sid);
}
