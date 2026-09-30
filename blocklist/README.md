# NSFW otaku-site blocklist

Supplementary blocklists for adblock-lean on OpenWrt. They cover sites listed on [everythingmoe.com](https://everythingmoe.com) that host NSFW content, offer no network-enforceable way to filter it, and are not already blocked by Hagezi NSFW.

"NSFW" here includes ecchi. Anything sexualised is in scope, not just explicit content.

## Files

| File | What it holds | Deploy? |
|---|---|---|
| `sites.tsv` | Every everythingmoe site with its tier, the evidence for it, and all known domains and mirrors. Reviewed by hand; the other files are generated from it. | Source of truth |
| `explicit.txt` | Hentai/porn/smut sites, sites with explicit genres (Hentai, Smut, Adult, Pornographic, R-18), adult stores, hentai reader apps, leak archives, mangadex.org | Yes |
| `ecchi.txt` | Unofficial aggregators with an Ecchi genre, plus full-catalogue anime/manga/novel mirrors whose catalogues include ecchi titles | Yes |
| `apps.txt` | Landing and download sites for reader apps (Mihon, Aniyomi, Paperback…) and the extension repos they install sources from | Your call |
| `review.txt` | Licensed/mainstream services (Crunchyroll, Netflix, MANGA Plus, Webtoon, pixiv…), databases (MAL, AniList…) and general film/drama piracy. They carry ecchi or mature content, and the only controls are per-account. | Your call |
| `allowlist.txt` | `api.mangadex.org` and `uploads.mangadex.org`, so the router proxy keeps working after `mangadex.org` is blocked | Yes, with `explicit.txt` |

Domains already covered by Hagezi NSFW are left out of the generated lists (marked `+` in `sites.tsv`). adblock-lean deduplicates across lists anyway.

The `clean` tier holds 232 sites with nothing to block: trackers, schedules, music, quizzes, tools, subtitle sites and similar.

## Deploy

```
scp blocklist/explicit.txt blocklist/ecchi.txt blocklist/allowlist.txt root@192.168.1.1:/tmp/
ssh root@192.168.1.1 '
  cat /tmp/explicit.txt /tmp/ecchi.txt >> /etc/adblock-lean/blocklist
  cat /tmp/allowlist.txt >> /etc/adblock-lean/allowlist
  service adblock-lean start
'
```

`/etc/adblock-lean/blocklist` and `/etc/adblock-lean/allowlist` are adblock-lean's default `local_blocklist_path` and `local_allowlist_path`. If you already keep your own entries there, merge rather than append blindly: re-running the command appends duplicates. adblock-lean deduplicates them, but the file grows.

Verify from a LAN client:

```
dig @192.168.1.1 mangadex.org          # NXDOMAIN
dig @192.168.1.1 api.mangadex.org      # resolves
dig @192.168.1.1 sukebei.nyaa.si       # NXDOMAIN
```

Cost: roughly 800 extra domains on top of Hagezi's 84k. That is under 1% more dnsmasq entries and under 20 KB.

## Safe endpoints

Every NSFW site on the list was checked for an official filtered endpoint that can be enforced from the network.

**Danbooru is the only one.** `safebooru.donmai.us` returns only rating `g` posts. Queries for `rating:s`, `rating:q` and `rating:e` return nothing, and fetching a non-`g` post directly by ID returns metadata with no `file_url`. The filter is enforced by the server, not by a client setting. `danbooru.donmai.us` is already blocked by Hagezi. `safebooru.donmai.us` and `cdn.donmai.us` are kept resolvable, and the build script refuses to emit them.

**No site needs a CNAME rewrite.** A CNAME only enforces anything when the vendor built the target to serve the original hostname and apply the filter by IP, as Google (`forcesafesearch.google.com`) and YouTube (`restrict.youtube.com`) do. None of these sites do that. Pointing `danbooru.donmai.us` at `safebooru.donmai.us` would change nothing: same Cloudflare IPs, same Host header, full site.

**Checked and rejected:**
- **`safebooru.org`:** returns 100 `rating:questionable` posts on request.
- **`konachan.net`:** blocks `q`/`e`, but its `s` rating still returns cleavage-tagged posts.
- **`safe.gsbooru.org`:** unreachable, so it can't be verified.

**MangaDex** already has its safe path: the router proxy in `cgi/md`. Blocking `mangadex.org` is what makes the proxy the only way in.

## How sites were classified

1. **Inventory.** The full site list was pulled from everythingmoe: the server-rendered page with the `nsfw=true` cookie (the hentai sections only render with it), `/data/lowsec/<section>.json` for low-ranked entries, and `/data/cache/main.json` for each site's alternate domains, former domains and CDN domains. Result: 918 sites and about 1,450 domains.
2. **Current coverage.** Each domain was checked against Hagezi NSFW and resolved through the router. The router hijacks port 53 and blocks DoH/DoT, so its answers are ground truth for what LAN clients can reach today.
3. **Content evidence.** For every live domain:
   - the homepage was scanned for genre and category labels (Hentai, Smut, Adult, Pornographic, Erotica, R-18, Ecchi, Mature);
   - for JavaScript-rendered sites that showed nothing, common genre URLs (`/genre/ecchi`, `/genres/hentai`, `/tag/ecchi`…) were requested and a match in the page title counted as evidence.
4. **Tier.** The `evidence` column in `sites.tsv` records which rule applied:
   - `everythingmoe NSFW tag` or `listed in hentai section`: explicit.
   - `verified labels: …`: explicit or ecchi, depending on which labels were found.
   - `inferred: catalogue includes ecchi titles`: unofficial full-catalogue sources where nothing could be fetched (Cloudflare challenge, JavaScript-only). The pages checked across the same kinds of site (HiAnime clones, manga scrapers) all had Ecchi genres.
   - Specific notes, e.g. `verified: API returns rating:questionable posts`.

Inferred entries are the least certain. Move a site to `clean` in `sites.tsv` and rebuild if you find one that is wrong.

## Limits

DNS blocking stops a browser from reaching a hostname. It does not stop:

- **`api.mangadex.org` and `uploads.mangadex.org`.** They stay resolvable for the proxy, so a LAN client that talks to the JSON API directly, or has a direct image URL, reaches unfiltered content. Doing that takes deliberate effort; clicking a link won't do it.
- **Links straight to `cdn.donmai.us`.** Explicit Danbooru images are served from the same CDN as safebooru; you need the file's hash to reach one.
- **Reader-app extensions hosted on `raw.githubusercontent.com`.** Blocking that host would break GitHub. `apps.txt` only blocks repos on their own hostnames (e.g. `keiyoushi.github.io`). The sources those extensions fetch from are covered by `explicit.txt` and `ecchi.txt`.
- **New mirrors.** They appear constantly. Re-run the audit.
- **VPNs, and IP-literal or Tor access.** Your router already blocks DoH/DoT; a VPN is a firewall question, not a DNS one.

## Maintain

```
npm run blocklist:audit   # re-scrape everythingmoe + Hagezi, add new domains, rebuild
npm run blocklist:build   # rebuild the .txt files after editing sites.tsv
```

The audit adds new domains for sites already in a blocking tier. It adds newly listed sites as `unreviewed`, and those are not emitted until you give them a tier. It never removes anything. A site dropped from everythingmoe stays blocked, because dead mirrors come back.
