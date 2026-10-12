/**
 * android-env.mjs: shared setup for the Android scripts (run + release).
 * Finds a JDK and the Android SDK, and returns the env Gradle/adb need.
 */
import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME || '';
export const ROOT = process.cwd();
export const ANDROID = path.join(ROOT, 'android');

// Find a usable JDK: $JAVA_HOME, then ~/.jdks/temurin-*, then Android Studio JBR.
export function detectJavaHome() {
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

// Find the Android SDK: $ANDROID_HOME, then sdk.dir in android/local.properties, then ~/Android/Sdk.
export function detectSdk() {
    if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME;
    try {
        const props = fs.readFileSync(path.join(ANDROID, 'local.properties'), 'utf8');
        const dir = props.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
        if (dir && fs.existsSync(dir)) return dir;
    } catch {
        // No local.properties: fall through.
    }
    const def = path.join(HOME, 'Android/Sdk');
    return fs.existsSync(def) ? def : null;
}

// Env for Gradle, adb and the emulator. Exits with a clear message if the JDK is missing.
export function androidEnv() {
    const javaHome = detectJavaHome();
    if (!javaHome) {
        console.error('✖ No JDK found. Install a JDK (17 or 21) or set JAVA_HOME.');
        process.exit(1);
    }
    const env = {...process.env, JAVA_HOME: javaHome};
    const sdk = detectSdk();
    if (sdk) {
        env.ANDROID_HOME = sdk;
        env.PATH = [path.join(sdk, 'platform-tools'), path.join(sdk, 'emulator'), env.PATH].join(path.delimiter);
    }
    return env;
}

// Keep gradlew executable (some checkouts and copies drop the bit).
export function ensureGradlewExecutable() {
    try {
        fs.chmodSync(path.join(ANDROID, 'gradlew'), 0o755);
    } catch {
        // Already fine.
    }
}
