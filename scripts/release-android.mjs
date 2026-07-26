#!/usr/bin/env node
/**
 * release-android.mjs — Build a signed release AAB locally on Linux.
 *
 * Flow:
 *   1. Build web assets (js/css/sw) and `cap sync android`.
 *   2. Signing: if android/keystore.properties exists, use it. Otherwise PROMPT
 *      for the keystore path + alias + passwords, write a TEMPORARY
 *      keystore.properties, and delete it again after the build (nothing is left
 *      on disk unless you created keystore.properties yourself).
 *   3. Run `./gradlew bundleRelease`.
 *   4. Print the absolute path to the produced .aab (and whether it verified).
 *
 * No Play upload — this only builds the file for you to upload manually.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';

const ROOT = process.cwd();
const ANDROID = path.join(ROOT, 'android');
const KS_PROPS = path.join(ANDROID, 'keystore.properties');
const AAB = path.join(ANDROID, 'app/build/outputs/bundle/release/app-release.aab');
const HOME = process.env.HOME || '';

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {stdio: 'inherit', cwd: ROOT, ...opts});
    if (r.status !== 0) {
        console.error(`\n✖ \`${cmd} ${args.join(' ')}\` failed`);
        process.exit(1);
    }
}

function expandHome(p) {
    return p.startsWith('~') ? path.join(HOME, p.slice(1)) : p;
}

// Find a usable JDK: $JAVA_HOME, then ~/.jdks/temurin-*, then Android Studio JBR.
function detectJavaHome() {
    const ok = (h) => h && fs.existsSync(path.join(h, 'bin', 'java')) && h;
    if (ok(process.env.JAVA_HOME)) return process.env.JAVA_HOME;

    const jdksDir = path.join(HOME, '.jdks');
    if (fs.existsSync(jdksDir)) {
        const found = fs.readdirSync(jdksDir)
            .map((d) => path.join(jdksDir, d))
            .filter((d) => ok(d));
        const preferred = found.find((d) => /-(17|21)\./.test(d)) || found[0];
        if (preferred) return preferred;
    }
    for (const jbr of [
        path.join(HOME, '.local/share/JetBrains/Toolbox/apps/android-studio/jbr'),
        '/opt/android-studio/jbr',
    ]) {
        if (ok(jbr)) return jbr;
    }
    return null;
}

// Gather keystore details over a SINGLE readline interface (mixing multiple
// readline instances on stdin is unreliable, especially with piped input).
async function promptForKeystore() {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY});
    const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));
    const askHidden = (q) => new Promise((r) => {
        const orig = rl._writeToOutput.bind(rl);
        let muted = false;
        rl._writeToOutput = (s) => { if (!muted) orig(s); };
        rl.question(q, (a) => {
            muted = false;
            rl._writeToOutput = orig;
            if (process.stdin.isTTY) process.stdout.write('\n');
            r(a.trim());
        });
        muted = true; // prompt already printed; mute the echo of what's typed next
    });

    try {
        let jks;
        for (;;) {
            jks = path.resolve(expandHome(await ask('  Keystore file (.jks) path: ')));
            if (fs.existsSync(jks)) break;
            console.log(`  ✖ Not found: ${jks}`);
        }
        const alias = await ask('  Key alias: ');
        const storePassword = await askHidden('  Keystore password: ');
        const keyPassword = (await askHidden('  Key password (blank = same): ')) || storePassword;
        return {jks, alias, storePassword, keyPassword};
    } finally {
        rl.close();
    }
}

async function main() {
    console.log('▶ Building web assets…');
    run('npm', ['run', 'build:js']);
    run('npm', ['run', 'build:css']);
    run('npm', ['run', 'build:sw']);

    console.log('▶ Syncing Android project (cap sync)…');
    run('npx', ['cap', 'sync', 'android']);

    let createdTempProps = false;
    if (fs.existsSync(KS_PROPS)) {
        console.log('▶ Using existing android/keystore.properties');
    } else {
        // Resolve signing from env vars (CI / scripted), else interactive prompt.
        let creds = null;
        if (process.env.WIRD_KEYSTORE) {
            const jks = path.resolve(expandHome(process.env.WIRD_KEYSTORE));
            if (!fs.existsSync(jks)) {
                console.error(`✖ WIRD_KEYSTORE not found: ${jks}`);
                process.exit(1);
            }
            creds = {
                jks,
                alias: process.env.WIRD_KEY_ALIAS || 'upload',
                storePassword: process.env.WIRD_KS_PASS || '',
                keyPassword: process.env.WIRD_KEY_PASS || process.env.WIRD_KS_PASS || '',
            };
            console.log('▶ Using keystore from WIRD_* environment variables');
        } else if (process.stdin.isTTY) {
            console.log('\nNo android/keystore.properties found — configure signing:');
            creds = await promptForKeystore();
        } else {
            console.error('✖ No signing configured. Do ONE of:');
            console.error('   • create android/keystore.properties (storeFile/storePassword/keyAlias/keyPassword)');
            console.error('   • set WIRD_KEYSTORE, WIRD_KS_PASS, WIRD_KEY_ALIAS [, WIRD_KEY_PASS]');
            console.error('   • run this command in an interactive terminal (it will prompt)');
            process.exit(1);
        }

        fs.writeFileSync(
            KS_PROPS,
            `storeFile=${creds.jks}\nstorePassword=${creds.storePassword}\nkeyAlias=${creds.alias}\nkeyPassword=${creds.keyPassword}\n`,
        );
        createdTempProps = true;
        console.log('  ✓ Temporary keystore.properties written (removed after build).');
    }

    const javaHome = detectJavaHome();
    if (!javaHome) {
        console.error('✖ No JDK found. Install a JDK (17 or 21) or set JAVA_HOME.');
        if (createdTempProps) fs.rmSync(KS_PROPS, {force: true});
        process.exit(1);
    }
    console.log(`▶ Building signed release bundle (JDK: ${javaHome})…`);

    // `cap sync` can reset the executable bit on gradlew — restore it before running.
    try {
        fs.chmodSync(path.join(ANDROID, 'gradlew'), 0o755);
    } catch {
        // Windows / already fine — ignore.
    }

    try {
        run('./gradlew', ['bundleRelease'], {cwd: ANDROID, env: {...process.env, JAVA_HOME: javaHome}});
    } finally {
        if (createdTempProps) {
            fs.rmSync(KS_PROPS, {force: true});
            console.log('  ✓ Removed temporary keystore.properties');
        }
    }

    if (!fs.existsSync(AAB)) {
        console.error('✖ Build finished but no AAB was found at the expected path.');
        process.exit(1);
    }

    const v = spawnSync(path.join(javaHome, 'bin', 'jarsigner'), ['-verify', AAB], {encoding: 'utf8'});
    const signed = /jar verified/.test(v.stdout || '');

    console.log('\n───────────────────────────────────');
    console.log(signed
        ? '✓ Release AAB is signed and verified.'
        : '⚠ AAB built but signature could NOT be verified — check your keystore credentials.');
    console.log('AAB ready to upload to Play Console:');
    console.log('  ' + AAB);
    console.log('───────────────────────────────────');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
