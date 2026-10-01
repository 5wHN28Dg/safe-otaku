# mangadex-safe

A self-hosted, read-only MangaDex frontend that hardcodes the `safe` and `suggestive` content ratings on every request. Designed to run on an OpenWrt router (target: Xiaomi Redmi Router AX6S, MediaTek MT7622, 256 MB RAM) with no additional runtime, no Node process, and no router-side image cache.

## What this is not

This is not a transparent content filter. It is a separate, stripped-down site served from your LAN. `mangadex.org` is still reachable unless you block it at the DNS level. Anyone on the network who types the real hostname gets the real site, with all content ratings. `blocklist/` has adblock-lean lists that block it (while keeping the proxy's upstreams reachable), along with other NSFW otaku sites. See `blocklist/README.md`.

What this does: gives you a safe-mode view of MangaDex at a hostname you control, with the ratings enforced server-side by the CGI proxy. Editing URLs or calling the proxy by hand does not get past the filter; see [Content filtering](#content-filtering).

## Why a proxy is required

MangaDex does not send CORS headers to third-party origins. The API documentation states:

> We do not send CORS responses for other websites than ours; MUST proxy the requests your users make to our services, and inject your own CORS responses and headers where relevant. We will serve the wrong response for any image hotlinked from our domains; you MUST proxy the requests your users make to our services.

A browser-based frontend cannot call `api.mangadex.org` directly, and cannot load images from `uploads.mangadex.org` directly. The proxy is not optional.

## Architecture

```
[Browser] --> uhttpd :80
              |
              +--> /mangadex-safe/*      static files from flash
              +--> /cgi-bin/md/api/*     CGI -> api.mangadex.org      (allowlisted endpoints only)
              +--> /cgi-bin/md/img/*     CGI -> uploads.mangadex.org  (covers and chapter pages only)
```

Everything is same-origin from the browser's perspective. No CORS headers are needed.

The CGI script is one shell file. Routes use the URL hash (`/mangadex-safe/#/manga/<id>`), because uhttpd serves files only and cannot fall back to `index.html` for a deep link.

Nothing is cached on the router. Covers and pages are content-addressed, so the CGI sends `Cache-Control: public, max-age=31536000, immutable` and the browser keeps them.

## Resource footprint

| Resource | Usage |
|---|---|
| Flash | 3.8 KB for the CGI script; 31.7 KB for the frontend (`bundle.js` 24.4 KB, `styles.css` 6.7 KB, `index.html` 0.6 KB), 11.3 KB gzipped |
| RAM at idle | 0 (uhttpd is already running for LuCI) |
| RAM per request | not yet measured on the router; one short-lived `sh` plus `uclient-fetch` |
| Processes per request | one `exec`; opening a chapter adds one rating-check fetch |
| Disk for cache | 0 (browser caches images) |

Bundle sizes are measured with `npm run size`. Per-request RAM and CPU still need measuring on the router (see AGENT.md, Testing).

## Requirements

- OpenWrt 22.03 or later on the router
- `uhttpd` with CGI support (installed by default with LuCI)
- `uclient-fetch` (installed by default)
- A development machine with Node.js 18+ and npm for building the frontend
- For `npm run dev` only: `busybox` and `curl` on the development machine

## Build

On your development machine:

```
npm install
npm run build
npm run size
```

This produces `dist/index.html`, `dist/bundle.js`, and `dist/styles.css`, and reports their gzipped sizes.

## Install on the router

Copy the build output and the CGI script:

```
ssh root@192.168.1.1 'mkdir -p /www/mangadex-safe'
scp -r dist/* root@192.168.1.1:/www/mangadex-safe/
scp cgi/md root@192.168.1.1:/www/cgi-bin/md
```

On the router, make the CGI executable:

```
chmod +x /www/cgi-bin/md
```

Confirm CGI is enabled in `/etc/config/uhttpd`:

```
option cgi_prefix '/cgi-bin'
```

If it is missing, add it and reload:

```
/etc/init.d/uhttpd reload
```

Verify the proxy works and refuses what it should:

```
wget -O- 'http://localhost/cgi-bin/md/api/manga?limit=1'       # JSON with a data array
wget -O- 'http://localhost/cgi-bin/md/api/manga/random'        # 403 Forbidden
```

Open `http://192.168.1.1/mangadex-safe/` in a browser.

## Troubleshooting

**CGI returns 403 for every request.** uhttpd is not passing `PATH_INFO`, so no route matches. Check `/etc/config/uhttpd` for `option cgi_prefix '/cgi-bin'` and reload uhttpd after changes.

**`uclient-fetch` fails with "unknown option".** Different OpenWrt versions use different flags for User-Agent and timeout. Run `uclient-fetch --help` on the router and adjust `cgi/md` if the flags differ. The script uses `--user-agent` and `-T`; older builds may require `-U` and `-t`.

**Images return a broken file named `agg.jpg`.** MangaDex serves a placeholder image when a request lacks a valid `User-Agent` or carries a `Via` header. Confirm the CGI sets `User-Agent` and does not forward `Via`. The script already does both; if you edited it, check those lines.

**Pages load slowly, a few at a time.** OpenWrt's stock uhttpd config has `option max_requests 3`, so at most three CGI requests run at once and the rest queue. Raising it lets more images load in parallel, at the cost of more short-lived processes. Measure `free -m` while reading before and after changing it.

**Rate limiting kicks in.** MangaDex enforces roughly 5 requests per second per IP. The CGI does not throttle locally; if the router's IP is shared, this can be hit by accident. Space out large loads, or add a token bucket to the CGI.

## Development

```
npm run dev
```

Builds, then serves the app at `http://127.0.0.1:8080/mangadex-safe/` with a local stand-in for the router. Static files come from `dist/`, and `/cgi-bin/md/*` runs the real `cgi/md` under BusyBox ash, with `uclient-fetch` swapped for a curl wrapper. It is close to the router, not identical: CGI changes still need testing on the router.

## Project layout

```
.
├── cgi/md                    # The CGI proxy script (runs on the router)
├── blocklist/                # adblock-lean lists for NSFW otaku sites
├── scripts/
│   ├── copy-static.js        # build helper
│   ├── dev-server.mjs        # local stand-in for uhttpd + CGI (npm run dev)
│   └── blocklist.mjs         # blocklist audit and build
├── src/
│   ├── index.html            # App shell, CSP meta tag
│   ├── styles.css            # All styles
│   ├── index.jsx             # Entry point
│   ├── app.jsx               # Top-level component and routing dispatch
│   ├── lib/
│   │   ├── api.js            # API client and URL builders
│   │   ├── db.js             # IndexedDB wrappers (favorites, reading position)
│   │   └── router.js         # Hash router
│   └── components/
│       ├── Header.jsx
│       ├── Browse.jsx
│       ├── Detail.jsx
│       ├── Reader.jsx
│       └── Favorites.jsx
├── package.json
├── LICENSE
└── README.md
```

## Content filtering

Two ratings are allowed: `safe` and `suggestive`. The CGI appends `contentRating[]=safe` and `contentRating[]=suggestive` to every API request it forwards.

Appending them is not enough on its own. MangaDex ignores `contentRating[]` on its by-ID endpoints (`/manga/<id>`, `/at-home/server/<id>`), and it accepts the parameter in several encodings (`%5b%5d`, `%5B0%5D`, `[0]`). So the CGI works from an allowlist:

- **Endpoints.** Only three API routes are forwarded: `/manga` (list and search), `/manga/<uuid>/feed`, and `/at-home/server/<uuid>`. Everything else returns 403. The frontend looks up single titles through `/manga?ids[]=<id>`, which applies the ratings.
- **Query keys.** Only the keys the frontend sends are forwarded. Any other key, including every spelling of `contentRating`, is dropped.
- **Chapter pages.** `/at-home/server/<id>` ignores ratings, so before forwarding it the CGI asks `/chapter?ids[]=<id>` with the ratings applied. If MangaDex doesn't return the chapter, the request gets a 403.
- **Images.** Only `/covers/<uuid>/<file>` and `/data/<hash>/<file>` with plain file names are proxied.

To add or remove ratings, edit the `RATINGS=` line in `cgi/md`:

```
RATINGS="contentRating%5B%5D=safe&contentRating%5B%5D=suggestive"
```

MangaDex ratings are `safe`, `suggestive`, `erotica`, and `pornographic`. MangaDex has no Ecchi tag. Uploaders put ecchi titles under `suggestive` or `erotica`, so `suggestive` lets some ecchi through, alongside mainstream titles such as One Piece and Jujutsu Kaisen.

Known residual: someone who already has a cover file name or a chapter image hash from outside this app can fetch that one image through `/img/`. The app itself never hands out names or hashes for titles outside the allowed ratings.

## What this does not do

- Log in
- Comment, rate, or upload
- Access `erotica` or `pornographic` content
- Filter other sites by itself (MangaDex proper stays reachable until you deploy `blocklist/`)
- Cache images on the router

## Security notes

- uhttpd on OpenWrt runs as root, and so do its CGI scripts. Treat `cgi/md` as root-run code: it validates every path segment, forwards only allowlisted endpoints and keys, and passes the URL to `uclient-fetch` as a single quoted argument.
- The CGI accepts only `GET`.
- The CGI does not forward client-supplied headers. `Via` is not set.
- The CSP meta tag in `index.html` restricts scripts, styles, images and connections to same-origin. `frame-ancestors` is left out: browsers ignore it in a meta tag, and uhttpd cannot add response headers to static files.

## License

AGPL-3.0. See `LICENSE`.
