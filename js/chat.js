/* ==========================================================================
   Chat — country rooms on Supabase (Auth, Realtime, Presence) + live visitors
   Security notes
     * All user-provided text is rendered with textContent; nothing is ever
       inserted as HTML. Avatars are shown only from https:// URLs.
     * Inputs are validated client-side (length, control chars, country code)
       and again server-side in the SQL functions (see supabase/schema.sql).
     * Only the public anon key is used; writes go through RLS-protected RPCs.
     * Client throttle: one message per second; the server enforces it too.
   ========================================================================== */
window.Chat = (function () {
  'use strict';

  const MAX_LEN = 500;
  const HISTORY = 100;
  const SEND_INTERVAL = 1000;
  const POLL_INTERVAL = 3000;   // REST fallback: how often to poll a room for new messages
  const WS_WATCHDOG = 3500;     // if the realtime socket has not joined by now, start polling anyway
  const $ = s => document.querySelector(s);

  const cfg = window.GEO_CONFIG || {};
  const URL_OK = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
  const KEY_OK = /^[A-Za-z0-9._-]{20,}$/;
  const CC_OK = /^[A-Z]{2}$/;
  const configured = URL_OK.test(cfg.supabaseUrl || '') && KEY_OK.test(cfg.supabaseAnonKey || '') && typeof window.supabase !== 'undefined';

  let sb = null;
  let opts = { t: k => k, lang: () => 'en', name: c => c.n, flag: () => '' };
  let user = null;
  let bannedUntil = null;
  let room = null;         // country record of the joined room
  let pending = null;      // country awaiting the switch confirmation
  let roomChannel = null;
  let siteChannel = null;
  let roomPoll = null;     // REST polling interval handle (fallback when realtime is unavailable)
  let lastMsgId = 0;       // highest message id seen in the current room, for incremental polling
  let wsJoined = false;    // whether the realtime channel for the current room is subscribed
  let joinToken = 0;       // bumped on every join() so stale async callbacks bail out
  let online = 0;
  let lastSent = 0;
  let minimized = false;
  const messages = [];     // rendered messages (id, user_id, ...)
  const pendingSends = [];  // optimistic messages awaiting the server's real id: {tempId, body, node, msg}
  const reported = new Set();
  const sessionKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 's-' + Math.random().toString(36).slice(2);

  const el = {};
  function grab() {
    el.panel = $('#chatPanel'); el.flag = $('#chatFlag'); el.room = $('#chatRoom'); el.online = $('#chatOnline');
    el.min = $('#chatMin'); el.body = $('#chatBody'); el.hint = $('#chatHint'); el.list = $('#chatList');
    el.signIn = $('#chatSignIn'); el.form = $('#chatForm'); el.me = $('#chatMe'); el.input = $('#chatInput');
    el.send = $('#chatSend'); el.signOut = $('#chatSignOut'); el.status = $('#chatStatus');
    el.modal = $('#roomModal'); el.modalText = $('#roomModalText'); el.stay = $('#roomStay'); el.switch = $('#roomSwitch');
    el.visitors = $('#visitors'); el.visitorsCount = $('#visitorsCount');
  }

  // ---------- helpers ----------
  const t = (k, v) => opts.t(k, v);
  function sanitize(s) {
    return String(s || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  }
  function safeUrl(u) { return typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 500 ? u : ''; }
  function status(msg, kind) {
    if (!msg) { el.status.hidden = true; el.status.textContent = ''; return; }
    el.status.textContent = msg;
    el.status.className = 'chat__status' + (kind ? ' is-' + kind : '');
    el.status.hidden = false;
  }
  function errorKey(err) {
    const m = (err && (err.message || err.error_description || err.msg)) || '';
    if (/banned_until:(\S+)/.test(m)) {
      const d = new Date(RegExp.$1);
      return t('chatBanned', { date: isNaN(d) ? '' : d.toLocaleString(opts.lang()) });
    }
    if (/rate_limited/.test(m)) return t('chatRateLimited');
    if (/message_too_long/.test(m)) return t('chatTooLong');
    if (/empty_message/.test(m)) return t('chatEmpty');
    if (/auth_required|profile_missing|JWT|permission/i.test(m)) return t('chatSignInFirst');
    if (/cannot_report_self/.test(m)) return t('chatReportSelf');
    return t('chatError');
  }
  function timeLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const sameDay = d.toDateString() === new Date().toDateString();
    const loc = opts.lang() === 'ar' ? 'ar-MA' : opts.lang();
    return sameDay ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(loc, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- rendering ----------
  function renderHeader() {
    if (room) {
      el.flag.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'flag'; img.width = 24; img.height = 18; img.alt = ''; img.loading = 'lazy';
      img.src = 'https://flagcdn.com/w40/' + room.a2.toLowerCase() + '.png';
      img.srcset = 'https://flagcdn.com/w80/' + room.a2.toLowerCase() + '.png 2x';
      el.flag.appendChild(img);
      el.room.textContent = t('chatRoomOf', { country: opts.name(room) });
      el.input.placeholder = t('chatPlaceholder', { country: opts.name(room) });
    } else {
      el.flag.innerHTML = '';
      el.room.textContent = t('chatTitle');
      el.input.placeholder = t('chatPlaceholderNoRoom');
    }
    el.online.querySelector('b').textContent = String(online);
    el.online.title = t('chatOnline', { n: online });
    el.hint.hidden = !!room || !configured;
    el.hint.textContent = t('chatSelectCountry');
  }
  function renderAuth() {
    const signed = !!user;
    el.signIn.hidden = signed || !configured;
    el.form.hidden = !signed;
    if (signed) {
      const meta = user.user_metadata || {};
      const avatar = safeUrl(meta.avatar_url || meta.picture);
      if (avatar) { el.me.src = avatar; el.me.hidden = false; } else { el.me.removeAttribute('src'); el.me.hidden = true; }
      el.me.alt = sanitize(meta.full_name || meta.name || '');
    }
    const banned = bannedUntil && bannedUntil > new Date();
    el.input.disabled = !room || banned;
    el.send.disabled = !room || banned;
    if (banned) status(t('chatBanned', { date: bannedUntil.toLocaleString(opts.lang()) }), 'error');
    // report buttons depend on who is signed in
    el.list.querySelectorAll('.chat__msg').forEach(li => {
      const own = user && li.dataset.uid === user.id;
      const btn = li.querySelector('.chat__report');
      if (btn) { btn.hidden = !signed || !!own; }
    });
  }
  function messageNode(m) {
    const li = document.createElement('li');
    li.className = 'chat__msg';
    li.dataset.id = String(m.id);
    li.dataset.uid = m.user_id || '';
    if (user && m.user_id === user.id) li.classList.add('is-own');

    const av = document.createElement('span');
    av.className = 'chat__avatar';
    const url = safeUrl(m.author_avatar);
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.width = 26; img.height = 26; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      av.appendChild(img);
    } else {
      av.textContent = sanitize(m.author_name).charAt(0).toUpperCase() || '?';
    }

    const main = document.createElement('div');
    main.className = 'chat__main';
    const meta = document.createElement('div');
    meta.className = 'chat__meta';
    const name = document.createElement('b');
    name.textContent = sanitize(m.author_name) || 'Explorer';
    const time = document.createElement('time');
    time.dateTime = m.created_at || '';
    time.textContent = timeLabel(m.created_at);
    meta.appendChild(name); meta.appendChild(time);
    const body = document.createElement('p');
    body.className = 'chat__text';
    body.textContent = sanitize(m.body);
    main.appendChild(meta); main.appendChild(body);

    const report = document.createElement('button');
    report.type = 'button';
    report.className = 'chat__report';
    report.textContent = reported.has(m.id) ? t('chatReported') : t('chatReport');
    report.disabled = reported.has(m.id);
    report.hidden = !user || (user && m.user_id === user.id);
    report.addEventListener('click', () => reportMessage(m.id, report));

    li.appendChild(av); li.appendChild(main); li.appendChild(report);
    return li;
  }
  function renderList() {
    el.list.replaceChildren(...messages.map(messageNode));
    el.list.hidden = !room;
    if (room && !messages.length) {
      const empty = document.createElement('li');
      empty.className = 'chat__empty';
      empty.textContent = t('chatNoMessages');
      el.list.appendChild(empty);
    }
    scrollToEnd();
  }
  function scrollToEnd() { el.list.scrollTop = el.list.scrollHeight; }
  function idNum(v) { return typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? parseInt(v, 10) : 0); }
  function noteId(m) { const n = idNum(m.id); if (n > lastMsgId) lastMsgId = n; }
  function appendMessage(m) {
    if (messages.some(x => x.id === m.id)) { noteId(m); return; }
    // realtime echo of a message we already showed optimistically: adopt the real id instead of adding a duplicate
    if (user && m.user_id === user.id) {
      const p = pendingSends.find(x => x.body === m.body);
      if (p) { confirmSend(p.tempId, m.id, m.created_at); return; }
    }
    noteId(m);
    messages.push(m);
    if (messages.length > 400) messages.splice(0, messages.length - 400);
    const empty = el.list.querySelector('.chat__empty');
    if (empty) empty.remove();
    // WhatsApp/Telegram behaviour: follow new messages only when already at the bottom,
    // so reading older history is not interrupted; sending always scrolls (see optimisticSend).
    const nearBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 80;
    el.list.appendChild(messageNode(m));
    if (nearBottom) scrollToEnd();
  }

  // ---------- optimistic send ----------
  // Show the message instantly with a temporary id, then reconcile once the server replies
  // (send_message returns the real id) or the realtime INSERT echo arrives.
  function optimisticSend(body) {
    const meta = user.user_metadata || {};
    const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const msg = {
      id: tempId, country: room.a2, user_id: user.id,
      author_name: sanitize(meta.full_name || meta.name || 'Explorer'),
      author_avatar: safeUrl(meta.avatar_url || meta.picture),
      body: body, created_at: new Date().toISOString(),
    };
    messages.push(msg);
    const node = messageNode(msg);
    node.classList.add('is-pending');
    const empty = el.list.querySelector('.chat__empty');
    if (empty) empty.remove();
    el.list.appendChild(node);
    scrollToEnd();
    pendingSends.push({ tempId: tempId, body: body, node: node, msg: msg });
    return tempId;
  }
  function confirmSend(tempId, realId, createdAt) {
    const i = pendingSends.findIndex(x => x.tempId === tempId);
    if (i < 0) return;
    const p = pendingSends[i];
    p.msg.id = realId;
    noteId(p.msg);
    if (createdAt) { p.msg.created_at = createdAt; const time = p.node.querySelector('time'); if (time) { time.dateTime = createdAt; time.textContent = timeLabel(createdAt); } }
    p.node.dataset.id = String(realId);
    p.node.classList.remove('is-pending');
    pendingSends.splice(i, 1);
  }

  // ---------- REST polling fallback ----------
  // International users whose WebSocket to Supabase Realtime is slow or blocked still receive
  // messages by polling the messages table over HTTPS (same REST endpoint the history load uses).
  // Polling runs only while realtime is not subscribed; it fetches rows newer than lastMsgId.
  async function pollOnce(a2, token) {
    if (!configured || !room || room.a2 !== a2 || token !== joinToken) return;
    try {
      const { data, error } = await sb.from('messages')
        .select('id,country,user_id,author_name,author_avatar,body,created_at')
        .eq('country', a2).gt('id', lastMsgId)
        .order('id', { ascending: true }).limit(200);
      if (error) throw error;
      if (!room || room.a2 !== a2 || token !== joinToken) return;
      (data || []).forEach(appendMessage);
    } catch (e) { /* transient network error; the next tick retries */ }
  }
  function startPolling(a2, token) {
    if (roomPoll || token !== joinToken) return;
    roomPoll = setInterval(() => pollOnce(a2, token), POLL_INTERVAL);
    pollOnce(a2, token);   // fetch immediately, don't wait a whole interval
  }
  function stopPolling() { if (roomPoll) { clearInterval(roomPoll); roomPoll = null; } }
  function failSend(tempId) {
    const i = pendingSends.findIndex(x => x.tempId === tempId);
    if (i < 0) return;
    const mi = messages.indexOf(pendingSends[i].msg);
    if (mi >= 0) messages.splice(mi, 1);
    pendingSends[i].node.remove();
    pendingSends.splice(i, 1);
  }

  // ---------- rooms ----------
  // Fire once a signed-in user has an active room (the moment they can actually chat).
  // The onboarding module listens for this to show its one-time Discord tooltip.
  function signalChatReady() {
    if (user && room) { try { document.dispatchEvent(new CustomEvent('geoscope:chat-ready')); } catch (e) { /* older browsers */ } }
  }

  async function join(country) {
    if (!configured || !country || !CC_OK.test(country.a2)) return;
    // explicitly leave the previous room: stop polling and unsubscribe its realtime channel
    stopPolling();
    if (roomChannel) { try { await sb.removeChannel(roomChannel); } catch (e) { /* ignore */ } roomChannel = null; }
    const token = ++joinToken;
    const a2 = country.a2;
    room = country;
    messages.length = 0; pendingSends.length = 0; online = 0; lastMsgId = 0; wsJoined = false;
    renderHeader(); renderAuth(); renderList();
    status(t('chatConnecting'));

    // 1) load recent history over REST (works regardless of the websocket)
    try {
      const { data, error } = await sb.from('messages')
        .select('id,country,user_id,author_name,author_avatar,body,created_at')
        .eq('country', a2).order('id', { ascending: false }).limit(HISTORY);
      if (error) throw error;
      if (token !== joinToken) return;   // a newer room was joined meanwhile
      messages.length = 0;
      (data || []).reverse().forEach(m => { messages.push(m); noteId(m); });
      renderList();
      status('');
    } catch (e) {
      if (token === joinToken) status(errorKey(e), 'error');
    }
    if (token !== joinToken) return;

    // 2) subscribe to this room's realtime channel: chat:<CC>. No IP/origin restriction — the
    //    channel is global; every subscriber gets every INSERT for this country (RLS permitting).
    roomChannel = sb.channel('chat:' + a2, { config: { presence: { key: sessionKey } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'country=eq.' + a2 },
        payload => { if (room && payload.new && payload.new.country === room.a2) appendMessage(payload.new); })
      .on('presence', { event: 'sync' }, () => {
        if (!roomChannel) return;
        online = Object.keys(roomChannel.presenceState()).length;
        el.online.querySelector('b').textContent = String(online);
        el.online.title = t('chatOnline', { n: online });
      })
      .subscribe(async st => {
        if (token !== joinToken) return;
        if (st === 'SUBSCRIBED') {
          wsJoined = true;
          stopPolling();                 // realtime is primary; drop the REST fallback
          pollOnce(a2, token);           // one catch-up read for anything missed while connecting
          status('');
          try { await roomChannel.track({ at: new Date().toISOString(), uid: user ? user.id : null }); } catch (e) { /* ignore */ }
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          // websocket failed or dropped (common for some international/mobile networks):
          // fall back to REST polling so messages still flow, without alarming the user.
          wsJoined = false;
          startPolling(a2, token);
        }
      });

    // 3) watchdog: if the socket has not joined shortly, start polling anyway so reception is
    //    never blocked by a slow or blocked websocket handshake.
    setTimeout(() => { if (token === joinToken && !wsJoined) startPolling(a2, token); }, WS_WATCHDOG);

    signalChatReady();   // signed-in user now has a room → onboarding may run
  }

  function requestRoom(country) {
    if (!configured || !country || !CC_OK.test(country.a2)) return;
    if (!room) { join(country); return; }
    if (room.a2 === country.a2) return;
    if (minimized) { join(country); return; }
    pending = country;
    el.modalText.textContent = t('switchText', { from: opts.name(room), to: opts.name(country) });
    el.modal.hidden = false;
    setTimeout(() => el.stay.focus(), 30);
  }
  function closeModal(doSwitch) {
    el.modal.hidden = true;
    const next = pending; pending = null;
    if (doSwitch && next) join(next);
  }

  // ---------- sending & reporting ----------
  async function send(e) {
    e.preventDefault();
    if (!user || !room) return;
    const body = sanitize(el.input.value);
    if (!body) { status(t('chatEmpty'), 'error'); return; }
    if (body.length > MAX_LEN) { status(t('chatTooLong'), 'error'); return; }
    const now = Date.now();
    if (now - lastSent < SEND_INTERVAL) { status(t('chatRateLimited'), 'error'); return; }
    lastSent = now;
    const roomA2 = room.a2;
    el.input.value = '';
    status('');
    const tempId = optimisticSend(body);   // instant local echo
    el.send.disabled = true;
    try {
      const { data, error } = await sb.rpc('send_message', { p_country: roomA2, p_body: body });
      if (error) throw error;
      if (data != null) confirmSend(tempId, data);     // real id from send_message()
      else { const p = pendingSends.find(x => x.tempId === tempId); if (p) { p.node.classList.remove("is-pending"); pendingSends.splice(pendingSends.indexOf(p), 1); } }
      if (!wsJoined && room && room.a2 === roomA2) pollOnce(roomA2, joinToken);   // no socket: pull any concurrent messages now
    } catch (err) {
      failSend(tempId);       // roll the optimistic bubble back on failure
      lastSent = 0;           // let the user retry straight away
      status(errorKey(err), 'error');
      if (/banned_until:(\S+)/.test((err && err.message) || '')) { bannedUntil = new Date(RegExp.$1); renderAuth(); }
    } finally {
      el.send.disabled = !room || !user;
      el.input.focus();
    }
  }
  async function reportMessage(id, btn) {
    if (!user || !Number.isInteger(id)) return;
    if (!window.confirm(t('chatReportConfirm'))) return;
    btn.disabled = true;
    try {
      const { error } = await sb.rpc('report_message', { p_message_id: id });
      if (error) throw error;
      reported.add(id);
      btn.textContent = t('chatReported');
      status(t('chatReportThanks'), 'ok');
    } catch (err) {
      btn.disabled = false;
      status(errorKey(err), 'error');
    }
  }

  // ---------- auth ----------
  async function refreshStatus() {
    bannedUntil = null;
    if (!user) return;
    try {
      const { data, error } = await sb.rpc('my_status');
      if (!error && data && data.banned_until) { const d = new Date(data.banned_until); if (!isNaN(d)) bannedUntil = d; }
    } catch (e) { /* ignore */ }
    renderAuth();
  }
  async function signIn() {
    if (!configured) return;
    status(t('chatConnecting'));
    const redirectTo = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) status(errorKey(error), 'error');
  }
  async function signOut() {
    try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
    status('');
  }

  // ---------- site-wide presence (live visitors) ----------
  function joinSite() {
    siteChannel = sb.channel('site-presence', { config: { presence: { key: sessionKey } } })
      .on('presence', { event: 'sync' }, () => {
        const n = Object.keys(siteChannel.presenceState()).length;
        el.visitorsCount.textContent = String(n);
        el.visitors.hidden = false;
      })
      .subscribe(async st => { if (st === 'SUBSCRIBED') { try { await siteChannel.track({ at: new Date().toISOString() }); } catch (e) { /* ignore */ } } });
  }

  // ---------- public API ----------
  function init(o) {
    grab();
    opts = Object.assign(opts, o || {});
    el.min.addEventListener('click', () => {
      minimized = !minimized;
      el.panel.classList.toggle('is-min', minimized);
      el.min.setAttribute('aria-expanded', minimized ? 'false' : 'true');
      el.min.setAttribute('aria-label', t(minimized ? 'chatExpand' : 'chatMinimise'));
    });
    el.form.addEventListener('submit', send);
    el.signIn.addEventListener('click', signIn);
    el.signOut.addEventListener('click', signOut);
    el.stay.addEventListener('click', () => closeModal(false));
    el.switch.addEventListener('click', () => closeModal(true));
    el.modal.addEventListener('click', e => { if (e.target === el.modal) closeModal(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.modal.hidden) closeModal(false); });
    el.input.addEventListener('input', () => { if (el.input.value.length > MAX_LEN) el.input.value = el.input.value.slice(0, MAX_LEN); });

    if (!configured) {
      el.hint.textContent = t('chatNotConfigured');
      el.hint.hidden = false;
      el.signIn.hidden = true;
      el.form.hidden = true;
      el.visitors.hidden = true;
      renderHeader();
      el.hint.textContent = t('chatNotConfigured');
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    sb.auth.onAuthStateChange((event, session) => {
      user = session ? session.user : null;
      renderAuth();
      refreshStatus();
      if (roomChannel && roomChannel.state === 'joined') { roomChannel.track({ at: new Date().toISOString(), uid: user ? user.id : null }).catch(() => {}); }
      if (event === 'SIGNED_IN') signalChatReady();   // signed in while already in a room → onboarding may run
    });
    sb.auth.getSession().then(({ data }) => { user = data && data.session ? data.session.user : null; renderAuth(); refreshStatus(); });
    joinSite();
    renderHeader();
    renderAuth();
    // clean the OAuth fragment/query left by the redirect
    if (/[?#].*(access_token|code=)/.test(location.href)) history.replaceState(null, '', location.pathname);
  }
  function refreshLang() {
    renderHeader();
    renderAuth();
    renderList();
    if (!configured) { el.hint.textContent = t('chatNotConfigured'); el.hint.hidden = false; }
    if (!el.modal.hidden && room && pending) el.modalText.textContent = t('switchText', { from: opts.name(room), to: opts.name(pending) });
  }

  return { init, requestRoom, refreshLang, get configured() { return configured; }, get room() { return room; } };
})();
