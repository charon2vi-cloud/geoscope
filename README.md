# GeoScope — globe & map trainer for GeoGuessr

A single-page, no-build web app: an interactive 3D globe / 2D map with a country directory, five
study overlays (flags, calling codes, currencies, facts, population 1990–2026), live per-country
chat rooms on Supabase, and an animated constellation background. English, Arabic, French and
Spanish; light and dark themes.

## Run it

Serve the folder with any static server (the chat sign-in needs an `http(s)` origin):

```bash
python -m http.server 8765
```

then visit <http://localhost:8765>. Everything except satellite imagery, label fonts, flag images
and the chat backend is bundled locally.

## Controls

| Control | What it does |
| --- | --- |
| **Language** | English, العربية, Français, Español — UI, directory, map labels (countries **and capitals**), overlays, facts and chat strings. Arabic is right-to-left. |
| **EARTH / MAP** | 3D globe or flat web-mercator map (animated projection change). |
| **SATELLITE** | Esri imagery in either view. No roads, no place labels, no street view. |
| **DARK** | Night theme (`#121212`, silver constellation, dark vector map). Remembered between visits. |
| Left column | Overlay selector (**None / Flag / Calling code / Currency / Learn a fact / Population**) with the country chat underneath. |
| Right panel | Searchable A–Z directory; click a country to fly to it. `/` focuses the search. |
| Bottom | `created by SOFi!BOU` credit (left), live-visitor counter (centre). |
| Keys | `E` earth, `M` map, `S` satellite, `D` dark mode, `Esc` clears the selection. |

## Country chat (Supabase)

Each country is a chat room. Everyone can read; sending needs a Google sign-in done inside the chat
box. The room follows the selected country; if you are already in a room, a **Stay / Switch Room**
dialog asks first. The header shows how many people are subscribed to the room (Supabase Presence),
and the bottom-centre pill counts every open tab on the site, signed in or not.

### Setup (once)

1. Create a Supabase project. In **Authentication → Providers** enable **Google** and add your site
   URL (and `http://localhost:8765` for local testing) to the redirect URLs.
2. Open **SQL editor**, paste `supabase/schema.sql`, run it. It creates the tables, enables Row Level
   Security on all of them, creates the RPC functions and adds `messages` to the realtime publication.
3. Put the project URL and **anon** key in `js/config.js` — either copy `js/config.example.js`, or
   generate it from environment variables (nothing project-specific is committed; `js/config.js` is
   git-ignored):

   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... CREDIT_URL=https://your-site node tools/write-config.js
   ```

   The generator refuses to run if `SUPABASE_SERVICE_ROLE_KEY` is present in the environment.

Without a config the app runs normally; the chat box says it is not configured and the visitor
counter stays hidden. `test-chat.html` loads a mocked Supabase client (`tools/mock-supabase.js`) to
try the chat UI without a project — development only.

### Behaviour enforced server-side (`supabase/schema.sql`)

| Rule | Where |
| --- | --- |
| Only authenticated users can write; anonymous users read only | RLS: `select` policies only; all writes via `security definer` RPCs granted to `authenticated` |
| Message: 1–500 chars, control characters stripped, whitespace collapsed | `send_message()` + table `check` constraints |
| Rate limit: 1 message / second / user (serialised with an advisory lock) | `send_message()` |
| Retention: newest 2,000 messages per room | `send_message()` deletes older rows after each insert |
| Reports linked to reporter and reported user, one per message per reporter | `reports` table, `report_message()` |
| Auto-ban: 15 reports / 1 day → 24 h, 50 / 7 days → 7 days, 80 / 30 days → 30 days | `report_message()` (counts distinct reporters; 30 reports/day per reporter max) |
| Author name/avatar copied from the profile at insert time (clients cannot spoof them) | `send_message()`; profile created by trigger on `auth.users` |

## Security notes

- **Input handling.** Chat text is validated on the client (length, control characters, country
  code `^[A-Z]{2}$`) and again in SQL. Every user-provided string is rendered with `textContent`;
  nothing is inserted as HTML. Avatars are shown only from `https://` URLs. The search box only
  filters a local list and is escaped before highlighting.
- **Database.** RLS on every table; no client-side inserts/updates/deletes; parameterised RPC calls
  through supabase-js (no string-built SQL anywhere).
- **Secrets.** Only the public anon key reaches the browser. The service-role key is never used by
  this app and `tools/write-config.js` refuses to run if it is set.
- **Rate limiting.** 1 message/second and 30 reports/day per user in SQL, mirrored by a client
  throttle; supabase-js realtime is capped at 5 events/second.
- **Content Security Policy** (meta tag in `index.html`): no inline scripts, no `eval`
  (`wasm-unsafe-eval` is allowed only for the Arabic text-shaping WebAssembly), resources limited to
  the CDNs and services the app uses, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`.

## How the overlays are drawn

- **Flag** — a custom raster tile protocol (`geoflags://`) paints, per tile, each country's flag
  stretched once over its core bounding box and clipped to its outline (outlying parts such as
  Alaska or French Guiana get their own flag). It never repeats and scales with zoom.
- **Calling code / Currency / Population** — below zoom 6 one label per country at a computed
  anchor; from zoom 6 one label per country piece in every tile, always drawn, so the value stays
  visible however far you zoom in. These labels take priority over capital names.
- **Learn a fact** — shown in the hover / selection card, in the current language.

## Project layout

```
index.html            page shell (with CSP)
test-chat.html        same page with a mocked Supabase client — development only
css/style.css         styling, light + dark tokens, RTL rules
js/theme-init.js      applies the saved theme before first paint
js/config.js          Supabase URL + anon key (git-ignored; see config.example.js / tools/write-config.js)
js/i18n.js            UI strings (en/ar/fr/es), region names, localized currency names
js/constellation.js   canvas particle-network background
js/geo.js             TopoJSON → GeoJSON, antimeridian splitting, borders, anchors, flag regions
js/chat.js            Supabase chat rooms, presence, reports, visitor counter
js/app.js             MapLibre setup, views, overlays, directory, info card, language, theme
data/world-topo.js    Natural Earth 1:50m countries (TopoJSON, via world-atlas)
data/countries.js     250 territories: names and capitals in en/fr/es/ar, calling code, currency,
                      label anchor, bounds, population 1990–2026, region
data/facts*.js        one short fact per territory in each language
supabase/schema.sql   tables, RLS policies, RPCs, triggers, realtime publication
tools/build-data.js   regenerates data/countries.js and data/world-topo.js
tools/write-config.js writes js/config.js from environment variables
tools/mock-*.js       mocked Supabase client + config for test-chat.html
vendor/               maplibre-gl 5.24 (UMD), topojson-client, mapbox-gl-rtl-text, supabase-js 2
```

## Data

- **Borders:** Natural Earth 1:50m via `world-atlas@2`, with a few merges (Northern Cyprus →
  Cyprus, Somaliland → Somalia, Siachen → India, Ashmore & Cartier → Australia) and antimeridian
  splitting for Russia and Fiji.
- **Country metadata:** [mledoze/countries](https://github.com/mledoze/countries) (names and
  translations, ISO codes, capitals, calling codes, currencies, area).
- **Capital coordinates:** Natural Earth populated places with manual fixes; **capital names in
  French, Spanish and Arabic** from Wikidata (`P36` labels), with a handful of manual entries.
- **Population:** World Bank `SP.POP.TOTL`, 1990–2025; 2026 projected and marked "(est.)".
- **Currency names:** the browser's `Intl.DisplayNames`, falling back to the dataset.
- **Flags:** `flagcdn.com`. **Label fonts:** MapLibre's demo glyph server (Noto Sans).

To refresh the data (Node 18+): `node tools/build-data.js` (downloads sources into `tools/raw/`).

## Notes

- MapLibre 5.x (UMD) is used because 6.x ships as ES modules only.
- Max zoom is capped (9 minimalist, 11 satellite) to keep the app at country/region scale.
- Flag emoji are shown as images because Windows has no colour flag glyphs.
- The footer credit link is inert until `creditUrl` in the config is an `https://` URL.
