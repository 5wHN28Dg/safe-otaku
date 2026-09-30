# mangadex-safe

A self-hosted, read-only MangaDex frontend that hardcodes the `safe` and `suggestive` content ratings on every request. Designed to run on an OpenWrt router (tested against Xiaomi Redmi Router AX6S, MediaTek MT7622, 256 MB RAM) with no additional runtime, no Node process, and no router-side image cache.

## What this is not

This is not a transparent content filter. It is a separate, stripped-down site served from your LAN. `mangadex.org` is still reachable unless you block it at the DNS level. Anyone on the network who types the real hostname gets the real site, with all content ratings. `blocklist/` has adblock-lean lists that block it (while keeping the proxy's upstreams reachable), along with other NSFW otaku sites. See `blocklist/README.md`.

What this does: gives you a safe-mode view of MangaDex at a hostname you control, with the ratings enforced server-side by the CGI proxy. The threat model is a household member clicking a bookmark, not an adversary editing URLs.

## Why a proxy is required

MangaDex does not send CORS headers to third-party origins. The API documentation states:

> We do not send CORS responses for other websites than ours; MUST proxy the requests your users make to our services, and inject your own CORS responses and headers where relevant. We will serve the wrong response for any image hotlinked from our domains; you MUST proxy the requests your users make to our services.

A browser-based frontend cannot call `api.mangadex.org` directly, and cannot load images from `uploads.mangadex.org` directly. The proxy is not optional.

## Architecture

```
[Browser] --> uhttpd :80
              |
              +--> /mangadex-safe/*      static files from flash
              +--> /cgi-bin/md/api/*     CGI -> api.mangadex.org
              +--> /cgi-bin/md/img/*     CGI -> uploads.mangadex.org
```

Everything is same-origin from the browser's perspective. No CORS headers needed.

The CGI script is one shell file. It strips any client-supplied `contentRating[]` parameter and injects `safe` and `suggestive`. Image requests are path-restricted to `/covers/` and `/data/` and forwarded to `uploads.mangadex.org`. No caching on the router; `Cache-Control: public, max-age=86400` tells the browser to cache instead.

## Resource footprint

| Resource ↕▾ | Usage ↕▾ |
|---|---|
| −Flash | ~3 KB for the CGI script, ~80 KB for the frontend bundle |
| −RAM at idle | 0 (uhttpd is already running for LuCI) |
| RAM per request | ~3 MB, freed when the CGI exits |
| CPU per request | ~10 ms fork+exec on MT7622 |
| Disk for cache | 0 (browser caches images) |
⚙

Measured against a base OpenWrt install using 100–150 MB of 256 MB. The CGI runs only during a request. No persistent process, no package installation beyond what OpenWrt already ships.

## Requirements

- OpenWrt 22.03 or later on the router
- `uhttpd` with CGI support (installed by default with LuCI)
- `uclient-fetch` (installed by default)
- A development machine with Node.js 18+ and npm for building the frontend

## Build

On your development machine:

```
npm install
npm run build
```

This produces `dist/index.html`, `dist/bundle.js`, and `dist/styles.css`.

## Install on the router

Copy the build output and the CGI script:

```
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

Verify the proxy works:

```
wget -O- 'http://localhost/cgi-bin/md/api/manga?limit=1'
```

You should get JSON. If you get a 404, `PATH_INFO` is not being passed to the CGI — see the troubleshooting section.

Open `http://192.168.1.1/mangadex-safe/` in a browser.

## Troubleshooting

**CGI returns 404 for every request.** uhttpd is not passing `PATH_INFO`. Check `/etc/config/uhttpd` for `option cgi_prefix '/cgi-bin'` and, if needed, `option path_info '1'`. Reload uhttpd after changes.

**`uclient-fetch` fails with "unknown option".** Different OpenWrt versions use different flags for User-Agent and timeout. Run `uclient-fetch --help` on the router and adjust `cgi/md` if the flags differ. The script uses `--user-agent` and `-T`; older builds may require `-U` and `-t`.

**Images return a broken file named `agg.jpg`.** MangaDex serves a placeholder image when a request lacks a valid `User-Agent` or carries a `Via` header. Confirm the CGI sets `User-Agent` and does not forward `Via`. The script already does both; if you edited it, check those lines.

**Rate limiting kicks in.** MangaDex enforces roughly 5 requests per second per IP. The CGI does not throttle locally; if the router's IP is shared, this can be hit by accident. Space out large loads, or add a token bucket to the CGI.

## Development

```
npm run dev
```

Rebuilds and reports the bundle size. There is no local server; the frontend is designed to be served by uhttpd from the router.

To test locally without a router, run any static server from `dist/` and set up a local CGI-compatible proxy at `/cgi-bin/md/*`. Most developers will find it faster to build and copy to the router.

## Project layout

```
.
├── cgi/md                  # The CGI proxy script (runs on the router)
├── src/
│   ├── index.html          # App shell, CSP meta tag
│   ├── styles.css          # All styles
│   ├── index.js            # Entry point
│   ├── app.js              # Top-level component and routing dispatch
│   ├── lib/
│   │   ├── api.js          # API client and URL builders
│   │   ├── db.js           # IndexedDB wrappers (favorites, reading position)
│   │   ├── html.js         # htm/preact binding
│   │   └── router.js       # History API router
│   └── components/
│       ├── Header.js
│       ├── Browse.js
│       ├── Detail.js
│       ├── Reader.js
│       └── Favorites.js
├── package.json
├── LICENSE
└── README.md
```

## Content filtering

Two ratings are allowed: `safe` and `suggestive`. The CGI strips any `contentRating[]` parameter the frontend might send, then appends `contentRating[]=safe` and `contentRating[]=suggestive` to every API request. The frontend does not send these parameters.

To add or remove ratings, edit the `url=` line in `cgi/md`:

```
url="${API}${path}?${clean}&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive"
```

MangaDex ratings are `safe`, `suggestive`, `erotica`, and `pornographic`. The `erotica` and `pornographic` ratings are never requested.

## What this does not do

- Log in
- Comment, rate, or upload
- Access `erotica` or `pornographic` content
- Filter other sites by itself (MangaDex proper stays reachable until you deploy `blocklist/`)
- Cache images on the router

## Security notes

- The CSP meta tag in `index.html` restricts scripts and connections to same-origin.
- The CGI validates that image paths begin with `/covers/` or `/data/`. Other paths return 403.
- The CGI does not forward client-supplied headers other than the request path. `Via` is not set.
- uhttpd runs the CGI as the configured CGI user (typically `nobody` on OpenWrt). The script does not require write access to any path.

## License

AGPL-3.0. See `LICENSE`.