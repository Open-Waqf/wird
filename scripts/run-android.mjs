#!/usr/bin/env node
/**
 * run-android.mjs: build the app and open it on an Android device in one command.
 *
 *   npm run android:run     build, install and open the app (normal build)
 *   npm run android:live    load the app from this computer and reload it on the
 *                           device every time a file changes (Ctrl+C to stop)
 *
 * Device: your phone over USB (or Wi-Fi debugging), or an emulator.
 * If several are available, `cap run` asks which.
 * Extra args are passed to `cap run`, e.g. `npm run android:run -- --target <id>`.
 *
 * Live mode uses `adb reverse`, so the device reaches this computer as
 * localhost:3000 over the adb link: no IP addresses or firewall rules needed.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {ROOT, androidEnv, ensureGradlewExecutable} from './android-env.mjs';

const PORT = 3000;
const WWW = path.join(ROOT, 'www');
const live = process.argv.includes('--live');
const capArgs = process.argv.slice(2).filter((a) => a !== '--live');
const env = androidEnv();

function run(cmd, args) {
    const r = spawnSync(cmd, args, {stdio: 'inherit', cwd: ROOT, env});
    if (r.status !== 0) {
        console.error(`\n✖ \`${cmd} ${args.join(' ')}\` failed`);
        process.exit(1);
    }
}

// Stop early with help if there is nothing to run on.
function checkDevices() {
    const adb = spawnSync('adb', ['devices'], {encoding: 'utf8', env});
    const devices = (adb.stdout || '').split('\n').filter((l) => /\tdevice$/.test(l));
    const avdDir = path.join(process.env.HOME || '', '.android/avd');
    const hasAvd = fs.existsSync(avdDir) && fs.readdirSync(avdDir).some((f) => f.endsWith('.ini'));
    if (devices.length || hasAvd) return;

    console.error('\n✖ No phone found. Plug in your phone with USB debugging on, then run again:');
    console.error('   1. Settings → About phone → tap "Build number" 7 times (turns on Developer options)');
    console.error('   2. Developer options → turn on "USB debugging"');
    console.error('   3. Plug in the cable and tap "Allow" on the phone');
    process.exit(1);
}

// Tiny static server for live mode. It adds a reload hook to index.html and tells the
// page to reload whenever anything in www/ changes. Nothing is written to disk.
function startDevServer() {
    const types = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
        '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.xml': 'application/xml',
    };
    const hook = '<script>new EventSource("/__reload").onmessage = () => location.reload();</script>';
    const clients = new Set();

    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath === '/__reload') {
            res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store'});
            res.write(': connected\n\n');
            clients.add(res);
            req.on('close', () => clients.delete(res));
            return;
        }
        let file = path.join(WWW, urlPath === '/' ? 'index.html' : urlPath);
        if (!file.startsWith(WWW + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            file = path.join(WWW, 'index.html'); // SPA-style fallback, like the service worker
        }
        let body = fs.readFileSync(file);
        if (file.endsWith('index.html')) body = body.toString().replace('</body>', `${hook}</body>`);
        res.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(body);
    });

    let timer = null;
    const watcher = fs.watch(WWW, {recursive: true}, () => {
        clearTimeout(timer);
        timer = setTimeout(() => clients.forEach((c) => c.write('data: reload\n\n')), 200);
    });

    server.listen(PORT, '127.0.0.1');
    return () => {
        watcher.close();
        clients.forEach((c) => c.end());
        server.close();
    };
}

console.log('▶ Building web assets…');
run('npm', ['run', 'build']);
console.log('▶ Syncing Android project…');
run('npx', ['cap', 'sync', 'android']);
ensureGradlewExecutable();
checkDevices();

if (!live) {
    run('npx', ['cap', 'run', 'android', '--no-sync', ...capArgs]);
    process.exit(0);
}

// --- Live mode ---
const stopServer = startDevServer();
const watchers = [
    spawn('node', ['scripts/build-js.js', '--watch'], {cwd: ROOT, stdio: 'ignore'}),
    spawn('npx', ['tailwindcss', '-i', './www/input.css', '-o', './www/compiled.css', '--watch'], {cwd: ROOT, stdio: 'ignore'}),
];

// Ctrl+C reaches `cap run` too: it puts the normal config back, then exits. Wait for that.
process.on('SIGINT', () => {});
const cap = spawn('npx', [
    'cap', 'run', 'android', '--no-sync',
    '--live-reload', '--host', 'localhost', '--port', String(PORT), '--forwardPorts', `${PORT}:${PORT}`,
    ...capArgs,
], {cwd: ROOT, stdio: 'inherit', env});

cap.on('exit', () => {
    stopServer();
    watchers.forEach((w) => w.kill());
    // Watch mode writes a dev build (inline source map) into www/script.js: restore the real one.
    console.log('\n▶ Restoring the production build…');
    spawnSync('npm', ['run', 'build'], {cwd: ROOT, stdio: 'ignore'});
    console.log('✓ Live session ended. The app on the device still loads from this computer:');
    console.log('  run `npm run android:run` once to install the normal build again.');
    process.exit(0);
});
