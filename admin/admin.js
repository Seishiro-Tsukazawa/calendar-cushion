(function () {
  const $ = id => document.getElementById(id);
  const show = id => ['viewLoading', 'viewLogin', 'viewApp'].forEach(v => { $(v).hidden = v !== id; });

  // ---------- 通信 ----------
  async function api(path, opt = {}) {
    const headers = { 'X-Requested-With': 'cushion' };
    if (opt.body) headers['Content-Type'] = 'application/json';
    const r = await fetch('/api' + path, { method: opt.method || 'GET', headers, credentials: 'same-origin', body: opt.body ? JSON.stringify(opt.body) : undefined });
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (r.status === 401 && !opt.silent) { goLogin('ログインの有効期限が切れました。もう一度ログインしてください。'); }
    return { ok: r.ok, status: r.status, data };
  }

  // ---------- ログイン ----------
  let gsiReady = false;
  let clientId = '';
  let appStarted = false;

  function loginMsg(msg) { const el = $('loginMsg'); el.hidden = !msg; el.textContent = msg || ''; }

  function waitGoogle() {
    return new Promise(res => {
      let n = 0;
      (function t() { if (window.google && google.accounts && google.accounts.id) return res(true); if (++n > 100) return res(false); setTimeout(t, 100); })();
    });
  }

  async function renderGoogleButton() {
    if (!(await waitGoogle())) { loginMsg('Googleのログイン部品を読み込めませんでした。通信状況を確認して、再読み込みしてください。'); return; }
    if (!gsiReady) {
      google.accounts.id.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup' });
      gsiReady = true;
    }
    $('gBtn').innerHTML = '';
    google.accounts.id.renderButton($('gBtn'), { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ja', width: 280 });
  }

  async function goLogin(msg) {
    show('viewLogin');
    loginMsg(msg || '');
    if (clientId) renderGoogleButton();
  }

  let pendingCredential = '';
  const LOGIN_ERR = { 429: '試行回数が多すぎます。しばらくしてから、もう一度お試しください。', 503: '新規登録は、いま受け付けていません。' };

  async function onCredential(resp) {
    loginMsg('');
    pendingCredential = resp.credential;
    $('inviteG').hidden = true;
    const r = await api('/login', { method: 'POST', body: { credential: pendingCredential }, silent: true });
    if (r.ok) return enterApp(r.data);
    if (r.status === 403 && r.data && r.data.error === 'invite_required') { $('inviteG').hidden = false; $('inviteGCode').focus(); return; }
    loginMsg(LOGIN_ERR[r.status] || 'ログインできませんでした。もう一度お試しください。');
  }

  $('btnInviteG').addEventListener('click', async () => {
    const invite = $('inviteGCode').value.trim();
    if (!invite) { loginMsg('招待コードを入力してください。'); return; }
    loginMsg('');
    const r = await api('/login', { method: 'POST', body: { credential: pendingCredential, invite }, silent: true });
    if (r.ok) { $('inviteG').hidden = true; $('inviteGCode').value = ''; return enterApp(r.data); }
    if (r.status === 403) { loginMsg('招待コードが違います。'); return; }
    if (r.status === 401) { $('inviteG').hidden = true; loginMsg('ログインの有効時間が切れました。もう一度「Googleでログイン」を押してください。'); return; }
    loginMsg(LOGIN_ERR[r.status] || 'ログインできませんでした。もう一度お試しください。');
  });

  // ユーザー名とパスワード
  let regMode = false;
  function setMode(reg) {
    regMode = reg;
    $('modeLogin').classList.toggle('on', !reg); $('modeReg').classList.toggle('on', reg);
    $('pwInvite').hidden = !reg;
    $('pwSubmit').textContent = reg ? '登録してログイン' : 'ログイン';
    $('pwPass').autocomplete = reg ? 'new-password' : 'current-password';
    loginMsg('');
  }
  $('modeLogin').addEventListener('click', () => setMode(false));
  $('modeReg').addEventListener('click', () => setMode(true));
  $('pwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('pwUser').value.trim(), password = $('pwPass').value, invite = $('pwInvite').value.trim();
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) { loginMsg('ユーザー名は、英数字と _ - の3〜20文字で入力してください。'); return; }
    if (regMode && password.length < 8) { loginMsg('パスワードは8文字以上にしてください。'); return; }
    if (!password) { loginMsg('パスワードを入力してください。'); return; }
    if (regMode && !invite) { loginMsg('招待コードを入力してください。'); return; }
    loginMsg('');
    const btn = $('pwSubmit'); btn.disabled = true;
    try {
      const r = await api(regMode ? '/register' : '/pwlogin', { method: 'POST', body: regMode ? { username, password, invite } : { username, password }, silent: true });
      if (r.ok) { $('pwPass').value = ''; $('pwInvite').value = ''; return await enterApp(r.data); }
      const code = r.data && r.data.error;
      if (r.status === 401) loginMsg('ユーザー名またはパスワードが違います。');
      else if (code === 'invite') loginMsg('招待コードが違います。');
      else if (code === 'taken') loginMsg('このユーザー名は、すでに使われています。');
      else if (code === 'username') loginMsg('ユーザー名は、英数字と _ - の3〜20文字で入力してください。');
      else if (code === 'password') loginMsg('パスワードは8〜72文字で、ユーザー名と別のものにしてください。');
      else loginMsg(LOGIN_ERR[r.status] || 'ログインできませんでした。もう一度お試しください。');
    } finally { btn.disabled = false; }
  });

  async function enterApp(me) {
    $('meEmail').textContent = me.email || me.name || '';
    show('viewApp');
    if (!appStarted) { appStarted = true; await startApp(); }
    await loadList();
  }

  async function boot() {
    let cfg;
    try {
      const r = await fetch('/api/config');
      if (!r.ok) throw new Error();
      cfg = await r.json();
    } catch (e) {
      show('viewLogin'); loginMsg('このアドレスでは、管理機能を使えません。公開先のURL（pages.dev）から開いてください。'); return;
    }
    if (!cfg.clientId || !cfg.ready) { show('viewLogin'); loginMsg('管理機能の設定がまだ終わっていません。'); return; }
    clientId = cfg.clientId;
    const me = await api('/me', { silent: true });
    if (me.ok) return enterApp(me.data);
    goLogin('');
  }

  $('btnLogout').addEventListener('click', async () => {
    if (isDirty() && !confirm('保存していない変更があります。ログアウトすると、この変更は失われます。よろしいですか？')) return;
    await api('/logout', { method: 'POST' });
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    location.reload();
  });

  // ---------- 編集画面 ----------
  const fields = { title: $('fTitle'), start: $('fStart'), end: $('fEnd'), loc: $('fLoc'), url: $('fUrl'), banner: $('fBanner'), detail: $('fDetail') };
  const memoEl = $('fMemo');
  let currentId = null;
  let snapshot = '';
  let events = [];
  let maxEvents = 100;
  let qrSvg = '';

  const SEASONS = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];
  const THEMES = [['gather', '集まり'], ['meal', '食事・乾杯'], ['study', '学び・講座'], ['music', '音楽・ライブ'], ['outdoor', 'お出かけ'], ['festival', 'お祭り'], ['family', 'ファミリー'], ['online', 'オンライン']];
  const presetPath = (s, t) => s === 'winter' ? (t === 'gather' ? '' : `img/preset-${t}.jpg`) : `img/${s}-${t}.jpg`;
  const presetThumb = (s, t) => ROOT + (s === 'winter' ? (t === 'gather' ? 'img/hero-s.jpg' : `img/preset-${t}-s.jpg`) : `img/${s}-${t}-s.jpg`);
  const seasonOfMonth = m => m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
  const seasonOfDate = v => { const p = parseLocal(v); return seasonOfMonth(p ? p[1] : new Date().getMonth() + 1); };
  let autoBanner = true;
  let userSeason = false;
  let season = seasonOfDate('');

  const shareUrl = id => location.origin + '/e/' + id;

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.style.opacity = 0, 2200);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast('コピーしました');
  }

  function getEv() {
    const ev = { title: fields.title.value.trim(), start: fields.start.value, end: fields.end.value, loc: fields.loc.value.trim(), url: fields.url.value.trim(), banner: fields.banner.value.trim(), nf: !$('fReq').checked, detail: fields.detail.value.replace(/\r\n?/g, '\n').trim() };
    const txt = memoEl.value.replace(/\r\n?/g, '\n').trim();
    const tpl = MEMO_TEMPLATES.find(t => t.text === txt && !!t.nf === ev.nf);
    if (!txt || tpl) { ev.memo = ''; ev.memoT = tpl ? tpl.id : ''; }
    else { ev.memo = txt; ev.memoT = ''; }
    return ev;
  }

  function fillForm(ev) {
    Object.keys(fields).forEach(k => fields[k].value = ev[k] || '');
    $('fReq').checked = !ev.nf;
    memoEl.value = memoText(ev);
    autoBanner = !ev.banner || /^img\/(spring|summer|autumn)-gather\.jpg$/.test(ev.banner);
    userSeason = false;
    season = (() => { const v = ev.banner; if (v) for (const [s] of SEASONS) for (const [t] of THEMES) if (presetPath(s, t) === v) return s; return seasonOfDate(ev.start); })();
    renderPresets();
  }

  const isNewAndFilled = () => !currentId && !!(fields.title.value.trim() || fields.start.value || fields.detail.value.trim());
  function isDirty() { return currentId ? JSON.stringify(getEv()) !== snapshot : isNewAndFilled(); }

  function renderPresets() {
    $('bnSeasons').innerHTML = SEASONS.map(([s, l]) => `<button type="button" role="tab" class="ad-tab${s === season ? ' on' : ''}" data-s="${s}" aria-selected="${s === season}">${l}</button>`).join('');
    $('bnPresets').innerHTML = THEMES.map(([t, l]) => `<button type="button" class="ad-preset" data-path="${presetPath(season, t)}" aria-label="${l}"><img src="${presetThumb(season, t)}" alt="" loading="lazy"><span>${l}</span></button>`).join('');
    markPresets();
  }
  function markPresets() {
    const v = fields.banner.value.trim();
    document.querySelectorAll('.ad-preset').forEach(el => el.classList.toggle('on', el.dataset.path === v));
  }

  function renderList() {
    $('evCount').textContent = `${events.length} / ${maxEvents} 件`;
    $('evList').innerHTML = events.length ? events.map(e => {
      const p = parseLocal(e.start);
      const d = p ? `${p[0]}/${p[1]}/${p[2]}（${WEEK_JA[weekday(p)]}）${p[3]}:${pad(p[4])}` : '';
      return `<li class="${e.id === currentId ? 'on' : ''}" data-id="${esc(e.id)}"><div class="ev-main"><div class="ev-t">${esc(e.title || '（無題）')}</div><div class="ev-d">${esc(d)}</div></div>
        <div class="ev-acts"><button class="ad-btn small ghost" data-act="edit" type="button">編集</button><button class="ad-btn small ghost" data-act="copy" type="button">URLをコピー</button><button class="ad-btn small danger" data-act="del" type="button">削除</button></div></li>`;
    }).join('') : '<li class="ad-evempty">まだイベントがありません。下のフォームから作成してください。</li>';
  }

  function update() {
    const ev = getEv();
    markPresets();
    $('bnThumb').src = bannerUrl(ev.banner) || HERO_SRC;
    $('bnThumb').onerror = function () { this.onerror = null; this.src = HERO_SRC; };
    $('urlField').hidden = ev.nf;
    $('memoTpl').innerHTML = MEMO_TEMPLATES.filter(t => !!t.nf === ev.nf).map(t => `<button type="button" class="ad-chip${ev.memoT === t.id ? ' on' : ''}" data-id="${t.id}">${t.label}</button>`).join('');
    $('memoWarn').hidden = !/記入してください|○/.test(memoEl.value);
    $('dateWarn').hidden = !(ev.start && ev.end && ev.end < ev.start);
    renderCushion($('phoneScreen'), ev);

    const st = $('editState');
    st.textContent = currentId ? '保存済みを編集中' : '新規（未保存）';
    st.className = 'ad-status' + (currentId ? ' saved' : '');
    const dirty = isDirty();
    $('dirtyWarn').hidden = !(currentId && dirty);
    $('btnSave').textContent = currentId ? '変更を保存する' : '保存してURLを発行する';
    $('pubLead').textContent = currentId ? '内容を直して保存すると、配布済みのURLとQRコードはそのまま、新しい内容が表示されます。' : '内容を保存すると、配布用のURLとQRコードが発行されます。';
    $('pubBox').hidden = !currentId;
    if (currentId) {
      const link = shareUrl(currentId);
      if ($('linkOut').value !== link) {
        $('linkOut').value = link; $('btnOpenLink').href = link;
        try { const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); qrSvg = qr.createSvgTag(8, 0); $('qrBox').innerHTML = qrSvg; }
        catch (e) { qrSvg = ''; $('qrBox').textContent = 'QRを作れませんでした。'; }
      }
    }
    document.querySelectorAll('#evList li').forEach(li => li.classList.toggle('on', li.dataset.id === currentId));
  }

  function newEvent() {
    currentId = null; snapshot = '';
    $('linkOut').value = '';
    fillForm({ title: '', start: '', end: '', loc: '', url: '', banner: '', detail: '', memo: '', memoT: '', nf: false });
    update();
  }

  async function openEvent(id) {
    if (id !== currentId && isDirty() && !confirm('保存していない変更があります。破棄して、別のイベントを開きますか？')) return;
    const r = await api('/events/' + encodeURIComponent(id));
    if (!r.ok) { toast('イベントを開けませんでした'); return; }
    currentId = id;
    $('linkOut').value = '';
    fillForm(r.data.ev);
    snapshot = JSON.stringify(getEv());
    update();
    window.scrollTo({ top: document.querySelector('#fTitle').getBoundingClientRect().top + scrollY - 120, behavior: 'smooth' });
  }

  async function loadList() {
    const r = await api('/events');
    if (r.ok) { events = r.data.events || []; maxEvents = r.data.max || 100; renderList(); update(); }
  }

  async function save() {
    const ev = getEv();
    if (!ev.title || !parseLocal(ev.start)) { toast('イベント名と開始日時を入れてください'); return; }
    if (ev.end && ev.end < ev.start) { toast('終了日時が開始日時より前になっています'); return; }
    if (/記入してください|○/.test(memoEl.value) && !confirm('備考に「○」や「記入してください」が残っています。このまま保存しますか？')) return;
    const btn = $('btnSave'); btn.disabled = true;
    try {
      const r = currentId
        ? await api('/events/' + encodeURIComponent(currentId), { method: 'PUT', body: ev })
        : await api('/events', { method: 'POST', body: ev });
      if (!r.ok) {
        if (r.status === 409) toast(`イベントは${maxEvents}件までです。不要なものを削除してください`);
        else if (r.status !== 401) toast('保存できませんでした。もう一度お試しください');
        return;
      }
      const wasNew = !currentId;
      currentId = currentId || r.data.id;
      snapshot = JSON.stringify(getEv());
      const entry = { id: currentId, title: ev.title, start: ev.start, updated: Date.now() };
      events = [entry].concat(events.filter(e => e.id !== currentId));
      renderList(); update();
      toast(wasNew ? '保存しました。URLとQRコードを発行しました' : '保存しました。配布済みのQRにも反映されます');
    } finally { btn.disabled = false; }
  }

  async function startApp() {
    renderPresets();
    newEvent();

    fields.start.addEventListener('change', () => {
      const p = parseLocal(fields.start.value);
      if (p && (!fields.end.value || fields.end.value < fields.start.value)) {
        const d = new Date(p[0], p[1] - 1, p[2], p[3] + 2, p[4]);
        fields.end.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      const ns = seasonOfDate(fields.start.value);
      if (autoBanner) fields.banner.value = presetPath(ns, 'gather');
      if (!userSeason && ns !== season) { season = ns; renderPresets(); }
      update();
    });
    Object.values(fields).concat(memoEl).forEach(el => el.addEventListener('input', update));
    $('fReq').addEventListener('change', () => {
      const nf = !$('fReq').checked, cur = memoEl.value.replace(/\r\n?/g, '\n').trim();
      const legacy = t => t.text.replace('{詳細}\n\n', '').trim();
      if (!cur || MEMO_TEMPLATES.some(t => (t.text === cur || legacy(t) === cur) && !!t.nf !== nf)) { memoEl.value = defaultTpl(nf).text; toast('備考のテンプレートを切り替えました'); }
      else toast('備考は編集済みのため、そのままにしています');
      update();
    });
    $('memoTpl').addEventListener('click', e => {
      const b = e.target.closest('.ad-chip'); if (!b) return;
      const t = MEMO_TEMPLATES.find(x => x.id === b.dataset.id);
      if (t) { memoEl.value = t.text; update(); }
    });
    $('bnSeasons').addEventListener('click', e => {
      const b = e.target.closest('.ad-tab'); if (!b) return;
      season = b.dataset.s; userSeason = true; renderPresets();
    });
    $('bnPresets').addEventListener('click', e => {
      const b = e.target.closest('.ad-preset'); if (!b) return;
      autoBanner = false; fields.banner.value = b.dataset.path; update();
    });

    $('btnSave').addEventListener('click', save);
    $('btnNew').addEventListener('click', () => {
      if (isDirty() && !confirm('保存していない変更があります。破棄して、新しいイベントを作りますか？')) return;
      newEvent();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('evList').addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const li = b.closest('li'), id = li.dataset.id, act = b.dataset.act;
      if (act === 'edit') openEvent(id);
      else if (act === 'copy') copyText(shareUrl(id));
      else if (act === 'del') {
        const t = (events.find(x => x.id === id) || {}).title || '';
        if (!confirm(`「${t}」を削除しますか？\n配布済みのQRコードも開けなくなります。この操作は取り消せません。`)) return;
        const r = await api('/events/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok) { if (r.status !== 401) toast('削除できませんでした'); return; }
        events = events.filter(x => x.id !== id);
        if (id === currentId) newEvent();
        renderList(); update();
        toast('削除しました');
      }
    });

    $('btnCopyLink').addEventListener('click', () => copyText($('linkOut').value));
    $('btnQrPng').addEventListener('click', () => {
      if (!qrSvg) return;
      const img = new Image();
      img.onload = () => {
        const size = 1000, margin = 60;
        const c = document.createElement('canvas'); c.width = c.height = size;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
        x.imageSmoothingEnabled = false; x.drawImage(img, margin, margin, size - margin * 2, size - margin * 2);
        const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'save-the-date-qr.png'; a.click();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg);
    });

    window.addEventListener('beforeunload', e => { if (appStarted && isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  }

  boot();
})();
