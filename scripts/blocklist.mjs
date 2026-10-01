#!/usr/bin/env node
// Maintains blocklist/sites.tsv (sites listed on everythingmoe.com) and
// blocklist/extensions.tsv (source hosts in reader-app extension repos), and
// builds the adblock-lean raw lists from both.
//
//   node scripts/blocklist.mjs build   *.tsv -> blocklist/<tier>.txt
//   node scripts/blocklist.mjs audit   refresh both TSVs from everythingmoe.com,
//                                      the extension repos and Hagezi NSFW, then build
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
const EXT_ORDER = ['explicit', 'ecchi', 'review', 'unreviewed', 'safe', 'covered'];

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

// Emitted in this order. A domain listed under both tiers goes to the stricter one.
const TIERS = ['explicit', 'ecchi'];
// Reviewed but deliberately not blocked. apps: reader apps fetch from the source
// sites, which the emitted tiers already cover. review: licensed/mainstream
// services; blocking them is out of proportion. Domains are still tracked.
const NOT_BLOCKED = new Set(['apps', 'review']);
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
  'raw.githubusercontent.com', 'bsky.app', 'apkmirror.com', 'flathub.org', 'teamup.com',
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

function build() {
  const sites = readTsv();
  const ext = readExtTsv();
  const seen = new Set();
  for (const tier of TIERS) {
    const out = [];
    const candidates = [
      ...sites.filter((s) => s.tier === tier).flatMap((s) => s.domains),
      ...ext.filter((r) => r.tier === tier).map((r) => ({ d: r.host, hagezi: r.hagezi })),
    ];
    for (const { d, hagezi } of candidates) {
      if (hagezi || seen.has(d) || NEVER.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    out.sort();
    const head = [
      `# safe-otaku ${tier} blocklist, generated from blocklist/sites.tsv and blocklist/extensions.tsv. Do not edit by hand.`,
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
      if (NEVER.has(d) || s.domains.some((x) => x.d === d)) continue;
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
  build();
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'audit') await audit();
else {
  console.error('usage: node scripts/blocklist.mjs build|audit');
  process.exit(1);
}
