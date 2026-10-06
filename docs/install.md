# Installing on an OpenWrt router

The examples use `192.168.1.1`, OpenWrt's default LAN address. Replace it with yours.

## Requirements

- OpenWrt 22.03 or later (checked against 25.12.5; see [AGENT.md](../AGENT.md))
- `uhttpd` with CGI support (installed with LuCI)
- `uclient-fetch` (installed by default)
- A development machine with Node.js 18+ and npm, to build the frontend

## 1. Build

```
npm install
npm run build
npm run size
```

This produces `dist/index.html`, `dist/bundle.js` and `dist/styles.css`, and reports their gzipped sizes.

## 2. Copy the app to the router

```
ssh root@192.168.1.1 'mkdir -p /www/mangadex-safe'
tar -C dist -cf - index.html bundle.js styles.css | ssh root@192.168.1.1 'tar -C /www/mangadex-safe -xf -'
ssh root@192.168.1.1 'cat > /www/cgi-bin/md && chmod 755 /www/cgi-bin/md' < cgi/md
```

These use `tar` and `cat` over `ssh` because OpenWrt's dropbear has no SFTP server, and OpenSSH 9+ `scp` uses SFTP by default. `scp -O` (legacy protocol) works too.

Confirm CGI is enabled in `/etc/config/uhttpd` (`option cgi_prefix '/cgi-bin'`). If it is missing, add it and run `/etc/init.d/uhttpd reload`.

## 3. Verify

On the router:

```
wget -O- 'http://localhost/cgi-bin/md/api/manga?limit=1'       # JSON with a data array
wget -O- 'http://localhost/cgi-bin/md/api/manga/random'        # HTTP error 403
```

Then open `http://192.168.1.1/mangadex-safe/` in a browser. [AGENT.md](../AGENT.md#testing) has the full test list.

## 4. Block the real site

Until `mangadex.org` is blocked at the DNS level, anyone on the network can open the real site with every content rating. The [blocklists](../blocklist/README.md) block it while keeping the two hosts the proxy needs (`api.mangadex.org`, `uploads.mangadex.org`) reachable, along with other NSFW anime/manga sites.

## Optional: a short name

To make `http://manga.lan` open the app:

```
uci add dhcp domain
uci set dhcp.@domain[-1].name='manga.lan'
uci set dhcp.@domain[-1].ip='192.168.1.1'
uci commit dhcp && /etc/init.d/dnsmasq reload
sed -i 's|<head>|<head>\n\t\t<script>/* safe-otaku: manga.lan opens the MangaDex safe app */ if (location.hostname === "manga.lan") location.replace("/mangadex-safe/");</script>|' /www/index.html
```

`/www/index.html` belongs to `luci-base`, and a LuCI upgrade overwrites it. Re-run the `sed` line after upgrading, or use `http://manga.lan/mangadex-safe/` directly. `192.168.1.1` keeps going to LuCI either way.

Firefox-based browsers treat `manga.lan` as a search query, because `.lan` is not on the public suffix list. Type `manga.lan/` or `http://manga.lan`, bookmark it, or set `browser.fixup.domainsuffixwhitelist.lan` to `true` in `about:config`. A name under `home.arpa` (for example `manga.home.arpa`) avoids this in every browser.

## Troubleshooting

**CGI returns 403 for every request.** uhttpd is not passing `PATH_INFO`, so no route matches. Check `/etc/config/uhttpd` for `option cgi_prefix '/cgi-bin'` and reload uhttpd after changes.

**`uclient-fetch` fails with "unknown option".** Different OpenWrt versions use different flags for User-Agent and timeout. Run `uclient-fetch --help` on the router and adjust `cgi/md` if the flags differ. The script uses `--user-agent` and `-T`; older builds may require `-U` and `-t`.

**Images return a broken file named `agg.jpg`.** MangaDex serves a placeholder image when a request lacks a valid `User-Agent` or carries a `Via` header. The script sets the first and never forwards the second; if you edited it, check those lines.

**Pages load slowly, a few at a time.** OpenWrt's stock uhttpd config has `option max_requests 3`, so at most three CGI requests run at once and the rest queue (LuCI shares the same slots). Raising it to 6 lets more pages load in parallel. Check `free` while reading before and after changing it.

**Refused requests show an error instead of "Not available".** uhttpd only honours a CGI `Status:` header written as code plus message (`Status: 403 Forbidden`). A bare `Status: 403` is ignored and the response goes out as 200. `cgi/md` sends the full form; keep it that way if you edit it.

**Rate limiting kicks in.** MangaDex enforces roughly 5 requests per second per IP. The CGI does not throttle locally; if the router's IP is shared, this can be hit by accident. Space out large loads.
