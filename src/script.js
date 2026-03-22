import { createHapticsEngine } from './js/haptics.js';
import { Prefs } from './js/prefs.js';
import { createStorage } from './js/storage.js';
import { createStreak } from './js/streak.js';
import { createFavorites } from './js/favorites.js';
import { createReminders } from './js/reminders.js';
import { createAudioController } from './js/audio.js';
import { createUI } from './js/ui.js';
import { createFocus } from './js/focus.js';
import { createBackup } from './js/backup.js';
import { App } from './js/app.js';
import { MAIN_CATEGORIES, el, connectStorage, syncNavEffects, isCategoryCompleteDynamic, normalizeText, escapeHTML, highlightText, formatShortDate } from './js/utils.js';
import { initServiceWorker } from './js/sw-init.js';
import { initSettingsUI } from './js/settings.js';
import { wireGlobalListeners } from './js/listeners.js';

(() => {
    // ==========================================
    // 0. CONSTANTS
    // ==========================================
    const SUPPORTED_LANGS = new Set(["en", "ar", "fr", "it", "es"]);

    // ==========================================
    // 0b. SMALL DOM HELPERS
    // ==========================================
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 5000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    }

    async function requestPersistentWebStorage() {
        // Web-only: native app data uses Capacitor Preferences.
        const cap = window.Capacitor;
        if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return;

        const storageApi = navigator.storage;
        if (!storageApi || typeof storageApi.persist !== "function") return;

        try {
            if (typeof storageApi.persisted === "function") {
                const alreadyPersistent = await storageApi.persisted();
                if (alreadyPersistent) return;
            }
            await storageApi.persist();
        } catch {
            // Best-effort only; ignore unsupported/denied cases.
        }
    }

    // ==========================================
    // 0d. FIRST-RUN LANGUAGE DETECTION (strictly first run)
    // ==========================================
    function detectSystemLang() {
        const raw = (navigator.language || "en").toLowerCase();
        const primary = raw.split("-")[0]; // "it-IT" -> "it"
        return SUPPORTED_LANGS.has(primary) ? primary : "en";
    }

    async function initFirstRunLanguage() {
        const saved = Prefs.get("userLang");
        if (saved && SUPPORTED_LANGS.has(saved)) return saved;

        // Only detect if missing
        if (!saved) {
            const detected = detectSystemLang();
            await Prefs.set("userLang", detected);
            return detected;
        }

        // If saved is unsupported, fall back to English (safe)
        await Prefs.set("userLang", "en");
        return "en";
    }

    // ==========================================
    // 2. HAPTICS ENGINE (Capacitor first, Web fallback, never throws)
    // ==========================================
    const HapticsEngine = createHapticsEngine(() => App.isHapticEnabled);

    // ==========================================
    // 2b. STATUS BAR ENGINE (Safe Native Access)
    // ==========================================
    const StatusBarHelper = (() => {
        async function setStyle(isDark) {
            // 1. Safety Check: Are we native?
            const cap = window.Capacitor;
            if (!cap || !cap.isNativePlatform()) return;

            // 2. Access Plugin via Global (No Import needed)
            const SB = cap.Plugins?.StatusBar;
            if (!SB) return;

            // 3. Set Style safely using Strings
            try {
                // 'DARK' style = White Text (for Dark backgrounds)
                // 'LIGHT' style = Black Text (for Light backgrounds)
                await SB.setStyle({style: isDark ? 'DARK' : 'LIGHT'});
            } catch (e) {
                // Fail silently if plugin missing
            }
        }

        return {setStyle};
    })();

    // ==========================================
    // 3. STORAGE (behavior-preserving)
    // ==========================================
    const Storage = createStorage(() => ({
        App, Prefs, MAIN_CATEGORIES, UI, Streak, Reminders, HapticsEngine, syncNavEffects
    }));

    // Wire Storage into utils — MUST happen before init() runs,
    // as syncNavEffects / isItemDoneInCategory use _Storage at call time.
    connectStorage(Storage);

    // ==========================================
    // 4. FAVORITES
    // ==========================================
    const Favorites = createFavorites(() => ({ App, Prefs, HapticsEngine, UI }));

    // ==========================================
    // 5. BACKUP
    // ==========================================
    const Backup = createBackup(() => ({ App, Prefs, Storage, UI }));

    // ==========================================
    // 6. STREAK
    // ==========================================
    const Streak = createStreak(() => ({ App, Prefs, WidgetSync, formatShortDate }));

    // ==========================================
    // 7. FOCUS MODE
    // ==========================================
    const Focus = createFocus(() => ({ App, Storage, UI }));

    // ==========================================
    // 7.5. AUDIO CONTROLLER (Human Recitations)
    // ==========================================
    const AudioController = createAudioController(() => ({ App, UI, CFG, projectUrl }));

    function isNativeCapacitor() {
        const cap = window.Capacitor;
        if (!cap) return false;
        if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
        const p = typeof cap.getPlatform === "function" ? cap.getPlatform() : "web";
        return p !== "web";
    }

    async function openExternal(url) {
        const Browser = window.Capacitor?.Plugins?.Browser;
        if (Browser?.open) {
            try {
                await Browser.open({url});
                return;
            } catch {
            }
        }
        window.open(url, "_blank", "noopener");
    }

    const WidgetSync = {
        async requestUpdate() {
            if (!isNativeCapacitor()) return;
            const updater = window.Capacitor?.Plugins?.WidgetUpdater;
            if (!updater?.update) return;
            try {
                await updater.update();
            } catch (e) {
                console.warn("Widget update failed", e);
            }
        }
    };

    function CFG(key, fallback = "") {
        // config lives in merged language dict because you spread defaults into each language
        return App.uiStrings?.[App.currentLang]?.[key] ?? App.uiStrings?.en?.[key] ?? fallback;
    }

    function projectUrl() {
        return String(CFG("website", "https://wird.open-waqf.org/")).replace(/\/+$/, "");
    }

    function apkUrl() {
        // prefer apk_url; fallback to website + /app/wird.apk
        const direct = CFG("apk_url", "");
        if (direct) return direct;
        return `${projectUrl()}/app/wird.apk`;
    }

    function contactEmail() {
        return CFG("contact_email", "wird-app@proton.me");
    }

    // ==========================================
    // 8. UI
    // ==========================================
    const UI = createUI(() => ({
        App, Prefs, Storage, HapticsEngine, AudioController, Favorites, Focus,
        MAIN_CATEGORIES, isCategoryCompleteDynamic, normalizeText, escapeHTML,
        highlightText, isNativeCapacitor, openExternal, projectUrl, syncNavEffects
    }));

    // ==========================================
    // 8.5. REMINDERS & NOTIFICATIONS
    // ==========================================
    const Reminders = createReminders(() => ({ App, Prefs, Storage, UI }));

    // getDeps factory — passed to extracted modules that need runtime instances
    function getDeps() {
        return {
            App, Prefs, Storage, UI, Reminders, Focus, Backup,
            HapticsEngine, AudioController, Favorites, Streak,
            projectUrl
        };
    }

    // ==========================================
    // 10. INIT (Updated for SEO & Capacitor Safety)
    // ==========================================
    async function init() {
        try {
            // --- 0. PREFERENCES & MIGRATION ---
            await Prefs.migrate();
            await Prefs.loadAll();
            await requestPersistentWebStorage();

            // --- 1. SETTINGS SYNC ---
            App.currentLang = await initFirstRunLanguage();
            App.showDetails = Prefs.get("showDetails") === "true";
            App.isKidsMode = Prefs.get("isKidsMode") === "true";
            App.isHapticEnabled = Prefs.get("isHapticEnabled") !== "false";
            try {
                App.favorites = JSON.parse(Prefs.get("wird_favorites") || "[]");
            } catch {
                App.favorites = [];
            }

            document.documentElement.lang = App.currentLang;
            document.documentElement.dir = App.currentLang === "ar" ? "rtl" : "ltr";

            // --- 2. Service Worker Version Check ---
            try {
                const swResponse = await fetchWithTimeout("sw.js");
                const swText = await swResponse.text();
                const versionMatch = swText.match(/CACHE_NAME\s*=\s*["']([^"']+)["']/);
                const version = versionMatch ? versionMatch[1] : "Unknown Version";
                console.log(`✅ Wird App Script [${version}] Loaded`);
                const versionEl = el("appVersion");
                if (versionEl) versionEl.innerText = version.replace("wird-", "");
            } catch {
                console.log("✅ Wird App Script Loaded (Dev Mode)");
            }

            // --- 2. SEO: Handle URL Language Param ---
            // This allows links like wird.open-waqf.org/?lang=fr to work for Google
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            if (urlLang && SUPPORTED_LANGS.has(urlLang)) {
                await Prefs.set("userLang", urlLang);
                App.currentLang = urlLang;
            }

            // --- 3. Capacitor Native Bridge (Safe Mode) ---
            const capApp = window.Capacitor?.Plugins?.App; // Safe access

            if (capApp) {
                // Only attach this listener if we are actually in the Native App
                capApp.addListener('backButton', ({canGoBack}) => {
                    const focusModal = el('focusModal');
                    const settingsModal = el('settingsModal');

                    // Priority 1: Close Focus Modal
                    if (focusModal && !focusModal.classList.contains('hidden')) {
                        Focus.close();
                    }
                    // Priority 2: Close Settings Modal
                    else if (settingsModal && !settingsModal.classList.contains('hidden')) {
                        settingsModal.classList.add('hidden');
                        settingsModal.classList.add('opacity-0'); // visual transition reset
                    }
                    // Priority 3: Go back in history (if any)
                    else if (canGoBack) {
                        window.history.back();
                    }
                    // Priority 4: Exit App
                    else {
                        capApp.exitApp();
                    }
                });
            }

            // --- 4. Load Data & Strings ---
            let adhkarRes, stringsRes;
            try {
                [adhkarRes, stringsRes] = await Promise.all([
                    fetchWithTimeout("data.json"),
                    fetchWithTimeout("strings.json")
                ]);
            } catch (e) {
                console.error("Data load failed, using empty defaults", e);
                adhkarRes = null;
                stringsRes = null;
            }

            if (adhkarRes) App.adhkarData = await adhkarRes.json(); else App.adhkarData = [];

            let rawStrings = null;
            try {
                rawStrings = stringsRes ? await stringsRes.json() : null;
            } catch {
                rawStrings = null;
            }

            App.uiStrings = {};
            if (rawStrings) {
                const defaults = rawStrings.default || {};
                Object.keys(rawStrings).forEach((lang) => {
                    if (lang !== "default") App.uiStrings[lang] = {...defaults, ...rawStrings[lang]};
                });
            } else {
                App.uiStrings.en = {};
            }

            if (!App.uiStrings[App.currentLang]) {
                App.currentLang = "en";
                await Prefs.set("userLang", "en");
            }

            // --- 5. Handle "Verify" Redirects ---
            const verifyId = urlParams.get("verify");
            if (verifyId) {
                const it = App.adhkarData.find((x) => x.id === verifyId);
                if (it?.verify_url) {
                    if (isNativeCapacitor()) {
                        await openExternal(it.verify_url);
                    } else {
                        window.location.href = it.verify_url;
                    }
                    return;
                }
            }

            // --- 5.5. Handle "Adhkar" Deep Links (Share URLs) ---
            const validCats = ["morning", "evening", "waking", "sleep", "favorites"];
            const adhkarId = urlParams.get("adhkar");

            if (adhkarId) {
                const it = App.adhkarData.find((x) => x.id === adhkarId);
                if (it) {
                    // If Kids Mode would hide the shared item, disable it so the link works
                    if (App.isKidsMode && !it.is_kids) {
                        App.isKidsMode = false;
                        await Prefs.set("isKidsMode", "false");
                    }
                    UI.toast(App.uiStrings[App.currentLang]?.kids_mode_disabled_link || "Kids Mode was turned off to show this link.", "info", 3500);

                    // Set category based on the shared item (so it appears in the list)
                    const itemCats = Array.isArray(it.category) ? it.category : [it.category];
                    const catFromItem = itemCats.find((c) => validCats.includes(c));
                    if (catFromItem) App.currentCategory = catFromItem;

                    // Remember the item to scroll to after render
                    App.pendingScrollToAdhkarId = adhkarId;

                    // Clean URL so refresh doesn't stick
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }

            // --- 6. Category Shortcut ---
            const shortcutCat = urlParams.get("category");

            if (shortcutCat && validCats.includes(shortcutCat)) {
                App.currentCategory = shortcutCat;
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                // REFINED Auto-detect brackets for better UX
                const hour = new Date().getHours();

                // 04:00 AM to 12:59 PM
                if (hour >= 4 && hour < 13) {
                    App.currentCategory = "morning";
                }
                // 13:00 (1:00 PM) to 19:59 (7:59 PM)
                else if (hour >= 13 && hour < 20) {
                    App.currentCategory = "evening";
                }
                // 20:00 (8:00 PM) to 03:59 AM
                else {
                    App.currentCategory = "sleep";
                }
            }

            // --- 7. Setup External Links (Native vs Web) ---
            const contactBtn = el("contactBtn");
            if (contactBtn) {
                const email = contactEmail();
                contactBtn.href = `mailto:${email}`;
                contactBtn.addEventListener("click", (e) => {
                    if (!isNativeCapacitor()) return;
                    e.preventDefault();
                    openExternal(`mailto:${email}`);
                });
            }

            const apkLink = el("apkDownloadLink");
            if (apkLink) {
                if (isNativeCapacitor()) {
                    // HIDE IT IN ANDROID APP
                    apkLink.closest('div').style.display = 'none';
                } else {
                    const url = apkUrl();
                    apkLink.href = url;
                    apkLink.addEventListener("click", (e) => {
                        if (!isNativeCapacitor()) return;
                        e.preventDefault();
                        openExternal(url);
                    });
                }
            }

            // --- 8. Theme Init ---
            const themeToggle = el("themeToggle");
            const oledToggle = el("oledToggle");
            let isOled = Prefs.get("oledMode") === "true";
            let isDark = Prefs.get("darkMode") === "true";

            function updateWebMetaTheme(isDark) {
                let meta = document.querySelector('meta[name="theme-color"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = "theme-color";
                    document.head.appendChild(meta);
                }
                meta.content = isDark ? "#0f172a" : "#ffffff";
            }

            function applyTheme() {
                if (isDark) {
                    document.body.classList.add("dark");
                    if (themeToggle) themeToggle.innerText = "☀️";
                } else {
                    document.body.classList.remove("dark");
                    if (themeToggle) themeToggle.innerText = "🌙";
                }
                if (isOled && isDark) document.body.classList.add("oled");
                else document.body.classList.remove("oled");

                if (oledToggle) oledToggle.checked = isOled;
                updateWebMetaTheme(isDark);
                StatusBarHelper.setStyle(isDark);
            }

            if (themeToggle) {
                themeToggle.onclick = async () => {
                    isDark = !isDark;
                    await Prefs.set("darkMode", String(isDark));
                    applyTheme();
                };
            }

            if (oledToggle) {
                oledToggle.onchange = async (e) => {
                    isOled = e.target.checked;
                    await Prefs.set("oledMode", String(isOled));
                    if (isOled && !isDark) {
                        isDark = true;
                        await Prefs.set("darkMode", "true");
                    }
                    applyTheme();
                };
            }

            // --- 9. Final Render & UI ---
            const langSelect = el("langSelect");
            if (langSelect) langSelect.value = App.currentLang;

            // Apply Dynamic Meta Title for SEO (e.g. "Wird - Morning")
            if (App.uiStrings[App.currentLang]?.app_name) {
                document.title = App.uiStrings[App.currentLang].app_name + " - " + (App.uiStrings[App.currentLang][App.currentCategory] || "Adhkar");
            }

            applyTheme();
            UI.applyUITranslations();
            App.checkFestivals();
            UI.render(false);
            UI.updateCategoryUI();

            // Scroll to shared adhkar card (if any)
            if (App.pendingScrollToAdhkarId) {
                setTimeout(() => {
                    const id = App.pendingScrollToAdhkarId;
                    const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');

                    // Favorite button exists on every card and carries data-id
                    const anyEl = document.querySelector(`[data-id="${esc(id)}"]`);
                    const card = anyEl?.closest(".adhkar-card");

                    if (card) {
                        card.scrollIntoView({behavior: "smooth", block: "start"});

                        // Optional: temporary highlight so user sees it immediately
                        card.classList.add(
                            "ring-2",
                            "ring-emerald-400",
                            "ring-offset-2",
                            "ring-offset-white",
                            "dark:ring-offset-slate-900"
                        );
                        setTimeout(() => {
                            card.classList.remove(
                                "ring-2",
                                "ring-emerald-400",
                                "ring-offset-2",
                                "ring-offset-white",
                                "dark:ring-offset-slate-900"
                            );
                        }, 2000);
                    }

                    App.pendingScrollToAdhkarId = null;
                }, 300);
            }

            // Safe Scroll
            setTimeout(() => {
                UI.scrollToActiveCategory();
            }, 300);

            syncNavEffects();
            UI.initFontSize();
            UI.initVoiceSpeed();
            initSettingsUI();
            AudioController.init();
            await Reminders.init();
            await Streak.awardForToday();

        } catch (e) {
            console.error("Init error:", e);
        }
    }

    // ==========================================
    // 13. BOOT
    // ==========================================
    (async () => {
        await init();
        wireGlobalListeners(getDeps);
        initServiceWorker(getDeps);
    })();

})();
