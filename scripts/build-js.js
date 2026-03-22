'use strict';
const esbuild = require('esbuild');
const watch   = process.argv.includes('--watch');

const options = {
    entryPoints: ['src/script.js'],
    bundle:      true,
    outfile:     'www/script.js',
    format:      'iife',
    minify:      !watch,
    sourcemap:   watch ? 'inline' : false,
    target:      ['es2020'],
};

if (watch) {
    esbuild.context(options).then(ctx => ctx.watch());
} else {
    esbuild.build(options).catch(() => process.exit(1));
}
