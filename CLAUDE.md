# CLAUDE.md

Read `AGENT.md` first. It has the hard constraints (router hardware, uhttpd CGI, dependency and bundle budgets) and the rules for changes. The project also follows `platform engineering policy.md` and `Evidence-first web engineering.md`.

Operational notes for sessions:

- **DNS on this machine is the router's.** The dev machine resolves through the OpenWrt router (192.168.1.1). The router hijacks port 53 and blocks DoH/DoT. `dig @192.168.1.1 <domain>` shows what LAN clients can reach; NXDOMAIN means blocked or dead, and you can't tell which from here. Do not try to get around the filter to get public DNS answers.
- **Content ratings (MangaDex).** Ecchi is not acceptable to the owner. MangaDex has no Ecchi tag; ecchi titles are rated `suggestive` or `erotica` at the uploader's discretion, and `suggestive` also covers mainstream titles like One Piece and Jujutsu Kaisen. On 2026-10-01 the owner chose to keep `safe` + `suggestive`. Any change to the ratings in `cgi/md` is the owner's decision.
- **CGI testing.** `npm run dev` runs `cgi/md` under BusyBox ash locally, which is good for development, but only the router counts as verification (see AGENT.md, Testing). Don't claim a CGI change works on the router without the owner testing it there.
- **Blocklist workflow.** Edit tiers in `blocklist/sites.tsv` or `blocklist/extensions.tsv`, then `npm run blocklist:build`. Use `npm run blocklist:audit` to pick up new everythingmoe entries and mirrors. It fetches external sites, so run it only when asked.
