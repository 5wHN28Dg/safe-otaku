# AGENT.md

Reference document for anyone — human or agent — making changes to this repository.

## What this project is

A read-only, safe-mode frontend for MangaDex, self-hosted on an OpenWrt router. It enforces the `safe` and `suggestive` content ratings server-side, in the CGI, on every API request. It is not a content filter for `mangadex.org`; it is a separate site served from the LAN.

## Hard constraints

Every change is measured against these. They are not negotiable defaults; they are the reason the architecture looks the way it does.

**Target hardware.** Xiaomi Redmi Router AX6S. MediaTek MT7622B, dual-core Cortex-A53 at 1.35 GHz, 256 MB RAM, 128 MB SPI-NAND flash. A base OpenWrt install with LuCI uses roughly 100–150 MB of that RAM.

**Runtime is uhttpd CGI.** No Node process, no nginx, no Lua, no persistent daemon. uhttpd is already running for LuCI. The proxy is one shell script executed per request. Adding any persistent runtime costs RAM at idle for a tool that serves a handful of requests per day.

**No router-side cache.** Images are not cached on the router. Cover and page URLs are content-addressed, so they carry `Cache-Control: public, max-age=31536000, immutable` and the browser caches them. Router flash has limited write endurance and the project does not need a second copy of every image on it.

**Frontend runtime budget.** Preact is the ceiling: roughly 4–5 KB gzipped for the runtime, plus application code. JSX is compiled by esbuild at build time, so there is no template runtime. The bundle target is under 30 KB gzipped total. This is a target, not a hard fail, but any growth past it needs a stated reason.

**Total dependencies.** `preact` (runtime) and `esbuild` (build). Two. Adding a third requires justifying it against the RAM, flash, and bundle budgets simultaneously. `package-lock.json` is committed, so builds are reproducible and dependency changes show up in review.

## Architecture

```
[Browser] --> uhttpd :80
              |
              +--> /mangadex-safe/*      static files from flash
              +--> /cgi-bin/md/api/*     CGI -> api.mangadex.org
              +--> /cgi-bin/md/img/*     CGI -> uploads.mangadex.org
```

Everything is same-origin. No CORS headers are needed. Routes use the URL hash (`#/manga/<id>`): uhttpd serves files only and has no per-site fallback to `index.html`, so path routes would 404 on refresh.

The CGI is an allowlist, not a filter on top of an open proxy:

- **Endpoints.** It forwards only `/manga`, `/manga/<uuid>/feed` and `/at-home/server/<uuid>`.
- **Query keys.** It keeps only the keys the frontend sends, then appends `contentRating[]=safe&contentRating[]=suggestive`.
- **Chapter pages.** Before forwarding `/at-home/server/<id>`, it checks the chapter through `/chapter?ids[]=<id>` with the ratings applied.
- **Images.** It proxies only `/covers/<uuid>/<file>` and `/data/<hash>/<file>`.

These rules come from tested MangaDex behaviour: by-ID endpoints ignore `contentRating[]`, and the parameter is accepted in several encodings. A denylist on top of an open proxy leaked both ways.

## Why the CGI, not nginx

nginx would handle concurrency in one process and offer a cleaner `proxy_pass` model. It costs roughly 2 MB of flash (nginx plus OpenSSL) and 10–15 MB RSS whether or not anyone uses the app. On a router where RAM is contested between routing, Wi-Fi, and firewall, that is 10% of free memory sitting idle. CGI pays a process spawn per request (~10 ms on this CPU) and nothing at idle. For a home tool with low traffic, CGI wins.

This tradeoff is documented so future contributors do not re-litigate it without new information. If you have measured idle RSS for both and the numbers differ from the above, say so and reopen the question.

## Rules for changes

**Do not add runtime dependencies to the CGI.** It runs on BusyBox ash. `uclient-fetch` is what ships with OpenWrt. Do not replace it with `curl` unless `curl` is already present and you have a reason.

**Do not introduce router-side caching** in any form: `proxy_cache`, a `/tmp` image store, a sqlite database, anything. Browser cache is the caching layer.

**Do not change the CGI to spawn additional processes per request.** Every route does one `exec` at the end. The single exception is `/at-home/server/<id>`, which runs one rating-check fetch first, because at-home ignores content ratings and there is no other way to tie a chapter to its manga's rating. That costs one extra process per chapter opened, not per page. Do not add others.

**Do not add a build step beyond esbuild.** The build is `esbuild src/index.jsx` (which also compiles JSX) plus a two-file copy. That is the whole pipeline. `--target` declares the browser floor; see the capability matrix.

**Do not add analytics, telemetry, error reporting, or any outbound network call other than to `api.mangadex.org` and `uploads.mangadex.org`.** The CSP meta tag enforces this at the browser level. Do not weaken the CSP to work around it.

**Do not weaken the allowlists in the CGI.** That covers the endpoint list, the query-key list, the at-home rating check and the image path patterns. The CGI runs as root (uhttpd on OpenWrt does not drop privileges) and proxies to hosts the user does not control. Each new endpoint or key needs evidence that MangaDex applies `contentRating[]` to it.

**Do not add features that require authentication.** The app is read-only by design. It does not log in, comment, rate, or upload.

**Any new feature must fit the RAM, flash, and bundle budgets.** If it does not, it is the wrong feature for this host. The policy document this project follows puts the platform's constraints above feature convenience.

## Build

```
npm install
npm run build
```

Produces `dist/index.html`, `dist/bundle.js`, `dist/styles.css`.

## Deploy

```
ssh root@ROUTER_IP 'mkdir -p /www/mangadex-safe'
scp -r dist/* root@ROUTER_IP:/www/mangadex-safe/
scp cgi/md root@ROUTER_IP:/www/cgi-bin/md
ssh root@ROUTER_IP 'chmod +x /www/cgi-bin/md'
```

Confirm `/etc/config/uhttpd` has `option cgi_prefix '/cgi-bin'`. If not, add it and `/etc/init.d/uhttpd reload`.

## Testing

There is no unit test suite. `npm run dev` runs the real `cgi/md` under BusyBox ash behind a local stand-in for uhttpd, which is enough to develop the frontend and to try CGI changes. It is not uhttpd, so CGI changes still require testing on the router before deploying.

On the router:

1. `wget -O- 'http://localhost/cgi-bin/md/api/manga?limit=1'`. Expect JSON with a `data` array.
2. Filter checks; every one must fail:
   - `wget -O- 'http://localhost/cgi-bin/md/api/manga/random'` → 403.
   - `wget -O- 'http://localhost/cgi-bin/md/api/manga?title=Tsugumomo&contentRating%5b%5d=pornographic'` → no `pornographic` results.
   - Open `#/manga/5b2cdbf6-9f64-4a01-9fd3-33b51724f9d3` (rated `pornographic`) → "Not available."
3. Open the frontend in a browser. Confirm covers load. A broken image named `agg.jpg` means the `User-Agent` header is wrong or a `Via` header is being forwarded.
4. Open a chapter. Confirm pages load, Next/Previous and the arrow keys move through pages, the position survives a reload, and the browser caches images (check `Cache-Control` in devtools).
5. `free -m` on the router after a browsing session. Compare `MemAvailable` to a baseline taken before the app was installed. A drop of more than a few MB at idle indicates a leak or a persistent process that should not exist.

On every engine in the capability matrix (Chromium, Firefox, Safari/iOS):

6. Navigate with the keyboard only. Every control is reachable and has a visible focus ring.
7. Use a screen reader on the search, detail and reader pages. Loading and error messages are announced.
8. Check 200% zoom and `prefers-reduced-motion`.

## Capability matrix

Declared support: current Chromium, Firefox and Safari, with the build floor at `es2020,chrome90,firefox90,safari15`. Every feature used is in all three engines at that floor or degrades gracefully. Rebuild this table when adding a feature.

| Requirement | Platform feature | Blink | Gecko | WebKit | Fallback |
|---|---|---|---|---|---|
| Module loading | `<script type="module">` | Yes | Yes | Yes | none needed |
| Routing | `hashchange`, `location.hash` | Yes | Yes | Yes | none needed |
| Favorites, reading position | IndexedDB | Yes | Yes | Yes | none needed |
| Current page in reader | IntersectionObserver | Yes | Yes | Yes | none needed |
| Deferred image loading | `loading="lazy"` | Yes | Yes | 15.4+ | images load eagerly |
| Cover layout | CSS grid, `aspect-ratio` | Yes | Yes | 15+ | none needed |
| Title clamp | `line-clamp` / `-webkit-line-clamp` | Yes | Yes | Yes | title not clamped |
| Focus ring | `:focus-visible` | Yes | Yes | 15.4+ | default outline |

Measured: `npm run size` reports 11.3 KB gzipped total (`bundle.js` 9.4 KB). The decision rule is the 30 KB target above.

## Blocklist

`blocklist/` holds supplementary adblock-lean lists: NSFW sites listed on everythingmoe.com that Hagezi NSFW misses and that have no network-enforceable safe mode. It complements the MangaDex proxy: blocking `mangadex.org` is what makes the proxy the only way in. `blocklist/README.md` covers tiers, method, deployment and limits.

Rules for changes:

- **`blocklist/sites.tsv` is the reviewed source of truth.** The `.txt` files are generated. Change a site's tier in the TSV and run `npm run blocklist:build`; never edit the `.txt` files by hand.
- **Every tier needs evidence** in the `evidence` column. Say whether it was verified (labels found, API response) or inferred.
- **Keep the proxy's upstreams resolvable.** `api.mangadex.org` and `uploads.mangadex.org` are in `blocklist/allowlist.txt` and in the script's `NEVER` set. The router's own dnsmasq serves the CGI, so blocking them breaks the proxy.
- **Only count a "safe" endpoint as safe if the server enforces the filter.** Show that non-safe content is refused, not just hidden. Currently only `safebooru.donmai.us` qualifies.
- **Don't propose CNAME rewrites** unless the vendor documents the target for DNS enforcement (Google/YouTube style). A CNAME to a sibling hostname on the same servers enforces nothing.
- `scripts/blocklist.mjs` runs on the development machine and fetches everythingmoe.com and Hagezi. The "no outbound calls" rule above applies to the deployed app and CGI, not to this dev-only script.

## Policy

This project follows the principles in `evidence-first web engineering`. The relevant ones:

- The browser platform comes first. HTML elements, CSS, and Web APIs are used directly wherever they suffice.
- A small library is justified when it closes a specific gap. Preact closes the state-to-DOM binding gap, and is the only runtime library. htm was removed: it closed a "JSX without a build step" gap, but esbuild is already the build step and compiles JSX, so htm only added template parsing at runtime.
- Frameworks and meta-frameworks are not used. The application is small enough that they would add weight without removing work.
- Security mechanisms are not bypassed. The CSP is strict. The proxy is an endpoint, key and path allowlist. The content filter is enforced server-side, not by hiding UI.

## Repository layout

```
.
├── AGENT.md                # this file
├── CLAUDE.md               # operational notes for Claude Code sessions
├── README.md               # user-facing install and usage
├── LICENSE                 # AGPL-3.0
├── cgi/md                  # the proxy script (runs on the router)
├── blocklist/              # adblock-lean lists for NSFW otaku sites (see below)
├── scripts/copy-static.js  # build helper
├── scripts/dev-server.mjs  # local stand-in for uhttpd + CGI (npm run dev)
├── scripts/blocklist.mjs   # audits everythingmoe + Hagezi, builds blocklist/*.txt
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── index.jsx
│   ├── app.jsx
│   ├── lib/                # api, db, router
│   └── components/         # Header, Browse, Detail, Reader, Favorites (.jsx)
├── package.json
└── package-lock.json
```