// このファイルの置き場所を基準に、画像のURLを作る（どの階層のページから読んでも同じ画像を指す）
const ROOT = new URL('.', document.currentScript.src).href;
let HERO_SRC = ROOT + 'img/hero.jpg';
const TZ = 'Asia/Tokyo';
const TZ_OFFSET = 9;
const pad = n => String(n).padStart(2, '0');
const WEEK_JA = '日月火水木金土';
const WEEK_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "2026-12-20T14:00" → [年,月,日,時,分]
function parseLocal(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
  return m ? m.slice(1).map(Number) : null;
}
function weekday(p) { return new Date(p[0], p[1] - 1, p[2]).getDay(); }
function compact(v) {
  const p = parseLocal(v);
  return p ? `${p[0]}${pad(p[1])}${pad(p[2])}T${pad(p[3])}${pad(p[4])}00` : '';
}
function utcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
// 開始日の N 日前 12:00（日本時間）を UTC で返す
function alarmUtc(startVal, daysBefore, hour = 12) {
  const p = parseLocal(startVal);
  return utcStamp(Date.UTC(p[0], p[1] - 1, p[2] - daysBefore, hour - TZ_OFFSET, 0, 0));
}

// 通知の種類（管理画面で選べる）。day＝日本時間の指定時刻、rel＝開始の何分前
const ALERTS = [
  { id: '7d', name: '1週間前の正午', short: '1週間前', desc: '1週間前のお知らせ', kind: 'day', n: 7, h: 12 },
  { id: '3d', name: '3日前の正午', short: '3日前', desc: '3日前のお知らせ', kind: 'day', n: 3, h: 12 },
  { id: '1d', name: '前日の正午', short: '前日', desc: '明日です', kind: 'day', n: 1, h: 12 },
  { id: '0d', name: '当日の朝9時', short: '当日朝', desc: '今日です', kind: 'day', n: 0, h: 9 },
  { id: '3h', name: '3時間前', short: '3時間前', desc: '3時間後に始まります', kind: 'rel', min: 180 },
  { id: '1h', name: '1時間前', short: '1時間前', desc: '1時間後に始まります', kind: 'rel', min: 60 },
  { id: '30m', name: '30分前', short: '30分前', desc: '30分後に始まります', kind: 'rel', min: 30 }
];
const DEFAULT_ALERTS = ['3d', '1d'];
function alertsOf(ev) {
  const a = Array.isArray(ev.alerts) ? ev.alerts : DEFAULT_ALERTS;
  return ALERTS.filter(x => a.includes(x.id));
}
function alertSummary(ev) {
  const l = alertsOf(ev);
  return l.length ? l.map(x => x.short).join('・') + 'に通知' : '';
}
function timeRange(ev) {
  const s = parseLocal(ev.start), e = parseLocal(ev.end);
  const hm = p => `${p[3]}:${pad(p[4])}`;
  if (!e) return `${hm(s)} 開始`;
  if (s[0] === e[0] && s[1] === e[1] && s[2] === e[2]) return `${hm(s)} – ${hm(e)}`;
  return `${hm(s)} – ${e[1]}/${e[2]}(${WEEK_JA[weekday(e)]}) ${hm(e)}`;
}

function calTitle(ev) { return ev.nf ? ev.title : `【仮押さえ・未申込】${ev.title}`; }
const MEMO_TEMPLATES = [
  { id: 'tentative', label: '標準', text: '現在は【仮押さえ（未申込）】の状態です！\n参加できそうな方は、以下のリンクから本申し込みをお願いします👇\n{URL}\n\n{詳細}\n\n※都合が悪くなった場合は、この予定を削除してください。' },
  { id: 'casual', label: 'やわらかめ', text: 'とりあえず予定だけ押さえておきました📌\n行けそうだったら、こちらから申し込んでね👇\n{URL}\n\n{詳細}\n\n予定が合わなくなったら、この予定は消してOKです！' },
  { id: 'formal', label: 'ていねい', text: '【ご案内】本予定は仮押さえです（お申し込みは未完了です）。\nご参加をご希望の方は、下記より本申し込みをお願いいたします。\n{URL}\n\n{詳細}\n\nご都合が悪くなった場合は、お手数ですが本予定を削除してください。' },
  { id: 'deadline', label: '締切あり', text: '現在は【仮押さえ（未申込）】の状態です！\n申込締切：○月○日まで\n参加される方は、お早めにこちらからお申し込みください👇\n{URL}\n\n{詳細}\n\n※都合が悪くなった場合は、この予定を削除してください。' },
  { id: 'fee', label: '参加費・持ち物', text: '現在は【仮押さえ（未申込）】の状態です！\n参加が決まったら、こちらから本申し込みをお願いします👇\n{URL}\n\n{詳細}\n\n■ 参加費：（記入してください）\n■ 持ち物：（記入してください）\n※都合が悪くなった場合は、この予定を削除してください。' },
  { id: 'online', label: 'オンライン', text: 'オンライン開催の予定です💻（仮押さえ・未申込）\n参加できる方は、こちらから本申し込みをお願いします👇\n{URL}\n\n{詳細}\n\n参加用のリンクは、お申し込みいただいた方にお送りします。\n※都合が悪くなった場合は、この予定を削除してください。' }
  ,
  { id: 'nf-simple', nf: 1, label: 'シンプル', text: '{詳細}\n\n※都合が悪くなった場合は、この予定を削除してください。' },
  { id: 'nf-casual', nf: 1, label: 'やわらかめ', text: 'ぜひ遊びに来てください✨\n{詳細}\n\n行けなくなったら、この予定は消してOKです！' },
  { id: 'nf-notice', nf: 1, label: 'お知らせ', text: '【お知らせ】下記の日程で開催します。\n{詳細}\n\nご不明な点は、主催者までお問い合わせください。' },
  { id: 'nf-free', nf: 1, label: '参加自由', text: '申し込みは不要です。当日、直接お越しください。\n{詳細}\n\n※都合が悪くなった場合は、この予定を削除してください。' }
];
function defaultTpl(nf) { return MEMO_TEMPLATES.find(x => !!x.nf === !!nf); }
function memoText(ev) {
  if (ev.memo) return ev.memo;
  const t = MEMO_TEMPLATES.find(x => x.id === ev.memoT && !!x.nf === !!ev.nf) || defaultTpl(ev.nf);
  return t.text;
}
function calDetails(ev) {
  const text = memoText(ev).replace(/\r\n?/g, '\n');
  const det = (ev.detail || '').replace(/\r\n?/g, '\n').trim();
  const out = [];
  text.split('\n').forEach(l => {
    let x = l;
    if (x.includes('{URL}')) { if (!ev.url) return; x = x.split('{URL}').join(ev.url); }
    if (x.includes('{詳細}')) { if (!det) return; x = x.split('{詳細}').join(det); }
    out.push(x);
  });
  let r = out.join('\n');
  if (det && !text.includes('{詳細}')) r += '\n\n' + det;
  return r.replace(/\n{3,}/g, '\n\n').trim();
}

function googleUrl(ev) {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: calTitle(ev),
    dates: `${compact(ev.start)}/${compact(ev.end || ev.start)}`,
    ctz: TZ,
    details: calDetails(ev),
    location: ev.loc || ''
  });
  return 'https://www.google.com/calendar/render?' + q.toString();
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
// 75バイトで折り返し（RFC 5545）
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function buildIcs(ev) {
  const end = ev.end || ev.start;
  const alarm = a => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + icsEscape(`${a.desc}：${ev.title}${ev.nf ? '' : '（まだ未申込です）'}`),
    a.kind === 'day' ? `TRIGGER;VALUE=DATE-TIME:${alarmUtc(ev.start, a.n, a.h)}` : `TRIGGER:-PT${a.min}M`,
    'END:VALARM'
  ];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Save the Date Cushion//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${TZ}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${hashStr(ev.title + ev.start)}@save-the-date-cushion`,
    `DTSTAMP:${utcStamp(Date.now())}`,
    `DTSTART;TZID=${TZ}:${compact(ev.start)}`,
    `DTEND;TZID=${TZ}:${compact(end)}`,
    'SUMMARY:' + icsEscape(calTitle(ev)),
    'DESCRIPTION:' + icsEscape(calDetails(ev)),
    ev.nf ? 'STATUS:CONFIRMED' : 'STATUS:TENTATIVE'
  ];
  if (ev.loc) lines.push('LOCATION:' + icsEscape(ev.loc));
  if (ev.url) lines.push('URL:' + ev.url);
  alertsOf(ev).forEach(a => lines.push(...alarm(a)));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

function downloadIcs(ev) {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'save-the-date.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function b64uDec(b) {
  b = b.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
  const bin = atob(b), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function evFromParams(search) {
  const q = new URLSearchParams(search);
  if (q.has('p')) {
    try {
      const a = JSON.parse(b64uDec(q.get('p')));
      let banner = a[5] || '';
      if (banner.startsWith('~c/')) { const i = banner.indexOf('/', 3); banner = `https://res.cloudinary.com/${banner.slice(3, i)}/image/upload/f_auto,q_auto,w_1000/${banner.slice(i + 1)}`; }
      return { title: a[0] || '', start: a[1] || '', end: a[2] || '', loc: a[3] || '', url: a[4] || '', banner, detail: a[6] || '', memo: a[7] || '', memoT: a[8] || '', nf: a[9] === 1 };
    } catch (e) { return { title: '', start: '', end: '', loc: '', url: '', banner: '', detail: '', memo: '', memoT: '', nf: false }; }
  }
  return { title: q.get('t') || '', start: q.get('s') || '', end: q.get('e') || '', loc: q.get('l') || '', url: q.get('u') || '', banner: q.get('b') || '', detail: q.get('d') || '', memo: q.get('m') || '', memoT: q.get('mt') || '', nf: q.get('n') === '1' };
}
function isValidEv(ev) { return !!(ev.title && parseLocal(ev.start)); }
function isAppleDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
function bannerUrl(b) {
  const v = safeBanner(b);
  return !v ? '' : /^https?:\/\//i.test(v) ? v : ROOT + v;
}
// バナー画像：https のURL か、同じ公開先の相対パスだけを許可
function safeBanner(u) {
  u = (u || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w.\-\/]+$/.test(u) && !u.startsWith('/') && !u.includes('..')) return u;
  return '';
}
function safeHttpUrl(u) { return /^https?:\/\//i.test(u) ? u : ''; }

const ICON = {
  cal: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M12 12.5v5M9.5 15h5"/></svg>',
  bell: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8.5 15l2.5 2.5 4.5-5"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

// カレンダーを使えない人向けに、コピーして貼れる形の文章を作る
function shareText(ev) {
  const s = parseLocal(ev.start), w = weekday(s);
  const lines = [ev.title, `日時：${s[0]}年${s[1]}月${s[2]}日（${WEEK_JA[w]}）${timeRange(ev)}`];
  if (ev.loc) lines.push(`場所：${ev.loc}`);
  if (ev.detail) lines.push('', ev.detail.trim());
  const form = ev.nf ? '' : safeHttpUrl(ev.url);
  if (form) lines.push('', `お申し込み：${form}`);
  return lines.join('\n');
}

function renderCushion(root, ev) {
  if (!isValidEv(ev)) {
    root.innerHTML = `<div class="cs"><div class="cs-empty"><div>
      <h1>イベント情報がありません</h1><p>イベント名と開始日時を指定してください。</p></div></div></div>`;
    return;
  }
  const s = parseLocal(ev.start), w = weekday(s);
  const formUrl = safeHttpUrl(ev.url);
  const bannerSrc = bannerUrl(ev.banner);
  const google = `<a class="cs-btn" data-act="google" href="${esc(googleUrl(ev))}" target="_blank" rel="noopener">
      ${ICON.cal}<span class="cs-btn-text"><b>Googleカレンダーに追加</b><small>Android・Googleカレンダーの方</small></span>${ICON.chev}</a>`;
  const apple = `<button class="cs-btn" data-act="ics" type="button">
      ${ICON.bell}<span class="cs-btn-text"><b>iPhoneのカレンダーに追加</b><small>Mac・Outlook対応${alertSummary(ev) ? '／' + alertSummary(ev) : ''}</small></span>${ICON.chev}</button>`;
  const btns = (isAppleDevice() ? [apple, google] : [google, apple]);
  btns[0] = btns[0].replace('class="cs-btn"', 'class="cs-btn primary"');

  root.innerHTML = `
  <div class="cs"><div class="cs-wrap">
    <div class="cs-eyebrow">SAVE THE DATE</div>
    <div class="cs-top">
    <img class="cs-hero${bannerSrc ? ' custom' : ''}" src="${esc(bannerSrc || HERO_SRC)}" alt="" width="1000" height="672"
         onerror="this.onerror=null;this.className='cs-hero';this.src='${esc(HERO_SRC)}'">
    <div class="cs-leaf">
      <div class="cs-leaf-body">
        <div class="cs-leaf-head"><span>${s[0]}年 ${s[1]}月</span><span>${MONTH_EN[s[1] - 1]}</span></div>
        <div class="cs-day${w === 0 ? ' sun' : w === 6 ? ' sat' : ''}">${s[2]}</div>
        <div class="cs-week">${WEEK_JA[w]}曜日<small>${WEEK_EN[w]}</small></div>
        <div class="cs-time">${esc(timeRange(ev))}</div>
      </div>
      <div class="cs-seal" aria-hidden="true">${ev.nf ? '<span>予定</span>' : '<span>仮押<br>さえ</span>'}</div>
    </div>
    </div>

    <div class="cs-info">
    <div class="cs-titlerow">
      <h1 class="cs-title">${esc(ev.title)}</h1>
      ${ev.detail ? `<button class="cs-jump" type="button" data-jump>詳細を見る<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>` : ''}
    </div>
    ${ev.loc ? `<div class="cs-place">${ICON.pin}<span>${esc(ev.loc)}</span></div>` : ''}
    </div>

    <div class="cs-lead">${ev.nf ? '予定を、カレンダーに入れておく' : 'まずは、予定だけ押さえる'}</div>
    <p class="cs-reassure"><span class="cs-nw">ボタンを押すと、</span><span class="cs-nw"><b>予定の登録画面</b>が開きます。</span><br><b><span class="cs-nw">押しただけで、</span><span class="cs-nw">予定がすぐに入ることはありません。</span></b></p>
    <div class="cs-btns">${btns.join('')}</div>
    <p class="cs-flash" data-flash hidden>カレンダーの画面が開きます。内容を確認して「追加」を押してください。まだ登録されていません。</p>

    <div class="cs-steps"><b>登録のしかた</b><ol><li>上のボタンを押す</li><li>開いた画面で、日時や内容を確認する</li><li>「保存」（iPhoneは「追加」）を押して完了</li></ol>
      <div class="cs-support"><b>使えるカレンダー</b><span class="cs-nw">Googleカレンダー</span>／<span class="cs-nw">iPhone・Macのカレンダー</span>／<span class="cs-nw">Outlook</span></div></div>
    <p class="cs-help">うまく追加できないときは、Safari または Chrome でこのページを開いてください。</p>
    <details class="cs-other"><summary>上のカレンダーを使っていない方へ</summary>
      <p>このページのボタンは、上の3つのカレンダーでのみ使えます。LINEカレンダーなど、ほかのアプリをお使いの方は、下のボタンで日時などをコピーして、お使いのアプリに貼り付けてください。</p>
      <button class="cs-copy" type="button" data-copy>日時・場所をコピーする</button>
    </details>
    ${ev.detail ? `<div class="cs-lead cs-lead-detail" data-detail>イベントの詳細</div>
    <div class="cs-detail">${esc(ev.detail)}</div>` : ''}

    ${ev.nf ? '' : `<div class="cs-note">
      <b>お申し込みは、まだ完了していません。</b>
      参加できそうな方は、あとから本申し込みをお願いします。
      ${formUrl ? `<br><a href="${esc(formUrl)}" target="_blank" rel="noopener">本申し込みフォームへ ${ICON.arrow}</a>` : ''}
    </div>`}
    ${ev.nf ? '' : '<p class="cs-foot">都合が悪くなった場合は、カレンダーの予定を削除するだけで大丈夫です。</p>'}
  </div></div>`;
  const copyBtn = root.querySelector('[data-copy]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const text = shareText(ev);
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) {} ta.remove(); }
    copyBtn.textContent = 'コピーしました';
    setTimeout(() => { copyBtn.textContent = '日時・場所をコピーする'; }, 2200);
  });
  const jump = root.querySelector('[data-jump]');
  if (jump) jump.addEventListener('click', () => root.querySelector('[data-detail]').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  root.querySelector('[data-act="ics"]').addEventListener('click', () => {
    downloadIcs(ev);
    root.querySelector('[data-flash]').hidden = false;
  });
}

// 単体のクッションページとして動かすとき
// /e/<番号> なら保存済みのイベントを読み込み、それ以外は従来のURLパラメータから表示する
async function bootstrapCushion(rootEl) {
  rootEl.hidden = false;
  rootEl.classList.add('cs-standalone');
  const m = location.pathname.match(/\/e\/([A-Za-z0-9]{4,32})\/?$/);
  let ev;
  if (m) {
    rootEl.innerHTML = '<div class="cs"><div class="cs-empty"><div><p>読み込み中…</p></div></div></div>';
    try {
      const r = await fetch('/api/e/' + m[1]);
      if (r.status === 404) { rootEl.innerHTML = '<div class="cs"><div class="cs-empty"><div><h1>ページが見つかりません</h1><p>URLが間違っているか、削除された可能性があります。</p></div></div></div>'; return; }
      if (!r.ok) throw new Error('status ' + r.status);
      ev = await r.json();
    } catch (e) {
      rootEl.innerHTML = '<div class="cs"><div class="cs-empty"><div><h1>読み込めませんでした</h1><p>通信状況を確認して、もう一度開いてください。</p></div></div></div>';
      return;
    }
  } else {
    ev = evFromParams(location.search);
  }
  if (ev.title) document.title = ev.title + '｜Save the Date';
  renderCushion(rootEl, ev);
}
