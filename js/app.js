/* ==========================================================================
   GeoScope — main application
   One MapLibre map drives both the 3D globe (EARTH) and the flat map (MAP);
   SATELLITE swaps the minimalist style for imagery in either projection.
   ========================================================================== */
(function () {
  'use strict';

  const Geo = window.Geo;
  const I18N = window.I18N;
  const FACTS = window.GEO_FACTS || { en: {} };
  const $ = s => document.querySelector(s);

  // ---------- configuration ----------
  const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
  const FONT = ['Noto Sans Regular'];
  const FONT_BOLD = ['Noto Sans Bold'];
  const RTL_PLUGIN = location.protocol === 'file:'
    ? 'https://cdn.jsdelivr.net/npm/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js'
    : new URL('vendor/mapbox-gl-rtl-text.js', location.href).href;
  const SAT_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
  const SAT_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics &amp; the GIS User Community';
  const DATA_ATTR = 'Borders: Natural Earth · Population: World Bank · Flags: flagcdn';
  const FLAG_URL = (a2, size) => 'https://flagcdn.com/' + size + '/' + a2.toLowerCase() + '.png';

  const ZOOM_MAX = { minimal: 9, satellite: 11 };
  const CAPITAL_MINZOOM = 3.6;   // capitals appear when zoomed in to country level
  const OVERLAY_SPLIT_ZOOM = 6;  // overlay labels: one per country below, one per tile-piece above
  const TILE = 512;

  const THEMES = {
    light: {
      bgEarth: '#f3f5f8', bgMap: '#eef1f5', bgMapOpacity: 0.84,
      land: '#ffffff', border: '#9e9e9e',
      label: '#a3a3a3', labelHalo: 'rgba(255,255,255,0.9)',
      accent: '#1A73E8', accentName: '#9a9a9a',
      capDot: '#1A73E8', capDotStroke: '#ffffff', capLabel: '#1a56b0', capHalo: 'rgba(255,255,255,0.95)',
      highlight: '#1A73E8', atmosphere: 0.5,
    },
    dark: {
      bgEarth: '#1b1f27', bgMap: '#171a21', bgMapOpacity: 0.86,
      land: '#2b303a', border: '#5b6270',
      label: '#aab2bf', labelHalo: 'rgba(20,22,28,0.85)',
      accent: '#8ab4f8', accentName: '#9aa3b2',
      capDot: '#8ab4f8', capDotStroke: '#171a21', capLabel: '#c6dafc', capHalo: 'rgba(20,22,28,0.9)',
      highlight: '#8ab4f8', atmosphere: 0.35,
    },
    satellite: {
      // the globe's polar caps are painted with the background colour, so keep it icy
      bgEarth: '#e6edf3', bgMap: '#e6edf3', bgMapOpacity: 1,
      land: '#ffffff', border: 'rgba(255,255,255,0.75)',
      label: '#ffffff', labelHalo: 'rgba(0,0,0,0.6)',
      accent: '#ffffff', accentName: 'rgba(255,255,255,0.8)',
      capDot: '#ffd54f', capDotStroke: '#1b1b1b', capLabel: '#ffffff', capHalo: 'rgba(0,0,0,0.75)',
      highlight: '#8ab4f8', atmosphere: 0.9,
    },
  };

  // ---------- state ----------
  const state = {
    view: 'earth',          // 'earth' | 'map'
    satellite: false,
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
    lang: 'en',
    overlay: 'none',        // 'none' | 'flag' | 'calling' | 'currency' | 'fact' | 'population'
    year: 2026,
    selectedId: null,
    hoverId: null,
    leftOpen: true,
    rightOpen: true,
    transitioning: false,
  };
  try { const l = localStorage.getItem('geoscope.lang'); if (l && I18N.LANGS.some(x => x.code === l)) state.lang = l; } catch (e) { /* ignore */ }

  // ---------- DOM ----------
  const el = {
    map: $('#map'),
    shadow: $('#globeShadow'),
    loader: $('#loader'),
    toast: $('#toast'),
    viewBtns: Array.from(document.querySelectorAll('.viewbar__btn')),
    satToggle: $('#satToggle'),
    satLabel: $('#satToggle').closest('.viewbar__toggle'),
    darkToggle: $('#darkToggle'),
    darkLabel: $('#darkToggle').closest('.viewbar__toggle'),
    langSelect: $('#langSelect'),
    leftCol: $('#leftCol'),
    overlayPanel: $('#overlayPanel'),
    overlayToggle: $('#overlayToggle'),
    credit: $('#creditLink'),
    overlayRadios: Array.from(document.querySelectorAll('input[name="overlay"]')),
    timeline: $('#timeline'),
    yearSlider: $('#yearSlider'),
    yearOut: $('#yearOut'),
    worldPop: $('#worldPop'),
    popNote: $('#popNote'),
    ticks: Array.from(document.querySelectorAll('.timeline__ticks span')),
    dirPanel: $('#dirPanel'),
    dirToggle: $('#dirToggle'),
    dirSearch: $('#dirSearch'),
    dirClear: $('#dirClear'),
    dirList: $('#dirList'),
    dirEmpty: $('#dirEmpty'),
    dirCount: $('#dirCount'),
    card: $('#infoCard'),
    cardFlag: $('#cardFlag'),
    cardName: $('#cardName'),
    cardIso: $('#cardIso'),
    cardBody: $('#cardBody'),
  };

  // ---------- small utils ----------
  const t = (k, v) => I18N.t(k, v);
  let toastTimer = 0;
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    if (ms !== 0) toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms || 2600);
  }
  function hideToast() { clearTimeout(toastTimer); el.toast.hidden = true; }
  function theme() { return state.satellite ? THEMES.satellite : (state.dark ? THEMES.dark : THEMES.light); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const cname = c => Geo.name(c, state.lang);
  // Flag emoji do not render on Windows, so flags are small images (emoji kept as alt text)
  function flagImg(c) {
    const a = c.a2.toLowerCase();
    return '<img class="flag" src="https://flagcdn.com/w40/' + a + '.png" srcset="https://flagcdn.com/w80/' + a + '.png 2x" width="24" height="18" alt="' + esc(c.f || '') + '" loading="lazy" decoding="async">';
  }
  // Symbols the map font can draw; anything else (Bengali, Sinhala, Khmer symbols…) is left out on the map.
  // Arabic-script symbols are only used on the map when the UI itself is Arabic, to avoid mixed-direction labels.
  const MAP_SAFE_LATIN = /^[ -ɏͰ-ԯ -⃏]+$/;
  const MAP_SAFE_ARABIC = /^[ -ɏͰ-ԯ؀-ۿ -⃏ﭐ-﷿ﹰ-﻿]+$/;
  function currencyText(c, forMap) {
    if (!c.cur) return '';
    const name = I18N.currencyName(c.cur.c, c.cur.n);
    let sym = c.cur.s || '';
    if (forMap && sym && !(state.lang === 'ar' ? MAP_SAFE_ARABIC : MAP_SAFE_LATIN).test(sym)) sym = '';
    return (sym ? sym + ' ' : '') + name + ' (' + c.cur.c + ')';
  }
  function popText(c) { return Geo.formatCompact(Geo.population(c, state.year), state.lang); }

  // ---------- flag tiles: one flag stretched over each country, clipped to its outline ----------
  const flagCache = new Map();
  let flagsLoaded = 0;
  function flagImage(a2, large) {
    const key = a2 + (large ? ':L' : ':S');
    if (!flagCache.has(key)) {
      const p = fetch(FLAG_URL(a2, large ? 'w1280' : 'w640'))
        .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(b => createImageBitmap(b))
        .then(img => { flagsLoaded++; updateFlagToast(); return img; })
        .catch(() => { flagCache.delete(key); return null; });
      flagCache.set(key, p);
    }
    return flagCache.get(key);
  }
  function updateFlagToast() {
    if (state.overlay !== 'flag' || !flagsLoading) return;
    const total = Geo.countries.filter(c => c.geo).length;
    toast(t('loadingFlags', { pct: Math.min(99, Math.round(flagsLoaded / total * 100)) }), 0);
  }
  let flagsLoading = false;
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  async function renderFlagTile(z, x, y) {
    const n = Math.pow(2, z);
    const tx0 = x / n, ty0 = y / n, tx1 = (x + 1) / n, ty1 = (y + 1) / n;
    const hits = [];
    for (const r of Geo.flagRegions()) {
      for (const o of [-1, 0, 1]) {
        const b = [r.mbox[0] + o, r.mbox[1], r.mbox[2] + o, r.mbox[3]];
        if (b[0] < tx1 && b[2] > tx0 && b[1] < ty1 && b[3] > ty0) hits.push({ r, o, b });
      }
    }
    const canvas = makeCanvas(TILE, TILE);
    const ctx = canvas.getContext('2d');
    if (hits.length) {
      const imgs = await Promise.all(hits.map(h => flagImage(h.r.a2, h.r.areaDeg > 300)));
      const s = n * TILE;
      hits.forEach((h, i) => {
        const img = imgs[i];
        if (!img) return;
        ctx.save();
        ctx.setTransform(s, 0, 0, s, -(tx0 - h.o) * s, -ty0 * s);   // Mercator units -> tile pixels
        ctx.beginPath();
        ctx.clip(h.r.path);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dx0 = (h.b[0] - tx0) * s, dy0 = (h.b[1] - ty0) * s;
        const dw = (h.b[2] - h.b[0]) * s, dh = (h.b[3] - h.b[1]) * s;
        const ix0 = Math.max(dx0, 0), iy0 = Math.max(dy0, 0);
        const ix1 = Math.min(dx0 + dw, TILE), iy1 = Math.min(dy0 + dh, TILE);
        if (ix1 > ix0 && iy1 > iy0) {
          const sx = (ix0 - dx0) / dw * img.width, sy = (iy0 - dy0) / dh * img.height;
          const sw = (ix1 - ix0) / dw * img.width, sh = (iy1 - iy0) / dh * img.height;
          ctx.drawImage(img, sx, sy, sw, sh, ix0, iy0, ix1 - ix0, iy1 - iy0);
        }
        ctx.restore();
      });
    }
    return canvas.transferToImageBitmap ? canvas.transferToImageBitmap() : createImageBitmap(canvas);
  }
  maplibregl.addProtocol('geoflags', async (params) => {
    const m = /^geoflags:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error('bad flag tile url');
    const data = await renderFlagTile(+m[1], +m[2], +m[3]);
    return { data };
  });
  try { maplibregl.setRTLTextPlugin(RTL_PLUGIN, true).catch(() => {}); } catch (e) { /* plugin optional */ }

  // ---------- style ----------
  function textSizeExpr(base) {
    return ['interpolate', ['linear'], ['zoom'], 1, base * 0.8, 3, base, 5, base * 1.25, 8, base * 1.55];
  }
  function nameExpr() { return ['get', 'n_' + state.lang]; }
  function capExpr() { return ['get', 'cap_' + state.lang]; }
  const capName = c => Geo.capital(c, state.lang);
  function matchExpr(fn) {
    const e = ['match', ['get', 'id']];
    for (const c of Geo.countries) { const v = fn(c); if (v) e.push(c.id, v); }
    e.push('');
    return e;
  }
  function overlayBigExpr() {
    if (state.overlay === 'calling') return matchExpr(c => c.cc || '');
    if (state.overlay === 'currency') return matchExpr(c => currencyText(c, true));
    if (state.overlay === 'population') return matchExpr(c => c.p ? popText(c) : '');
    return '';
  }
  function overlayField(tt) {
    return ['format',
      overlayBigExpr(), { 'font-scale': 1.4, 'text-font': ['literal', FONT_BOLD], 'text-color': tt.accent },
      '\n', {},
      nameExpr(), { 'font-scale': 0.78, 'text-color': tt.accentName },
    ];
  }

  function buildStyle() {
    const tt = theme();
    const zoomFilter = ['>=', ['zoom'], ['get', 'lz']];
    return {
      version: 8,
      glyphs: GLYPHS,
      projection: { type: 'globe' },
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, tt.atmosphere, 4, tt.atmosphere, 6, 0] },
      sources: {
        satellite: { type: 'raster', tiles: SAT_TILES, tileSize: 256, maxzoom: 18, attribution: SAT_ATTR },
        flags: { type: 'raster', tiles: ['geoflags://{z}/{x}/{y}'], tileSize: TILE, minzoom: 0, maxzoom: 11 },
        countries: { type: 'geojson', data: Geo.fills(), tolerance: 0.3, buffer: 32, attribution: DATA_ATTR },
        borders: { type: 'geojson', data: Geo.borders(), tolerance: 0.3, buffer: 8 },
        anchors: { type: 'geojson', data: Geo.anchors() },
        capitals: { type: 'geojson', data: Geo.capitals() },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': tt.bgEarth, 'background-opacity': 1 } },
        { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 200, 'raster-saturation': 0.05, 'raster-contrast': 0.05 } },
        { id: 'country-fill', type: 'fill', source: 'countries',
          paint: { 'fill-color': tt.land, 'fill-opacity': 1, 'fill-antialias': true } },
        { id: 'country-flags', type: 'raster', source: 'flags', layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0.96, 'raster-fade-duration': 150, 'raster-resampling': 'linear' } },
        { id: 'country-highlight', type: 'fill', source: 'countries',
          paint: {
            'fill-color': tt.highlight,
            'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.28, ['boolean', ['feature-state', 'hover'], false], 0.15, 0],
            'fill-opacity-transition': { duration: 150 },
          } },
        { id: 'country-border', type: 'line', source: 'borders',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': tt.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 3, 0.9, 6, 1.4, 9, 2] } },
        { id: 'capital-dot', type: 'circle', source: 'capitals', minzoom: CAPITAL_MINZOOM,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], CAPITAL_MINZOOM, 3, 7, 5.5],
            'circle-color': tt.capDot, 'circle-stroke-color': tt.capDotStroke, 'circle-stroke-width': 2,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], CAPITAL_MINZOOM, 0, CAPITAL_MINZOOM + 0.8, 1],
            'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], CAPITAL_MINZOOM, 0, CAPITAL_MINZOOM + 0.8, 1],
          } },
        { id: 'country-label', type: 'symbol', source: 'anchors', filter: zoomFilter,
          layout: {
            'text-field': nameExpr(), 'text-font': FONT, 'text-size': textSizeExpr(11),
            'text-max-width': 7, 'text-letter-spacing': 0.03, 'text-padding': 6, 'symbol-sort-key': ['get', 'rank'],
          },
          paint: { 'text-color': tt.label, 'text-halo-color': tt.labelHalo, 'text-halo-width': 1.2, 'text-halo-blur': 0.4 } },
        { id: 'capital-label', type: 'symbol', source: 'capitals', minzoom: CAPITAL_MINZOOM,
          layout: {
            'text-field': capExpr(), 'text-font': FONT_BOLD,
            'text-size': ['interpolate', ['linear'], ['zoom'], CAPITAL_MINZOOM, 10.5, 7, 13.5],
            'text-anchor': 'left', 'text-offset': [0.85, 0], 'text-padding': 4, 'symbol-sort-key': ['get', 'rank'],
          },
          paint: {
            'text-color': tt.capLabel, 'text-halo-color': tt.capHalo, 'text-halo-width': 1.5,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], CAPITAL_MINZOOM, 0, CAPITAL_MINZOOM + 0.8, 1],
          } },
        // Overlay labels (calling code / currency / population). Below OVERLAY_SPLIT_ZOOM one label per
        // country at its anchor; above it one label per country piece in every tile, always drawn, so the
        // value stays on screen however far you zoom in. Both sit above the capital labels so they win.
        { id: 'ov-anchor', type: 'symbol', source: 'anchors', maxzoom: OVERLAY_SPLIT_ZOOM, filter: zoomFilter,
          layout: {
            visibility: 'none', 'text-field': overlayField(tt), 'text-font': FONT, 'text-size': textSizeExpr(11),
            'text-max-width': 9, 'text-line-height': 1.15, 'text-padding': 4, 'symbol-sort-key': ['get', 'rank'],
          },
          paint: { 'text-color': tt.accent, 'text-halo-color': tt.labelHalo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 } },
        { id: 'ov-poly', type: 'symbol', source: 'countries', minzoom: OVERLAY_SPLIT_ZOOM, filter: ['!=', ['get', 'a2'], ''],
          layout: {
            visibility: 'none', 'text-field': overlayField(tt), 'text-font': FONT, 'text-size': textSizeExpr(11),
            'text-max-width': 9, 'text-line-height': 1.15, 'text-padding': 4,
            'text-allow-overlap': true, 'text-ignore-placement': false,
          },
          paint: { 'text-color': tt.accent, 'text-halo-color': tt.labelHalo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 } },
      ],
    };
  }

  // ---------- map ----------
  const map = new maplibregl.Map({
    container: 'map',
    style: buildStyle(),
    center: [12, 28],
    zoom: 1.65,
    minZoom: 0.8,
    maxZoom: ZOOM_MAX.minimal,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    attributionControl: false,
    canvasContextAttributes: { antialias: true },
    fadeDuration: 200,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  if (window.ResizeObserver) new ResizeObserver(() => map.resize()).observe(el.map);

  const blank = { width: 2, height: 2, data: new Uint8Array(16) };
  map.on('styleimagemissing', e => { if (!map.hasImage(e.id)) map.addImage(e.id, blank, { pixelRatio: 2 }); });

  function hideLoader() {
    if (!el.loader) return;
    el.loader.classList.add('is-done');
    setTimeout(() => { if (el.loader) { el.loader.remove(); el.loader = null; } }, 700);
  }
  map.once('load', () => {
    applyTheme();
    hideLoader();
    updateGlobeShadow();
  });
  setTimeout(hideLoader, 8000);
  map.on('error', e => {
    const msg = e && e.error && e.error.message ? e.error.message : '';
    if (/glyph|font/i.test(msg)) toast(t('fontsFailed'), 5000);
  });
  map.on('idle', () => { if (flagsLoading && state.overlay === 'flag') { flagsLoading = false; hideToast(); } });

  // ---------- theme / view / satellite / dark ----------
  function setLayerVis(id, on) {
    if (!map.getLayer(id)) return;
    const v = on ? 'visible' : 'none';
    if (map.getLayoutProperty(id, 'visibility') !== v) map.setLayoutProperty(id, 'visibility', v);
  }
  function applyTheme() {
    if (!map.getLayer('bg')) return;
    const tt = theme();
    const earth = state.view === 'earth';
    map.setPaintProperty('bg', 'background-color', earth ? tt.bgEarth : tt.bgMap);
    map.setPaintProperty('bg', 'background-opacity', earth ? 1 : tt.bgMapOpacity);
    setLayerVis('satellite', state.satellite);
    setLayerVis('country-fill', !state.satellite);
    map.setPaintProperty('country-fill', 'fill-color', tt.land);
    map.setPaintProperty('country-highlight', 'fill-color', tt.highlight);
    map.setPaintProperty('country-border', 'line-color', tt.border);
    map.setPaintProperty('country-label', 'text-color', tt.label);
    map.setPaintProperty('country-label', 'text-halo-color', tt.labelHalo);
    for (const id of ['ov-anchor', 'ov-poly']) {
      map.setPaintProperty(id, 'text-color', tt.accent);
      map.setPaintProperty(id, 'text-halo-color', tt.labelHalo);
    }
    map.setPaintProperty('capital-dot', 'circle-color', tt.capDot);
    map.setPaintProperty('capital-dot', 'circle-stroke-color', tt.capDotStroke);
    map.setPaintProperty('capital-label', 'text-color', tt.capLabel);
    map.setPaintProperty('capital-label', 'text-halo-color', tt.capHalo);
    map.setPaintProperty('country-flags', 'raster-opacity', state.satellite ? 0.9 : 0.96);
    map.setMaxZoom(state.satellite ? ZOOM_MAX.satellite : ZOOM_MAX.minimal);
    map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, tt.atmosphere, 4, tt.atmosphere, 6, 0] });
    el.map.classList.toggle('is-satellite', state.satellite);
    applyOverlayText();
    updateGlobeShadow();
  }
  function applyOverlayText() {
    if (!map.getLayer('ov-anchor')) return;
    const field = overlayField(theme());
    map.setLayoutProperty('ov-anchor', 'text-field', field);
    map.setLayoutProperty('ov-poly', 'text-field', field);
  }

  let shadowTimer = 0;
  function setView(view) {
    if (state.view === view) return;
    state.view = view;
    el.viewBtns.forEach(b => {
      const on = b.dataset.view === view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    state.transitioning = true;
    updateGlobeShadow();
    map.setProjection({ type: view === 'earth' ? 'globe' : 'mercator' });
    applyTheme();
    clearTimeout(shadowTimer);
    shadowTimer = setTimeout(() => { state.transitioning = false; updateGlobeShadow(); }, 900);
    positionCard();
    syncBackground();
  }
  function setSatellite(on) {
    state.satellite = !!on;
    el.satToggle.checked = state.satellite;
    el.satLabel.classList.toggle('is-on', state.satellite);
    applyTheme();
    syncBackground();
  }
  function setDark(on) {
    state.dark = !!on;
    document.documentElement.setAttribute('data-theme', state.dark ? 'dark' : 'light');
    try { localStorage.setItem('geoscope.theme', state.dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    el.darkToggle.checked = state.dark;
    el.darkLabel.classList.toggle('is-on', state.dark);
    if (window.Constellation) window.Constellation.setTheme(state.dark ? 'dark' : 'light');
    applyTheme();
  }
  el.viewBtns.forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  el.satToggle.addEventListener('change', () => setSatellite(el.satToggle.checked));
  el.darkToggle.addEventListener('change', () => setDark(el.darkToggle.checked));

  // ---------- globe drop shadow (EARTH mode, satellite off) ----------
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  function destination(center, distDeg, bearingDeg) {
    const f1 = center.lat * RAD, l1 = center.lng * RAD, d = distDeg * RAD, b = bearingDeg * RAD;
    const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
    return new maplibregl.LngLat(l2 * DEG, f2 * DEG);
  }
  function updateGlobeShadow() {
    const show = state.view === 'earth' && !state.satellite && !state.transitioning
      && map.transform && typeof map.transform.isLocationOccluded === 'function';
    if (!show) { el.shadow.hidden = true; return; }
    const center = map.getCenter();
    const c = map.project(center);
    let lo = 0, hi = 179.5;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (map.transform.isLocationOccluded(destination(center, mid, 90))) hi = mid; else lo = mid;
    }
    const edge = map.project(destination(center, lo, 90));
    const r = Math.hypot(edge.x - c.x, edge.y - c.y);
    const limit = Math.max(el.map.clientWidth, el.map.clientHeight) * 3;
    if (!isFinite(r) || r < 16 || r > limit || lo > 178) { el.shadow.hidden = true; return; }
    el.shadow.hidden = false;
    el.shadow.style.left = (c.x - r) + 'px';
    el.shadow.style.top = (c.y - r) + 'px';
    el.shadow.style.width = el.shadow.style.height = (2 * r) + 'px';
  }
  map.on('move', updateGlobeShadow);
  map.on('resize', updateGlobeShadow);

  // ---------- overlays ----------
  function setOverlay(mode) {
    state.overlay = mode;
    el.overlayRadios.forEach(r => { r.checked = r.value === mode; });
    const big = mode === 'calling' || mode === 'currency' || mode === 'population';
    setLayerVis('country-label', !big);
    setLayerVis('ov-anchor', big);
    setLayerVis('ov-poly', big);
    setLayerVis('country-flags', mode === 'flag');
    el.timeline.hidden = mode !== 'population';
    if (big) applyOverlayText();
    if (mode === 'flag') { flagsLoading = true; updateFlagToast(); }
    else if (flagsLoading) { flagsLoading = false; hideToast(); }
    if (mode === 'fact') toast(t('factHint'), 2200);
    if (mode === 'population') updateWorldPop();
    refreshCard();
  }
  el.overlayRadios.forEach(r => r.addEventListener('change', () => { if (r.checked) setOverlay(r.value); }));

  // ---------- population timeline ----------
  function setYear(y) {
    state.year = y;
    el.yearOut.textContent = y;
    const pct = (y - 1990) / (2026 - 1990) * 100;
    el.yearSlider.style.setProperty('--pct', pct + '%');
    if (el.yearSlider.value !== String(y)) el.yearSlider.value = y;
    updateWorldPop();
    refreshCard();
    if (state.overlay === 'population') applyOverlayText();
  }
  function updateWorldPop() {
    const i = Geo.years.indexOf(state.year);
    const w = Geo.meta.world[i];
    const est = Geo.meta.worldEstFrom >= 0 && i >= Geo.meta.worldEstFrom;
    el.worldPop.textContent = Geo.formatCompact(w, state.lang) + (est ? ' (' + t('est') + ')' : '');
    el.popNote.textContent = (est ? t('popProjected', { year: state.year }) + ' ' : '') + t('popSource');
  }
  el.yearSlider.addEventListener('input', () => setYear(+el.yearSlider.value));
  el.ticks.forEach(tick => {
    const pct = (+tick.textContent - 1990) / 36 * 100;
    tick.style.left = pct + '%';
    tick.style.transform = pct === 0 ? 'none' : pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)';
  });

  // ---------- hover / selection ----------
  // feature-state throws while the style is still loading; interaction must never crash on that
  function featureState(id, patch) {
    if (id == null || id >= 10000) return;
    try { if (map.isStyleLoaded()) map.setFeatureState({ source: 'countries', id }, patch); } catch (e) { /* not ready yet */ }
  }
  function setHover(id) {
    if (state.hoverId === id) return;
    featureState(state.hoverId, { hover: false });
    state.hoverId = id;
    featureState(id, { hover: true });
    el.map.classList.toggle('is-hovering', id != null && Geo.byId.has(id));
    el.dirList.querySelectorAll('.dir__item.is-hover').forEach(n => n.classList.remove('is-hover'));
    if (id != null) { const item = el.dirList.querySelector('[data-id="' + id + '"]'); if (item) item.classList.add('is-hover'); }
    refreshCard();
  }
  function select(id, opts) {
    opts = opts || {};
    if (state.selectedId != null && state.selectedId !== id) featureState(state.selectedId, { selected: false });
    state.selectedId = id;
    const c = id != null ? Geo.byId.get(id) : null;
    if (c && c.geo) featureState(id, { selected: true });
    el.dirList.querySelectorAll('.dir__item.is-active').forEach(n => n.classList.remove('is-active'));
    if (c) {
      const item = el.dirList.querySelector('[data-id="' + id + '"]');
      if (item) { item.classList.add('is-active'); if (opts.scroll !== false) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      if (opts.fly) flyToCountry(c);
      if (window.Chat) window.Chat.requestRoom(c);   // country chat room follows the selection
    }
    refreshCard();
  }
  function flyToCountry(c) {
    const w = el.map.clientWidth;
    let left = state.leftOpen ? 330 : 40, right = state.rightOpen ? 340 : 40;
    if (left + right > w - 260) { left = 40; right = 40; }
    map.fitBounds(Geo.bounds(c), {
      padding: { top: 100, bottom: 70, left, right },
      maxZoom: c.area > 5e6 ? 3.6 : c.area > 5e5 ? 4.8 : c.area > 5e4 ? 5.8 : c.area > 2e3 ? 6.8 : 8,
      duration: 1500, essential: true,
    });
  }
  let pointer = { x: 0, y: 0 };
  const HIT_LAYERS = ['country-fill', 'country-highlight'];
  map.on('mousemove', e => {
    pointer = { x: e.point.x, y: e.point.y };
    const f = map.queryRenderedFeatures(e.point, { layers: HIT_LAYERS })[0];
    setHover(f ? f.id : null);
    if (state.hoverId != null) positionCard();
  });
  map.getCanvas().addEventListener('mouseleave', () => setHover(null));
  map.on('click', e => {
    const f = map.queryRenderedFeatures(e.point, { layers: HIT_LAYERS })[0];
    if (f && Geo.byId.has(f.id)) select(f.id === state.selectedId ? null : f.id, { fly: false });
    else select(null);
  });
  map.on('move', positionCard);
  map.on('dragstart', () => setHover(null));

  // ---------- info card ----------
  function cardBodyFor(c) {
    const mode = state.overlay;
    if (mode === 'calling') {
      return '<div class="infocard__big">' + esc(c.cc || '—') + '</div><div class="infocard__sub">' + esc(t('callingLabel')) + '</div>';
    }
    if (mode === 'currency') {
      if (!c.cur) return '<div class="infocard__sub">' + esc(t('noCurrency')) + '</div>';
      const name = I18N.currencyName(c.cur.c, c.cur.n);
      return '<div class="infocard__big is-medium">' + esc((c.cur.s ? c.cur.s + ' ' : '') + name) + '</div>' +
        '<div class="infocard__sub">' + esc(c.cur.c) + ' · ' + esc(t('currencyLabel')) + '</div>';
    }
    if (mode === 'population') {
      const p = Geo.population(c, state.year);
      const est = Geo.isEstimate(c, state.year);
      return '<div class="infocard__big">' + esc(Geo.formatCompact(p, state.lang)) + '</div>' +
        '<div class="infocard__sub">' + esc(t('peopleIn', { n: Geo.formatFull(p, state.lang), year: state.year })) + (est ? ' (' + esc(t('estimate')) + ')' : '') + '</div>';
    }
    if (mode === 'fact') {
      const facts = FACTS[state.lang] || FACTS.en || {};
      const fact = facts[c.a2] || (FACTS.en && FACTS.en[c.a2]);
      return '<div class="infocard__fact">' + esc(fact || t('noFact')) + '</div>';
    }
    let html = '';
    if (c.cap) html += '<div class="infocard__cap">' + esc(capName(c)) + '</div>';
    html += '<div class="infocard__sub">' + esc(I18N.region(c.sub || c.reg || '')) + (c.cc ? ' · ' + esc(c.cc) : '') + '</div>';
    return html;
  }
  function refreshCard() {
    const id = state.hoverId != null && Geo.byId.has(state.hoverId) ? state.hoverId : state.selectedId;
    const c = id != null ? Geo.byId.get(id) : null;
    if (!c) { el.card.hidden = true; return; }
    el.cardFlag.innerHTML = flagImg(c);
    el.cardName.textContent = cname(c);
    el.cardIso.textContent = c.a2;
    el.cardBody.innerHTML = cardBodyFor(c);
    el.card.hidden = false;
    el.card.classList.toggle('is-cursor', id === state.hoverId);
    positionCard();
  }
  function positionCard() {
    if (el.card.hidden) return;
    const hovering = state.hoverId != null && Geo.byId.has(state.hoverId);
    if (hovering) {
      let x = pointer.x, y = pointer.y;
      const cw = el.card.offsetWidth + 24, ch = el.card.offsetHeight + 24;
      const rtl = I18N.dir() === 'rtl';
      if (!rtl && x + cw > el.map.clientWidth) x = x - cw - 8;
      if (rtl && x - cw < 0) x = x + cw + 8;
      if (y + ch > el.map.clientHeight) y = y - ch - 8;
      el.card.style.left = x + 'px';
      el.card.style.top = y + 'px';
      el.card.style.opacity = '1';
      return;
    }
    const c = Geo.byId.get(state.selectedId);
    if (!c) return;
    const ll = maplibregl.LngLat.convert(c.ll);
    const occluded = map.transform && typeof map.transform.isLocationOccluded === 'function' && map.transform.isLocationOccluded(ll);
    const p = map.project(ll);
    const off = occluded || p.x < -50 || p.y < -50 || p.x > el.map.clientWidth + 50 || p.y > el.map.clientHeight + 50;
    el.card.style.opacity = off ? '0' : '1';
    el.card.style.left = p.x + 'px';
    el.card.style.top = p.y + 'px';
  }

  // ---------- directory ----------
  function renderDirectory(list) {
    const frag = document.createDocumentFragment();
    let letter = '';
    for (const c of list) {
      const nm = cname(c);
      const L = (Geo.strip(nm).charAt(0) || nm.charAt(0)).toUpperCase();
      if (L !== letter) {
        letter = L;
        const h = document.createElement('li');
        h.className = 'dir__letter'; h.textContent = L; h.setAttribute('role', 'presentation');
        frag.appendChild(h);
      }
      const li = document.createElement('li');
      li.className = 'dir__item' + (c.id === state.selectedId ? ' is-active' : '');
      li.dataset.id = c.id;
      li.setAttribute('role', 'option');
      li.innerHTML = '<span class="dir__flag">' + flagImg(c) + '</span><span class="dir__name">' + highlight(nm) + '</span><span class="dir__iso">' + esc(c.a2) + '</span>';
      frag.appendChild(li);
    }
    el.dirList.replaceChildren(frag);
    el.dirEmpty.hidden = list.length > 0;
    el.dirCount.textContent = list.length;
  }
  function highlight(name) {
    const q = Geo.strip(el.dirSearch.value).trim();
    if (!q) return esc(name);
    const idx = Geo.strip(name).indexOf(q);
    if (idx < 0) return esc(name);
    return esc(name.slice(0, idx)) + '<mark>' + esc(name.slice(idx, idx + q.length)) + '</mark>' + esc(name.slice(idx + q.length));
  }
  function filterDirectory() {
    const q = el.dirSearch.value;
    const list = q.trim() ? Geo.search(q, state.lang) : Geo.sorted(state.lang);
    renderDirectory(q.trim() ? list.slice().sort((a, b) => cname(a).localeCompare(cname(b), state.lang)) : list);
    el.dirClear.hidden = !q;
  }
  el.dirSearch.addEventListener('input', filterDirectory);
  $('#dirForm').addEventListener('submit', e => {
    e.preventDefault();
    const first = el.dirList.querySelector('.dir__item');
    if (first) select(+first.dataset.id, { fly: true });
  });
  el.dirSearch.addEventListener('keydown', e => {
    if (e.key === 'Escape') { el.dirSearch.value = ''; filterDirectory(); el.dirSearch.blur(); }
  });
  el.dirClear.addEventListener('click', () => { el.dirSearch.value = ''; filterDirectory(); el.dirSearch.focus(); });
  el.dirList.addEventListener('click', e => {
    const item = e.target.closest('.dir__item');
    if (item) select(+item.dataset.id, { fly: true, scroll: false });
  });
  el.dirList.addEventListener('mouseover', e => {
    const item = e.target.closest('.dir__item');
    if (item) { const c = Geo.byId.get(+item.dataset.id); if (c && c.geo) setHover(c.id); }
  });
  el.dirList.addEventListener('mouseleave', () => setHover(null));

  // ---------- panels (both open by default) ----------
  function setPanel(which, open) {
    const panel = which === 'left' ? el.leftCol : el.dirPanel;
    const btn = which === 'left' ? el.overlayToggle : el.dirToggle;
    if (which === 'left') state.leftOpen = open; else state.rightOpen = open;
    panel.classList.toggle('is-collapsed', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', t(which === 'left' ? (open ? 'collapseOverlay' : 'expandOverlay') : (open ? 'collapseList' : 'expandList')));
  }
  el.overlayToggle.addEventListener('click', () => setPanel('left', !state.leftOpen));
  el.dirToggle.addEventListener('click', () => setPanel('right', !state.rightOpen));

  // ---------- language ----------
  function setLang(l) {
    state.lang = l;
    try { localStorage.setItem('geoscope.lang', l); } catch (e) { /* ignore */ }
    I18N.setLang(l);
    el.langSelect.value = l;
    setPanel('left', state.leftOpen); setPanel('right', state.rightOpen);
    filterDirectory();
    updateWorldPop();
    if (map.getLayer('country-label')) {
      map.setLayoutProperty('country-label', 'text-field', nameExpr());
      map.setLayoutProperty('capital-label', 'text-field', capExpr());
      applyOverlayText();
    }
    if (window.Chat) window.Chat.refreshLang();
    refreshCard();
  }
  el.langSelect.addEventListener('change', () => setLang(el.langSelect.value));

  // ---------- footer credit ----------
  (function initCredit() {
    const cfgUrl = (window.GEO_CONFIG && window.GEO_CONFIG.creditUrl) || '#';
    // only an https:// URL is accepted; anything else keeps the inert placeholder
    if (/^https:\/\/[^\s"'<>]+$/.test(cfgUrl)) el.credit.href = cfgUrl;
    el.credit.addEventListener('click', e => { if (el.credit.getAttribute('href') === '#') e.preventDefault(); });
  })();

  // ---------- keyboard ----------
  document.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (e.key === '/') { e.preventDefault(); setPanel('right', true); el.dirSearch.focus(); }
    if (e.key === 'Escape') select(null);
    if (e.key === 'e' || e.key === 'E') setView('earth');
    if (e.key === 'm' || e.key === 'M') setView('map');
    if (e.key === 's' || e.key === 'S') setSatellite(!state.satellite);
    if (e.key === 'd' || e.key === 'D') setDark(!state.dark);
  });

  // pause the background animation only when an opaque flat satellite map fully covers it
  function syncBackground() {
    if (!window.Constellation) return;
    if (state.view === 'map' && state.satellite) window.Constellation.stop(); else window.Constellation.start();
  }

  // ---------- init ----------
  if (window.Chat) window.Chat.init({ t, lang: () => state.lang, name: cname });
  setLang(state.lang);
  setPanel('left', true);
  setPanel('right', true);
  setYear(2026);
  el.darkToggle.checked = state.dark;
  el.darkLabel.classList.toggle('is-on', state.dark);
  if (window.Constellation) window.Constellation.setTheme(state.dark ? 'dark' : 'light');

  window.GeoScope = { map, state, select, setView, setSatellite, setDark, setLang, setOverlay, setYear };
})();
