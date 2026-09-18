/* ==========================================================================
   Geo — turns the embedded TopoJSON + country records into the GeoJSON
   sources the map needs (fills, de-duplicated borders, label anchors,
   capitals, flag regions) and exposes lookup/format helpers.
   ========================================================================== */
window.Geo = (function () {
  'use strict';

  const D = window.GEO_DATA;
  const T = window.GEO_TOPO;
  if (!D || !T || typeof topojson === 'undefined') {
    throw new Error('GeoScope: data files or topojson-client failed to load');
  }

  const countries = D.countries;           // sorted A→Z (English), ids 1..n
  const years = D.meta.years;              // 1990..2026
  const byId = new Map(countries.map(c => [c.id, c]));
  const byA2 = new Map(countries.map(c => [c.a2, c]));
  const geoms = T.objects.countries.geometries;
  const LANGS = ['en', 'fr', 'es', 'ar'];

  // ---------- helpers ----------
  const strip = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function name(c, lang) {
    if (lang === 'fr') return c.nf || c.n;
    if (lang === 'es') return c.ns || c.n;
    if (lang === 'ar') return c.na || c.n;
    return c.n;
  }
  function capital(c, lang) {
    if (lang === 'fr') return c.capf || c.cap;
    if (lang === 'es') return c.caps || c.cap;
    if (lang === 'ar') return c.capa || c.cap;
    return c.cap;
  }
  const SUFFIX = { en: ['K', 'M', 'B'], fr: ['k', 'M', 'Md'], es: ['k', 'M', 'mil M'], ar: ['ألف', 'مليون', 'مليار'] };
  function formatCompact(n, lang) {
    const s = SUFFIX[lang] || SUFFIX.en;
    const sep = lang === 'ar' ? ' ' : '';
    if (n == null) return '—';
    if (n === 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + sep + s[2];
    if (n >= 1e8) return Math.round(n / 1e6) + sep + s[1];
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + sep + s[1];
    if (n >= 1e4) return Math.round(n / 1e3) + sep + s[0];
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + sep + s[0];
    return String(n);
  }
  function formatFull(n, lang) {
    if (n == null) return '—';
    const locale = lang === 'ar' ? 'ar-MA' : lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US';
    return n.toLocaleString(locale);
  }
  function population(c, year) {
    const i = years.indexOf(year);
    if (i < 0 || !c.p) return null;
    return c.p[i];
  }
  function isEstimate(c, year) {
    if (c.pm === 'flat') return true;
    const i = years.indexOf(year);
    return c.pe >= 0 && i >= c.pe;
  }

  // ---------- antimeridian handling ----------
  // Natural Earth (via world-atlas) leaves rings that hop from +180 to -180 (Russia, Fiji). Rendered as-is
  // such a hop becomes a segment around the whole world, which is what painted huge bars over Russia.
  function unwrapRing(ring) {
    const out = [ring[0].slice()];
    let off = 0;
    for (let i = 1; i < ring.length; i++) {
      const dx = ring[i][0] - ring[i - 1][0];
      if (dx > 180) off -= 360; else if (dx < -180) off += 360;
      out.push([ring[i][0] + off, ring[i][1]]);
    }
    return out;
  }
  function clipHalf(ring, X, keepLeft) {
    const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    const inside = p => keepLeft ? p[0] <= X : p[0] >= X;
    const cross = (a, b) => { const t = (X - a[0]) / (b[0] - a[0]); return [X, a[1] + (b[1] - a[1]) * t]; };
    const out = [];
    for (let i = 0, n = pts.length; i < n; i++) {
      const cur = pts[i], prev = pts[(i - 1 + n) % n];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cross(prev, cur)); out.push(cur); }
      else if (pi) out.push(cross(prev, cur));
    }
    if (out.length < 3) return null;
    out.push(out[0].slice());
    return out;
  }
  function splitPolygon(poly) {
    const outer = poly[0];
    let hops = false;
    for (let i = 1; i < outer.length; i++) if (Math.abs(outer[i][0] - outer[i - 1][0]) > 180) { hops = true; break; }
    if (!hops) return [poly];
    let ring = unwrapRing(outer);
    if (Math.abs(ring[0][0] - ring[ring.length - 1][0]) > 180) return [poly]; // encircles a pole: leave it
    let minX = Infinity, maxX = -Infinity;
    for (const p of ring) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; }
    if (minX < -180) { ring = ring.map(p => [p[0] + 360, p[1]]); minX += 360; maxX += 360; }
    if (maxX <= 180) return [[ring]];
    const parts = [];
    const left = clipHalf(ring, 180, true);
    const right = clipHalf(ring, 180, false);
    if (left) parts.push([left]);
    if (right) parts.push([right.map(p => [p[0] - 360, p[1]])]);
    return parts;
  }
  function fixGeometry(geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const out = [];
    for (const poly of polys) for (const part of splitPolygon(poly)) out.push(part);
    return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
  }

  // ---------- geometry sources ----------
  let _fills = null, _borders = null, _capitals = null, _regions = null;

  function nameProps(c) {
    const p = {};
    for (const l of LANGS) p['n_' + l] = name(c, l);
    return p;
  }

  function fills() {
    if (_fills) return _fills;
    const features = [];
    const used = new Set();
    for (const c of countries) {
      if (!c.tg || !c.tg.length) continue;
      c.tg.forEach(i => used.add(i));
      const raw = c.tg.length === 1
        ? topojson.feature(T, geoms[c.tg[0]]).geometry
        : topojson.merge(T, c.tg.map(i => geoms[i]));
      features.push({
        type: 'Feature', id: c.id,
        properties: Object.assign({ id: c.id, a2: c.a2 }, nameProps(c)),
        geometry: fixGeometry(raw),
      });
    }
    let extra = 10000;
    geoms.forEach((g, i) => {
      if (used.has(i)) return;
      features.push({
        type: 'Feature', id: extra,
        properties: { id: extra, a2: '', n_en: g.properties.name, n_fr: g.properties.name, n_es: g.properties.name, n_ar: g.properties.name },
        geometry: fixGeometry(topojson.feature(T, g).geometry),
      });
      extra++;
    });
    _fills = { type: 'FeatureCollection', features };
    return _fills;
  }

  function borders() {
    if (_borders) return _borders;
    const owner = new Array(geoms.length).fill(-1);
    countries.forEach(c => (c.tg || []).forEach(i => { owner[i] = c.id; }));
    const index = new Map(geoms.map((g, i) => [g, i]));
    const mesh = topojson.mesh(T, T.objects.countries, (a, b) => {
      if (a === b) return true;                     // coastline
      const oa = owner[index.get(a)], ob = owner[index.get(b)];
      return oa === -1 || ob === -1 || oa !== ob;   // keep borders between different countries
    });
    // drop the artificial cut edges along ±180° and Antarctica's edge along -90°, and split any hop
    const lines = mesh.type === 'MultiLineString' ? mesh.coordinates : [mesh.coordinates];
    const clean = [];
    const onCut = p => Math.abs(p[0]) >= 179.99;
    const polar = p => p[1] <= -89;
    for (const line of lines) {
      let cur = [];
      for (let i = 0; i < line.length; i++) {
        const p = line[i], q = line[i + 1];
        cur.push(p);
        const drop = !q || Math.abs(q[0] - p[0]) > 180 || (onCut(p) && onCut(q)) || (polar(p) && polar(q));
        if (drop) { if (cur.length > 1) clean.push(cur); cur = []; }
      }
      if (cur.length > 1) clean.push(cur);
    }
    _borders = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: clean } }] };
    return _borders;
  }

  function anchors() {
    const features = countries.map(c => ({
      type: 'Feature', id: c.id,
      properties: Object.assign({
        id: c.id, a2: c.a2, cc: c.cc || '', lz: c.lz,
        rank: c.area ? Math.round(1e7 / Math.max(c.area, 1)) : 1e7,
      }, nameProps(c)),
      geometry: { type: 'Point', coordinates: c.ll },
    }));
    return { type: 'FeatureCollection', features };
  }

  function capitals() {
    if (_capitals) return _capitals;
    const features = countries.filter(c => c.cap && c.cll).map(c => ({
      type: 'Feature', id: c.id,
      properties: {
        id: c.id, a2: c.a2, rank: c.area ? Math.round(1e7 / Math.max(c.area, 1)) : 1e7,
        cap_en: c.cap, cap_fr: c.capf || c.cap, cap_es: c.caps || c.cap, cap_ar: c.capa || c.cap,
      },
      geometry: { type: 'Point', coordinates: c.cll },
    }));
    _capitals = { type: 'FeatureCollection', features };
    return _capitals;
  }

  // ---------- flag regions (for the raster flag overlay) ----------
  const MAX_LAT = 85.051129;
  const lngToX = lng => (lng + 180) / 360;
  const latToY = lat => {
    const l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / Math.PI) / 2;
  };
  function polyBbox(poly) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of poly[0]) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }
    return b;
  }
  const intersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

  // Each country becomes one "main" region (its core bounding box, from the build) plus one region per
  // outlying part (Alaska, Hawaii, French Guiana…). The flag is stretched once over each region's box and
  // clipped to the region's polygons, so it never repeats.
  function flagRegions() {
    if (_regions) return _regions;
    const regions = [];
    for (const f of fills().features) {
      const c = byId.get(f.id);
      if (!c) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const main = { a2: c.a2, id: c.id, bbox: c.bb.slice(), polys: [], isMain: true };
      const others = [];
      for (const poly of polys) {
        const pb = polyBbox(poly);
        let placed = false;
        for (const o of [0, 360, -360]) {
          const shifted = [pb[0] + o, pb[1], pb[2] + o, pb[3]];
          if (intersects(shifted, main.bbox)) {
            main.polys.push(o ? poly.map(r => r.map(p => [p[0] + o, p[1]])) : poly);
            main.bbox = [Math.min(main.bbox[0], shifted[0]), Math.min(main.bbox[1], shifted[1]), Math.max(main.bbox[2], shifted[2]), Math.max(main.bbox[3], shifted[3])];
            placed = true; break;
          }
        }
        if (!placed) others.push({ a2: c.a2, id: c.id, bbox: pb, polys: [poly], isMain: false });
      }
      if (main.polys.length) regions.push(main);
      regions.push(...others);
    }
    // Precompute Mercator paths and boxes
    for (const r of regions) {
      const path = new Path2D();
      for (const poly of r.polys) for (const ring of poly) {
        ring.forEach((p, i) => { const x = lngToX(p[0]), y = latToY(p[1]); if (i === 0) path.moveTo(x, y); else path.lineTo(x, y); });
        path.closePath();
      }
      r.path = path;
      r.mbox = [lngToX(r.bbox[0]), latToY(r.bbox[3]), lngToX(r.bbox[2]), latToY(r.bbox[1])];
      r.areaDeg = (r.bbox[2] - r.bbox[0]) * (r.bbox[3] - r.bbox[1]);
    }
    _regions = regions;
    return _regions;
  }

  function bounds(c) {
    const b = c.bb;
    return [[b[0], b[1]], [b[2], b[3]]];
  }

  function search(q, lang) {
    const s = strip(q).trim();
    if (!s) return countries;
    return countries.filter(c => strip(name(c, lang)).includes(s) || strip(c.n).includes(s) || strip(c.o).includes(s)
      || c.a2.toLowerCase() === s || c.a3.toLowerCase() === s || (c.cap && strip(c.cap).includes(s)));
  }
  function sorted(lang) {
    if (!lang || lang === 'en') return countries;
    const locale = lang === 'ar' ? 'ar' : lang;
    return countries.slice().sort((a, b) => name(a, lang).localeCompare(name(b, lang), locale));
  }

  return {
    countries, years, byId, byA2, LANGS,
    meta: D.meta,
    fills, borders, anchors, capitals, flagRegions, bounds, search, sorted, name, capital,
    population, isEstimate, formatCompact, formatFull, strip,
  };
})();
