#!/usr/bin/env node
// Local stand-in for the router, for testing the frontend without deploying.
//
//   /mangadex-safe/*  -> dist/ (static, 404 for anything missing, like uhttpd)
//   /cgi-bin/md/*     -> cgi/md run under BusyBox ash, with uclient-fetch
//                        replaced by a curl wrapper taking the same flags
//
// Needs busybox and curl on the development machine. This is not uhttpd: the
// CGI still has to be tested on the router before deploying (AGENT.md, Testing).

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-shim-'));
fs.writeFileSync(path.join(shimDir, 'uclient-fetch'), `#!/bin/sh
ua=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --user-agent) ua="$2"; shift 2 ;;
    -T|-O) shift 2 ;;
    -q) shift ;;
    *) url="$1"; shift ;;
  esac
done
exec curl -sf --max-time 30 -A "$ua" "$url"
`, { mode: 0o755 });

function runCgi(req, res, url) {
  const cgi = spawn('busybox', ['sh', path.join(ROOT, 'cgi/md')], {
    env: {
      PATH: `${shimDir}:${process.env.PATH}`,
      REQUEST_METHOD: req.method,
      PATH_INFO: url.pathname.slice('/cgi-bin/md'.length),
      QUERY_STRING: url.search.slice(1),
    },
  });
  const chunks = [];
  cgi.stdout.on('data', (c) => chunks.push(c));
  cgi.on('error', (err) => { res.writeHead(500); res.end(String(err)); });
  cgi.on('close', () => {
    const out = Buffer.concat(chunks);
    const split = out.indexOf('\r\n\r\n');
    let status = 200;
    const headers = {};
    for (const line of out.subarray(0, split).toString().split('\r\n')) {
      const i = line.indexOf(':');
      const key = line.slice(0, i);
      const value = line.slice(i + 1).trim();
      if (key === 'Status') status = parseInt(value, 10);
      else headers[key] = value;
    }
    res.writeHead(status, headers);
    res.end(out.subarray(split + 4));
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/cgi-bin/md/')) return runCgi(req, res, url);

  if (url.pathname.startsWith('/mangadex-safe/')) {
    const rel = url.pathname.slice('/mangadex-safe/'.length) || 'index.html';
    const file = path.join(ROOT, 'dist', path.normalize(rel));
    if (file.startsWith(path.join(ROOT, 'dist')) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found\n');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}/mangadex-safe/`);
});
