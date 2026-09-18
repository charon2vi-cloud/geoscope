/* Development-only stand-in for @supabase/supabase-js, used by test-chat.html to exercise the chat
   UI (auth state, history, realtime inserts, presence, RPC errors) without a real project.
   It mirrors the subset of the API that js/chat.js uses. Never load this in production. */
(function () {
  'use strict';
  const rooms = {};                // country -> messages
  const channels = [];             // live channel objects
  let nextId = 1;
  let user = null;
  const authListeners = [];
  let lastSentAt = 0;

  function seed(a2) {
    if (rooms[a2]) return rooms[a2];
    rooms[a2] = [
      { id: nextId++, country: a2, user_id: 'u-alice', author_name: 'Alice', author_avatar: '', body: 'Hello from ' + a2 + '! Anyone playing tonight?', created_at: new Date(Date.now() - 3600e3).toISOString() },
      { id: nextId++, country: a2, user_id: 'u-bob', author_name: 'Bob <script>alert(1)</script>', author_avatar: 'javascript:alert(1)', body: '<img src=x onerror=alert(1)> this must render as plain text', created_at: new Date(Date.now() - 1800e3).toISOString() },
    ];
    return rooms[a2];
  }
  function emitAuth(event) { authListeners.forEach(cb => cb(event, user ? { user } : null)); }
  function presenceFor(ch) {
    // this session + a few simulated viewers
    const extra = ch.name === 'site-presence' ? 6 : 2;
    const state = {};
    if (ch.tracked) state[ch.key] = [{}];
    for (let i = 0; i < extra; i++) state['viewer-' + i] = [{}];
    return state;
  }
  function makeChannel(name, cfg) {
    const ch = {
      name, key: cfg && cfg.config && cfg.config.presence ? cfg.config.presence.key : 'anon', handlers: [], tracked: false, state: 'closed',
      on(type, filter, cb) { ch.handlers.push({ type, filter, cb }); return ch; },
      subscribe(cb) { ch.state = 'joined'; channels.push(ch); setTimeout(() => cb && cb('SUBSCRIBED'), 30); return ch; },
      async track() { ch.tracked = true; ch.handlers.filter(h => h.type === 'presence').forEach(h => h.cb()); },
      presenceState() { return presenceFor(ch); },
    };
    return ch;
  }
  function broadcastInsert(row) {
    channels.forEach(ch => ch.handlers.filter(h => h.type === 'postgres_changes' && h.filter.filter === 'country=eq.' + row.country).forEach(h => h.cb({ new: row })));
  }

  const client = {
    auth: {
      onAuthStateChange(cb) { authListeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: user ? { user } : null } }; },
      async signInWithOAuth() {
        user = { id: 'u-me', user_metadata: { full_name: 'Test Explorer', avatar_url: 'https://flagcdn.com/w80/es.png' } };
        setTimeout(() => emitAuth('SIGNED_IN'), 10);
        return { data: {}, error: null };
      },
      async signOut() { user = null; emitAuth('SIGNED_OUT'); return { error: null }; },
    },
    from(table) {
      const q = { _a2: null, _limit: 100 };
      q.select = () => q; q.order = () => q; q.limit = n => { q._limit = n; return q; };
      q.eq = (col, v) => { if (col === 'country') q._a2 = v; return q; };
      q.then = (res, rej) => Promise.resolve({ data: table === 'messages' ? seed(q._a2).slice(-q._limit).reverse() : [], error: null }).then(res, rej);
      return q;
    },
    async rpc(fn, args) {
      if (fn === 'my_status') return { data: { banned_until: null, display_name: 'Test Explorer' }, error: null };
      if (!user) return { data: null, error: { message: 'auth_required' } };
      if (fn === 'send_message') {
        if (!/^[A-Z]{2}$/.test(args.p_country)) return { data: null, error: { message: 'invalid_country' } };
        if (Date.now() - lastSentAt < 1000) return { data: null, error: { message: 'rate_limited' } };
        lastSentAt = Date.now();
        const row = { id: nextId++, country: args.p_country, user_id: user.id, author_name: 'Test Explorer', author_avatar: user.user_metadata.avatar_url, body: args.p_body, created_at: new Date().toISOString() };
        seed(args.p_country).push(row);
        setTimeout(() => broadcastInsert(row), 20);
        return { data: row.id, error: null };
      }
      if (fn === 'report_message') return { data: { ok: true, day: 1, week: 1, month: 1, banned: false }, error: null };
      return { data: null, error: { message: 'unknown_rpc' } };
    },
    channel: makeChannel,
    async removeChannel(ch) { const i = channels.indexOf(ch); if (i >= 0) channels.splice(i, 1); ch.state = 'closed'; },
  };

  window.supabase = { createClient: () => client };
  // test hook: simulate somebody else posting into a room
  window.__mockIncoming = (a2, body) => {
    const row = { id: nextId++, country: a2, user_id: 'u-alice', author_name: 'Alice', author_avatar: '', body, created_at: new Date().toISOString() };
    seed(a2).push(row); broadcastInsert(row); return row.id;
  };
})();
