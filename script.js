import { createHapticsEngine } from "./js/haptics.js";

import { Prefs } from "./js/prefs.js";

import { createStorage } from "./js/storage.js";

import { createStreak } from "./js/streak.js";

import { createFavorites } from "./js/favorites.js";

import { createReminders } from "./js/reminders.js";

import { createAudioController } from "./js/audio.js";

import { createUI } from "./js/ui.js";

import { createFocus } from "./js/focus.js";

import { createBackup } from "./js/backup.js";

(() => {
    const SUPPORTED_LANGS = new Set([ "en", "ar", "fr", "it", "es" ]);
    const el = id => document.getElementById(id);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const MAIN_CATEGORIES = [ "morning", "evening", "waking", "sleep" ];
    async function fetchWithTimeout(resource, options = {}) {
        const {timeout: timeout = 5e3} = options;
        const controller = new AbortController;
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
        } catch {}
    }
    function detectSystemLang() {
        const raw = (navigator.language || "en").toLowerCase();
        const primary = raw.split("-")[0];
        return SUPPORTED_LANGS.has(primary) ? primary : "en";
    }
    async function initFirstRunLanguage() {
        const saved = Prefs.get("userLang");
        if (saved && SUPPORTED_LANGS.has(saved)) return saved;
        if (!saved) {
            const detected = detectSystemLang();
            await Prefs.set("userLang", detected);
            return detected;
        }
        await Prefs.set("userLang", "en");
        return "en";
    }
    function syncNavEffects() {
        const nav = document.querySelector("nav");
        if (!nav) return;
        const state = Storage.getSavedState();
        const allDone = MAIN_CATEGORIES.every(cat => isCategoryCompleteDynamic(state, cat));
        if (allDone) {
            nav.classList.add("nav-reward-all-done");
        } else {
            nav.classList.remove("nav-reward-all-done");
        }
    }
    function formatShortDate(dStr) {
        try {
            const d = new Date(dStr);
            if (Number.isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString(App.currentLang || "en", {
                year: "numeric",
                month: "short",
                day: "numeric"
            });
        } catch {
            return dStr;
        }
    }
    function isItemDoneInCategory(state, category, itemId) {
        const key = Storage.getStorageKeyForCategory(category, itemId);
        return state.completedIds.includes(key);
    }
    function isItemDoneAnywhere(state, item) {
        const cats = Array.isArray(item.category) ? item.category : [ item.category ];
        for (const c of cats) {
            if (MAIN_CATEGORIES.includes(c) && isItemDoneInCategory(state, c, item.id)) return true;
        }
        const suffix = `_${item.id}`;
        return state.completedIds.some(k => k.endsWith(suffix));
    }
    function isCategoryCompleteDynamic(state, category) {
        if (category === "favorites") {
            const favs = (App.favorites || []).map(id => App.adhkarData.find(x => x.id === id)).filter(Boolean);
            if (favs.length === 0) return false;
            return favs.every(it => isItemDoneAnywhere(state, it));
        }
        const target = App.adhkarData.filter(item => {
            const cats = Array.isArray(item.category) ? item.category : [ item.category ];
            if (!cats.includes(category)) return false;
            if (App.isKidsMode && !item.is_kids) return false;
            return true;
        });
        if (target.length === 0) return false;
        return target.every(it => isItemDoneInCategory(state, category, it.id));
    }
    const App = {
        adhkarData: [],
        uiStrings: {},
        currentLang: "en",
        showDetails: false,
        currentCategory: "morning",
        isKidsMode: false,
        isHapticEnabled: true,
        currentUtterance: null,
        currentAudioId: null,
        deferredPrompt: null,
        favorites: [],
        focusState: {
            currentVal: 0,
            targetVal: 0,
            cardId: null
        },
        searchQuery: "",
        checkFestivals() {
            const bBody = document.body;
            bBody.classList.remove("fest-ramadan", "fest-eid-fitr", "fest-eid-adha", "fest-hajj");
            if (Prefs.get("wird_show_decorations") === "false") return;
            const date = new Date;
            let day = date.getDate();
            let month = date.getMonth();
            let year = date.getFullYear();
            if (year < 1700) return;
            let m = month + 1;
            let y = year;
            if (m < 3) {
                y -= 1;
                m += 12;
            }
            let a = Math.floor(y / 100);
            let b = 2 - a + Math.floor(a / 4);
            let jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
            let z = jd + 1;
            let cyc = Math.floor((z - 1948440) / 10631);
            let rem = (z - 1948440) % 10631;
            let yyc = Math.floor(rem / 354);
            let rrem = rem % 354;
            let hYear = Math.floor(cyc * 30 + yyc);
            let hMonth = 1;
            let hDay = rrem;
            const monthDays = [ 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29 ];
            for (let i = 0; i < 12; i++) {
                let duration = i % 2 === 0 ? 30 : 29;
                if (hDay <= duration) {
                    hMonth = i + 1;
                    break;
                }
                hDay -= duration;
            }
            if (hMonth === 9) bBody.classList.add("fest-ramadan"); else if (hMonth === 10 && hDay <= 3) bBody.classList.add("fest-eid-fitr"); else if (hMonth === 12) {
                if (hDay <= 9) bBody.classList.add("fest-hajj"); else if (hDay <= 13) bBody.classList.add("fest-eid-adha");
            }
        }
    };
    function normalizeText(str) {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0617-\u061A\u064B-\u0652]/g, "").toLowerCase();
    }
    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>'"]/g, tag => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        }[tag] || tag));
    }
    function highlightText(text, query) {
        if (!query || !text) return escapeHTML(text);
        const escapedText = escapeHTML(text);
        const escapedQuery = escapeHTML(query).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(`(${escapedQuery})`, "gi");
        return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }
    const HapticsEngine = createHapticsEngine(() => App.isHapticEnabled);
    const StatusBarHelper = (() => {
        async function setStyle(isDark) {
            const cap = window.Capacitor;
            if (!cap || !cap.isNativePlatform()) return;
            const SB = cap.Plugins?.StatusBar;
            if (!SB) return;
            try {
                await SB.setStyle({
                    style: isDark ? "DARK" : "LIGHT"
                });
            } catch (e) {}
        }
        return {
            setStyle: setStyle
        };
    })();
    const Storage = createStorage(() => ({
        App: App,
        Prefs: Prefs,
        MAIN_CATEGORIES: MAIN_CATEGORIES,
        UI: UI,
        Streak: Streak,
        Reminders: Reminders,
        HapticsEngine: HapticsEngine,
        syncNavEffects: syncNavEffects
    }));
    const Favorites = createFavorites(() => ({
        App: App,
        Prefs: Prefs,
        HapticsEngine: HapticsEngine,
        UI: UI
    }));
    const Backup = createBackup(() => ({
        App: App,
        Prefs: Prefs,
        Storage: Storage,
        UI: UI
    }));
    const Streak = createStreak(() => ({
        App: App,
        Prefs: Prefs,
        WidgetSync: WidgetSync,
        formatShortDate: formatShortDate
    }));
    const Focus = createFocus(() => ({
        App: App,
        Storage: Storage,
        UI: UI
    }));
    const AudioController = createAudioController(() => ({
        App: App,
        UI: UI,
        CFG: CFG,
        projectUrl: projectUrl
    }));
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
                await Browser.open({
                    url: url
                });
                return;
            } catch {}
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
        return App.uiStrings?.[App.currentLang]?.[key] ?? App.uiStrings?.en?.[key] ?? fallback;
    }
    function projectUrl() {
        return String(CFG("website", "https://wird.open-waqf.org/")).replace(/\/+$/, "");
    }
    function apkUrl() {
        const direct = CFG("apk_url", "");
        if (direct) return direct;
        return `${projectUrl()}/app/wird.apk`;
    }
    function contactEmail() {
        return CFG("contact_email", "wird-app@proton.me");
    }
    const UI = createUI(() => ({
        App: App,
        Prefs: Prefs,
        Storage: Storage,
        HapticsEngine: HapticsEngine,
        AudioController: AudioController,
        Favorites: Favorites,
        Focus: Focus,
        MAIN_CATEGORIES: MAIN_CATEGORIES,
        isCategoryCompleteDynamic: isCategoryCompleteDynamic,
        normalizeText: normalizeText,
        escapeHTML: escapeHTML,
        highlightText: highlightText,
        isNativeCapacitor: isNativeCapacitor,
        openExternal: openExternal,
        projectUrl: projectUrl,
        syncNavEffects: syncNavEffects
    }));
    const Reminders = createReminders(() => ({
        App: App,
        Prefs: Prefs,
        Storage: Storage,
        UI: UI
    }));
    function initSettingsUI() {
        const modal = el("settingsModal");
        const panel = el("modalContent");
        const openBtn = el("settingsBtn");
        const closeBtn = el("settingsCloseBtn");
        let lastFocus = null;
        let isOpen = false;
        const getFocusable = () => {
            if (!panel) return [];
            return qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel).filter(n => !n.disabled && n.offsetParent !== null);
        };
        const open = () => {
            if (!modal || !panel) return;
            lastFocus = document.activeElement;
            isOpen = true;
            document.body.classList.add("modal-open");
            panel.setAttribute("aria-hidden", "false");
            modal.classList.remove("hidden");
            setTimeout(() => {
                modal.classList.remove("opacity-0");
                panel.classList.remove("scale-95");
                const focusables = getFocusable();
                (focusables[0] || panel).focus?.();
            }, 10);
        };
        const close = () => {
            if (!modal || !panel) return;
            isOpen = false;
            if (lastFocus && lastFocus.focus) {
                lastFocus.focus();
            } else if (document.activeElement) {
                document.activeElement.blur();
            }
            panel.setAttribute("aria-hidden", "true");
            modal.classList.add("opacity-0");
            panel.classList.add("scale-95");
            document.body.classList.remove("modal-open");
            setTimeout(() => {
                modal.classList.add("hidden");
            }, 300);
        };
        if (openBtn) openBtn.onclick = open;
        if (closeBtn) closeBtn.onclick = e => {
            e.stopPropagation();
            close();
        };
        if (modal) {
            modal.onclick = e => {
                if (e.target === modal) close();
            };
        }
        document.addEventListener("keydown", e => {
            if (!isOpen) return;
            if (e.key === "Escape") {
                e.preventDefault();
                close();
                return;
            }
            if (e.key === "Tab") {
                const focusables = getFocusable();
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }, true);
    }
    async function init() {
        try {
            await Prefs.migrate();
            await Prefs.loadAll();
            await requestPersistentWebStorage();
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
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get("lang");
            if (urlLang && SUPPORTED_LANGS.has(urlLang)) {
                await Prefs.set("userLang", urlLang);
                App.currentLang = urlLang;
            }
            const capApp = window.Capacitor?.Plugins?.App;
            if (capApp) {
                capApp.addListener("backButton", ({canGoBack: canGoBack}) => {
                    const focusModal = el("focusModal");
                    const settingsModal = el("settingsModal");
                    if (focusModal && !focusModal.classList.contains("hidden")) {
                        Focus.close();
                    } else if (settingsModal && !settingsModal.classList.contains("hidden")) {
                        settingsModal.classList.add("hidden");
                        settingsModal.classList.add("opacity-0");
                    } else if (canGoBack) {
                        window.history.back();
                    } else {
                        capApp.exitApp();
                    }
                });
            }
            let adhkarRes, stringsRes;
            try {
                [adhkarRes, stringsRes] = await Promise.all([ fetchWithTimeout("data.json"), fetchWithTimeout("strings.json") ]);
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
                Object.keys(rawStrings).forEach(lang => {
                    if (lang !== "default") App.uiStrings[lang] = {
                        ...defaults,
                        ...rawStrings[lang]
                    };
                });
            } else {
                App.uiStrings.en = {};
            }
            if (!App.uiStrings[App.currentLang]) {
                App.currentLang = "en";
                await Prefs.set("userLang", "en");
            }
            const verifyId = urlParams.get("verify");
            if (verifyId) {
                const it = App.adhkarData.find(x => x.id === verifyId);
                if (it?.verify_url) {
                    if (isNativeCapacitor()) {
                        await openExternal(it.verify_url);
                    } else {
                        window.location.href = it.verify_url;
                    }
                    return;
                }
            }
            const validCats = [ "morning", "evening", "waking", "sleep", "favorites" ];
            const adhkarId = urlParams.get("adhkar");
            if (adhkarId) {
                const it = App.adhkarData.find(x => x.id === adhkarId);
                if (it) {
                    if (App.isKidsMode && !it.is_kids) {
                        App.isKidsMode = false;
                        await Prefs.set("isKidsMode", "false");
                    }
                    UI.toast(App.uiStrings[App.currentLang]?.kids_mode_disabled_link || "Kids Mode was turned off to show this link.", "info", 3500);
                    const itemCats = Array.isArray(it.category) ? it.category : [ it.category ];
                    const catFromItem = itemCats.find(c => validCats.includes(c));
                    if (catFromItem) App.currentCategory = catFromItem;
                    App.pendingScrollToAdhkarId = adhkarId;
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }
            const shortcutCat = urlParams.get("category");
            if (shortcutCat && validCats.includes(shortcutCat)) {
                App.currentCategory = shortcutCat;
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                const hour = (new Date).getHours();
                if (hour >= 4 && hour < 13) {
                    App.currentCategory = "morning";
                } else if (hour >= 13 && hour < 20) {
                    App.currentCategory = "evening";
                } else {
                    App.currentCategory = "sleep";
                }
            }
            const contactBtn = el("contactBtn");
            if (contactBtn) {
                const email = contactEmail();
                contactBtn.href = `mailto:${email}`;
                contactBtn.addEventListener("click", e => {
                    if (!isNativeCapacitor()) return;
                    e.preventDefault();
                    openExternal(`mailto:${email}`);
                });
            }
            const apkLink = el("apkDownloadLink");
            if (apkLink) {
                if (isNativeCapacitor()) {
                    apkLink.closest("div").style.display = "none";
                } else {
                    const url = apkUrl();
                    apkLink.href = url;
                    apkLink.addEventListener("click", e => {
                        if (!isNativeCapacitor()) return;
                        e.preventDefault();
                        openExternal(url);
                    });
                }
            }
            const themeToggle = el("themeToggle");
            const oledToggle = el("oledToggle");
            let isOled = Prefs.get("oledMode") === "true";
            let isDark = Prefs.get("darkMode") === "true";
            function updateWebMetaTheme(isDark) {
                let meta = document.querySelector('meta[name="theme-color"]');
                if (!meta) {
                    meta = document.createElement("meta");
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
                if (isOled && isDark) document.body.classList.add("oled"); else document.body.classList.remove("oled");
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
                oledToggle.onchange = async e => {
                    isOled = e.target.checked;
                    await Prefs.set("oledMode", String(isOled));
                    if (isOled && !isDark) {
                        isDark = true;
                        await Prefs.set("darkMode", "true");
                    }
                    applyTheme();
                };
            }
            const langSelect = el("langSelect");
            if (langSelect) langSelect.value = App.currentLang;
            if (App.uiStrings[App.currentLang]?.app_name) {
                document.title = App.uiStrings[App.currentLang].app_name + " - " + (App.uiStrings[App.currentLang][App.currentCategory] || "Adhkar");
            }
            applyTheme();
            UI.applyUITranslations();
            App.checkFestivals();
            UI.render(false);
            UI.updateCategoryUI();
            if (App.pendingScrollToAdhkarId) {
                setTimeout(() => {
                    const id = App.pendingScrollToAdhkarId;
                    const esc = s => window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
                    const anyEl = document.querySelector(`[data-id="${esc(id)}"]`);
                    const card = anyEl?.closest(".adhkar-card");
                    if (card) {
                        card.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });
                        card.classList.add("ring-2", "ring-emerald-400", "ring-offset-2", "ring-offset-white", "dark:ring-offset-slate-900");
                        setTimeout(() => {
                            card.classList.remove("ring-2", "ring-emerald-400", "ring-offset-2", "ring-offset-white", "dark:ring-offset-slate-900");
                        }, 2e3);
                    }
                    App.pendingScrollToAdhkarId = null;
                }, 300);
            }
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
    function wireGlobalListeners() {
        const skipLink = document.querySelector(".skip-link");
        if (skipLink) {
            skipLink.onclick = e => {
                e.preventDefault();
                const target = el("adhkar-container");
                if (target) {
                    target.focus();
                    target.scrollIntoView();
                }
            };
        }
        const searchToggleBtn = el("searchToggleBtn");
        const searchCloseBtn = el("searchCloseBtn");
        const searchInput = el("searchInput");
        const defaultNav = el("defaultNavContent");
        const searchNav = el("searchNavContent");
        let searchTimeout;
        const openSearch = () => {
            if (defaultNav && searchNav) {
                defaultNav.style.pointerEvents = "none";
                defaultNav.classList.add("opacity-0");
                searchNav.style.pointerEvents = "auto";
                searchNav.classList.remove("opacity-0");
                setTimeout(() => searchInput?.focus(), 50);
            }
        };
        const closeSearch = () => {
            if (defaultNav && searchNav) {
                defaultNav.style.pointerEvents = "auto";
                defaultNav.classList.remove("opacity-0");
                searchNav.style.pointerEvents = "none";
                searchNav.classList.add("opacity-0");
                if (App.searchQuery) {
                    App.searchQuery = "";
                    if (searchInput) searchInput.value = "";
                    UI.render(false);
                }
            }
        };
        if (searchToggleBtn) searchToggleBtn.addEventListener("click", openSearch);
        if (searchCloseBtn) searchCloseBtn.addEventListener("click", closeSearch);
        if (searchInput) {
            searchInput.addEventListener("input", e => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    App.searchQuery = e.target.value.trim();
                    UI.render(false);
                }, 200);
            });
            searchInput.addEventListener("keydown", e => {
                if (e.key === "Escape") closeSearch();
            });
        }
        let pendingCategory = null;
        [ "favorites", "morning", "evening", "waking", "sleep" ].forEach(cat => {
            const btn = el(`btn-${cat}`);
            if (btn) {
                btn.onclick = () => {
                    const wrapper = el("card-wrapper");
                    if (!wrapper) return;
                    if (window.speechSynthesis) window.speechSynthesis.cancel();
                    if (App.searchQuery) {
                        closeSearch();
                    }
                    pendingCategory = cat;
                    if (wrapper.classList.contains("fade-out-left")) return;
                    wrapper.classList.remove("fade-out-right");
                    wrapper.classList.add("fade-out-left");
                    let transitionFinished = false;
                    const onTransitionEnd = e => {
                        if (transitionFinished) return;
                        if (e && e.target !== wrapper) return;
                        transitionFinished = true;
                        if (safetyTimeout) clearTimeout(safetyTimeout);
                        wrapper.removeEventListener("transitionend", onTransitionEnd);
                        App.currentCategory = pendingCategory;
                        UI.updateCategoryUI();
                        UI.render(true);
                        wrapper.classList.remove("fade-out-left");
                        wrapper.classList.add("fade-out-right");
                        void wrapper.offsetWidth;
                        wrapper.classList.remove("fade-out-right");
                    };
                    wrapper.addEventListener("transitionend", onTransitionEnd);
                    const safetyTimeout = setTimeout(onTransitionEnd, 400);
                };
            }
        });
        const kidsToggle = el("kidsToggle");
        if (kidsToggle) {
            kidsToggle.checked = App.isKidsMode;
            document.body.classList.toggle("theme-kids", App.isKidsMode);
            kidsToggle.onchange = async e => {
                App.isKidsMode = e.target.checked;
                await Prefs.set("isKidsMode", String(App.isKidsMode));
                document.body.classList.toggle("theme-kids", App.isKidsMode);
                UI.render();
            };
        }
        const decorationsToggle = el("decorationsToggle");
        if (decorationsToggle) {
            const savedDeco = Prefs.get("wird_show_decorations") !== "false";
            decorationsToggle.checked = savedDeco;
            decorationsToggle.onchange = async e => {
                await Prefs.set("wird_show_decorations", String(e.target.checked));
                App.checkFestivals();
            };
        }
        const langSelect = el("langSelect");
        if (langSelect) {
            langSelect.onchange = async e => {
                App.currentLang = e.target.value;
                await Prefs.set("userLang", App.currentLang);
                UI.applyUITranslations();
                UI.updateCategoryUI();
                UI.render();
                if (Prefs.get("wird_reminders_enabled") === "true") {
                    await Reminders.scheduleAll();
                }
            };
        }
        const resetFabBtn = el("resetFabBtn");
        if (resetFabBtn) {
            resetFabBtn.onclick = async e => {
                e.stopPropagation();
                await Storage.resetCurrentCategory();
            };
        }
        const fabContainer = el("fabContainer");
        const navTitleContainer = el("navTitleContainer");
        const scrollTopBtn = el("scrollTopBtn");
        if (scrollTopBtn) {
            window.onscroll = () => {
                const scrollY = window.scrollY || document.documentElement.scrollTop;
                if (scrollY > 300) fabContainer?.classList.add("visible"); else fabContainer?.classList.remove("visible");
                if (navTitleContainer) {
                    if (scrollY > 100) {
                        navTitleContainer.classList.remove("nav-state-app");
                        navTitleContainer.classList.add("nav-state-cat");
                    } else {
                        navTitleContainer.classList.add("nav-state-app");
                        navTitleContainer.classList.remove("nav-state-cat");
                    }
                }
            };
            scrollTopBtn.onclick = e => {
                e.stopPropagation();
                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });
            };
        }
        const focusModal = el("focusModal");
        if (focusModal) focusModal.addEventListener("click", e => Focus.handleTap(e));
        const closeFocusBtn = el("closeFocusBtn");
        if (closeFocusBtn) {
            closeFocusBtn.onclick = e => {
                e.stopPropagation();
                Focus.close();
            };
        }
        const exportBtn = el("exportBtn");
        if (exportBtn) {
            exportBtn.onclick = e => {
                e.stopPropagation();
                Backup.exportData();
            };
        }
        const importBtn = el("importBtn");
        const importInput = el("importInput");
        if (importBtn && importInput) {
            importBtn.onclick = e => {
                e.stopPropagation();
                importInput.click();
            };
            importInput.onchange = e => {
                Backup.importData(e);
                importInput.value = "";
            };
        }
        const shareAppBtn = el("shareAppBtn");
        if (shareAppBtn) {
            shareAppBtn.onclick = async e => {
                e.stopPropagation();
                const title = App.uiStrings?.[App.currentLang]?.app_name || "Wird";
                const text = App.uiStrings?.[App.currentLang]?.share_app_text || "Check out Wird: a free, offline, and ad-free Islamic Adhkar app.";
                const lang = App.currentLang || "en";
                const url = lang === "en" ? `${projectUrl()}/` : `${projectUrl()}/?lang=${encodeURIComponent(lang)}`;
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: title,
                            text: text,
                            url: url
                        });
                    } catch (err) {}
                } else {
                    await UI.copyToClipboard(`${text} ${url}`);
                    UI.toast(App.uiStrings?.[App.currentLang]?.toast_copied || "Copied", "success");
                }
            };
        }
        const hapticToggle = el("hapticToggle");
        if (hapticToggle) {
            hapticToggle.checked = !!App.isHapticEnabled;
            hapticToggle.onchange = async () => {
                App.isHapticEnabled = !!hapticToggle.checked;
                await Prefs.set("isHapticEnabled", App.isHapticEnabled ? "true" : "false");
            };
        }
        const installBtn = el("installAppBtn");
        if (installBtn) {
            installBtn.style.display = "none";
            const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || !!window.navigator.standalone;
            const isNative = window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" ? window.Capacitor.isNativePlatform() : false;
            const ua = navigator.userAgent || "";
            const isIOS = /iPad|iPhone|iPod/.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
            const isSafari = isIOS && /WebKit/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
            if (isStandalone || isNative) {
                installBtn.style.display = "none";
            } else {
                if (isSafari) {
                    installBtn.style.display = "flex";
                }
                window.addEventListener("beforeinstallprompt", e => {
                    e.preventDefault();
                    App.deferredInstallPrompt = e;
                    installBtn.style.display = "flex";
                });
                window.addEventListener("appinstalled", () => {
                    App.deferredInstallPrompt = null;
                    installBtn.style.display = "none";
                });
                installBtn.onclick = async e => {
                    e.stopPropagation();
                    if (App.deferredInstallPrompt) {
                        App.deferredInstallPrompt.prompt();
                        try {
                            const outcome = await App.deferredInstallPrompt.userChoice;
                            if (outcome.outcome === "accepted") {
                                installBtn.style.display = "none";
                            }
                        } catch (_) {}
                        App.deferredInstallPrompt = null;
                        return;
                    }
                    if (isSafari) {
                        const step1 = App.uiStrings?.[App.currentLang]?.install_ios_step1 || "Tap the Share icon at the bottom";
                        const step2 = App.uiStrings?.[App.currentLang]?.install_ios_step2 || "Select 'Add to Home Screen'";
                        const iosHtml = `\n                            <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">\n                                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">\n                                    <svg style="width:24px; height:24px; color:#3b82f6; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n                                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>\n                                    </svg>\n                                    <span style="font-size:0.9rem; font-weight:600; text-align:start;">1. ${step1}</span>\n                                </div>\n                                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">\n                                    <svg style="width:24px; height:24px; color:inherit; opacity:0.7; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>\n                                    </svg>\n                                    <span style="font-size:0.9rem; font-weight:600; text-align:start;">2. ${step2}</span>\n                                </div>\n                            </div>\n                        `;
                        UI.info(iosHtml, {
                            isHtml: true
                        });
                        return;
                    }
                    const msg = App.uiStrings?.[App.currentLang]?.install_help || "To install: open your browser menu and choose 'Add to Home Screen'.";
                    UI.info(msg);
                };
            }
        }
    }
    function initServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        if (window.Capacitor && window.Capacitor.isNativePlatform()) return;
        let updateRequested = false;
        let updatePromptShown = false;
        const getUpdateMsg = () => {
            try {
                return App.uiStrings?.[App.currentLang]?.update_msg || "New version available! Update?";
            } catch {
                return "New version available! Update?";
            }
        };
        const promptUpdate = reg => {
            if (updatePromptShown) return;
            updatePromptShown = true;
            const msg = getUpdateMsg();
            const btn = App.uiStrings?.[App.currentLang]?.btn_update || "Update";
            UI.toastAction(msg, btn, () => {
                updateRequested = true;
                if (reg.waiting) reg.waiting.postMessage({
                    type: "SKIP_WAITING"
                }); else if (reg.installing) reg.installing.postMessage({
                    type: "SKIP_WAITING"
                }); else window.location.reload();
            }, "info", 9e3);
            setTimeout(() => {
                updatePromptShown = false;
            }, 1e4);
        };
        navigator.serviceWorker.register("sw.js").then(reg => {
            console.log("✅ Service Worker Registered!", reg);
            if (reg.waiting && navigator.serviceWorker.controller) {
                promptUpdate(reg);
            }
            reg.addEventListener("updatefound", () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener("statechange", () => {
                    if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                        console.log("🔄 New version available!");
                        promptUpdate(reg);
                    }
                });
            });
        }).catch(err => console.error("❌ SW Registration Failed:", err));
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (updateRequested) window.location.reload();
        });
    }
    (async () => {
        await init();
        wireGlobalListeners();
        initServiceWorker();
    })();
})();