// iPhoneで「予定を追加」の画面を直接開くため、ページが作った予定データを「カレンダーの予定」として返す
// （ファイルの保存ではなく、表示として渡すので、ダウンロードの確認が出ない）
export async function onRequestPost({ request }) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return new Response('forbidden', { status: 403 });
  let ics = '';
  try { ics = String((await request.formData()).get('ics') || ''); } catch (e) {}
  ics = ics.replace(/\r?\n/g, '\r\n').trim();
  if (!ics.startsWith('BEGIN:VCALENDAR') || !ics.endsWith('END:VCALENDAR') || ics.length > 20000) {
    return new Response('bad request', { status: 400 });
  }
  return new Response(ics + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="save-the-date.ics"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
