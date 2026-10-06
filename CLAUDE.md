# CLAUDE.md

Read `AGENT.md` first. It has the hard constraints (router hardware, uhttpd CGI, dependency and bundle budgets), the rules for changes and the test list. The project follows the policies in `docs/policies/`.

Notes for sessions:

- **Content ratings (MangaDex).** The project's line is that ecchi is not acceptable, but MangaDex has no Ecchi tag: ecchi titles are rated `suggestive` or `erotica` at the uploader's discretion, and `suggestive` also covers mainstream titles like One Piece and Jujutsu Kaisen. The CGI allows `safe` + `suggestive`. Changing the ratings or the excluded tags in `cgi/md` is the maintainer's decision.
- **CGI testing.** `npm run dev` runs `cgi/md` under BusyBox ash locally, which is good for development, but only a router counts as verification (see AGENT.md, Testing). Don't claim a CGI change works on a router without it being tested there.
- **Blocklist workflow.** Edit tiers in `blocklist/sites.tsv`, `blocklist/extensions.tsv` or `blocklist/fmhy.tsv`, then `npm run blocklist:build`. `npm run blocklist:audit` fetches external sites, so run it only when asked.
- **Personal setup.** Anything about a specific router or network lives in the gitignored `local/`, never in tracked files. If it exists, it is imported below.

@local/NOTES.md
