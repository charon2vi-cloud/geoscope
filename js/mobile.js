/* ==========================================================================
   Mobile — turns the desktop side panels into a bottom tab bar + bottom sheets
   on small screens (<=768px). Desktop layout is untouched; everything here is
   gated behind a matchMedia query and a body[data-sheet] attribute the CSS uses.
   ========================================================================== */
(function () {
  'use strict';

  const mq = window.matchMedia('(max-width: 768px)');
  const tabs = document.getElementById('mtabs');
  if (!tabs) return;
  const tabBtns = Array.from(tabs.querySelectorAll('.mtab'));
  const chatBadge = document.getElementById('mtabChatBadge');
  const body = document.body;

  // which sheet is open: 'none' | 'overlay' | 'dir' | 'chat'
  function currentSheet() { return body.getAttribute('data-sheet') || 'none'; }

  function setSheet(name) {
    if (!mq.matches) return;
    const next = (name === currentSheet() && name !== 'none') ? 'none' : name;
    body.setAttribute('data-sheet', next);
    tabBtns.forEach(b => {
      const on = (b.dataset.sheet === next) || (next === 'none' && b.dataset.sheet === 'none');
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (next === 'chat') {
      const panel = document.getElementById('chatPanel');
      if (panel) panel.classList.remove('is-min');   // the sheet shows the chat in full
    }
    if (next !== 'chat') closeKeyboard();
    updateBadge();
    // let the map recompute after the layout shift (globe shadow, projected labels)
    if (window.GeoScope && window.GeoScope.map) setTimeout(() => window.GeoScope.map.resize(), 320);
  }

  tabBtns.forEach(b => b.addEventListener('click', () => setSheet(b.dataset.sheet)));

  // ---- live chat badge on the Chat tab: a room is active but the chat sheet is closed ----
  function updateBadge() {
    if (!chatBadge) return;
    const active = window.Chat && window.Chat.room && currentSheet() !== 'chat';
    chatBadge.hidden = !active;
  }
  document.addEventListener('geoscope:select', e => {
    // picking a country from the directory sheet: close it so the map fly is visible
    if (mq.matches && e.detail && e.detail.id != null && currentSheet() === 'dir') setSheet('none');
    updateBadge();
  });

  // ---- on-screen keyboard: keep the chat input above it, hide the tab bar while typing ----
  const vv = window.visualViewport;
  function onViewport() {
    if (!vv) return;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kb + 'px');
    body.classList.toggle('kb-open', kb > 90);
    if (kb > 90) {
      const list = document.getElementById('chatList');
      if (list && currentSheet() === 'chat') list.scrollTop = list.scrollHeight;
    }
  }
  function closeKeyboard() {
    const input = document.getElementById('chatInput');
    if (input && document.activeElement === input) input.blur();
    document.documentElement.style.setProperty('--kb', '0px');
    body.classList.remove('kb-open');
  }
  if (vv) { vv.addEventListener('resize', onViewport); vv.addEventListener('scroll', onViewport); }

  // ---- enter / leave mobile mode ----
  function applyMode() {
    if (mq.matches) {
      tabs.hidden = false;
      if (!body.hasAttribute('data-sheet')) body.setAttribute('data-sheet', 'none');
      setSheet(currentSheet() === 'chat' || currentSheet() === 'overlay' || currentSheet() === 'dir' ? currentSheet() : 'none');
    } else {
      tabs.hidden = true;
      body.removeAttribute('data-sheet');
      closeKeyboard();
    }
    if (window.GeoScope && window.GeoScope.map) setTimeout(() => window.GeoScope.map.resize(), 320);
  }
  if (mq.addEventListener) mq.addEventListener('change', applyMode); else if (mq.addListener) mq.addListener(applyMode);

  applyMode();
  updateBadge();

  // small public hook so other scripts can open a sheet if needed
  window.MobileUI = { setSheet, isMobile: () => mq.matches, updateBadge };
})();
