'use strict';
const esbuild = require('esbuild');
const watch   = process.argv.includes('--watch');
// The app version (shown in Settings) is written into the bundle at build time.
const {version} = require('../package.json');

const options = {
    entryPoints: ['src/script.js'],
    bundle:      true,
    outfile:     'www/script.js',
    format:      'iife',
    minify:      !watch,
    sourcemap:   watch ? 'inline' : false,
    target:      ['es2020'],
    define:      {__APP_VERSION__: JSON.stringify(version)},
};

if (watch) {
    esbuild.context(options).then(ctx => ctx.watch());
} else {
    esbuild.build(options).catch(() => process.exit(1));
}
