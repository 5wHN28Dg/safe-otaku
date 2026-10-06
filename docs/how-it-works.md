# How the MangaDex app works

## Architecture

```
[Browser] --> uhttpd :80 (the router's existing web server)
              |
              +--> /mangadex-safe/*      static files from flash
              +--> /cgi-bin/md/api/*     CGI -> api.mangadex.org      (allowlisted endpoints only)
              +--> /cgi-bin/md/img/*     CGI -> uploads.mangadex.org  (covers and chapter pages only)
```

Everything is same-origin from the browser's point of view, so no CORS headers are needed. The CGI (`cgi/md`) is one BusyBox shell script, run per request. Routes use the URL hash (`/mangadex-safe/#/manga/<id>`), because uhttpd serves files only and cannot fall back to `index.html` for a deep link.

Nothing is cached on the router. Covers and pages are content-addressed, so the CGI sends `Cache-Control: public, max-age=31536000, immutable` and the browser keeps them.

## Why a proxy is required

MangaDex does not send CORS headers to third-party origins. Its API documentation states:

> We do not send CORS responses for other websites than ours; MUST proxy the requests your users make to our services, and inject your own CORS responses and headers where relevant. We will serve the wrong response for any image hotlinked from our domains; you MUST proxy the requests your users make to our services.

A browser-based frontend cannot call `api.mangadex.org` or load images from `uploads.mangadex.org` directly. The proxy is not optional, and it is also where the content filter is enforced.

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

### Excluded tags

Titles tagged **Boys' Love** or **Girls' Love** are filtered out the same way, by the CGI, not the frontend. It appends `excludedTags[]=<id>&excludedTagsMode=OR` to every search and to the single-title lookup, so those titles never appear and cannot be opened by ID. The chapter check before `/at-home/server/<id>` asks for the chapter's manga (`includes[]=manga`) in the same request and refuses the chapter if either tag is present. A client cannot loosen this: `includedTags[]`, `excludedTags[]` and `excludedTagsMode` are not on the forwarded-keys allowlist.

To change the list, edit `TAG_BL`/`TAG_GL` and `EXCLUDED` near the top of `cgi/md`. Tag ids come from `GET https://api.mangadex.org/manga/tag`. Tags are set by uploaders and the community, so a title missing a tag is not caught.

### Known residual

Someone who already has a cover file name or a chapter image hash from outside this app can fetch that one image through `/img/`. The app itself never hands out names or hashes for titles outside the allowed ratings and tags. A LAN client that talks to `api.mangadex.org` directly (it stays resolvable for the proxy) bypasses the app entirely; that takes deliberate effort.

## Licensed series

MangaDex has taken down most officially licensed English translations. For those series (Jujutsu Kaisen, Frieren, SPY×FAMILY, Naruto, Solo Leveling…) it keeps only "external" chapters: links to the publisher's site. The app lists them as "Official site: … ↗" links that open in a new tab with no referrer, and the reader's previous/next skip them. Fan-translated and less mainstream series are mostly hosted and readable in the app. Of the 80 most-followed titles within the allowed ratings on 2026-10-06, 62 had hosted English chapters.

## What the app does not do

- Log in, comment, rate, or upload. It is read-only by design.
- Show `erotica` or `pornographic` titles, or titles with an excluded tag.
- Filter other sites. `mangadex.org` itself stays reachable until you block it at the DNS level; the [blocklists](../blocklist/README.md) do that.
- Cache images on the router.

## Security notes

- uhttpd on OpenWrt runs as root, and so do its CGI scripts. Treat `cgi/md` as root-run code: it validates every path segment, forwards only allowlisted endpoints and keys, and passes the URL to `uclient-fetch` as a single quoted argument.
- The CGI accepts only `GET`.
- The CGI does not forward client-supplied headers. `Via` is not set.
- The CSP meta tag in `index.html` restricts scripts, styles, images and connections to same-origin. `frame-ancestors` is left out: browsers ignore it in a meta tag, and uhttpd cannot add response headers to static files.

## Resource footprint

| Resource | Usage |
|---|---|
| Flash | about 4 KB for the CGI script; about 32 KB for the frontend, under 12 KB gzipped (`npm run size`) |
| RAM at idle | 0 (uhttpd is already running for LuCI) |
| RAM per request | one short-lived `sh` plus `uclient-fetch`; reading a chapter with six pages loading at once showed no drop in available memory on a 256 MB router |
| Processes per request | one `exec`; opening a chapter adds one rating/tag check fetch |
| Disk for cache | 0 (the browser caches images) |
