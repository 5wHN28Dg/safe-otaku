#!/usr/bin/env node
// Maintains three reviewed sources and builds the adblock-lean raw lists from them:
//   blocklist/sites.tsv       sites listed on everythingmoe.com
//   blocklist/extensions.tsv  source hosts in reader-app extension repos
//   blocklist/fmhy.tsv        media, search, front-end and bypass hosts listed on fmhy.net
//
//   node scripts/blocklist.mjs build   *.tsv -> blocklist/<tier>.txt
//   node scripts/blocklist.mjs audit   refresh the TSVs from their sources and
//                                      Hagezi NSFW, then build
//
// Runs on the development machine only. Nothing here is deployed to the router.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'blocklist');
const TSV = path.join(DIR, 'sites.tsv');
const HEADER = '# slug\ttier\tsection\tname\tevidence\tdomains (+ = already in Hagezi NSFW at audit time)';
const EXT_TSV = path.join(DIR, 'extensions.tsv');
const EXT_HEADER = '# host (+ = already in Hagezi NSFW at audit time)\ttier\tmaintainer label\tevidence\textensions (repo:name)';
const EXT_ORDER = ['explicit', 'ecchi', 'review', 'general', 'unreviewed', 'safe', 'covered'];
const FMHY_TSV = path.join(DIR, 'fmhy.tsv');
const FMHY_HEADER = '# host (+ = already in Hagezi NSFW at audit time)\ttier\tgroup\tevidence\twhere (fmhy page/section)';
const FMHY_ORDER = ['explicit', 'ecchi', 'bypass', 'review', 'library', 'general', 'unverified', 'unreviewed', 'covered', 'clean'];
const FMHY_DOCS = 'https://api.github.com/repos/fmhy/edit/contents/docs';
const FMHY_RAW = 'https://raw.githubusercontent.com/fmhy/edit/main/docs/';
// Which fmhy sections are audited. Everything else on fmhy (tools, education,
// software) is out of scope unless fmhy itself annotates a link as NSFW.
const FMHY_GROUPS = {
  anime: { 'video.md': ['Anime Streaming', 'Anime Downloading', 'Anime Torrenting'] },
  video: { 'video.md': ['Multi-Server', 'P-Stream Forks', 'Stream Aggregators', 'TV Streaming', 'Dedicated-Server', 'Download Sites', 'Torrent Sites', 'Drama Streaming', 'Video Streaming', 'Free w/ Ads', 'Cartoon Streaming', 'Specialty Streaming', 'Specialty Downloading', 'Classics / Public Domain', 'Film Archives', 'Live TV', 'Live TV / Sports', 'Live Sports', 'Sports Replays', 'Stream Lounges'] },
  manga: { 'reading.md': ['Manga'] },
  reading: { 'reading.md': ['Comics', 'Light Novels', 'Fanfiction / Stories', 'Ebooks', 'Downloading', 'Magazines', 'Visual Media', 'Streaming', 'Special Interest', 'Documents / Articles'] },
  download: { 'downloading.md': ['Download Sites', 'Download Directories', 'Indexers', 'Search Sites', 'Usenet', 'Debrid / Leeches'] },
  torrent: { 'torrenting.md': ['Torrent Sites', 'Aggregators', 'Private Trackers'] },
  games: { 'gaming.md': ['Download Games', 'Game Repacks', 'ROM Sites', 'Abandonware / Retro'] },
  images: { 'image-tools.md': ['Art / Illustrations', 'Download Images', 'Image Hosts', 'Online Galleries', 'Stock Images', 'Image Search Engines'], 'system-tools.md': ['Wallpapers'] },
  ai: { 'ai.md': ['Roleplaying Chatbots', 'Image Generation', 'Video Generation', 'Specialized Chatbots'] },
  imageboard: { 'social-media-tools.md': ['4chan Archives', '4chan Tools'] },
  frontend: { 'social-media-tools.md': ['Players / Frontends', 'Reddit Alternatives', 'Viewers / Downloaders', 'Twitter/X Tools', 'Instagram Tools', 'Reddit Search', 'Subreddit Discovery', 'TikTok Tools', 'Tumblr Tools'] },
  search: { 'internet-tools.md': ['Search Engines', 'Custom Search Engines'], 'privacy.md': ['Search Engines'], 'storage.md': ['Searx Instances'] },
  bypass: { 'privacy.md': ['Proxy', 'Proxy Clients', 'Proxy Servers', 'Proxy Sites', 'VPN', 'VPN Server', 'VPN Tools', 'Anti Censorship', 'DNS Adblocking', 'DNS Filters'], 'storage.md': ['Proxy Lists', 'Free VPN Configs', 'Free DNS Resolvers'] },
};
const FMHY_NSFW = /\/\s*(Some NSFW|NSFW)\b/i;

// Extension repos linked from everythingmoe's app guides. Each maintainer labels
// its sources: Keiyoushi as SAFE / MIXED / NSFW, the others as nsfw yes/no.
const REPOS = [
  { name: 'keiyoushi', url: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json', format: 'keiyoushi' },
  { name: 'yuzono-anime', url: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json', format: 'tachiyomi' },
  { name: 'salmanbappi', url: 'https://raw.githubusercontent.com/salmanbappi/extensions-repo/main/index.min.json', format: 'tachiyomi' },
  { name: 'secozzi', url: 'https://raw.githubusercontent.com/Secozzi/aniyomi-extensions/repo/index.min.json', format: 'tachiyomi' },
  { name: 'cursedyomi', url: 'https://raw.githubusercontent.com/Claudemirovsky/cursedyomi-extensions/repo/index.min.json', format: 'tachiyomi' },
  { name: 'hollow-fr', url: 'https://codeberg.org/hollow/aniyomi-extensions-fr/raw/branch/repo/index.min.json', format: 'tachiyomi' },
  { name: 'mangayomi-manga', url: 'https://m2k3a.github.io/mangayomi-extensions/index.json', format: 'mangayomi' },
  { name: 'mangayomi-anime', url: 'https://m2k3a.github.io/mangayomi-extensions/anime_index.json', format: 'mangayomi' },
  { name: 'mangayomi-novel', url: 'https://m2k3a.github.io/mangayomi-extensions/novel_index.json', format: 'mangayomi' },
  { name: 'swak', url: 'https://raw.githubusercontent.com/Swakshan/mangayomi-swak-extensions/main/index.json', format: 'mangayomi' },
  { name: 'mallyd', url: 'https://raw.githubusercontent.com/Mallyd11/mangayomi-anime-extensions/main/anime_index.json', format: 'mangayomi' },
  { name: 'hayase', url: 'https://exten.pages.dev/index.json', format: 'hayase', label: 'safe' },
  { name: 'hayase-dub', url: 'https://exten.pages.dev/dub/index.json', format: 'hayase', label: 'safe' },
  { name: 'hayase-multi', url: 'https://exten.pages.dev/multi/index.json', format: 'hayase', label: 'safe' },
  { name: 'hayase-hentai', url: 'https://exten.pages.dev/hentai/index.json', format: 'hayase', label: 'nsfw' },
];
const LABEL_RANK = { safe: 0, mixed: 1, nsfw: 2 };

// Emitted in this order. A domain listed under several tiers goes to the first one.
// bypass: hosts that get around a filter the router already enforces (a safe-search
// redirect, or a platform blocked outright), not NSFW sites in their own right.
const TIERS = ['explicit', 'ecchi', 'bypass'];
// Reviewed but deliberately not blocked; domains are still tracked.
//   apps: reader apps fetch from the source sites, which the emitted tiers cover.
//   review: licensed/mainstream services; blocking them is out of proportion.
//   unverified: sites where no NSFW evidence was found. Recheck on audit.
//   general: general-purpose piracy (torrent/DDL indexes, Netflix-style movie/TV
//     streaming, game/ebook/magazine downloads). Owner rule: not blocked for
//     incidental NSFW; only sites that are purely or mainly NSFW are.
//   library: public preservation libraries (LibGen, Anna's Archive, Z-Library…). Never blocked.
const NOT_BLOCKED = new Set(['apps', 'review', 'unverified', 'general', 'library']);
const NO_DOMAINS = new Set(['clean', 'safe-endpoint']);

const EM = 'https://everythingmoe.com';
const HAGEZI = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/nsfw-onlydomains.txt';
const UA = 'safe-otaku-blocklist-audit/1.0';

// Hosts that are links to shared platforms, not the listed site itself.
const SHARED = [
  'github.com', 'gitlab.com', 'codeberg.org', 'reddit.com', 'discord.gg', 'discord.com', 't.me',
  'twitter.com', 'x.com', 'youtube.com', 'play.google.com', 'apps.apple.com', 'f-droid.org',
  'chromewebstore.google.com', 'chrome.google.com', 'addons.mozilla.org', 'greasyfork.org',
  'everythingmoe.com', 'rentry.co', 'rentry.org', 'pastebin.com', 'docs.google.com', 'wikipedia.org',
  'patreon.com', 'ko-fi.com', 'archive.org', 'telegra.ph', 'medium.com', 'microsoftedge.microsoft.com',
  'raw.githubusercontent.com', 'bsky.app', 'apkmirror.com', 'flathub.org', 'teamup.com', 'telegram.me', 'google.com',
];
// Hosts that must stay resolvable: safe endpoints and the router's own MangaDex proxy upstreams.
const NEVER = new Set([
  'safebooru.donmai.us', 'cdn.donmai.us', 'api.mangadex.org', 'uploads.mangadex.org',
]);

const isShared = (h) => SHARED.some((s) => h === s || h.endsWith('.' + s));

function readTsv() {
  const sites = [];
  for (const line of fs.readFileSync(TSV, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [slug, tier, section, name, evidence, domains = ''] = line.split('\t');
    sites.push({
      slug, tier, section, name, evidence,
      domains: domains.split(' ').filter(Boolean).map((d) => ({ d: d.replace(/^\+/, ''), hagezi: d.startsWith('+') })),
    });
  }
  return sites;
}

function writeTsv(sites) {
  const lines = sites.map((s) => [
    s.slug, s.tier, s.section, s.name, s.evidence,
    s.domains.map((x) => (x.hagezi ? '+' : '') + x.d).join(' '),
  ].join('\t'));
  fs.writeFileSync(TSV, [HEADER, ...lines, ''].join('\n'));
}

function readExtTsv() {
  if (!fs.existsSync(EXT_TSV)) return [];
  const rows = [];
  for (const line of fs.readFileSync(EXT_TSV, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [h, tier, label, evidence, exts = ''] = line.split('\t');
    rows.push({ host: h.replace(/^\+/, ''), hagezi: h.startsWith('+'), tier, label, evidence, exts: exts.split(' ').filter(Boolean) });
  }
  return rows;
}

function writeExtTsv(rows) {
  rows.sort((a, b) => EXT_ORDER.indexOf(a.tier) - EXT_ORDER.indexOf(b.tier) || a.host.localeCompare(b.host));
  const lines = rows.map((r) => [(r.hagezi ? '+' : '') + r.host, r.tier, r.label, r.evidence, r.exts.join(' ')].join('\t'));
  fs.writeFileSync(EXT_TSV, [EXT_HEADER, ...lines, ''].join('\n'));
}

function readFmhyTsv() {
  if (!fs.existsSync(FMHY_TSV)) return [];
  const rows = [];
  for (const line of fs.readFileSync(FMHY_TSV, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [h, tier, group, evidence, where = ''] = line.split('\t');
    rows.push({ host: h.replace(/^\+/, ''), hagezi: h.startsWith('+'), tier, group, evidence, where: where.split(' | ').filter(Boolean) });
  }
  return rows;
}

function writeFmhyTsv(rows) {
  rows.sort((a, b) => FMHY_ORDER.indexOf(a.tier) - FMHY_ORDER.indexOf(b.tier) || a.host.localeCompare(b.host));
  const lines = rows.map((r) => [(r.hagezi ? '+' : '') + r.host, r.tier, r.group, r.evidence, r.where.join(' | ')].join('\t'));
  fs.writeFileSync(FMHY_TSV, [FMHY_HEADER, ...lines, ''].join('\n'));
}

function build() {
  const sites = readTsv();
  const ext = readExtTsv();
  const fmhy = readFmhyTsv();
  const seen = new Set();
  for (const tier of TIERS) {
    const out = [];
    const candidates = [
      ...sites.filter((s) => s.tier === tier).flatMap((s) => s.domains),
      ...ext.filter((r) => r.tier === tier).map((r) => ({ d: r.host, hagezi: r.hagezi })),
      ...fmhy.filter((r) => r.tier === tier).map((r) => ({ d: r.host, hagezi: r.hagezi })),
    ];
    for (const { d, hagezi } of candidates) {
      if (hagezi || seen.has(d) || NEVER.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    out.sort();
    const head = [
      `# safe-otaku ${tier} blocklist, generated from blocklist/*.tsv. Do not edit by hand.`,
      '# Domains already in Hagezi NSFW at audit time are omitted.',
      `# Entries: ${out.length}`,
    ];
    fs.writeFileSync(path.join(DIR, `${tier}.txt`), [...head, ...out, ''].join('\n'));
    console.log(`${tier}.txt: ${out.length} domains`);
  }
  const pending = sites.filter((s) => !TIERS.includes(s.tier) && !NOT_BLOCKED.has(s.tier) && !NO_DOMAINS.has(s.tier));
  if (pending.length) console.log(`unreviewed sites: ${pending.map((s) => s.slug).join(', ')}`);
  const pendingExt = ext.filter((r) => r.tier === 'unreviewed');
  if (pendingExt.length) console.log(`unreviewed extension hosts: ${pendingExt.length} (tier "unreviewed" in extensions.tsv)`);
  const pendingFmhy = fmhy.filter((r) => r.tier === 'unreviewed');
  if (pendingFmhy.length) console.log(`unreviewed fmhy hosts: ${pendingFmhy.length} (tier "unreviewed" in fmhy.tsv)`);
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

// Accepts a URL or a bare hostname (everythingmoe's "domains" field holds both).
function host(u) {
  let h = u.trim().replace(/^[([]+|[)\],;]+$/g, '');
  try { h = new URL(h.includes('://') ? h : 'https://' + h).hostname; } catch { return ''; }
  h = h.toLowerCase().replace(/\.$/, '');
  return HOSTNAME.test(h) ? h : '';
}

// Returns Map slug -> { name, section, nsfw, domains[] } for every site everythingmoe lists.
async function scrapeEverythingmoe() {
  const page = await get(EM + '/', { Cookie: 'nsfw=true' });
  const expand = JSON.parse(await get(EM + '/data/cache/main.json'));
  const sites = new Map();
  const add = (slug, name, link, section, nsfw) => {
    const s = sites.get(slug) || { name, section, nsfw: false, domains: [] };
    s.nsfw ||= nsfw;
    const h = host(link);
    if (h && !s.domains.includes(h)) s.domains.push(h);
    sites.set(slug, s);
  };

  const sections = [...page.matchAll(/id="sec-([a-z0-9]+)" class="section/g)].map((m) => [m.index, m[1]]);
  const itemRe = /<div data-rank="\d+"(?: data-filter="[^"]*")? class="(section-item[^"]*)"[^>]*>([\s\S]*?)(?=<div data-rank=|<div class="section-item section-expandbtn|<div\s+id="sec-|$)/g;
  for (const m of page.matchAll(itemRe)) {
    const a = m[2].match(/<a href="\/s\/([^"]+)" data-link="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const section = sections.filter(([i]) => i < m.index).pop()?.[1];
    if (!section || section === 'bookmark') continue;
    add(a[1], a[3].replace(/<[^>]+>/g, '').trim(), a[2], section, m[2].includes('nsfwtag') || m[1].includes('nsfwsection'));
  }

  const lowRe = /expandsection\(this, '([a-z0-9]+)'/g;
  for (const [, section] of page.matchAll(lowRe)) {
    let list;
    try { list = JSON.parse(await get(`${EM}/data/lowsec/${section}.json`)); } catch { continue; }
    for (const e of list) add(e.id || e.tempid, e.title, e.link, section, (e.tags || '').split(' ').includes('nsfw'));
    await new Promise((r) => setTimeout(r, 500)); // everythingmoe rate-limits bursts
  }

  for (const [slug, s] of sites) {
    for (const [key, value] of Object.entries(expand[slug] || {})) {
      if (typeof value !== 'string') continue;
      if (key.includes('link') || key === 'extra') {
        for (const part of value.split('#')) {
          const h = host(part.split('<<')[1] || '');
          if (h && !s.domains.includes(h)) s.domains.push(h);
        }
      } else if (key === 'domains' || key === 'domain') {
        for (const d of value.split(/[,\s#]+/).map(host)) if (d && !s.domains.includes(d)) s.domains.push(d);
      }
    }
    s.domains = s.domains.filter((d) => !isShared(d));
  }
  return sites;
}

// Returns Map host -> { label, exts[] }, label being the strictest any repo gives the host.
async function scrapeExtensionRepos() {
  const hosts = new Map();
  const add = (u, label, ext) => {
    const h = host(u || '');
    if (!h || isShared(h)) return;
    const x = hosts.get(h) || { label: 'safe', exts: [] };
    if (LABEL_RANK[label] > LABEL_RANK[x.label]) x.label = label;
    if (!x.exts.includes(ext)) x.exts.push(ext);
    hosts.set(h, x);
  };
  for (const repo of REPOS) {
    let data;
    try { data = JSON.parse(await get(repo.url)); } catch (err) { console.log(`skipped ${repo.name}: ${err.message}`); continue; }
    if (repo.format === 'keiyoushi') {
      const labels = { CONTENT_WARNING_SAFE: 'safe', CONTENT_WARNING_MIXED: 'mixed', CONTENT_WARNING_NSFW: 'nsfw' };
      for (const e of data.extensionList?.extensions || []) {
        const label = labels[e.contentWarning] || 'nsfw'; // unknown label: assume the worst
        for (const s of e.sources || []) for (const u of [s.homeUrl, ...(s.mirrorUrls || [])]) add(u, label, `${repo.name}:${e.name}`);
      }
    } else if (repo.format === 'tachiyomi') {
      for (const e of data) for (const s of e.sources || []) add(s.baseUrl, e.nsfw ? 'nsfw' : 'safe', `${repo.name}:${e.name}`);
    } else if (repo.format === 'mangayomi') {
      for (const e of data) add(e.baseUrl, e.isNsfw ? 'nsfw' : 'safe', `${repo.name}:${e.name}`);
    } else if (repo.format === 'hayase') {
      for (const e of data) {
        let api = '';
        try { api = Buffer.from(e.url || '', 'base64').toString(); } catch {}
        add(api, repo.label, `${repo.name}:${e.name}`);
        add(e.icon, repo.label, `${repo.name}:${e.name}`);
      }
    }
  }
  for (const x of hosts.values()) x.exts = x.exts.map((e) => e.replace(/\s+/g, '_'));
  return hosts;
}

async function auditExtensions(inHagezi, sites) {
  const classified = new Map();
  for (const s of sites) for (const { d } of s.domains) if (!classified.has(d)) classified.set(d, s);
  const coveredBy = (h) => {
    const p = h.split('.');
    for (let i = 0; i < p.length - 1; i++) {
      const s = classified.get(p.slice(i).join('.'));
      if (s) return s;
    }
    return null;
  };

  const found = await scrapeExtensionRepos();
  const rows = readExtTsv();
  const byHost = new Map(rows.map((r) => [r.host, r]));
  const newMixed = [];
  let added = 0;
  for (const [h, x] of found) {
    let r = byHost.get(h);
    const site = coveredBy(h);
    if (!r) {
      r = { host: h, hagezi: false, tier: 'unreviewed', label: x.label, evidence: 'maintainer label SAFE; not checked', exts: [] };
      if (x.label === 'nsfw') Object.assign(r, { tier: 'explicit', evidence: 'maintainer label NSFW' });
      if (x.label === 'mixed') {
        Object.assign(r, { tier: 'explicit', evidence: 'maintainer label MIXED (contains NSFW entries)' });
        newMixed.push(h);
      }
      rows.push(r);
      byHost.set(h, r);
      added++;
    } else if (LABEL_RANK[x.label] > LABEL_RANK[r.label]) {
      console.log(`label raised for ${h}: ${r.label} -> ${x.label}`);
      r.label = x.label;
      if (['safe', 'unreviewed'].includes(r.tier)) {
        r.tier = 'explicit';
        r.evidence = `maintainer label ${x.label.toUpperCase()}`;
      }
    }
    if (site) Object.assign(r, { tier: 'covered', evidence: `classified in sites.tsv (${site.slug}: ${site.tier})` });
    for (const e of x.exts) if (!r.exts.includes(e)) r.exts.push(e);
  }
  for (const r of rows) r.hagezi = inHagezi(r.host);

  writeExtTsv(rows);
  console.log(`extension hosts: ${found.size}, new: ${added}`);
  if (newMixed.length) console.log(`new MIXED hosts blocked as explicit; check for licensed services and move those to "review": ${newMixed.join(' ')}`);
}

// Returns Map host -> { group, where[], nsfw } for every in-scope or NSFW-annotated fmhy link.
async function scrapeFmhy() {
  const groupOf = {};
  for (const [group, files] of Object.entries(FMHY_GROUPS)) {
    for (const [file, sections] of Object.entries(files)) for (const s of sections) groupOf[`${file}/${s}`] = group;
  }
  const hosts = new Map();
  const files = JSON.parse(await get(FMHY_DOCS)).filter((f) => f.type === 'file' && f.name.endsWith('.md'));
  for (const f of files) {
    let section = '';
    for (const line of (await get(FMHY_RAW + f.name)).split('\n')) {
      const heading = line.match(/^#+\s*(.*)/);
      if (heading) { section = heading[1].replace(/[▷►#*]/g, '').trim(); continue; }
      let group = groupOf[`${f.name}/${section}`];
      if (!group && f.name === 'non-english.md') {
        if (/^Streaming/.test(section)) group = 'video';
        else if (/^Torrenting/.test(section)) group = 'torrent';
        else if (/^Downloading/.test(section)) group = 'download';
        else if (section === 'Manga') group = 'manga';
        else if (/^(Reading|Light Novels)/.test(section)) group = 'reading';
      }
      // fmhy's annotation describes the entry: the links before the first " - " (its
      // name, alternatives and mirrors), not the Discord/Lemmy/subreddit links after it.
      const nsfwLine = FMHY_NSFW.test(line);
      if (!group && !nsfwLine) continue;
      const entryEnd = line.indexOf(' - ') === -1 ? line.length : line.indexOf(' - ');
      for (const m of line.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
        const url = m[1];
        const nsfw = nsfwLine && m.index < entryEnd;
        const h = host(url);
        if (!h || isShared(h) || h.endsWith('.onion')) continue;
        if (!group && !nsfw) continue;
        const x = hosts.get(h) || { group: group || 'other', where: [], nsfw: false };
        const w = `${f.name.replace(/\.md$/, '')}/${section}`;
        if (!x.where.includes(w)) x.where.push(w);
        x.nsfw ||= nsfw;
        hosts.set(h, x);
      }
    }
  }
  return hosts;
}

async function auditFmhy(inHagezi, sites, ext) {
  const classified = new Map();
  for (const s of sites) for (const { d } of s.domains) if (!classified.has(d)) classified.set(d, `sites.tsv (${s.slug}: ${s.tier})`);
  for (const r of ext) if (!classified.has(r.host)) classified.set(r.host, `extensions.tsv (${r.tier})`);
  const coveredBy = (h) => {
    const p = h.split('.');
    for (let i = 0; i < p.length - 1; i++) {
      const c = classified.get(p.slice(i).join('.'));
      if (c) return c;
    }
    return null;
  };

  const found = await scrapeFmhy();
  const rows = readFmhyTsv();
  const byHost = new Map(rows.map((r) => [r.host, r]));
  let added = 0;
  for (const [h, x] of found) {
    let r = byHost.get(h);
    const c = coveredBy(h);
    if (!r) {
      r = { host: h, hagezi: false, tier: 'unreviewed', group: x.group, evidence: 'new on fmhy; not checked', where: [] };
      if (x.nsfw) Object.assign(r, { tier: 'explicit', evidence: 'fmhy annotates it NSFW / Some NSFW' });
      if (c) Object.assign(r, { tier: 'covered', evidence: `classified in ${c}` });
      rows.push(r);
      byHost.set(h, r);
      added++;
    } else if (x.nsfw && ['unreviewed', 'unverified', 'clean'].includes(r.tier)) {
      console.log(`fmhy now annotates ${h} as NSFW`);
      Object.assign(r, { tier: 'explicit', evidence: 'fmhy annotates it NSFW / Some NSFW' });
    }
    for (const w of x.where) if (!r.where.includes(w)) r.where.push(w);
  }
  for (const r of rows) r.hagezi = inHagezi(r.host);

  writeFmhyTsv(rows);
  console.log(`fmhy hosts in scope: ${found.size}, new: ${added}`);
}

async function audit() {
  const hz = new Set((await get(HAGEZI)).split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim()));
  const inHagezi = (d) => {
    const p = d.split('.');
    for (let i = 0; i < p.length - 1; i++) if (hz.has(p.slice(i).join('.'))) return true;
    return false;
  };
  const listed = await scrapeEverythingmoe();
  const sites = readTsv();
  const bySlug = new Map(sites.map((s) => [s.slug, s]));

  let added = 0;
  const claimed = new Set(sites.flatMap((s) => s.domains.map((x) => x.d)));
  for (const [slug, e] of listed) {
    let s = bySlug.get(slug);
    if (!s) {
      s = { slug, tier: 'unreviewed', section: e.section, name: e.name, evidence: e.nsfw ? 'everythingmoe NSFW tag' : '', domains: [] };
      sites.push(s);
      bySlug.set(slug, s);
      console.log(`new site: ${slug} (${e.section}${e.nsfw ? ', NSFW tag' : ''})`);
    }
    if (NO_DOMAINS.has(s.tier)) continue;
    for (const d of e.domains) {
      // A domain belongs to one row. Rows split by hand (e.g. clone domains moved
      // out of a site's row) keep their domains.
      if (NEVER.has(d) || claimed.has(d)) continue;
      claimed.add(d);
      s.domains.push({ d, hagezi: false });
      added++;
      if (s.tier !== 'unreviewed') console.log(`new domain for ${slug}: ${d}`);
    }
  }
  for (const s of sites) for (const x of s.domains) x.hagezi = inHagezi(x.d);
  for (const s of sites) if (!listed.has(s.slug)) console.log(`no longer listed (kept): ${s.slug}`);

  writeTsv(sites);
  console.log(`everythingmoe sites: ${listed.size}, new domains: ${added}`);
  await auditExtensions(inHagezi, sites);
  await auditFmhy(inHagezi, sites, readExtTsv());
  build();
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'audit') await audit();
else {
  console.error('usage: node scripts/blocklist.mjs build|audit');
  process.exit(1);
}
