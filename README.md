# Wird (ورد)

**Open Source, Offline-First Islamic Adhkar**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Live](https://img.shields.io/badge/Status-Live-success.svg)](https://wird.open-waqf.org)

**Wird** is a privacy-focused Progressive Web App (PWA) and Android app designed to help you read your Morning and
Evening Adhkar (supplications) without distractions. It works 100% offline, contains no ads, and tracks no personal
data.

🔗 **Use the App:** [wird.open-waqf.org](https://wird.open-waqf.org)

---

## 🌟 Key Features

* **100% Offline:** Works in Airplane mode. Load it once, use it forever.
* **Privacy First:** No tracking, no analytics, no servers. Your data stays on your device.
* **Focus Mode:** A clean interface that helps you concentrate on the meaning.
* **Smart Haptics:** Physical vibration feedback for Tasbih counting.
* **Kids Mode:** Simplified interface for younger users.

## 📱 How to Install (Standard Users)

1. **Android APK:** Download the latest `.apk` from the [Releases](https://github.com/open-waqf/wird/releases) section
   and install it manually.
2. **PWA:** Open the website in Chrome/Safari and select "Add to Home Screen".

---

## 🛠️ Build from Source (Developers)

If you want to contribute to the code or build your own APK, follow these steps:

### Prerequisites

* **Node.js** (v18+)
* **Android Studio** (with Android SDK and Build Tools)

### 1. Clone & Install

```bash
git clone [https://github.com/open-waqf/wird.git](https://github.com/open-waqf/wird.git)
cd wird
npm install

```

### 2. Build Web Assets

```bash
# This prepares the files in the /www directory
npm run build 

```

### 3. Sync with Android

```bash
npx cap sync android

```

### 4. Build the APK

1. Open **Android Studio**.
2. Select **Open an existing project** and choose the `android` folder in this repository.
3. Wait for Gradle to sync.
4. Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. The finished file will be located in `android/app/build/outputs/apk/debug/`.

---

## 🤝 Contributing

This is an **Open Waqf** project. Contributions, corrections, and feature suggestions are welcome.

## ⚖️ License & Legal

This project is licensed under the **[Polyform Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)**.

Unlike standard open-source licenses, this license prevents commercial exploitation of the code while keeping it free for the community.

### ✅ You Are Free To:
* **Use** this software for personal or community purposes.
* **Modify** the source code.
* **Distribute** your own versions (forks), even if you keep the source code closed.

### ❌ You May NOT:
* **Sell** this software or any derivative works.
* **Place Advertisements** inside the app.
* **Use** this software for any commercial business purpose.

*Built with ❤️ for the Ummah.*