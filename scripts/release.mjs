#!/usr/bin/env node
/**
 * release.mjs: release a new version (website + Android) with one command.
 *
 *   npm run release                  next version (1.73 -> 1.74)
 *   npm run release -- 2.0           an exact version
 *   npm run release -- --dry-run     show what would happen, change nothing
 *
 * Steps (it asks before changing anything):
 *   1. Checks: on develop, nothing uncommitted, not behind GitHub.
 *   2. Shows the commits since the last release and opens your editor for an optional
 *      "What's new" note, kept in the repo (500 characters max, like Google Play).
 *      Leave it empty to skip it.
 *   3. Sets the version everywhere: package.json, package-lock.json, versionName
 *      and versionCode (+1) in build.gradle, and the service worker cache name.
 *   4. Runs the tests.
 *   5. Commits "Release X", tags it vX and pushes both. GitHub then tests again
 *      and deploys the website.
 *   6. Builds the signed Android bundle for Google Play.
 *
 * Other options: --notes "text" (skip the editor), --yes (skip the confirmation),
 * --skip-tests, --no-android.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';

const ROOT = process.cwd();
const BRANCH = 'develop';
const PKG = path.join(ROOT, 'package.json');
const LOCK = path.join(ROOT, 'package-lock.json');
const GRADLE = path.join(ROOT, 'android/app/build.gradle');
const CHANGELOGS = path.join(ROOT, 'fastlane/metadata/android/en-US/changelogs');
const PLAY_LIMIT = 500;

// --- Arguments ---
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = flag('--dry-run');
const assumeYes = flag('--yes');
const notesArg = option('--notes');
const explicitVersion = args.find((a, i) => /^\d/.test(a) && args[i - 1] !== '--notes');

// --- Helpers ---
function fail(msg) {
    console.error(`\n✖ ${msg}`);
    process.exit(1);
}

function git(...gitArgs) {
    const r = spawnSync('git', gitArgs, {cwd: ROOT, encoding: 'utf8'});
    if (r.status !== 0) fail(`git ${gitArgs.join(' ')} failed:\n${(r.stderr || '').trim()}`);
    return (r.stdout || '').trim();
}

function run(cmd, cmdArgs) {
    return spawnSync(cmd, cmdArgs, {cwd: ROOT, stdio: 'inherit'}).status === 0;
}

async function ask(question) {
    if (!process.stdin.isTTY) fail('Not an interactive terminal: use --yes (and --notes) to run without questions.');
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    // If input ends without an answer, resolve with null so the caller can cancel.
    const answer = await new Promise((r) => {
        rl.question(question, r);
        rl.on('close', () => r(null));
    });
    rl.close();
    if (answer === null) fail('No answer: cancelled. Nothing was changed.');
    return answer.trim().toLowerCase();
}

// 1.10 > 1.9: compare number by number.
function compareVersions(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    }
    return 0;
}

// Opens the user's git editor on a template; returns the text without # lines.
function editNotes(next, current, commits) {
    const file = path.join(os.tmpdir(), `wird-release-${next}.txt`);
    fs.writeFileSync(file, [
        '',
        `# What's new in ${next} (optional, max ${PLAY_LIMIT} characters, like Google Play).`,
        '# Write it above. Lines starting with # are ignored.',
        '# Save and close the editor to continue. Leave it empty to skip the note.',
        '#',
        `# Commits since ${current}:`,
        ...commits.map((c) => `#   ${c}`),
        '',
    ].join('\n'));
    const editor = spawnSync('git', ['var', 'GIT_EDITOR'], {cwd: ROOT, encoding: 'utf8'}).stdout.trim() || 'nano';
    spawnSync(`${editor} "${file}"`, {shell: true, stdio: 'inherit'});
    const text = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
    fs.rmSync(file, {force: true});
    return text;
}

// --- 1. Checks ---
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== BRANCH) fail(`You are on "${branch}". Switch to ${BRANCH} first: git switch ${BRANCH}`);
if (git('status', '--porcelain')) fail('You have uncommitted changes. Commit them (or stash them) first, then run this again.');
if (spawnSync('git', ['var', 'GIT_COMMITTER_IDENT'], {cwd: ROOT, stdio: 'ignore'}).status !== 0) {
    fail('git does not know your name/email here (needed for the release commit). Set user.name and user.email.');
}
if (spawnSync('git', ['fetch', '--quiet', 'origin', BRANCH, '--tags'], {cwd: ROOT, stdio: 'ignore'}).status !== 0) {
    fail('Could not reach GitHub. Check your internet connection, then run this again.');
}
if (Number(git('rev-list', '--count', `HEAD..origin/${BRANCH}`)) > 0) {
    fail(`GitHub has commits you don't have. Run: git pull, then run this again.`);
}

// --- 2. Version + notes ---
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const current = pkg.version;
let next = explicitVersion;
if (next) {
    if (!/^\d+(\.\d+)+$/.test(next)) fail(`"${next}" is not a version like 1.74`);
} else {
    const parts = current.split('.').map(Number);
    parts[parts.length - 1] += 1;
    next = parts.join('.');
}
if (compareVersions(next, current) <= 0) fail(`${next} is not higher than the current version ${current}`);
if (git('tag', '--list', `v${next}`)) fail(`Tag v${next} already exists`);

const gradleText = fs.readFileSync(GRADLE, 'utf8');
const codeMatch = gradleText.match(/versionCode\s+(\d+)/);
if (!codeMatch || !/versionName\s+"[^"]*"/.test(gradleText)) fail('versionCode/versionName not found in build.gradle');
const code = Number(codeMatch[1]) + 1;

// Commits since the last "Release x" commit (or all, if there is none).
const lastRelease = git('log', '--grep=^Release ', '-1', '--format=%H');
const commits = git('log', '--no-merges', '--format=%s', ...(lastRelease ? [`${lastRelease}..HEAD`] : []))
    .split('\n').filter(Boolean);
if (commits.length === 0) fail(`Nothing new since the last release (${current}).`);

console.log(`\nRelease ${current} -> ${next} (Android versionCode ${code})`);
console.log(`\n${commits.length} commit(s) since ${current}:`);
commits.forEach((c) => console.log(`  - ${c}`));

let notes = notesArg;
if (notes === undefined && !dryRun) {
    for (;;) {
        await ask('\nPress Enter to write the "What\'s new" text in your editor…');
        notes = editNotes(next, current, commits);
        if (!notes || notes.length <= PLAY_LIMIT) break;
        console.log(`\n✖ ${notes.length} characters: Google Play allows ${PLAY_LIMIT}. Please shorten it.`);
    }
}

console.log('\nThis will:');
console.log(`  • set version ${next} (versionCode ${code}) in package.json, package-lock.json, build.gradle, sw.js`);
if (notes) console.log(`  • save the "What's new" note to changelogs/${code}.txt`);
if (!flag('--skip-tests')) console.log('  • run the tests');
console.log(`  • commit "Release ${next}", tag v${next}, push both to GitHub (this deploys the website)`);
if (!flag('--no-android')) console.log('  • build the signed Android bundle for Google Play');
if (notes) console.log(`\nWhat's new:\n${notes.split('\n').map((l) => `  ${l}`).join('\n')}`);

if (dryRun) {
    console.log('\n(dry run: nothing was changed)');
    process.exit(0);
}
if (!assumeYes && (await ask(`\nRelease ${next} now? (y/N) `)) !== 'y') fail('Cancelled. Nothing was changed.');

// --- 3. Set the version everywhere ---
const changelog = path.join(CHANGELOGS, `${code}.txt`);
fs.writeFileSync(GRADLE, gradleText
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${next}"`));
pkg.version = next;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
lock.version = next;
if (lock.packages?.['']) lock.packages[''].version = next;
fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
if (notes) fs.writeFileSync(changelog, notes + '\n');

// Put everything back if a later step fails before the commit.
function undo(msg) {
    git('reset', '--quiet');
    git('checkout', '--', '.');
    fs.rmSync(changelog, {force: true});
    fail(`${msg} Everything was put back; nothing was committed.`);
}

console.log('\n▶ Building…');
if (!run('npm', ['run', 'build'])) undo('Build failed.');

// --- 4. Tests ---
if (!flag('--skip-tests')) {
    console.log('▶ Running tests…');
    if (!run('npm', ['test', '--', '--reporter=line'])) undo('Tests failed.');
}

// --- 5. Commit, tag, push ---
console.log('▶ Committing, tagging and pushing…');
const tryGit = (...gitArgs) => spawnSync('git', gitArgs, {cwd: ROOT, stdio: 'inherit'}).status === 0;
if (!tryGit('add', '-A') || !tryGit('commit', '--quiet', '-m', `Release ${next}`)) undo('Commit failed.');
if (!tryGit('tag', '-a', `v${next}`, '-m', `Release ${next}`)) {
    git('reset', '--quiet', '--hard', 'HEAD~1');
    fs.rmSync(changelog, {force: true});
    fail('Tagging failed. Everything was put back; nothing was committed.');
}
// --atomic: the branch and the tag are pushed together, or not at all.
if (!tryGit('push', '--atomic', 'origin', BRANCH, `v${next}`)) {
    fail(`Push failed (network?). The release is committed and tagged on this computer.\n` +
        `  When you are online, finish it with:  git push --atomic origin ${BRANCH} v${next}\n` +
        '  then: npm run android:release');
}
console.log(`✓ v${next} pushed. GitHub is testing and deploying the website:`);
console.log('  https://github.com/open-waqf/wird/actions');

// --- 6. Android ---
if (!flag('--no-android')) {
    console.log('\n▶ Building the signed Android bundle…');
    if (!run('npm', ['run', 'android:release'])) {
        console.log('\n⚠ The Android build failed. The website release is done; fix the problem,');
        console.log('  then run `npm run android:release` again.');
        process.exit(1);
    }
    console.log('\nLast step: upload the .aab above to the Play Console.');
    if (notes) console.log(`Your "What's new" note: ${path.relative(ROOT, changelog)}`);
}
