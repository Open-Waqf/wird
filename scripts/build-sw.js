#!/usr/bin/env node
/**
 * build-sw.js
 * Rewrites the CACHE_NAME and ASSETS block at the top of sw.js.
 * - CACHE_NAME is derived from package.json "version"
 * - ASSETS are auto-discovered from www/ (JS modules, HTML, CSS, fonts, icons)
 *
 * Usage: node scripts/build-sw.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW  = path.join(ROOT, 'www');
const SW   = path.join(WWW, 'sw.js');

const { version } = require(path.join(ROOT, 'package.json'));
const CACHE_NAME   = `wird-v${version}`;

// Files to exclude even when auto-discovered
const EXCLUDE = new Set(['sw.js', 'input.css']);

// Scan a directory for files matching given extensions (non-recursive)
function scan(dir, exts) {
    if (!fs.existsSync(dir)) return [];
    const rel = path.relative(WWW, dir).replace(/\\/g, '/');
    return fs.readdirSync(dir)
        .filter(f => {
            const full = path.join(dir, f);
            return fs.statSync(full).isFile()
                && exts.some(e => f.endsWith(e))
                && !EXCLUDE.has(f);
        })
        .sort()
        .map(f => rel ? `./${rel}/${f}` : `./${f}`);
}

const assets = [
    './',                                                       // app shell
    ...scan(WWW,                    ['.html']),
    ...scan(WWW,                    ['.css']),
    ...scan(WWW,                    ['.js']),
...scan(WWW,                    ['.json']),
    ...scan(WWW,                    ['.ico']),
    ...scan(path.join(WWW, 'img'),  ['.png', '.svg', '.jpg', '.webp']),
    ...scan(path.join(WWW, 'fonts'),['.woff', '.woff2']),
];

// Verify each entry actually exists on disk
const valid = assets.filter(a => {
    if (a === './') return true;
    return fs.existsSync(path.join(WWW, a.slice(2)));
});

// Build the replacement block
const assetsLines = valid.map(a => `    "${a}"`).join(',\n');
const newBlock = [
    `const CACHE_NAME = "${CACHE_NAME}";`,
    `const AUDIO_CACHE_NAME = "wird-audio-v1";`,
    ``,
    `const ASSETS = [`,
    assetsLines,
    `];`,
].join('\n');

// Splice into sw.js — replace everything from CACHE_NAME through closing ];
const sw       = fs.readFileSync(SW, 'utf8');
const blockStart = sw.indexOf('const CACHE_NAME');
const assetsOpen = sw.indexOf('const ASSETS = [', blockStart);
const closingPos = sw.indexOf('\n];', assetsOpen);   // points to \n before ];

if (blockStart === -1 || assetsOpen === -1 || closingPos === -1) {
    console.error('❌  Could not locate CACHE_NAME/ASSETS block in sw.js');
    process.exit(1);
}

const blockEnd = closingPos + 3;  // include the '\n];' itself
const updated  = sw.slice(0, blockStart) + newBlock + sw.slice(blockEnd);

if (updated === sw) {
    console.log(`ℹ️   sw.js already up-to-date  (${CACHE_NAME}, ${valid.length} assets)`);
} else {
    fs.writeFileSync(SW, updated, 'utf8');
    console.log(`✅  sw.js updated  →  ${CACHE_NAME}  |  ${valid.length} assets`);
    valid.forEach(a => console.log(`    ${a}`));
}
