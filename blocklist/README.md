# NSFW otaku-site blocklist

Supplementary blocklists for adblock-lean on OpenWrt. They cover NSFW sites that offer no network-enforceable way to filter, and that Hagezi NSFW does not already block. There are three sources:

- **everythingmoe:** sites listed on [everythingmoe.com](https://everythingmoe.com).
- **Extension repos:** source sites in the reader-app extension repos everythingmoe links to, which apps like Mihon, Aniyomi, Mangayomi and Hayase install sources from.
- **fmhy:** media, search, front-end and bypass hosts listed on [fmhy.net](https://fmhy.net), read from its source repo (`fmhy/edit`).

"NSFW" here includes ecchi. Anything sexualised is in scope, not just explicit content.

The rule: a site that hosts NSFW content and offers no network-enforceable filter (an API the router proxy can use, or a vendor-documented DNS endpoint) is blocked. Exemptions, none of them blocked:

- **`review`:** licensed or mainstream legal services (Netflix, Crunchyroll, MAL, pixiv…).
- **`general`:** general-purpose piracy, meaning torrent and DDL indexes, Netflix-style movie/TV streaming, and game, ebook and magazine downloads. These carry NSFW content incidentally (R-rated films, an XXX category); only torrent or streaming sites that are purely or mainly NSFW are blocked.
- **`library`:** public preservation libraries (LibGen, Anna's Archive, Z-Library, WeLib…).

Information sites (MAL, AniList, AniDB, VNDB, schedules, title lists) are not blocked: they describe titles rather than serve them. Catalogues whose content is hentai or fanservice imagery itself (doujinshi databases, e-hentai tag search, Absolute Territory) are.

Anime streaming sites are not blocked for ecchi. They are blocked only for hentai or explicit content: a Hentai, Erotica or Smut genre, or an extension maintainer's NSFW label (owner rule 2026-10-03). Manga, manhwa and novel aggregators stay under the original rule: ecchi or explicit content means blocked.

## Files

| File | What it holds | Deploy? |
|---|---|---|
| `sites.tsv` | Every everythingmoe site with its tier, the evidence for it, and all known domains and mirrors. Reviewed by hand. | Source of truth |
| `extensions.tsv` | Every source host from the extension repos, with the maintainer's NSFW label, the tier, the evidence and the extensions that use it | Source of truth |
| `fmhy.tsv` | Every in-scope fmhy host, with its fmhy group, the tier, the evidence and where fmhy lists it | Source of truth |
| `explicit.txt` | Hentai/porn/smut sites, sites with explicit genres (Hentai, Smut, Adult, Pornographic, R-18), adult stores, hentai reader apps, leak archives, mangadex.org | Yes |
| `ecchi.txt` | Unofficial manga/manhwa/novel aggregators with an Ecchi genre, and full-catalogue manga mirrors whose catalogues include ecchi titles | Yes |
| `bypass.txt` | Hosts that get around a filter the router already enforces: search engines without DNS safe-search enforcement, DuckDuckGo/Yandex domains your redirects miss, and Reddit/TikTok/4chan viewers and archives | Yes |
| `allowlist.txt` | `api.mangadex.org` and `uploads.mangadex.org`, so the router proxy keeps working after `mangadex.org` is blocked, and `forums.mangadex.org`, which is kept reachable on purpose | Yes, with `explicit.txt` |

Domains already covered by Hagezi NSFW are left out of the generated lists (marked `+` in `sites.tsv`). adblock-lean deduplicates across lists anyway.

Two more tiers in `sites.tsv` are reviewed but deliberately not blocked; the script tracks their domains and does not emit them:

- **`apps` (75 sites).** Landing and download pages for reader apps (Mihon, Aniyomi, Paperback…) and their extension repos. The apps are frontends, and they fetch from source sites that `explicit.txt` and `ecchi.txt` already block.
- **`review`.** Licensed and mainstream services (Crunchyroll, Netflix, MANGA Plus, Webtoon, pixiv…) and databases (MAL, AniList…). They carry some ecchi or mature content behind per-account controls; blocking them outright is out of proportion.
- **`general`.** General-purpose piracy: torrent/DDL indexes, Netflix-style streaming, game/ebook/magazine downloads. The evidence column keeps what was found ("Was: …") in case the rule changes.
- **`library`.** Public preservation libraries. Never blocked.
- **`unverified`.** Sites where no NSFW evidence was found. Recheck these on the next audit.

The `clean` tier holds 232 sites with nothing to block: trackers, schedules, music, quizzes, tools, subtitle sites and similar.

## Deploy

From the repository root. The examples use `192.168.1.1`, OpenWrt's default address.

```
cat blocklist/explicit.txt blocklist/ecchi.txt blocklist/bypass.txt | grep -vE '^[[:space:]]*(#|$)' | sort -u \
  | ssh root@192.168.1.1 'cat > /tmp/safe-otaku.txt'
grep -vE '^[[:space:]]*(#|$)' blocklist/allowlist.txt | ssh root@192.168.1.1 'cat > /tmp/safe-otaku-allow.txt'
ssh root@192.168.1.1 '
  BL=/etc/adblock-lean/blocklist; AL=/etc/adblock-lean/allowlist
  touch $BL $AL; cp $BL $BL.bak; cp $AL $AL.bak
  strip() { awk "/^# >>> safe-otaku/{s=1} !s{print} /^# <<< safe-otaku/{s=0}" "$1"; }
  strip $BL > /tmp/bl.user
  grep -vE "^[[:space:]]*(#|\$)" /tmp/bl.user | sort -u > /tmp/bl.mine
  { cat /tmp/bl.user; echo "# >>> safe-otaku"; grep -vxF -f /tmp/bl.mine /tmp/safe-otaku.txt; echo "# <<< safe-otaku"; } > $BL
  { strip $AL; echo "# >>> safe-otaku"; cat /tmp/safe-otaku-allow.txt; echo "# <<< safe-otaku"; } > /tmp/al && mv /tmp/al $AL
  rm -f /tmp/bl.user /tmp/bl.mine /tmp/safe-otaku.txt /tmp/safe-otaku-allow.txt
  service adblock-lean start
'
```

`/etc/adblock-lean/blocklist` and `/etc/adblock-lean/allowlist` are adblock-lean's default `local_blocklist_path` and `local_allowlist_path`. Your own entries stay at the top of each file. Ours go between `# >>> safe-otaku` and `# <<< safe-otaku` markers, minus anything you already list, and re-running replaces only that section. The previous files are kept as `.bak`. adblock-lean tests the new list (DNS resolution of its `test_domains`) before installing it.

Verify from a LAN client:

```
dig @192.168.1.1 mangadex.org +short   # no address
dig @192.168.1.1 api.mangadex.org      # resolves (allowlist)
dig @192.168.1.1 forums.mangadex.org   # resolves (allowlist)
dig @192.168.1.1 sukebei.nyaa.si       # NXDOMAIN
dig @192.168.1.1 noai.duckduckgo.com   # NXDOMAIN (bypass.txt)
```

`mangadex.org` itself may come back as NOERROR with an empty answer instead of NXDOMAIN: dnsmasq answers that way for a blocked domain once several of its subdomains are allowlisted. Either way no address is returned, so nothing can connect.

Cost: about 1,275 extra domains on top of Hagezi's 84k (950 explicit, 274 ecchi, 51 bypass). That is under 2% more dnsmasq entries and about 20 KB.

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
- **VPNs, proxies, DoH and Tor.** None of these are in these lists. See Router recommendations.
- **Torrent swarms.** Blocking an index does not stop a client that already has a magnet link (see Torrent and download sites).
- **Mainstream platforms.** X/Twitter, Tumblr, Instagram, Discord, Telegram, Imgur and YouTube carry NSFW content and are not in these lists. Their viewers are in `review`; whether to block a platform is a per-household decision.

## Torrent and download sites

Torrent indexes, DDL sites and Usenet indexers are `general` and not blocked, even when they have an XXX or Hentai category (The Pirate Bay, 1337x, Torlock, Knaben, nyaa.si, AnimeTosho…). Only trackers that are purely or mainly NSFW are blocked: `sukebei.nyaa.si`, Erogevn, Sakura Circle, and hentai-only sources from the extension repos (Hentai Torrent, PTorrent…).

DNS only reaches the index anyway. A torrent client fetching a magnet link it already has does not resolve the index at all: it finds peers through DHT and peer exchange, by IP.

## fmhy

fmhy is a general piracy index: 28,603 links to about 16,000 hosts. Most of it (software, tools, education) is out of scope. The audit reads only these groups, plus any link fmhy itself annotates "NSFW" or "Some NSFW":

| Group | fmhy sections | How hosts are tiered |
|---|---|---|
| anime, manga | Anime Streaming/Downloading/Torrenting, Manga | Verified labels; otherwise inferred `ecchi` (full catalogue), same as everythingmoe |
| video | movie/TV streaming, drama, download and torrent sites, live TV, archives | `general` for movie/TV/drama piracy; `review` for legal Free w/ Ads / public-domain / archive services; anime-specific sites follow the anime rule |
| reading | manga, comics, novels, fanfiction, ebooks, magazines | Manga/manhwa/novel aggregators: verified labels or fmhy annotation → blocked. Ebook/magazine/audiobook piracy → `general`. Libraries → `library`. Fiction platforms: verified labels or a direct test (Archive of Our Own) |
| download, torrent, games | download sites, indexers, torrent sites, repacks/ROMs | `general` |
| images, ai | galleries, wallpapers, roleplay chatbots, image/video generators | fmhy's own "NSFW"/"Some NSFW" annotation or verified labels |
| search | search engines, SearXNG instances | `bypass` if it returns third-party results without vendor-documented DNS enforcement; `clean` for link hubs and redirectors |
| frontend | YouTube/Reddit/X/Instagram/Tumblr/TikTok viewers | `bypass` when the platform is blocked in the target setup (Reddit, TikTok, 4chan; see Assumptions); `review` otherwise |
| bypass | VPNs, proxies, DNS resolvers | `review`: use Hagezi's DoH/VPN/TOR/Proxy bypass list instead (see Router recommendations) |

Results (audit 2026-10-01, re-tiered 2026-10-03 for the general-piracy, library and anime-streaming exemptions): 3,034 in-scope hosts.

| Tier | Hosts | Notes |
|---|---|---|
| `explicit` | 33 | fmhy's NSFW annotations (AI roleplay/image sites, NSFW webcomic and manga sources), manga/novel aggregators with explicit genres, anime sites with hentai, Archive of Our Own |
| `ecchi` | 19 | manga sources with an Ecchi genre or a full catalogue |
| `bypass` | 51 | search engines without DNS enforcement, DuckDuckGo/Yandex gaps, Reddit/TikTok/4chan viewers and archives |
| `general` | 351 | movie/TV piracy, torrent/DDL indexes, game/ebook/magazine downloads; not blocked |
| `library` | 10 | LibGen, WeLib, Z-Library mirrors; not blocked |
| `review` | 308 | legal free streaming and archives, licensed publishers, X/Instagram/Tumblr/YouTube viewers, VPN/proxy/DNS services |
| `covered` | 358 | already decided in `sites.tsv`/`extensions.tsv`, or already in Hagezi NSFW |
| `clean` | 39 | tools, wikis, subtitle sites, release indexes |
| `unverified` | 1,858 | no evidence found, behind Cloudflare, or unreachable; not blocked |
| `unreviewed` | 7 | new on fmhy since the first audit; not blocked until checked |

Evidence checks were tightened after false positives:

- A genre/tag URL only counts if a made-up name at the same path does not also produce a matching page. WordPress `/tag/` pages echo any word: 5 fmhy sites lost tag evidence this way, and 9 extension-repo sites lost genre evidence earlier.
- A lone generic word ("adult" as in adult medicine or Adult Swim) on a legal or educational site was overridden by hand. Each override is noted in the evidence column.

`unverified` is large because most of fmhy's reading, image, game and AI links show no NSFW labels in their HTML. They are not blocked. The audit marks them for recheck rather than guessing.

## Assumptions

`bypass.txt` only makes sense alongside filters the router already enforces. The current list assumes:

- **DNS safe-search redirects** for Google (`forcesafesearch.google.com`), Bing (`strict.bing.com`), DuckDuckGo (`safe.duckduckgo.com`), Brave Search, Startpage and Yandex (`yandex.com`/`yandex.ru` to the family-search IP). adblock-lean's `hagezi:nosafesearch` list blocks engines that offer no such redirect.
- **Reddit, TikTok and 4chan blocked outright.** Their viewers, archives and downloaders are in `bypass.txt`.
- **DoH and DoT blocked, and port 53 redirected to the router**, so clients cannot use their own resolver.

If your setup differs, review the `bypass` rows in `fmhy.tsv` before deploying `bypass.txt`.

## Router recommendations

These came up during the audits. They are router settings, not list entries.

- **Hagezi's DoH/VPN/TOR/Proxy bypass list** (`hagezi:doh-vpn-proxy-bypass` in adblock-lean's `raw_block_lists`). Without it, a VPN app or web proxy gets around every DNS block. If the router itself runs a VPN client, check that its endpoint is an IP address, not a hostname: the list blocks VPN providers' domains (e.g. `protonvpn.com/.net/.ch`), so a hostname endpoint would stop resolving. Policy-based routing by IP range or by unrelated domains is unaffected.
- **YouTube Restricted Mode.** Google documents the DNS method: point `www.youtube.com`, `m.youtube.com`, `youtubei.googleapis.com`, `youtube.googleapis.com` and `www.youtube-nocookie.com` at `restrict.youtube.com` (strict) or `restrictmoderate.youtube.com`. Once that's on, YouTube front-ends (Invidious, Piped, FreeTube…) become bypasses and belong in `bypass`.
- **Safe-search redirects usually miss some hostnames.** These resolve to the normal servers unless redirected or blocked, and `bypass.txt` blocks them:
  - `html.duckduckgo.com`, `lite.duckduckgo.com` and `noai.duckduckgo.com`. DuckDuckGo's safe IP refuses `noai`, so it cannot be redirected, only blocked.
  - `www.yandex.com` and `ya.ru`, alongside the commonly redirected `yandex.com` and `yandex.ru`.

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

The audit adds new hosts automatically: NSFW and MIXED as `explicit`, SAFE as `unreviewed` (not emitted). It prints new MIXED hosts so licensed services can be moved to `review`. Aniyomi maintainers also flag some general movie/TV sources as NSFW; move those to `general` when they show up.

## Maintain

```
npm run blocklist:audit   # re-fetch everythingmoe, the extension repos, fmhy and Hagezi; add new domains; rebuild
npm run blocklist:build   # rebuild the .txt files after editing a TSV
```

The audit adds new domains for sites already in a blocking tier. It adds newly listed sites and hosts as `unreviewed`, and those are not emitted until you give them a tier. The exceptions: new hosts that an extension maintainer labels NSFW/MIXED, or that fmhy annotates NSFW, go straight to `explicit`, because that label is the evidence. The audit never removes anything. A site dropped from a source stays blocked, because dead mirrors come back.

The audit does not probe sites for evidence; that is a manual step. Promote `unreviewed` rows by hand after checking them.
