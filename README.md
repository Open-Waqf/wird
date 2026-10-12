# Wird (وِرد)

**Open Source, Offline-First Islamic Adhkar**

**Wird** is a privacy-focused Progressive Web App (PWA) and Android application designed to help you read your daily
Adhkar (supplications) without distractions. It works 100% offline, contains zero ads, tracks no personal data, and
features deep accessibility support.

🔗 **Use the Web App:** [wird.open-waqf.org](https://wird.open-waqf.org)

📱 **Get it on Google Play:** [Wird Android App](https://play.google.com/store/apps/details?id=org.openwaqf.wird)

---

## 🌟 Key Features

* 🌍 **Multilingual:** Fully translated UI with Arabic, English, French, Spanish, and Italian support (including
  transliterations and translations for every Dua).
* 📵 **100% Offline & Private:** Works in Airplane mode. No analytics, no servers, and your data never leaves your
  device.
* 🧱 **Safer Web Storage:** On supported browsers, Wird requests persistent storage to reduce the chance of browser
  eviction under low-disk conditions.
* 🔍 **Smart Search:** Instantly find specific Adhkar by searching across Arabic, transliteration, or translation.
* 🔔 **Local Reminders:** Set custom daily push notifications for Morning and Evening Adhkar (fully offline via
  Capacitor).
* 🎯 **Focus Mode:** A distraction-free, full-screen Tasbih counter featuring smart haptic vibration feedback.
* 🌙 **OLED & Dark Mode:** Beautiful true-black themes for night reading and battery saving.
* ♿ **Highly Accessible:** Built for everyone. Includes keyboard navigation, per-count `aria-live` screen-reader
  announcements, `prefers-reduced-motion` support, `lang="ar"` on Arabic text for correct voice, visible focus rings,
  and skip-to-content links.
* 💾 **Data Portability:** Export and import your completion streaks, favorites, and settings as a simple JSON file.

---

## 📱 How to Install (Standard Users)

1. **Android:** Download from [Google Play](https://play.google.com/store/apps/details?id=org.openwaqf.wird).
2. **iOS / iPhone:** Open the website in Safari, tap the Share icon ⍗, and select **Add to Home Screen ⊞**.
3. **Desktop:** Click the "Install App" icon in the address bar of Chrome, Edge, or Brave.

---

## 🛠️ Build from Source (Developers)

If you want to contribute to the code, run the tests, or build your own APK, follow these steps:

### Prerequisites

* **Node.js** (v22+, required by the Capacitor 8 CLI)
* **Android SDK** (Platform 36 + Build-Tools; e.g. via Android Studio or the command-line tools)
* **JDK 17 or 21** (Android Studio bundles one; a standalone Temurin JDK also works)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/open-waqf/wird.git
cd wird
npm install

```

### 2. Build the Web App

```bash
# Build everything (JS bundle, Tailwind CSS, service worker)
npm run build

# Build, then serve the app at http://localhost:3000
npm run dev

# (Optional) Rebuild JS or CSS on every change during development
npm run watch:js
npm run watch:css

```

### 3. Run E2E Tests (Playwright)

We use Playwright to ensure the app remains bug-free across browser updates.

```bash
# Download the test browser (once, and again after every Playwright upgrade)
npx playwright install chromium

# Run tests silently in the background
npm run test

# Run tests visually in the Playwright UI dashboard
npm run test:ui

```

> **Newer Linux distros (e.g. Ubuntu 26.04):** if Playwright says your OS is not
> supported, use the Ubuntu 24.04 build. Set the variable on the install **and** on
> every test run:
>
> ```bash
> PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium
> PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npm run test
> ```

### 4. Build the Android App

First tell Gradle where your SDK is (once): create `android/local.properties` with

```properties
sdk.dir=/absolute/path/to/Android/Sdk
```

This file is git-ignored. On Linux the SDK is usually at `~/Android/Sdk`.

#### Run on a device (one command)

```bash
# Build, install and open the app on your plugged-in phone
npm run android:run

# Live mode: the device loads the app from your computer and reloads on every
# change in src/ or www/ (Ctrl+C to stop)
npm run android:live
```

If several devices are available, you are asked which one to use. To pick one
directly: `npm run android:run -- --target <id>` (see `npx cap run android --list`).

Set up your phone (once):

1. **Settings ▸ About phone**: tap **Build number** 7 times to turn on Developer options.
2. **Developer options**: turn on **USB debugging**.
3. Plug in the cable and tap **Allow** on the phone.

An emulator from Android Studio ▸ Device Manager also works.

> After a live session, the installed app still loads from your computer. Run
> `npm run android:run` once to install the normal build again.

Tip: `scrcpy` mirrors the phone screen on your desktop.

#### Signed release bundle (`.aab` for Google Play)

Use the one-command release script — it builds the web assets, runs `cap sync`, and produces a **signed** App Bundle, then prints its path:

```bash
npm run android:release
```

**Signing** is read from a git-ignored `android/keystore.properties`:

```properties
storeFile=/absolute/path/to/upload-key.jks
storePassword=your-keystore-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

> Use an **absolute, unquoted** path for `storeFile` (spaces are fine without quotes).

If `android/keystore.properties` is absent, the script instead reads the
`WIRD_KEYSTORE`, `WIRD_KS_PASS`, `WIRD_KEY_ALIAS`, and `WIRD_KEY_PASS` environment
variables (useful for CI); and if neither is present in an interactive terminal, it
**prompts** you for the path, alias, and passwords (used once, not stored).

The signed bundle is written to
`android/app/build/outputs/bundle/release/app-release.aab` — upload that to the Play Console.

> **Note:** without any signing config, `./gradlew bundleRelease` still succeeds but
> produces an **unsigned** bundle.

### 5. Release (web + Android)

One command, when your work is committed:

```bash
npm run release              # next version: 1.73 -> 1.74
npm run release -- 2.0       # or an exact version
npm run release -- --dry-run # only show what would happen
```

It checks that you are on `develop` with nothing uncommitted, shows the commits since
the last release, and opens your editor for an optional "What's new" note kept in the
repo (max 500 characters; leave it empty to skip. The Google Play text itself is entered
in the Play Console). After you confirm, it:

1. sets the version everywhere (`package.json`, `versionName`, `versionCode` + 1,
   service worker cache name) and saves the note, if any, under `fastlane/.../changelogs/`,
2. runs the tests (if they fail, everything is put back),
3. commits "Release 1.74", tags it `v1.74` and pushes both. GitHub tests again and
   **deploys the website**,
4. builds the signed `.aab`: upload it to the Play Console.

One version, one tag, both platforms: the commit tagged `v1.74` is version 1.74 on the
website and on Google Play. Pushing to `develop` without a tag only runs the tests; the
website is not updated.

---

## 🤝 Contributing

This is an **Open Waqf** project. Contributions, translations, corrections to the Adhkar, and feature suggestions are
highly welcome. Please ensure that all Playwright tests pass (`npm run test`) before submitting a Pull Request!

---

## ⚖️ License & Legal

This project is licensed under the *
*[Polyform Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)**.

Unlike standard open-source licenses, this license prevents commercial exploitation of the code while keeping it
entirely free for the community.

### ✅ You Are Free To:

* **Use** this software for personal or community purposes.
* **Modify** the source code.
* **Distribute** your own versions (forks), even if you keep the source code closed.

### ❌ You May NOT:

* **Sell** this software or any derivative works.
* **Place Advertisements** inside the app.
* **Use** this software for any commercial or business purpose.

*Built with ❤️ for the Ummah.*
