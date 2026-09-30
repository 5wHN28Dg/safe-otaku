#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

fs.mkdirSync(DIST, { recursive: true });

for (const file of ['index.html', 'styles.css']) {
  fs.copyFileSync(path.join(SRC, file), path.join(DIST, file));
}

console.log('Static files copied to dist/');
