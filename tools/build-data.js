#!/usr/bin/env node
/**
 * build-data.js — regenerates data/countries.js and data/world.js
 *
 * Sources (downloaded into tools/raw/ on first run):
 *   - world-atlas countries-50m.json (Natural Earth 1:50m, TopoJSON)
 *   - mledoze/countries countries.json (ISO codes, capitals, calling codes, flags)
 *   - Natural Earth 50m populated places (capital coordinates)
 *   - World Bank SP.POP.TOTL 1990-2025 (population); 2026 is extrapolated
 *
 * Usage:  node tools/build-data.js
 */
const fs = require('fs');
const path = require('path');
const topojson = require('../vendor/topojson-client.min.js');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(__dirname, 'raw');
const OUT = path.join(ROOT, 'data');

const SOURCES = {
  'countries-50m.json': 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
  'mledoze.json': 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json',
  'places50.json': 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_populated_places_simple.geojson',
  'wb_pop.json': 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=1990:2026&format=json&per_page=20000',
};

const YEARS = [];
for (let y = 1990; y <= 2026; y++) YEARS.push(y);

async function loadRaw(name) {
  const file = path.join(RAW, name);
  if (!fs.existsSync(file)) {
    console.log('downloading', name);
    const res = await fetch(SOURCES[name]);
    if (!res.ok) throw new Error('Failed to download ' + name + ': ' + res.status);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------- geometry helpers ----------
function ringArea(ring) {
  // planar shoelace with latitude scaling, in ~km²
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const x1 = ring[j][0], y1 = ring[j][1], x2 = ring[i][0], y2 = ring[i][1];
    a += (x1 * y2 - x2 * y1);
  }
  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const k = 111.32 * 111.32 * Math.cos(midLat * Math.PI / 180);
  return Math.abs(a / 2) * k;
}
function polygonArea(poly) {
  return ringArea(poly[0]) - poly.slice(1).reduce((s, r) => s + ringArea(r), 0);
}
function bboxOf(polys) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const ring of poly) for (const pt of ring) {
    if (pt[0] < b[0]) b[0] = pt[0];
    if (pt[1] < b[1]) b[1] = pt[1];
    if (pt[0] > b[2]) b[2] = pt[0];
    if (pt[1] > b[3]) b[3] = pt[1];
  }
  return b;
}
function polygonsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

// ---------- polylabel (pole of inaccessibility), after mapbox/polylabel ----------
function polylabel(polygon, precision) {
  precision = precision || 1.0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of polygon[0]) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] > maxY) maxY = pt[1];
  }
  const width = maxX - minX, height = maxY - minY;
  const cellSize = Math.min(width, height);
  let h = cellSize / 2;
  if (cellSize === 0) return [minX, minY];
  const queue = [];
  for (let x = minX; x < maxX; x += cellSize) for (let y = minY; y < maxY; y += cellSize) queue.push(makeCell(x + h, y + h, h, polygon));
  let best = makeCell(minX + width / 2, minY + height / 2, 0, polygon);
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    const cell = queue.splice(bi, 1)[0];
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    h = cell.h / 2;
    queue.push(makeCell(cell.x - h, cell.y - h, h, polygon), makeCell(cell.x + h, cell.y - h, h, polygon), makeCell(cell.x - h, cell.y + h, h, polygon), makeCell(cell.x + h, cell.y + h, h, polygon));
  }
  return [best.x, best.y];
}
function makeCell(x, y, h, polygon) {
  const d = pointToPolygonDist(x, y, polygon);
  return { x: x, y: y, h: h, d: d, max: d + h * Math.SQRT2 };
}
function pointToPolygonDist(x, y, polygon) {
  let inside = false, minDistSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y !== b[1] > y) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
      minDistSq = Math.min(minDistSq, segDistSq(x, y, a, b));
    }
  }
  return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}
function segDistSq(px, py, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

// ---------- text helpers ----------
const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const r4 = v => Math.round(v * 1e4) / 1e4;

// Manual capital coordinates [lng, lat] for places Natural Earth lacks or names differently
const CAPITAL_OVERRIDES = {
  XK: [21.1655, 42.6629],   // Pristina
  PW: [134.6242, 7.5006],   // Ngerulmud
  NR: [166.9209, -0.5477],  // Yaren
  LK: [79.8880, 6.9016],    // Sri Jayawardenepura Kotte
  MM: [96.0785, 19.7633],   // Nay Pyi Taw
  TK: [-171.8484, -9.2005], // Fakaofo (no official capital)
  BQ: [-68.2385, 12.1443],  // Kralendijk
  SJ: [15.6401, 78.2232],   // Longyearbyen
  CX: [105.6797, -10.4222], // Flying Fish Cove
  CC: [96.8339, -12.1568],  // West Island
  UM: [166.6469, 19.2823],  // Wake Island (no capital)
  BV: [3.3464, -54.4208],
  HM: [73.5045, -53.0818],
  AQ: [0, -90],
  TF: [70.2195, -49.3543],  // Port-aux-Français
  GS: [-36.5, -54.28],      // King Edward Point
  IO: [72.4229, -7.3195],   // Diego Garcia
  PN: [-130.1015, -25.0662],// Adamstown
  NF: [167.9584, -29.0569], // Kingston
  EH: [-13.2033, 27.1536],  // El Aaiún
  MF: [-63.0822, 18.0671],  // Marigot
  BL: [-62.8498, 17.8963],  // Gustavia
  YT: [45.2279, -12.7806],  // Mamoudzou
  TV: [179.1942, -8.5211],  // Funafuti
  GI: [-5.3536, 36.1408],
  VA: [12.4534, 41.9029],
  AX: [19.9348, 60.0971],   // Mariehamn
  BI: [29.9246, -3.4264],   // Gitega (Natural Earth still lists Bujumbura)
  AI: [-63.0578, 18.2170],  // The Valley
  SH: [-5.7089, -15.9387],  // Jamestown
  CK: [-159.7777, -21.2075],// Avarua
  FO: [-6.7719, 62.0079],   // Tórshavn
  GG: [-2.5353, 49.4556],   // St. Peter Port
  GU: [144.7502, 13.4757],  // Hagåtña
  HK: [114.1694, 22.3193],  // Victoria / Central
  JE: [-2.1035, 49.1868],   // Saint Helier
  MO: [113.5439, 22.1987],  // Macau
  MP: [145.7506, 15.1850],  // Saipan
  MS: [-62.2159, 16.7065],  // Plymouth (abandoned; Brades is de facto)
  NU: [-169.9187, -19.0554],// Alofi
  RE: [55.4504, -20.8823],  // Saint-Denis
  PM: [-56.1778, 46.7778],  // Saint-Pierre
  SX: [-63.0458, 18.0260],  // Philipsburg
  TC: [-71.1389, 21.4675],  // Cockburn Town
  VG: [-64.6230, 18.4207],  // Road Town
  VI: [-64.9307, 18.3419],  // Charlotte Amalie
  WF: [-176.1761, -13.2825],// Mata-Utu
};
// Capital names where the dataset is empty or outdated
const CAPITAL_NAMES = { MO: 'Macau', MS: 'Brades (de facto)', TK: 'Fakaofo (no official capital)', UM: 'Wake Island', LK: 'Sri Jayawardenepura Kotte' };
// Translations for capitals Wikidata cannot provide (overrides above, or no P36 statement)
const CAPITAL_I18N_MANUAL = {
  MO: { fr: 'Macao', es: 'Macao', ar: 'ماكاو' },
  MS: { fr: 'Brades (de facto)', es: 'Brades (de facto)', ar: 'برايدز (بحكم الأمر الواقع)' },
  TK: { fr: 'Fakaofo (pas de capitale officielle)', es: 'Fakaofo (sin capital oficial)', ar: 'فاكاوفو (لا عاصمة رسمية)' },
  UM: { fr: 'Île Wake', es: 'Isla Wake', ar: 'جزيرة ويك' },
  BQ: { fr: 'Kralendijk', es: 'Kralendijk', ar: 'كرالنديك' },
  EH: { fr: 'Laâyoune', es: 'El Aaiún', ar: 'العيون' },
  HK: { fr: 'Victoria', es: 'Victoria', ar: 'فيكتوريا' },
  SJ: { fr: 'Longyearbyen', es: 'Longyearbyen', ar: 'لونغييربين' },
};

// Localized capital labels (fr/es/ar) from Wikidata: country P297 (ISO alpha-2) -> P36 (capital) labels
const WD_QUERY = `SELECT ?iso ?en ?fr ?es ?ar WHERE {
  ?country wdt:P297 ?iso ; wdt:P36 ?cap .
  OPTIONAL { ?cap rdfs:label ?en FILTER(LANG(?en)="en") }
  OPTIONAL { ?cap rdfs:label ?fr FILTER(LANG(?fr)="fr") }
  OPTIONAL { ?cap rdfs:label ?es FILTER(LANG(?es)="es") }
  OPTIONAL { ?cap rdfs:label ?ar FILTER(LANG(?ar)="ar") }
}`;
async function loadWikidataCapitals() {
  const file = path.join(RAW, 'capitals-wd.json');
  if (!fs.existsSync(file)) {
    console.log('downloading capitals-wd.json (Wikidata SPARQL)');
    const res = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(WD_QUERY),
      { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'GeoScope-build/1.0 (local data build)' } });
    if (!res.ok) throw new Error('Wikidata query failed: ' + res.status);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).results.bindings;
  const byIso = new Map();
  for (const r of rows) {
    const iso = r.iso && r.iso.value;
    if (!iso) continue;
    if (!byIso.has(iso)) byIso.set(iso, []);
    byIso.get(iso).push({ en: r.en && r.en.value, fr: r.fr && r.fr.value, es: r.es && r.es.value, ar: r.ar && r.ar.value });
  }
  return byIso;
}
function capitalI18n(c, capName, wd) {
  if (CAPITAL_I18N_MANUAL[c.cca2]) return CAPITAL_I18N_MANUAL[c.cca2];
  const rows = wd.get(c.cca2) || [];
  if (!rows.length) return null;
  const want = norm(capName);
  const hit = rows.find(r => norm(r.en) === want) || rows.find(r => r.en && want && (norm(r.en).startsWith(want) || want.startsWith(norm(r.en)))) || rows[0];
  return { fr: hit.fr || hit.en || capName, es: hit.es || hit.en || capName, ar: hit.ar || hit.en || capName };
}

// Approximate populations (single estimate) where the World Bank has no series
const POP_FLAT = {
  VA: 800, AQ: 0, AX: 30400, SJ: 2600, PN: 47, NU: 1700, CK: 15000, TK: 1600, WF: 11500,
  MS: 4400, AI: 15000, FK: 3700, SH: 5300, BL: 10900, PM: 5800, GG: 64000, JE: 103000,
  RE: 885000, GP: 378000, MQ: 349000, YT: 321000, GF: 295000, NF: 2200, CX: 1700, CC: 600,
  BQ: 30000, BV: 0, HM: 0, GS: 30, IO: 3000, TF: 150, UM: 300, MF: 32000,
};
// Manual yearly anchors (linearly interpolated) — [year, population]
const POP_MANUAL = {
  TW: [[1990, 20353000], [1995, 21357000], [2000, 22277000], [2005, 22770000], [2010, 23162000], [2015, 23492000], [2020, 23561000], [2022, 23264000], [2024, 23400000], [2026, 23330000]],
  EH: [[1990, 207000], [2000, 305000], [2010, 460000], [2020, 560000], [2026, 610000]],
};
const WB_CODE = { XK: 'XKX' };

function interpolateAnchors(anchors) {
  return YEARS.map(y => {
    if (y <= anchors[0][0]) return anchors[0][1];
    if (y >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i][0]) {
        const y0 = anchors[i - 1][0], p0 = anchors[i - 1][1], y1 = anchors[i][0], p1 = anchors[i][1];
        return Math.round(p0 + (p1 - p0) * (y - y0) / (y1 - y0));
      }
    }
    return null;
  });
}

function fillSeries(byYear) {
  // byYear: Map(year -> value|null). Returns {series, estFrom}
  const series = YEARS.map(y => (byYear.has(y) && byYear.get(y) != null) ? byYear.get(y) : null);
  const first = series.findIndex(v => v != null);
  if (first < 0) return null;
  for (let i = 0; i < first; i++) series[i] = series[first];
  let last = first;
  for (let i = first + 1; i < series.length; i++) {
    if (series[i] != null) {
      if (i - last > 1) for (let k = last + 1; k < i; k++) series[k] = Math.round(series[last] + (series[i] - series[last]) * (k - last) / (i - last));
      last = i;
    }
  }
  // extrapolate the tail with the growth rate of the last two known years
  const estFrom = last + 1;
  if (last < series.length - 1) {
    const base = series[last];
    const prevIdx = Math.max(first, last - 2);
    const prev = series[prevIdx];
    const span = Math.max(1, last - prevIdx);
    const rate = prev > 0 ? Math.pow(base / prev, 1 / span) : 1;
    const r = Math.min(Math.max(rate, 0.97), 1.04);
    for (let i = last + 1; i < series.length; i++) series[i] = Math.round(series[i - 1] * r);
  }
  return { series: series, estFrom: estFrom < YEARS.length ? estFrom : -1 };
}

// VA shares Italy's +39; SH's main code is +290 (Ascension +247); EH uses Morocco's +212
const CALLING_OVERRIDES = { VA: '+39', AQ: '', SH: '+290', EH: '+212' };
function callingCode(c) {
  if (CALLING_OVERRIDES[c.cca2] != null) return CALLING_OVERRIDES[c.cca2];
  const idd = c.idd;
  if (!idd || !idd.root) return '';
  const s = idd.suffixes || [];
  // one suffix: full code (+34). Several: the shared root (+1 for NANP, +7 for RU/KZ)
  return s.length === 1 ? idd.root + s[0] : idd.root;
}

// Shift a polygon that straddles the antimeridian onto a continuous 0..360 range
function unwrapPolygon(poly) {
  const b = bboxOf([poly]);
  if (b[2] - b[0] <= 180) return poly;
  return poly.map(ring => ring.map(p => [p[0] < 0 ? p[0] + 360 : p[0], p[1]]));
}
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (a === 0) return ring[0];
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}
// Label anchor: the centroid when it sits comfortably inside the polygon, otherwise the pole of inaccessibility
function labelAnchor(poly) {
  const lb = bboxOf([poly]);
  const size = Math.max(lb[2] - lb[0], lb[3] - lb[1]);
  const pole = polylabel(poly, Math.max(size / 200, 0.002));
  const poleDist = pointToPolygonDist(pole[0], pole[1], poly);
  const c = ringCentroid(poly[0]);
  const cDist = pointToPolygonDist(c[0], c[1], poly);
  return (cDist > 0 && cDist >= poleDist * 0.25) ? c : pole;
}
const wrapLng = x => (x > 180 ? x - 360 : x);

// Primary currency per country: {c: ISO code, n: English name, s: symbol}
const CURRENCY_PICK = { CU: 'CUP', EH: 'MAD', PS: 'ILS', CK: 'NZD', BS: 'BSD', PA: 'PAB', KH: 'KHR' };
const CURRENCY_MANUAL = {
  ZW: { c: 'ZWG', n: 'Zimbabwe Gold', s: 'ZiG' },
  FM: { c: 'USD', n: 'United States dollar', s: '$' },
};
function currencyOf(c) {
  if (CURRENCY_MANUAL[c.cca2]) return CURRENCY_MANUAL[c.cca2];
  const cur = c.currencies || {};
  const codes = Object.keys(cur);
  if (!codes.length) return null;
  const code = CURRENCY_PICK[c.cca2] && cur[CURRENCY_PICK[c.cca2]] ? CURRENCY_PICK[c.cca2] : codes[0];
  return { c: code, n: cur[code].name, s: cur[code].symbol || '' };
}
function translatedName(c, key) {
  return (c.translations && c.translations[key] && c.translations[key].common) || c.name.common;
}

function labelMinZoom(areaKm2) {
  if (areaKm2 >= 300000) return 0;
  if (areaKm2 >= 60000) return 1.5;
  if (areaKm2 >= 15000) return 2.5;
  if (areaKm2 >= 1500) return 3.5;
  if (areaKm2 >= 100) return 4.5;
  return 5.5;
}

async function main() {
  const loaded = await Promise.all(['countries-50m.json', 'mledoze.json', 'places50.json', 'wb_pop.json'].map(loadRaw));
  const topo = loaded[0], ml = loaded[1], places = loaded[2], wb = loaded[3];
  const wdCapitals = await loadWikidataCapitals();
  const capMisses = [];

  // ----- population series by ISO3 -----
  const wbByIso3 = new Map();
  for (const row of wb[1]) {
    if (!row.countryiso3code) continue;
    if (!wbByIso3.has(row.countryiso3code)) wbByIso3.set(row.countryiso3code, new Map());
    wbByIso3.get(row.countryiso3code).set(+row.date, row.value == null ? null : row.value);
  }
  const world = fillSeries(wbByIso3.get('WLD'));

  // ----- geometry: TopoJSON -> features, with merges for unassigned regions -----
  const geoms = topo.objects.countries.geometries;
  const byName = new Map(geoms.map(g => [g.properties.name, g]));
  const byId = new Map(geoms.filter(g => g.id).map(g => [g.id, g]));
  const MERGE = { 'N. Cyprus': '196', 'Somaliland': '706', 'Siachen Glacier': '356' }; // into Cyprus, Somalia, India
  const NAME_TO_CCA2 = { 'Kosovo': 'XK' };

  const featureGeom = new Map(); // cca2 -> GeoJSON geometry (build-time only, for anchors/bboxes)
  const topoIdx = new Map();     // cca2 -> [indices into topo.objects.countries.geometries]
  const mlByN3 = new Map(ml.filter(c => c.ccn3).map(c => [c.ccn3, c]));
  const consumed = new Set();
  const addIdx = (cca2, i) => { if (!topoIdx.has(cca2)) topoIdx.set(cca2, []); topoIdx.get(cca2).push(i); };
  // Several geometries can share one ISO id (e.g. Australia + "Ashmore and Cartier Is." both use 036),
  // so group indices per country and merge the group into one geometry.
  for (const name of Object.keys(MERGE)) {
    const extra = byName.get(name);
    const target = mlByN3.get(MERGE[name]);
    if (extra && target) { addIdx(target.cca2, geoms.indexOf(extra)); consumed.add(extra); }
  }
  geoms.forEach((g, i) => {
    if (consumed.has(g)) return;
    let cca2 = null;
    if (g.id && mlByN3.has(g.id)) cca2 = mlByN3.get(g.id).cca2;
    else if (NAME_TO_CCA2[g.properties.name]) cca2 = NAME_TO_CCA2[g.properties.name];
    if (!cca2) { console.log('  (unassigned polygon kept without label: ' + g.properties.name + ')'); return; }
    addIdx(cca2, i);
    consumed.add(g);
  });
  for (const [cca2, idxs] of topoIdx) {
    idxs.sort((a, b) => a - b);
    if (idxs.length > 1) console.log('  merged ' + idxs.length + ' geometries for ' + cca2 + ': ' + idxs.map(i => geoms[i].properties.name).join(' + '));
    featureGeom.set(cca2, idxs.length === 1 ? topojson.feature(topo, geoms[idxs[0]]).geometry : topojson.merge(topo, idxs.map(i => geoms[i])));
  }

  // ----- capitals -----
  const placeIdx = places.features.map(f => f.properties);
  function findCapital(c) {
    if (CAPITAL_OVERRIDES[c.cca2]) return { ll: CAPITAL_OVERRIDES[c.cca2], approx: false };
    const capName = norm((c.capital || [])[0]);
    const cands = placeIdx.filter(p => p.iso_a2 === c.cca2 || p.adm0_a3 === c.cca3);
    let hit = cands.find(p => capName && [p.name, p.nameascii, p.namealt, p.namepar].some(n => norm(n) === capName));
    if (!hit && capName) hit = placeIdx.find(p => [p.name, p.nameascii].some(n => norm(n) === capName) && /Admin-0 capital/.test(p.featurecla));
    if (!hit) hit = cands.find(p => p.featurecla === 'Admin-0 capital');
    if (!hit) hit = cands.find(p => /Admin-0 capital/.test(p.featurecla));
    if (hit) return { ll: [r4(hit.longitude), r4(hit.latitude)], approx: false, via: hit.name };
    return { ll: [c.latlng[1], c.latlng[0]], approx: true };
  }

  const countries = [];
  const missingPop = [], approxCaps = [], viaOther = [];
  for (const c of ml) {
    const geom = featureGeom.get(c.cca2);
    const polys = polygonsOf(geom);
    let anchor, bbox;
    const areaKm2 = c.area || 0;
    if (polys.length) {
      const upolys = polys.map(unwrapPolygon);
      const areas = upolys.map(polygonArea);
      const maxA = Math.max.apply(null, areas);
      const largest = upolys[areas.indexOf(maxA)];
      const a = labelAnchor(largest);
      anchor = [r4(wrapLng(a[0])), r4(a[1])];
      const major = upolys.filter((p, i) => areas[i] >= maxA * 0.25);
      let mb = bboxOf(major);
      // if the union of major polygons straddles the antimeridian, fall back to the largest one
      if (mb[2] - mb[0] > 180) mb = bboxOf([largest]);
      if (mb[2] - mb[0] > 180) { // still straddling: unwrap the union itself
        const shifted = major.map(p => p.map(ring => ring.map(pt => [pt[0] < 0 ? pt[0] + 360 : pt[0], pt[1]])));
        const sb = bboxOf(shifted);
        if (sb[2] - sb[0] < mb[2] - mb[0]) mb = sb;
      }
      bbox = mb.map(r4); // west may exceed 180 by design; MapLibre accepts it
    } else {
      anchor = [c.latlng[1], c.latlng[0]];
      bbox = [anchor[0] - 0.5, anchor[1] - 0.5, anchor[0] + 0.5, anchor[1] + 0.5];
    }

    // population
    let pop = null, popMode = 'wb', estFrom = -1;
    const wbSeries = wbByIso3.get(WB_CODE[c.cca2] || c.cca3);
    if (POP_MANUAL[c.cca2]) { pop = interpolateAnchors(POP_MANUAL[c.cca2]); popMode = 'manual'; estFrom = YEARS.indexOf(2025); }
    else if (wbSeries && Array.from(wbSeries.values()).some(v => v != null)) { const f = fillSeries(wbSeries); pop = f.series; estFrom = f.estFrom; }
    else if (POP_FLAT[c.cca2] != null) { pop = YEARS.map(() => POP_FLAT[c.cca2]); popMode = 'flat'; }
    else { missingPop.push(c.cca2 + ':' + c.name.common); pop = YEARS.map(() => null); popMode = 'none'; }

    const cap = findCapital(c);
    if (cap.approx) approxCaps.push(c.cca2 + ':' + c.name.common + ' (' + (c.capital || []).join('/') + ')');
    else if (cap.via && norm(cap.via) !== norm((c.capital || [])[0])) viaOther.push(c.cca2 + ':' + (c.capital || [])[0] + '->' + cap.via);

    const capName = CAPITAL_NAMES[c.cca2] || (c.capital && c.capital[0]) || '';
    const ci = capName ? capitalI18n(c, capName, wdCapitals) : null;
    if (capName && !ci) capMisses.push(c.cca2 + ':' + capName);

    countries.push({
      a2: c.cca2, a3: c.cca3, n3: c.ccn3 || '',
      n: c.name.common, o: c.name.official, f: c.flag,
      nf: translatedName(c, 'fra'), ns: translatedName(c, 'spa'), na: translatedName(c, 'ara'),
      cur: currencyOf(c),
      cap: capName, capf: ci ? ci.fr : capName, caps: ci ? ci.es : capName, capa: ci ? ci.ar : capName,
      cll: cap.ll, cx: cap.approx ? 1 : 0,
      tg: topoIdx.get(c.cca2) || [],
      cc: callingCode(c),
      ll: anchor, bb: bbox, area: areaKm2, lz: labelMinZoom(areaKm2),
      reg: c.region, sub: c.subregion, ind: c.independent ? 1 : 0, un: c.unMember ? 1 : 0,
      geo: polys.length ? 1 : 0,
      p: pop, pm: popMode, pe: estFrom,
    });
  }
  countries.sort((a, b) => a.n.localeCompare(b.n, 'en'));
  countries.forEach((c, i) => { c.id = i + 1; });

  console.log('countries: ' + countries.length + ' | with geometry: ' + countries.filter(c => c.geo).length);
  console.log('no population data: ' + (missingPop.join(', ') || 'none'));
  console.log('approximate capitals (country centre used): ' + (approxCaps.join(', ') || 'none'));
  console.log('capital matched via different place name: ' + (viaOther.join(', ') || 'none'));
  console.log('capitals without Wikidata translations (English kept): ' + (capMisses.join(', ') || 'none'));

  // ----- write outputs -----
  fs.mkdirSync(OUT, { recursive: true });
  const meta = { years: YEARS, world: world.series, worldEstFrom: world.estFrom, generated: new Date().toISOString().slice(0, 10), popSource: 'World Bank SP.POP.TOTL (updated ' + wb[0].lastupdated + ')' };
  fs.writeFileSync(path.join(OUT, 'countries.js'), '// Generated by tools/build-data.js — do not edit by hand\nwindow.GEO_DATA = ' + JSON.stringify({ meta: meta, countries: countries }) + ';\n');

  // TopoJSON topology embedded as JS so it loads from file://. The browser (js/geo.js) turns
  // it into GeoJSON with topojson-client, using each country's `tg` geometry indices.
  const slim = { type: topo.type, transform: topo.transform, arcs: topo.arcs, bbox: topo.bbox,
    objects: { countries: { type: 'GeometryCollection', geometries: geoms.map(g => ({ type: g.type, arcs: g.arcs, id: g.id, properties: { name: g.properties.name } })) } } };
  fs.writeFileSync(path.join(OUT, 'world-topo.js'), '// Generated by tools/build-data.js — Natural Earth 1:50m via world-atlas (TopoJSON)\nwindow.GEO_TOPO = ' + JSON.stringify(slim) + ';\n');
  const oldOut = path.join(OUT, 'world.js');
  if (fs.existsSync(oldOut)) fs.unlinkSync(oldOut);
  console.log('wrote data/countries.js (' + fs.statSync(path.join(OUT, 'countries.js')).size + ' bytes), data/world-topo.js (' + fs.statSync(path.join(OUT, 'world-topo.js')).size + ' bytes)');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { polylabel, pointToPolygonDist, ringCentroid, labelAnchor, polygonArea, bboxOf, unwrapPolygon };
