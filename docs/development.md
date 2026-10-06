# Development

Read [AGENT.md](../AGENT.md) before changing anything. It has the hard constraints (router hardware, uhttpd CGI, dependency and bundle budgets), the rules for changes and the test list.

## Commands

```
npm install
npm run build             # dist/index.html, dist/bundle.js, dist/styles.css
npm run size              # gzipped sizes; the target is under 30 KB total
npm run dev               # build, then serve with a local stand-in for the router
npm run blocklist:build   # rebuild blocklist/*.txt after editing a TSV
npm run blocklist:audit   # re-fetch the blocklist sources (network), then build
```

`npm run dev` serves the app at `http://127.0.0.1:8080/mangadex-safe/`. Static files come from `dist/`, and `/cgi-bin/md/*` runs the real `cgi/md` under BusyBox ash, with `uclient-fetch` swapped for a curl wrapper. It needs `busybox` and `curl` on the development machine. It is close to the router, not identical (uhttpd's `Status:` header handling, for one), so CGI changes still need testing on a router.

## Project layout

```
.
├── README.md
├── AGENT.md                  # constraints, rules for changes, testing (read first)
├── CLAUDE.md                 # notes for Claude Code sessions
├── LICENSE                   # AGPL-3.0-or-later
├── cgi/md                    # the CGI proxy (runs on the router)
├── src/
│   ├── index.html            # app shell, CSP meta tag
│   ├── styles.css            # all styles (true-black theme)
│   ├── index.jsx             # entry point
│   ├── app.jsx               # top-level component and routing dispatch
│   ├── lib/
│   │   ├── api.js            # API client and URL builders
│   │   ├── db.js             # IndexedDB (favorites, reading position)
│   │   └── router.js         # hash router
│   └── components/           # Header, Browse, Detail, Reader, Favorites (.jsx)
├── blocklist/                # adblock-lean lists and their reviewed sources
├── scripts/
│   ├── copy-static.js        # build helper
│   ├── dev-server.mjs        # local stand-in for uhttpd + CGI
│   └── blocklist.mjs         # blocklist audit and build
├── docs/
│   ├── install.md
│   ├── how-it-works.md
│   ├── development.md
│   └── policies/             # the engineering policies this project follows
├── package.json
└── package-lock.json
```

## Local notes

`local/` is gitignored. Put anything specific to your own router or network there (addresses, what your adblock-lean setup already blocks, deploy keys, decisions you made for your household). If a `local/NOTES.md` exists, `CLAUDE.md` imports it so Claude Code sessions see it; it never reaches the repository.
