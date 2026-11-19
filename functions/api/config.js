import { json } from '../../lib/events.js';

export function onRequestGet({ env }) {
  return json({ clientId: env.GOOGLE_CLIENT_ID || '', ready: !!env.EVENTS });
}
