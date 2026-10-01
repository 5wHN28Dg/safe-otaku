#!/usr/bin/env node
// Maintains blocklist/sites.tsv and builds the adblock-lean raw lists from it.
//
//   node scripts/blocklist.mjs build   sites.tsv -> blocklist/<tier>.txt
//   node scripts/blocklist.mjs audit   refresh domains from everythingmoe.com and
//                                      Hagezi NSFW, add new sites as "unreviewed",
//                                      then build
//
// Runs on the development machine only. Nothing here is deployed to the router.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'blocklist');
const TSV = path.join(DIR, 'sites.tsv');
const HEADER = '# slug\ttier\tsection\tname\tevidence\tdomains (+ = already in Hagezi NSFW at audit time)';

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

function build() {
  const sites = readTsv();
  const seen = new Set();
  for (const tier of TIERS) {
    const out = [];
    for (const s of sites) {
      if (s.tier !== tier) continue;
      for (const { d, hagezi } of s.domains) {
        if (hagezi || seen.has(d) || NEVER.has(d)) continue;
        seen.add(d);
        out.push(d);
      }
    }
    out.sort();
    const head = [
      `# safe-otaku ${tier} blocklist, generated from blocklist/sites.tsv. Do not edit by hand.`,
      '# Domains already in Hagezi NSFW at audit time are omitted.',
      `# Entries: ${out.length}`,
    ];
    fs.writeFileSync(path.join(DIR, `${tier}.txt`), [...head, ...out, ''].join('\n'));
    console.log(`${tier}.txt: ${out.length} domains`);
  }
  const pending = sites.filter((s) => !TIERS.includes(s.tier) && !NOT_BLOCKED.has(s.tier) && !NO_DOMAINS.has(s.tier));
  if (pending.length) console.log(`unreviewed: ${pending.map((s) => s.slug).join(', ')}`);
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
  build();
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'audit') await audit();
else {
  console.error('usage: node scripts/blocklist.mjs build|audit');
  process.exit(1);
}
