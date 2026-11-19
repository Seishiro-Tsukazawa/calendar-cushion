// 書き込み系のAPIの共通チェック：同じサイトからの操作かを確認し、ログイン済みのユーザーを返す
import { getSession } from './auth.js';
import { json } from './events.js';

export async function requireUser(request, env, { write = false } = {}) {
  if (!env.EVENTS) return { res: json({ error: 'storage' }, 500) };
  if (write) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return { res: json({ error: 'origin' }, 403) };
    if (request.headers.get('X-Requested-With') !== 'cushion') return { res: json({ error: 'header' }, 403) };
  }
  const user = await getSession(request, env);
  if (!user) return { res: json({ error: 'login' }, 401) };
  return { user };
}
