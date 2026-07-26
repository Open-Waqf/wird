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

1. **Android:** Download directly from [Google Play](https://play.google.com/store/apps/details?id=org.openwaqf.wird) or
   grab the latest `.apk` from the [Releases](https://github.com/open-waqf/wird/releases) tab.
2. **iOS / iPhone:** Open the website in Safari, tap the Share icon ⍗, and select **Add to Home Screen ⊞**.
3. **Desktop:** Click the "Install App" icon in the address bar of Chrome, Edge, or Brave.

---

## 🛠️ Build from Source (Developers)

If you want to contribute to the code, run the tests, or build your own APK, follow these steps:

### Prerequisites

* **Node.js** (v18+)
* **Android SDK** (Platform 36 + Build-Tools; e.g. via Android Studio or the command-line tools)
* **JDK 17 or 21** (Android Studio bundles one; a standalone Temurin JDK also works)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/open-waqf/wird.git
cd wird
npm install

```

### 2. Build the CSS (Tailwind)

```bash
# Compile and minify the Tailwind CSS for production
npm run build:css

# (Optional) Watch for CSS changes during development
npm run watch:css

```

### 3. Run E2E Tests (Playwright)

We use Playwright to ensure the app remains bug-free across browser updates.

```bash
# Run tests silently in the background
npm run test

# Run tests visually in the Playwright UI dashboard
npm run test:ui

```

### 4. Build the Android App

First tell Gradle where your SDK is (once): create `android/local.properties` with

```properties
sdk.dir=/absolute/path/to/Android/Sdk
```

This file is git-ignored. On Linux the SDK is usually at `~/Android/Sdk`.

#### Debug build (quick, unsigned)

1. Sync web assets to the native project: `npx cap sync android`
2. Open the `android` folder in **Android Studio**, let Gradle sync.
3. **Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)** → output in `android/app/build/outputs/apk/debug/`.

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
> produces an **unsigned** bundle. Remember to bump `versionCode` in
> `android/app/build.gradle` for every Play release.

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
