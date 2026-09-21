/* ==========================================================================
   Onboarding — a one-time spotlight tooltip shown the first time a signed-in
   user can chat in a country room. It highlights only the Discord footer icon
   and invites them to continue on Discord. Localized; remembered in localStorage.
   ========================================================================== */
(function () {
  'use strict';

  const KEY = 'geoscope.discordGuide';
  const overlay = document.getElementById('discordGuide');
  const hole = document.getElementById('spotlightHole');
  const card = document.getElementById('spotlightCard');
  const btn = document.getElementById('spotlightBtn');
  const textEl = document.getElementById('spotlightText');
  const target = document.getElementById('discordLink');
  if (!overlay || !hole || !card || !btn || !target) return;

  const t = (k) => (window.I18N ? window.I18N.t(k) : k);
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked */ }
  let open = false;

  function applyText() {
    textEl.textContent = t('discordGuideText');
    btn.textContent = t('discordGuideBtn');
  }

  function position() {
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return false;      // icon not laid out / hidden
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const radius = Math.max(r.width, r.height) / 2 + 9;
    hole.style.left = (cx - radius) + 'px';
    hole.style.top = (cy - radius) + 'px';
    hole.style.width = hole.style.height = (radius * 2) + 'px';

    // measure the card, then place it above the icon (footer sits at the bottom), clamped to the viewport
    card.style.visibility = 'hidden';
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = Math.min(Math.max(8, cx - 24), window.innerWidth - cw - 8);
    let top = r.top - ch - 16;
    if (top < 8) top = Math.min(r.bottom + 16, window.innerHeight - ch - 8);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.visibility = '';
    return true;
  }

  function reveal() {
    if (seen || open) return;
    applyText();
    overlay.hidden = false;
    if (!position()) { overlay.hidden = true; return; }   // icon still not visible → skip quietly
    open = true;
    try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); }
  }
  function show() {
    if (seen || open) return;
    // on phones the footer is hidden behind an open sheet: close it first so the icon is visible
    if (window.MobileUI && window.MobileUI.isMobile()) {
      window.MobileUI.setSheet('none');
      setTimeout(reveal, 60);   // let the sheet close before measuring the icon
    } else {
      reveal();
    }
  }

  function dismiss() {
    if (!open) return;
    open = false;
    seen = true;
    overlay.hidden = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
  }

  btn.addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (!card.contains(e.target)) dismiss(); });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') dismiss(); });
  window.addEventListener('resize', () => { if (open) position(); }, { passive: true });
  document.addEventListener('geoscope:lang', () => { if (open) { applyText(); position(); } });

  // trigger: chat.js fires this once a signed-in user has an active room
  document.addEventListener('geoscope:chat-ready', show);

  window.Onboarding = { show, dismiss, seen: () => seen };
})();
