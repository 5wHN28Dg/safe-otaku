# NSFW otaku-site blocklist

Supplementary blocklists for adblock-lean on OpenWrt. They cover NSFW sites that offer no network-enforceable way to filter, and that Hagezi NSFW does not already block. There are two sources:

- **everythingmoe:** sites listed on [everythingmoe.com](https://everythingmoe.com).
- **Extension repos:** source sites in the reader-app extension repos everythingmoe links to, which apps like Mihon, Aniyomi, Mangayomi and Hayase install sources from.

"NSFW" here includes ecchi. Anything sexualised is in scope, not just explicit content.

## Files

| File | What it holds | Deploy? |
|---|---|---|
| `sites.tsv` | Every everythingmoe site with its tier, the evidence for it, and all known domains and mirrors. Reviewed by hand. | Source of truth |
| `extensions.tsv` | Every source host from the extension repos, with the maintainer's NSFW label, the tier, the evidence and the extensions that use it | Source of truth |
| `explicit.txt` | Hentai/porn/smut sites, sites with explicit genres (Hentai, Smut, Adult, Pornographic, R-18), adult stores, hentai reader apps, leak archives, mangadex.org | Yes |
| `ecchi.txt` | Unofficial aggregators with an Ecchi genre, plus full-catalogue anime/manga/novel mirrors whose catalogues include ecchi titles | Yes |
| `allowlist.txt` | `api.mangadex.org` and `uploads.mangadex.org`, so the router proxy keeps working after `mangadex.org` is blocked | Yes, with `explicit.txt` |

Domains already covered by Hagezi NSFW are left out of the generated lists (marked `+` in `sites.tsv`). adblock-lean deduplicates across lists anyway.

Two more tiers in `sites.tsv` are reviewed but deliberately not blocked; the script tracks their domains and does not emit them:

- **`apps` (75 sites).** Landing and download pages for reader apps (Mihon, Aniyomi, Paperback…) and their extension repos. The apps are frontends, and they fetch from source sites that `explicit.txt` and `ecchi.txt` already block.
- **`review` (109 sites).** Licensed and mainstream services (Crunchyroll, Netflix, MANGA Plus, Webtoon, pixiv…), databases (MAL, AniList…) and general film/drama piracy. They carry some ecchi or mature content behind per-account controls; blocking them outright is out of proportion.

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

Cost: about 1,460 extra domains on top of Hagezi's 84k. That is under 2% more dnsmasq entries and about 22 KB.

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
- **Extension repos not in `REPOS`.** The audit covers the 15 repo indexes linked from everythingmoe's app guides (Keiyoushi, Aniyomi forks, Mangayomi, Hayase). A repo added by URL inside an app is not covered until it is added to `REPOS` in `scripts/blocklist.mjs`.
- **Sources addressed by IP or set at runtime.** About ten extensions use raw IP addresses and some leave `baseUrl` empty and pick the domain at runtime. DNS cannot block an IP, and an empty URL leaves nothing to list.
- **Kaguya modules.** Its index lists module names without URLs, so it cannot be audited this way.
- **New mirrors.** They appear constantly. Re-run the audit.
- **VPNs, and IP-literal or Tor access.** Your router already blocks DoH/DoT; a VPN is a firewall question, not a DNS one.

## Extension repos

Reader apps are frontends; what they can reach is decided by the sources in their extension repos. Each repo maintainer labels its sources:

- **Keiyoushi:** `CONTENT_WARNING_SAFE`, `MIXED` ("a mix of SFW and NSFW entries") or `NSFW`.
- **Aniyomi forks and Mangayomi:** an `nsfw` / `isNsfw` flag.
- **Hayase:** separate index files, one of them `hentai`.

The labels decide the tier in `extensions.tsv`:

| Maintainer label | Tier | Why |
|---|---|---|
| NSFW | `explicit` | The maintainer's own label is the evidence. |
| MIXED | `explicit`, or `review` for 43 licensed services (Japanese publishers, LINE Manga, Piccoma, Tencent, U-NEXT, DeviantArt…) | Same line as `sites.tsv`: licensed/mainstream services are not blocked. Adult-focused stores (DMM/FANZA, Comic Festa, Manga Kingdom, Toptoon, Honeytoon) stay `explicit`. |
| SAFE | `explicit` or `ecchi` only with verified labels; otherwise `safe` (not blocked) | Keiyoushi's SAFE means "no NSFW entries", which may still include ecchi, so these were checked the same way as everythingmoe sites. A genre URL only counted if a made-up genre at the same path did not also match; 9 sites echo any path into the title and lost that evidence. Three more matches were overridden by hand (noted in the evidence column). |
| any | `covered` | The host is already classified in `sites.tsv`, and that decision stands. |

Results from the first audit (2026-10-01): 2,073 hosts from 2,221 extensions. 804 are `explicit` and 61 `ecchi`; 668 of those were reachable before this list, the rest were already in Hagezi. 883 SAFE-labelled hosts showed no evidence or could not be checked (Cloudflare challenge, unreachable) and are not blocked.

The audit adds new hosts automatically: NSFW and MIXED as `explicit`, SAFE as `unreviewed` (not emitted). It prints new MIXED hosts so licensed services can be moved to `review`.

## Maintain

```
npm run blocklist:audit   # re-fetch everythingmoe, the extension repos and Hagezi, add new domains, rebuild
npm run blocklist:build   # rebuild the .txt files after editing sites.tsv
```

The audit adds new domains for sites already in a blocking tier. It adds newly listed sites as `unreviewed`, and those are not emitted until you give them a tier. It never removes anything. A site dropped from everythingmoe stays blocked, because dead mirrors come back.
