(() => {
    // ==========================================
    // 0. CONSTANTS
    // ==========================================
    const SUPPORTED_LANGS = new Set(["en", "ar", "fr", "it", "es"]);

    // ==========================================
    // 0b. SMALL DOM HELPERS
    // ==========================================
    const el = (id) => document.getElementById(id);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const MAIN_CATEGORIES = ["morning", "evening", "waking", "sleep"];

    // ==========================================
    // 0c. CAPACITOR PREFERENCES (New Async Storage Engine)
    // ==========================================
    const Prefs = {
        _cache: {},
        async loadAll() {
            const cap = window.Capacitor;
            const P = cap?.Plugins?.Preferences;
            if (P) {
                try {
                    const { keys } = await P.keys();
                    for (const key of keys) {
                        const { value } = await P.get({ key });
                        this._cache[key] = value;
                    }
                } catch (e) {
                    console.error("Failed to load preferences:", e);
                }
            } else {
                // Fallback: Populate cache from localStorage
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    this._cache[key] = localStorage.getItem(key);
                }
            }
        },
        get(key) {
            // Synchronous read from cache
            return this._cache[key] || null;
        },
        async set(key, value) {
            this._cache[key] = String(value);
            const cap = window.Capacitor;
            const P = cap?.Plugins?.Preferences;
            if (P) {
                await P.set({ key, value: String(value) });
            } else {
                localStorage.setItem(key, String(value));
            }
        },
        async remove(key) {
            delete this._cache[key];
            const cap = window.Capacitor;
            const P = cap?.Plugins?.Preferences;
            if (P) {
                await P.remove({ key });
            } else {
                localStorage.removeItem(key);
            }
        },
        async migrate() {
            const cap = window.Capacitor;
            const P = cap?.Plugins?.Preferences;
            if (!P || !cap.isNativePlatform()) return;

            const migratedKey = "wird_storage_migrated";
            const { value: alreadyMigrated } = await P.get({ key: migratedKey });
            if (alreadyMigrated === "true") return;

            console.log("🚀 Starting storage migration...");
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key === migratedKey) continue;
                const value = localStorage.getItem(key);
                await P.set({ key, value });
            }
            
            // Clear localStorage AFTER migration
            localStorage.clear();
            
            await P.set({ key: migratedKey, value: "true" });
            console.log("✅ Storage migration complete.");
        }
    };

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


    function syncNavEffects() {
        const nav = document.querySelector('nav');
        if (!nav) return;

        const state = Storage.getSavedState();

        // Dynamic completion (respects Kids Mode)
        const allDone = MAIN_CATEGORIES.every(cat => isCategoryCompleteDynamic(state, cat));

        if (allDone) {
            nav.classList.add('nav-reward-all-done');
        } else {
            nav.classList.remove('nav-reward-all-done');
        }
    }

    function formatShortDate(dStr) {
        try {
            const d = new Date(dStr);
            if (Number.isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString(App.currentLang || "en", {year: "numeric", month: "short", day: "numeric"});
        } catch {
            return dStr;
        }
    }

    function isItemDoneInCategory(state, category, itemId) {
        const key = Storage.getStorageKeyForCategory(category, itemId);
        return state.completedIds.includes(key);
    }

    function isItemDoneAnywhere(state, item) {
        const cats = Array.isArray(item.category) ? item.category : [item.category];
        for (const c of cats) {
            if (MAIN_CATEGORIES.includes(c) && isItemDoneInCategory(state, c, item.id)) return true;
        }
        // fallback: any key ending with _id (covers legacy/favorites mistakes)
        const suffix = `_${item.id}`;
        return state.completedIds.some((k) => k.endsWith(suffix));
    }

    function isCategoryCompleteDynamic(state, category) {
        if (category === "favorites") {
            const favs = (App.favorites || [])
                .map((id) => App.adhkarData.find((x) => x.id === id))
                .filter(Boolean);
            if (favs.length === 0) return false;
            return favs.every((it) => isItemDoneAnywhere(state, it));
        }

        const target = App.adhkarData.filter((item) => {
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            if (!cats.includes(category)) return false;
            if (App.isKidsMode && !item.is_kids) return false;
            return true;
        });

        if (target.length === 0) return false;
        return target.every((it) => isItemDoneInCategory(state, category, it.id));
    }

    // ==========================================
    // 1. STATE
    // ==========================================
    const App = {
        adhkarData: [],
        uiStrings: {},
        currentLang: "en",
        showDetails: false,
        currentCategory: "morning",
        isKidsMode: false,
        isHapticEnabled: true,
        currentUtterance: null,
        deferredPrompt: null,
        favorites: [],
        focusState: {currentVal: 0, targetVal: 0, cardId: null},
        searchQuery: "",
        checkFestivals() {
            const bBody = document.body;
            bBody.classList.remove('fest-ramadan', 'fest-eid-fitr', 'fest-eid-adha', 'fest-hajj');
            if (Prefs.get("wird_show_decorations") === "false") return;

            // --- Math-based Hijri Calculation (Kuwaiti Algorithm) ---
            const date = new Date();
            let day = date.getDate();
            let month = date.getMonth();
            let year = date.getFullYear();

            if (year < 1700) return; // Guard

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
            let yyc = Math.floor((rem) / 354);
            let rrem = (rem) % 354;

            let hYear = Math.floor(cyc * 30 + yyc);
            let hMonth = 1;
            let hDay = rrem;

            // Simplified month distribution for Hijri
            const monthDays = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
            for (let i = 0; i < 12; i++) {
                let duration = (i % 2 === 0) ? 30 : 29;
                if (hDay <= duration) {
                    hMonth = i + 1;
                    break;
                }
                hDay -= duration;
            }
            if (hMonth === 9) bBody.classList.add('fest-ramadan');
            else if (hMonth === 10 && hDay <= 3) bBody.classList.add('fest-eid-fitr');
            else if (hMonth === 12) {
                if (hDay <= 9) bBody.classList.add('fest-hajj');
                else if (hDay <= 13) bBody.classList.add('fest-eid-adha');
            }
        },
    };

    function normalizeText(str) {
        if (!str) return "";
        return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove Latin diacritics
            .replace(/[\u0617-\u061A\u064B-\u0652]/g, "") // Remove Arabic harakat
            .toLowerCase();
    }

    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    function highlightText(text, query) {
        if (!query || !text) return escapeHTML(text);
        const escapedText = escapeHTML(text);
        const escapedQuery = escapeHTML(query).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');

        // Use the new clean CSS class here
        return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    // ==========================================
    // 2. HAPTICS ENGINE (Capacitor first, Web fallback, never throws)
    // ==========================================
    const HapticsEngine = (() => {
        let initPromise = null;

        const CAP_STYLES = {
            light: ["LIGHT", "light"], medium: ["MEDIUM", "medium"], heavy: ["HEAVY", "heavy"],
        };

        function getGlobalCapHaptics() {
            // Capacitor injects window.Capacitor in native WebView
            const cap = window.Capacitor;
            return cap?.Plugins?.Haptics || null;
        }

        async function init() {
            if (initPromise) return initPromise;

            initPromise = (async () => {
                const global = getGlobalCapHaptics();
                if (global) return global;

                // Optional: if you bundle with Vite/Webpack, this works; otherwise it safely rejects
                try {
                    const mod = await import("@capacitor/haptics");
                    return mod?.Haptics || null;
                } catch {
                    return null;
                }
            })();

            return initPromise;
        }

        async function impact(styleCandidates, webFallbackMs) {
            if (!App.isHapticEnabled) return;

            const h = await init();
            if (h?.impact) {
                for (const style of styleCandidates) {
                    try {
                        await h.impact({style});
                        return;
                    } catch {
                        // try next style string
                    }
                }
            }

            // Web / fallback
            if (navigator.vibrate) navigator.vibrate(webFallbackMs);
        }

        async function pulse(ms) {
            if (!App.isHapticEnabled) return;

            const h = await init();
            if (h?.vibrate) {
                try {
                    await h.vibrate({duration: ms});
                    return;
                } catch {
                    // Some environments may have vibrate() without args
                    try {
                        await h.vibrate();
                        return;
                    } catch {
                        // fallback to navigator.vibrate below
                    }
                }
            }

            if (navigator.vibrate) navigator.vibrate(ms);
        }

        // Public API: smart, semantic haptics
        return {
            lightTap() {
                // Light tick on every increment
                impact(CAP_STYLES.light, 10);
            }, milestoneThump() {
                // Stronger on every 10th
                impact(CAP_STYLES.medium, 40);
            }, completionPulse() {
                // Long distinct pulse when finished
                pulse(300);
            }, // For legacy patterns you still use (numbers only). Arrays are handled via navigator.vibrate.
            pulseMs(ms) {
                pulse(ms);
            },
        };
    })();

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
    const Storage = {
        getStorageKey(cardId) {
            return `${App.currentCategory}_${cardId}`;
        },

        getStorageKeyForCategory(category, cardId) {
            return `${category}_${cardId}`;
        },

        // When browsing Favorites, progress is stored under the item's real category (not "favorites")
        getProgressCategoryForItem(item) {
            if (App.currentCategory !== "favorites") return App.currentCategory;
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            const preferred = cats.find((c) => MAIN_CATEGORIES.includes(c));
            return preferred || cats[0] || "morning";
        },

        getTodayKey() {
            const d = new Date();
            // ROLLOVER: If it's before 3:00 AM, count it as the previous day
            d.setHours(d.getHours() - 3);
            return `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        },

        getSavedState() {
            const key = this.getTodayKey();
            const defaultState = {completedIds: [], categoriesDone: {}, cardCounts: {}};
            const raw = Prefs.get(key);

            let saved = null;
            try {
                saved = raw ? JSON.parse(raw) : null;
            } catch {
                saved = null;
            }

            return {...defaultState, ...(saved || {})};
        },

        async saveState(state) {
            await Prefs.set(this.getTodayKey(), JSON.stringify(state));
        },

        async saveCardCount(cardId, count) {
            const state = this.getSavedState();
            const key = this.getStorageKey(cardId);
            state.cardCounts[key] = count;
            await this.saveState(state);
        },

        async saveCardCountForCategory(category, cardId, count) {
            const state = this.getSavedState();
            const key = this.getStorageKeyForCategory(category, cardId);
            state.cardCounts[key] = count;
            await this.saveState(state);
        },


        async saveCardComplete(cardId) {
            const state = this.getSavedState();
            const key = this.getStorageKey(cardId);
            if (!state.completedIds.includes(key)) state.completedIds.push(key);
            await this.saveState(state);
        },

        async saveCardCompleteForCategory(category, cardId) {
            const state = this.getSavedState();
            const key = this.getStorageKeyForCategory(category, cardId);
            if (!state.completedIds.includes(key)) state.completedIds.push(key);
            await this.saveState(state);
        },


        async resetCardProgress(cardId) {
            const state = this.getSavedState();

            // In Favorites view, a card can belong to multiple categories.
            // Remove progress across ALL categories for that item.
            if (App.currentCategory === "favorites") {
                const suffix = `_${cardId}`;
                state.completedIds = state.completedIds.filter((id) => !id.endsWith(suffix));
                Object.keys(state.cardCounts).forEach((k) => {
                    if (k.endsWith(suffix)) delete state.cardCounts[k];
                });

                // Also clear any "done" flags for main categories (recomputed dynamically)
                await this.saveState(state);
                UI.updateCategoryUI();
                UI.render();
                UI.updateCategoryUI();
                syncNavEffects();
                syncNavEffects();
                return;
            }

            const key = this.getStorageKey(cardId);
            state.completedIds = state.completedIds.filter((id) => id !== key);
            if (state.cardCounts[key]) delete state.cardCounts[key];

            if (state.categoriesDone[App.currentCategory]) {
                delete state.categoriesDone[App.currentCategory];
                UI.updateCategoryUI();
            }

            await this.saveState(state);
        },


        async resetCurrentCategory() {
            const confirmMsg = App.uiStrings[App.currentLang]?.reset_confirm || "Reset this category?";
            const ok = await UI.confirm(confirmMsg);
            if (!ok) return;

            const state = this.getSavedState();

            if (App.currentCategory === "favorites") {
                // Reset progress for ALL favorite items across any category keys
                const favIds = new Set(App.favorites || []);
                state.completedIds = state.completedIds.filter((k) => {
                    // remove keys that end with _<favId>
                    for (const id of favIds) {
                        if (k.endsWith(`_${id}`)) return false;
                    }
                    return true;
                });
                Object.keys(state.cardCounts).forEach((k) => {
                    for (const id of favIds) {
                        if (k.endsWith(`_${id}`)) {
                            delete state.cardCounts[k];
                            break;
                        }
                    }
                });

                await this.saveState(state);
                UI.updateCategoryUI();
                UI.render();
                syncNavEffects();
                UI.toast(App.uiStrings[App.currentLang]?.toast_reset_done || "Progress reset.", "success");
                UI.vibrate(40);
                return;
            }

            // Normal category reset
            const targetCards = App.adhkarData.filter((item) => {
                const cats = Array.isArray(item.category) ? item.category : [item.category];
                return cats.includes(App.currentCategory);
            });

            targetCards.forEach((item) => {
                const key = this.getStorageKey(item.id);
                state.completedIds = state.completedIds.filter((id) => id !== key);
                if (state.cardCounts[key]) delete state.cardCounts[key];
            });

            if (state.categoriesDone[App.currentCategory]) delete state.categoriesDone[App.currentCategory];

            document.querySelector('nav')?.classList.remove('nav-reward-all-done');
            await this.saveState(state);
            UI.updateCategoryUI();
            UI.render();
            syncNavEffects();
            UI.toast(App.uiStrings[App.currentLang]?.toast_reset_done || "Progress reset.", "success");
            UI.vibrate(40);
        },

        async saveCategoryComplete(category) {
            if (category === "favorites") return;

            const state = this.getSavedState();

            // We force the update even if it was already "true"
            // to ensure the UI checkmark appears
            state.categoriesDone[category] = true;
            await this.saveState(state);

            // This is the line that was likely missing its impact:
            UI.updateCategoryUI();

            // Trigger the Nav Glow/Shimmer
            syncNavEffects();
            this.triggerNavReward();

            // Update Streak if it's the first time today
            await Streak.awardForToday();
        },

        triggerNavReward() {
            const nav = document.querySelector('nav');
            const state = this.getSavedState();

            // Check if ALL main categories are done
            const mainCategories = ["morning", "evening", "waking", "sleep"];
            const allDone = mainCategories.every(cat => state.categoriesDone[cat]);

            if (allDone) {
                // High Tier Reward: Golden Shimmer
                nav.classList.remove('nav-reward-category');
                nav.classList.add('nav-reward-all-done');
            } else {
                // Standard Reward: Green Pulse
                nav.classList.add('nav-reward-category');
                // Remove it after animation ends so it can be re-triggered
                setTimeout(() => nav.classList.remove('nav-reward-category'), 1500);
            }
        }
    };

    // ==========================================
    // 4. FAVORITES
    // ==========================================
    const Favorites = {
        async persist() {
            await Prefs.set("wird_favorites", JSON.stringify(App.favorites));
        },

        async toggle(id) {
            if (App.favorites.includes(id)) {
                App.favorites = App.favorites.filter((favId) => favId !== id);
            } else {
                App.favorites.push(id);
                // nice feedback, respects toggle
                HapticsEngine.lightTap();
            }
            await this.persist();

            if (App.currentCategory === "favorites") {
                UI.render();
            } else {
                const btn = document.querySelector(`.btn-heart[data-id="${id}"]`);
                if (btn) {
                    const isFav = App.favorites.includes(id);
                    btn.innerHTML = UI.getHeartIcon(isFav);
                    btn.classList.toggle("active", isFav);
                    btn.style.color = isFav ? "#ef4444" : "";
                    btn.setAttribute("aria-pressed", isFav ? "true" : "false");
                }
            }
        },
    };

    // ==========================================
    // 5. BACKUP
    // ==========================================
    const Backup = {
        async exportData() {
            const data = {
                key: "wird_backup",
                date: new Date().toISOString(),
                state: Storage.getSavedState(),
                favorites: App.favorites,
                settings: {
                    lang: Prefs.get("userLang"),
                    darkMode: Prefs.get("darkMode"),
                    oledMode: Prefs.get("oledMode"),
                    fontSize: Prefs.get("fontScale"),
                    streak: Prefs.get("wird_streak"),
                    lastActive: Prefs.get("wird_last_active_date"),
                },
            };

            const jsonStr = JSON.stringify(data, null, 2);
            const fileName = `wird-backup-${new Date().toISOString().slice(0, 10)}.json`;

            // --- NATIVE ANDROID/IOS FLOW ---
            const cap = window.Capacitor;
            if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
                try {
                    const Filesystem = cap.Plugins.Filesystem;
                    const Share = cap.Plugins.Share;

                    if (Filesystem && Share) {
                        // 1. Write the file securely to the app's cache directory
                        const result = await Filesystem.writeFile({
                            path: fileName,
                            data: jsonStr,
                            directory: 'CACHE',
                            encoding: 'utf8'
                        });

                        // 2. Open the Native Android "Save/Share" dialog
                        await Share.share({
                            title: 'Wird Backup',
                            text: 'Here is your Wird backup file.',
                            url: result.uri,
                            dialogTitle: 'Save Wird Backup'
                        });
                        return;
                    }
                } catch (e) {
                    console.error("Native export error:", e);
                    UI.toast(App.uiStrings[App.currentLang]?.copy_error || "Export failed.", "error");
                    return;
                }
            }

            // --- STANDARD WEB / PWA FLOW ---
            const blob = new Blob([jsonStr], {type: "application/json"});
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Clean up memory
            setTimeout(() => URL.revokeObjectURL(url), 100);
        },

        importData(event) {
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.key !== "wird_backup") throw new Error("Invalid file");

                    const confirmMsg = App.uiStrings[App.currentLang]?.overwrite_confirm || "Overwrite current progress?";
                    const ok = await UI.confirm(confirmMsg);
                    if (ok) {
                        await Prefs.set(Storage.getTodayKey(), JSON.stringify(data.state));

                        if (Array.isArray(data.favorites)) {
                            await Prefs.set("wird_favorites", JSON.stringify(data.favorites));
                        }

                        if (data.settings?.lang) await Prefs.set("userLang", data.settings.lang);
                        if (data.settings?.darkMode) await Prefs.set("darkMode", data.settings.darkMode);
                        if (data.settings?.oledMode) await Prefs.set("oledMode", data.settings.oledMode);
                        if (data.settings?.fontSize) await Prefs.set("fontScale", data.settings.fontSize);
                        if (data.settings?.streak) await Prefs.set("wird_streak", data.settings.streak);
                        if (data.settings?.lastActive) await Prefs.set("wird_last_active_date", data.settings.lastActive);

                        const successMsg = App.uiStrings[App.currentLang]?.backup_restored || "Data restored successfully!";
                        UI.toast(successMsg, "success");
                        location.reload();
                    }
                } catch {
                    const errorMsg = App.uiStrings[App.currentLang]?.import_error || "Error importing file.";
                    UI.toast(errorMsg, "error");
                }
            };
            reader.readAsText(file);
        },
    };

    // ==========================================
    // 6. STREAK
    // ==========================================
    const Streak = {
        getCurrentStreak() {
            return parseInt(Prefs.get("wird_streak") || "0", 10);
        },

        refreshUI() {
            const streakEl = el("streakValue");
            if (streakEl) streakEl.innerText = String(this.getCurrentStreak());

            const sub = el("streakSub");
            const lastDateStr = Prefs.get("wird_last_active_date");
            if (sub) {
                if (lastDateStr) {
                    const template = App.uiStrings?.[App.currentLang]?.streak_last_active || "Last active: {date}";
                    sub.innerText = template.replace("{date}", formatShortDate(lastDateStr));
                } else {
                    sub.innerText = "";
                }
            }
        },

        // Award streak only when the user completes a main category (once per day)
        async awardForToday() {
            const streakKey = "wird_streak";
            const lastDateKey = "wird_last_active_date";

            const todayStr = new Date().toDateString();
            const lastDateStr = Prefs.get(lastDateKey);
            let currentStreak = parseInt(Prefs.get(streakKey) || "0", 10);

            if (lastDateStr !== todayStr) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                if (lastDateStr === yesterday.toDateString()) currentStreak++;
                else currentStreak = 1;

                await Prefs.set(streakKey, String(currentStreak));
                await Prefs.set(lastDateKey, todayStr);
            }

            this.refreshUI();
        },
    };

    // ==========================================
    // 7. FOCUS MODE
    // ==========================================
    const Focus = {
        _keyHandler: null,
        _lastFocus: null,

        open(item, currentVal) {
            const modal = el("focusModal");
            const counterEl = el("focusCounter");
            const targetEl = el("focusTarget");
            const progressEl = el("focusProgressBar");

            App.focusState = {
                currentVal,
                targetVal: item.repeat,
                cardId: item.id,
                category: Storage.getProgressCategoryForItem(item)
            };

            if (counterEl) counterEl.innerText = String(App.focusState.currentVal);
            if (targetEl) targetEl.innerText = `/ ${App.focusState.targetVal}`;
            if (progressEl) this.updateProgress(progressEl);

            modal?.classList.remove("hidden");
            modal?.classList.add("flex");

            if (modal) {
                Focus._lastFocus = document.activeElement;
                modal.setAttribute("aria-hidden", "false");
                document.body.classList.add("modal-open");
                setTimeout(() => modal.focus?.(), 0);

                Focus._keyHandler = async (ev) => {
                    if (ev.key === "Escape") {
                        ev.preventDefault();
                        Focus.close();
                        return;
                    }
                    if (ev.key === " " || ev.key === "Enter") {
                        ev.preventDefault();
                        await Focus.handleTap(ev);
                    }
                    if (ev.key === "Tab") {
                        // Keep focus inside: cycle between close button and modal
                        const closeBtn = el("closeFocusBtn");
                        const active = document.activeElement;
                        if (ev.shiftKey) {
                            if (active === modal) {
                                ev.preventDefault();
                                closeBtn?.focus?.();
                            } else {
                                ev.preventDefault();
                                modal.focus?.();
                            }
                        } else {
                            if (active === closeBtn) {
                                ev.preventDefault();
                                modal.focus?.();
                            } else {
                                ev.preventDefault();
                                closeBtn?.focus?.();
                            }
                        }
                    }
                };
                document.addEventListener("keydown", Focus._keyHandler, true);
            }
        },

        updateProgress(bar) {
            const pct = (App.focusState.currentVal / App.focusState.targetVal) * 100;
            bar.style.width = `${pct}%`;
        },

        createRipple(e, container) {
            const circle = document.createElement("span");
            const diameter = Math.max(container.clientWidth, container.clientHeight);
            const radius = diameter / 2;
            const rect = container.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : (typeof e.clientX === "number" ? e.clientX : rect.left + rect.width / 2);
            const clientY = e.touches ? e.touches[0].clientY : (typeof e.clientY === "number" ? e.clientY : rect.top + rect.height / 2);

            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${clientX - radius}px`;
            circle.style.top = `${clientY - radius}px`;
            circle.classList.add("ripple");

            container.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
        },

        async handleTap(e) {
            if (e.target.closest("#closeFocusBtn")) return;

            const modal = el("focusModal");
            const counterEl = el("focusCounter");
            const progressEl = el("focusProgressBar");

            if (App.focusState.currentVal < App.focusState.targetVal) {
                App.focusState.currentVal++;

                // Modal UI
                if (counterEl) {
                    counterEl.innerText = String(App.focusState.currentVal);
                    counterEl.style.transform = "scale(1.2)";
                    setTimeout(() => (counterEl.style.transform = "scale(1)"), 100);
                }
                if (modal) this.createRipple(e, modal);
                if (progressEl) this.updateProgress(progressEl);

                // SMART HAPTICS: every tap / milestone / completion
                UI.smartHapticForCounter(App.focusState.currentVal, App.focusState.targetVal);

                UI.announceMilestone(App.focusState.currentVal, App.focusState.targetVal);

                // SYNC: Save Immediately
                await Storage.saveCardCountForCategory(App.focusState.category || App.currentCategory, App.focusState.cardId, App.focusState.currentVal);

                // SYNC: Update Card Behind Modal
                const focusBtn = document.querySelector(`.btn-focus[data-id="${App.focusState.cardId}"]`);
                if (focusBtn) {
                    const card = focusBtn.closest(".adhkar-card");
                    if (card) {
                        const span = card.querySelector(".counter");
                        if (span) span.innerText = String(App.focusState.currentVal);

                        const cardBar = card.querySelector('.card-progress-bar');
                        if (cardBar) {
                            const pct = (App.focusState.currentVal / App.focusState.targetVal) * 100;
                            cardBar.style.width = `${pct}%`;
                        }

                        // Check Completion
                        if (App.focusState.currentVal === App.focusState.targetVal) {
                            card.classList.add("card-done");
                            const bar = card.querySelector('.card-progress-bar');
                            if (bar) bar.classList.add('bar-completion-pulse');
                            await Storage.saveCardCompleteForCategory(App.focusState.category || App.currentCategory, App.focusState.cardId);

                            // Category completion preserved
                            if (App.currentCategory !== "favorites") {
                                const totalCount = document.querySelectorAll(".adhkar-card").length;
                                const completedCount = document.querySelectorAll(".adhkar-card.card-done").length;
                                if (completedCount >= totalCount) await Storage.saveCategoryComplete(App.currentCategory);
                            }

                            setTimeout(() => this.close(), 500);
                        }
                    }
                }
            }
        },

        close() {
            const modal = el("focusModal");

            // Final sync check
            const focusBtn = document.querySelector(`.btn-focus[data-id="${App.focusState.cardId}"]`);
            if (focusBtn) {
                const card = focusBtn.closest(".adhkar-card");
                const span = card?.querySelector(".counter");
                if (card && span) {
                    span.innerText = String(App.focusState.currentVal);
                    if (App.focusState.currentVal >= App.focusState.targetVal) card.classList.add("card-done");
                }
            }

            modal?.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");
            if (Focus._keyHandler) {
                document.removeEventListener("keydown", Focus._keyHandler, true);
                Focus._keyHandler = null;
            }

            modal?.classList.add("hidden");
            modal?.classList.remove("flex");
            UI.updateCategoryUI();

            if (Focus._lastFocus && Focus._lastFocus.focus) Focus._lastFocus.focus();
        },
    };

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
    const UI = {
        scrollToActiveCategory() {
            const container = el('category-nav-container');
            // Find the button that has the "active" emerald background
            const activeBtn = container?.querySelector('.bg-emerald-100, .dark\\:bg-emerald-900');

            if (activeBtn && container) {
                // This math calculates how to center the button in the middle of the screen
                const offset = activeBtn.offsetLeft - (container.clientWidth / 2) + (activeBtn.clientWidth / 2);
                container.scrollTo({
                    left: offset,
                    behavior: 'smooth'
                });
            }
        },

        vibrate(pattern) {
            if (!App.isHapticEnabled) return;

            // If you pass arrays (like [100,50,100]), Capacitor Haptics doesn’t support patterns reliably.
            // We keep navigator.vibrate for arrays (works in browsers + many WebViews).
            if (Array.isArray(pattern)) {
                if (navigator.vibrate) navigator.vibrate(pattern);
                return;
            }

            // Number duration: prefer Capacitor vibrate if available, else navigator.vibrate
            if (typeof pattern === "number") {
                HapticsEngine.pulseMs(pattern);
            }
        },

        // Screen reader milestones (Polite so it doesn't spam)
        announceMilestone(currentVal, targetVal) {
            const announcer = el("a11y-announcer");
            if (!announcer) return;

            // Announce completion
            if (currentVal >= targetVal) {
                const doneTxt = App.uiStrings?.[App.currentLang]?.completed || "Completed";
                announcer.innerText = `${currentVal}. ${doneTxt}.`;
                return;
            }

            // Announce every 10 counts so blind users know their progress
            if (currentVal % 10 === 0) {
                announcer.innerText = String(currentVal);
            }
        },

        // Smart vibration rules
        smartHapticForCounter(currentVal, targetVal) {
            if (!App.isHapticEnabled) return;

            // Completion first (so 10/10 becomes completion, not milestone)
            if (currentVal >= targetVal) {
                HapticsEngine.completionPulse();
                return;
            }

            if (currentVal % 10 === 0) {
                HapticsEngine.milestoneThump();
                return;
            }

            HapticsEngine.lightTap();
        },

        initFontSize() {
            const slider = el("fontSizeSlider");
            const label = el("fontSizeLabel");
            const savedScale = Prefs.get("fontScale") || "1";

            document.documentElement.style.setProperty("--arabic-scale", savedScale);
            if (slider) {
                slider.value = savedScale;
                if (label) label.innerText = Math.round(parseFloat(savedScale) * 100) + "%";
                slider.oninput = async (e) => {
                    const val = e.target.value;
                    document.documentElement.style.setProperty("--arabic-scale", val);
                    if (label) label.innerText = Math.round(parseFloat(val) * 100) + "%";
                    await Prefs.set("fontScale", val);
                };
            }
        },

        async checkCategoryCompletion(category) {
            const state = Storage.getSavedState();
            // Get the actual cards for this category
            const {filtered} = this.getFilteredData();

            if (filtered.length === 0) return;

            // Count how many of THESE filtered cards are in the 'completedIds' list
            const completedCount = filtered.filter(item => {
                const key = Storage.getStorageKeyForCategory(category, item.id);
                return state.completedIds.includes(key);
            }).length;

            // If the count matches the total, trigger the completion
            if (completedCount >= filtered.length) {
                await Storage.saveCategoryComplete(category);
            }
        },

        updateStickyTitle() {
            const stickyTitle = el("stickyCategoryTitle");
            if (!stickyTitle) return;

            let label = App.uiStrings[App.currentLang] && App.uiStrings[App.currentLang][App.currentCategory] ? App.uiStrings[App.currentLang][App.currentCategory] : App.currentCategory;

            if (App.currentCategory === "morning" && !App.uiStrings[App.currentLang]?.[App.currentCategory]) {
                label = App.uiStrings[App.currentLang]?.morning || "Morning";
            }
            if (App.currentCategory === "favorites" && !App.uiStrings[App.currentLang]?.[App.currentCategory]) {
                label = "Favorites";
            }

            stickyTitle.innerText = label;
        },


        updateCategoryUI() {
            const categories = ["favorites", ...MAIN_CATEGORIES];
            const state = Storage.getSavedState();

            const activeClass = ["bg-emerald-100", "text-emerald-700", "shadow-sm", "dark:bg-emerald-900", "dark:text-emerald-300", "border-emerald-200", "dark:border-emerald-700", "border"];
            const inactiveClass = ["bg-slate-200", "text-slate-500", "hover:bg-slate-300", "dark:bg-slate-700", "dark:text-slate-400", "dark:hover:bg-slate-600"];
            const completedClass = ["ring-2", "ring-emerald-500", "ring-offset-1", "dark:ring-offset-slate-900"];

            categories.forEach((cat) => {
                const btn = el(`btn-${cat}`);
                if (!btn) return;

                btn.className = "flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 border border-transparent whitespace-nowrap snap-start";

                let label = App.uiStrings[App.currentLang]?.[cat] || cat;
                if (cat === "favorites" && !App.uiStrings[App.currentLang]?.[cat]) label = "Favorites";
                if (cat === "morning" && !App.uiStrings[App.currentLang]?.[cat]) label = "Morning";

                const isComplete = isCategoryCompleteDynamic(state, cat);

                if (isComplete && cat !== "favorites") {
                    btn.innerHTML = `<span class="inline-block text-emerald-500">✓</span> ${label}`;
                    btn.classList.add(...completedClass);
                } else {
                    if (cat === "favorites") btn.innerHTML = `❤️ ${label}`;
                    else btn.innerHTML = label;
                }

                if (App.currentCategory === cat) btn.classList.add(...activeClass);
                else btn.classList.add(...inactiveClass);
            });
        },

        ensureToastContainer() {
            let c = document.getElementById("toast-container");
            if (!c) {
                c = document.createElement("div");
                c.id = "toast-container";
                c.setAttribute("aria-live", "polite");
                c.setAttribute("aria-atomic", "true");
                document.body.appendChild(c);
            }
            return c;
        },

        toast(message, type = "info", duration = 2200) {
            if (!message) return;
            const c = this.ensureToastContainer();

            const t = document.createElement("div");
            t.className = `toast ${type}`;
            t.dir = (App.currentLang === "ar") ? "rtl" : "ltr";
            t.textContent = message;

            c.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));

            window.setTimeout(() => {
                t.classList.remove("show");
                window.setTimeout(() => t.remove(), 200);
            }, duration);
        },

        toastAction(message, actionText, onAction, type = "info", duration = 8000) {
            if (!message) return;
            const c = this.ensureToastContainer();

            const t = document.createElement("div");
            t.className = `toast ${type}`;
            t.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

            const row = document.createElement("div");
            row.className = "toast-row";

            const msg = document.createElement("div");
            msg.textContent = message;

            const btn = document.createElement("button");
            btn.className = "toast-action";
            btn.type = "button";
            btn.textContent = actionText || (App.uiStrings?.[App.currentLang]?.btn_ok || "OK");
            btn.onclick = () => {
                try {
                    onAction && onAction();
                } catch {
                }
                t.classList.remove("show");
                setTimeout(() => t.remove(), 200);
            };

            row.appendChild(msg);
            row.appendChild(btn);
            t.appendChild(row);

            c.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));

            window.setTimeout(() => {
                if (!t.isConnected) return;
                t.classList.remove("show");
                window.setTimeout(() => t.remove(), 200);
            }, duration);
        },

// Promise-based confirm dialog
        confirm(message, opts = {}) {
            return new Promise((resolve) => {
                const okText = opts.okText || App.uiStrings?.[App.currentLang]?.btn_ok || "OK";
                const cancelText = opts.cancelText || App.uiStrings?.[App.currentLang]?.btn_cancel || "Cancel";

                const overlay = document.createElement("div");
                overlay.className = "dialog-overlay";
                overlay.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

                const dialog = document.createElement("div");
                dialog.className = "dialog";
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "true");

                const body = document.createElement("div");
                body.className = "dialog-body";
                body.textContent = message || "";

                const actions = document.createElement("div");
                actions.className = "dialog-actions";

                const btnCancel = document.createElement("button");
                btnCancel.className = "dialog-btn cancel";
                btnCancel.type = "button";
                btnCancel.textContent = cancelText;

                const btnOk = document.createElement("button");
                btnOk.className = "dialog-btn ok";
                btnOk.type = "button";
                btnOk.textContent = okText;

                const cleanup = (val) => {
                    overlay.remove();
                    document.removeEventListener("keydown", onKeyDown, true);
                    resolve(val);
                };

                const onKeyDown = (e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        cleanup(false);
                    }
                    // simple focus trap between 2 buttons
                    if (e.key === "Tab") {
                        const active = document.activeElement;
                        if (e.shiftKey && active === btnCancel) {
                            e.preventDefault();
                            btnOk.focus();
                        } else if (!e.shiftKey && active === btnOk) {
                            e.preventDefault();
                            btnCancel.focus();
                        }
                    }
                    if (e.key === "Enter" && (document.activeElement === btnOk || document.activeElement === btnCancel)) {
                        e.preventDefault();
                        cleanup(document.activeElement === btnOk);
                    }
                };

                btnCancel.onclick = () => cleanup(false);
                btnOk.onclick = () => cleanup(true);

                overlay.onclick = (e) => {
                    if (e.target === overlay) cleanup(false);
                };

                actions.appendChild(btnCancel);
                actions.appendChild(btnOk);
                dialog.appendChild(body);
                dialog.appendChild(actions);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                document.addEventListener("keydown", onKeyDown, true);

                // focus default
                setTimeout(() => btnOk.focus(), 0);
            });
        },

        // Info dialog (no cancel)
        info(message, opts = {}) {
            return new Promise((resolve) => {
                const okText = opts.okText || App.uiStrings?.[App.currentLang]?.btn_ok || "OK";

                const overlay = document.createElement("div");
                overlay.className = "dialog-overlay";
                overlay.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

                const dialog = document.createElement("div");
                dialog.className = "dialog";
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "true");

                const body = document.createElement("div");
                body.className = "dialog-body";
                if (opts.isHtml) {
                    body.innerHTML = message || "";
                } else {
                    body.textContent = message || "";
                }

                const actions = document.createElement("div");
                actions.className = "dialog-actions";

                const btnOk = document.createElement("button");
                btnOk.className = "dialog-btn ok";
                btnOk.type = "button";
                btnOk.textContent = okText;

                const cleanup = () => {
                    overlay.remove();
                    document.removeEventListener("keydown", onKeyDown, true);
                    resolve();
                };

                const onKeyDown = (e) => {
                    if (e.key === "Escape" || e.key === "Enter") {
                        e.preventDefault();
                        cleanup();
                    }
                };

                btnOk.onclick = cleanup;
                overlay.onclick = (e) => {
                    if (e.target === overlay) cleanup();
                };

                actions.appendChild(btnOk);
                dialog.appendChild(body);
                dialog.appendChild(actions);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                document.addEventListener("keydown", onKeyDown, true);
                setTimeout(() => btnOk.focus(), 0);
            });
        },

        async copyToClipboard(text) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            } catch {
                // fall back below
            }

            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand("copy");
                document.body.removeChild(ta);
                return !!ok;
            } catch {
                return false;
            }
        },

        applyUITranslations() {
            if (!App.uiStrings[App.currentLang]) return;

            const isAr = App.currentLang === "ar";
            document.documentElement.dir = isAr ? "rtl" : "ltr";
            document.documentElement.lang = App.currentLang;

            qsa("[data-i18n]").forEach((node) => {
                const key = node.getAttribute("data-i18n");
                if (key && App.uiStrings[App.currentLang][key]) node.innerText = App.uiStrings[App.currentLang][key];
            });

            // aria-label translations
            qsa("[data-i18n-aria]").forEach((node) => {
                const key = node.getAttribute("data-i18n-aria");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("aria-label", val);
            });

            // title translations
            qsa("[data-i18n-title]").forEach((node) => {
                const key = node.getAttribute("data-i18n-title");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("title", val);
            });

            qsa("[data-i18n-placeholder]").forEach((node) => {
                const key = node.getAttribute("data-i18n-placeholder");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("placeholder", val);
            });

            this.updateMetaTags();
        },

        updateMetaTags() {
            const strings = App.uiStrings[App.currentLang];
            if (!strings) return;

            const baseTitle = strings.seo_title || document.title || "Wird";
            const catLabel = strings[App.currentCategory] || App.currentCategory;
            document.title = `${baseTitle} - ${catLabel}`;

            const desc = strings.seo_description || "Islamic Adhkar App";
            const descTag = document.querySelector('meta[name="description"]');
            const ogDesc = document.querySelector('meta[property="og:description"]');
            const twDesc = document.querySelector('meta[name="twitter:description"]');
            if (descTag) descTag.setAttribute("content", desc);
            if (ogDesc) ogDesc.setAttribute("content", desc);
            if (twDesc) twDesc.setAttribute("content", desc);

            const ogTitle = document.querySelector('meta[property="og:title"]');
            const twTitle = document.querySelector('meta[name="twitter:title"]');
            if (ogTitle) ogTitle.setAttribute("content", baseTitle);
            if (twTitle) twTitle.setAttribute("content", baseTitle);

            const keyTag = document.querySelector('meta[name="keywords"]');
            if (keyTag && strings.seo_keywords) keyTag.setAttribute("content", strings.seo_keywords);

            // Canonical + OG URL should reflect language (helps indexing / sharing)
            const lang = App.currentLang || "en";
            const url = lang === "en" ? `${projectUrl()}/` : `${projectUrl()}/?lang=${encodeURIComponent(lang)}`;

            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) canonical.setAttribute("href", url);

            const ogUrl = document.querySelector('meta[property="og:url"]');
            if (ogUrl) ogUrl.setAttribute("content", url);


            const imgAlt = strings.seo_image_alt || "Wird app preview";
            const twAlt = document.querySelector('meta[name="twitter:image:alt"]');
            if (twAlt) twAlt.setAttribute("content", imgAlt);
            const ogImgAlt = document.querySelector('meta[property="og:image:alt"]');
            if (ogImgAlt) ogImgAlt.setAttribute("content", imgAlt);
        },

        toggleSpeech(text) {
            const synth = window.speechSynthesis;
            if (synth.speaking) {
                synth.cancel();
                if (App.currentUtterance === text) {
                    App.currentUtterance = null;
                    return;
                }
            }
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "ar-SA";
            utterance.rate = 0.85;
            App.currentUtterance = text;
            synth.speak(utterance);
        },

        // Share URL/text now always points to PROJECT_URL and includes Arabic+Transliteration+Translation
        buildShareUrl(item) {
            return `${projectUrl()}/?adhkar=${encodeURIComponent(item.id)}`;
        },

        buildVerifyUrl(item) {
            return `${projectUrl()}/?verify=${encodeURIComponent(item.id)}`;
        },

        buildShareText(item) {
            const parts = [];

            // Always Arabic
            if (item.arabic) parts.push(item.arabic);

            // Always Transliteration (if present)
            if (item.transliteration) parts.push(item.transliteration);

            // Translation in current language (fallback to English)
            const t = item.translation?.[App.currentLang] || item.translation?.en || "";
            if (t) parts.push(t);

            // Always include your project URL
            parts.push(this.buildShareUrl(item));

            return parts.join("\n\n");
        },

        toggleShareMenu(button, data) {
            const existing = button.querySelector(".share-menu");
            if (existing) {
                existing.remove();
                button.setAttribute("aria-expanded", "false");
                return;
            }

            // Close other menus
            qsa(".share-menu").forEach((m) => m.remove());
            qsa(".btn-share[aria-expanded='true']").forEach((b) => b.setAttribute("aria-expanded", "false"));

            const url = data.url || projectUrl();
            const text = data.text || "";

            const t = (key, fallback) =>
                App.uiStrings?.[App.currentLang]?.[key] ??
                App.uiStrings?.en?.[key] ??
                fallback;

            const menu = document.createElement("div");
            menu.className = "share-menu";
            menu.setAttribute("role", "menu");
            menu.setAttribute("aria-label", t("aria_share_menu", "Share options"));
            menu.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

            const mkLink = (href, label) => {
                const a = document.createElement("a");
                a.href = href;
                a.target = "_blank";
                a.rel = "noopener";
                a.className = "share-item";
                a.setAttribute("role", "menuitem");
                a.textContent = label;
                a.onclick = () => close();
                return a;
            };

            const mkBtn = (label, onClick) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "share-item";
                b.setAttribute("role", "menuitem");
                b.textContent = label;
                b.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await onClick();
                    close();
                };
                return b;
            };

            const close = () => {
                menu.remove();
                button.setAttribute("aria-expanded", "false");
                try {
                    button.focus?.();
                } catch {
                }
                document.removeEventListener("click", onDocClick, true);
                document.removeEventListener("keydown", onKeyDown, true);
            };

            const onDocClick = (e) => {
                if (!menu.contains(e.target) && !button.contains(e.target)) close();
            };

            const onKeyDown = (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                    return;
                }

                const items = qsa(".share-item", menu);
                const idx = items.indexOf(document.activeElement);

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = items[(idx + 1) % items.length] || items[0];
                    next?.focus?.();
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prev = items[(idx - 1 + items.length) % items.length] || items[items.length - 1];
                    prev?.focus?.();
                } else if (e.key === "Home") {
                    e.preventDefault();
                    items[0]?.focus?.();
                } else if (e.key === "End") {
                    e.preventDefault();
                    items[items.length - 1]?.focus?.();
                }
            };

            // Items
            menu.appendChild(
                mkLink(
                    `https://wa.me/?text=${encodeURIComponent(text)}`,
                    t("share_whatsapp", "WhatsApp")
                )
            );

            menu.appendChild(
                mkLink(
                    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
                    t("share_telegram", "Telegram")
                )
            );

            menu.appendChild(
                mkBtn(t("share_copy_link", "Copy link"), async () => {
                    try {
                        await navigator.clipboard.writeText(url);
                        UI.toast(t("toast_link_copied", "Link copied"), "success");
                        UI.vibrate(20);
                    } catch {
                        UI.toast(t("copy_error", "Copy failed."), "error");
                    }
                })
            );

            button.appendChild(menu);
            button.setAttribute("aria-expanded", "true");

            // attach close listeners
            setTimeout(() => {
                document.addEventListener("click", onDocClick, true);
                document.addEventListener("keydown", onKeyDown, true);

                // focus first item for keyboard users
                const first = menu.querySelector(".share-item");
                if (first) first.focus?.();
            }, 0);
        },

        getHeartIcon(isFav) {
            if (isFav) {
                return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
            }
            return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
        },

        getFilteredData() {
            const isAr = App.currentLang === "ar";

            // MUST declare it here so it is available outside the if/else blocks!
            let baseFiltered = [];

            if (App.currentCategory === "favorites") {
                baseFiltered = App.adhkarData.filter((item) => App.favorites.includes(item.id));
            } else {
                baseFiltered = App.adhkarData.filter((item) => {
                    const cats = Array.isArray(item.category) ? item.category : [item.category];
                    if (!cats.includes(App.currentCategory)) return false;
                    return !(App.isKidsMode && !item.is_kids);

                });
            }

            // Apply Search Filtering (Displayed set only)
            let displayed = baseFiltered;
            if (App.searchQuery) {
                const q = normalizeText(App.searchQuery);
                displayed = baseFiltered.filter(item => {
                    const ar = normalizeText(item.arabic);
                    const trans = normalizeText(item.transliteration);
                    const t = normalizeText(item.translation?.[App.currentLang] || item.translation?.en);
                    const ref = normalizeText(item.reference);
                    return ar.includes(q) || trans.includes(q) || t.includes(q) || ref.includes(q);
                });
            }

            // We return 'filtered' (the real math for completions) and 'displayed' (the search results)
            return {filtered: baseFiltered, displayed, isAr};
        },

        renderEmptyState(cardWrapper, type) {
            if (type === "search") {
                const msgTemplate = App.uiStrings[App.currentLang]?.search_no_results || 'No results found for "{query}"';
                const msg = msgTemplate.replace("{query}", escapeHTML(App.searchQuery));
                const clearBtn = App.uiStrings[App.currentLang]?.clear_search || "Clear search";

                cardWrapper.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-400 px-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <p class="text-center text-sm mb-6">${msg}</p>
                      <button id="emptyClearSearchBtn" class="px-5 py-2 rounded-xl font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 active:scale-95 transition-all">${clearBtn}</button>
                    </div>`;

                setTimeout(() => {
                    const btn = el("emptyClearSearchBtn");
                    if (btn) btn.onclick = () => {
                        const input = el("searchInput");
                        if (input) {
                            input.value = "";
                            input.dispatchEvent(new Event('input'));
                        }
                    };
                }, 0);
            } else if (type === "favorites") {
                const msg = App.uiStrings[App.currentLang]?.no_favorites || "No favorites yet.";
                const cta = App.uiStrings[App.currentLang]?.cta_browse_adhkar || "Browse Adhkar";
                cardWrapper.innerHTML = `
                  <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <p class="text-center text-sm mb-4">${msg}</p>
                    <button class="browse-adhkar-btn px-5 py-2 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all">${cta}</button>
                  </div>`;
                const btn = cardWrapper.querySelector(".browse-adhkar-btn");
                if (btn) {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        App.currentCategory = "morning";
                        UI.updateCategoryUI();
                        UI.render(true);
                        setTimeout(() => UI.scrollToActiveCategory(), 250);
                    };
                }
            } else {
                const msg = App.uiStrings[App.currentLang]?.no_adkhar_found || "No Adhkar found";
                cardWrapper.innerHTML = `<div class="text-center text-slate-400 py-10">${msg}</div>`;
            }
        },

        buildCard(item, savedState, isAr, countersCtx) {
            const card = document.createElement("div");
            const progressCategory = Storage.getProgressCategoryForItem(item);
            const storageKey = Storage.getStorageKeyForCategory(progressCategory, item.id);

            const isDone = savedState.completedIds.includes(storageKey);
            const isFav = App.favorites.includes(item.id);

            card.className = `adhkar-card rounded-3xl p-6 shadow-sm mb-6 bg-white dark:bg-slate-800 border dark:border-slate-700 relative ${isDone ? "card-done" : ""}`;

            // --- REWARDS LOGIC ---
            // Check if benefit exists for current language and is not empty
            const benefitText = (item.benefit && item.benefit[App.currentLang]) ? item.benefit[App.currentLang] : "";
            const hasBenefit = benefitText && benefitText.trim().length > 0;

            const preTextHtml = item.pre_text ? `<p class="text-right text-emerald-600/70 font-serif text-lg mb-2" dir="rtl">${item.pre_text}</p>` : "";

            const focusBtnHtml = item.repeat > 10 ? `
                <button class="btn-focus text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Focus mode"
                  data-i18n-title="title_focus_mode"
                  aria-label="Focus mode"
                  data-i18n-aria="aria_focus_mode" data-id="${item.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            ` : "";

            const heartBtnHtml = `
                <button class="btn-heart text-xs flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors ${isFav ? "active" : ""}" title="Toggle favorite"
                  aria-pressed="${isFav ? "true" : "false"}"
                  data-i18n-title="title_toggle_favorite"
                  aria-label="Toggle favorite"
                  data-i18n-aria="aria_toggle_favorite" data-id="${item.id}">
                  ${UI.getHeartIcon(isFav)}
                </button>
            `;

            // ✨ Reward Button HTML (Only renders if text exists)
            const benefitBtnHtml = hasBenefit ? `
                <button class="btn-benefit text-xs flex items-center gap-1 text-amber-400 hover:text-amber-500 transition-colors" title="View reward"
                  data-i18n-title="title_view_reward"
                  aria-label="View reward"
                  data-i18n-aria="aria_view_reward">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
                </button>
            ` : "";

            // ✨ Reward Content Block (Hidden by default)
            const benefitContentHtml = hasBenefit ? `
                <div class="benefit-box hidden" dir="${isAr ? "rtl" : "ltr"}">
                    <div class="flex items-start gap-2">
                        <span class="text-xl">✨</span>
                        <p class="font-serif italic">${benefitText}</p>
                    </div>
                </div>
            ` : "";

            const actionButtons = `
                <div class="flex gap-4 mt-4 card-actions" dir="ltr">
                  ${heartBtnHtml}
                  ${benefitBtnHtml}
                  ${focusBtnHtml}
                  <button class="btn-speak text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Read aloud"
                    data-i18n-aria="aria_speak"
                    title="Read aloud"
                    data-i18n-title="title_speak">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                  <button class="btn-share text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Share"
                    data-i18n-aria="aria_share"
                    title="Share"
                    data-i18n-title="title_share"
                    aria-haspopup="menu"
                    aria-expanded="false">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                  <button class="btn-copy text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Copy"
                    data-i18n-aria="aria_copy"
                    title="Copy"
                    data-i18n-title="title_copy">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"/></svg>
                    <span class="copy-text hidden sm:inline">${App.uiStrings[App.currentLang].copy || "Copy"}</span>
                  </button>
                </div>
            `;

            const displayTransliteration = highlightText(item.transliteration, App.searchQuery);
            const displayTranslation = highlightText(item.translation?.[App.currentLang] || item.translation?.en || "", App.searchQuery);

            const detailsHtml = !isAr ? `
                <div class="details-content ${App.showDetails ? "open" : ""}">
                  <p class="text-emerald-600 dark:text-emerald-400 text-sm italic mb-3">${displayTransliteration}</p>
                  <p class="text-slate-600 dark:text-slate-300 text-sm mb-5" dir="${isAr ? "rtl" : "ltr"}">${displayTranslation}</p>
                </div>
            ` : "";

            const toggleBtnHtml = !isAr ? `
                <button class="toggle-btn text-xs text-slate-400 underline p-2 -m-2 z-10 hover:text-emerald-600">
                  ${App.showDetails ? App.uiStrings[App.currentLang].hide_details : App.uiStrings[App.currentLang].show_details}
                </button>
            ` : "";

            let initialVal = savedState.cardCounts[storageKey] || 0;
            if (isDone) initialVal = item.repeat;

            const verifyHref = UI.buildVerifyUrl(item);

            card.innerHTML = `
                ${preTextHtml}
                <p class="arabic-text" dir="rtl">${item.arabic}</p>
                <div class="mb-2 flex ${isAr ? "justify-end" : "justify-start"}">
                  <a href="${verifyHref}" target="_blank" rel="noopener" class="verify-link text-[10px] uppercase tracking-widest text-emerald-600 font-bold hover:underline z-10 p-2 -m-2 block">${item.reference} 🔗</a>
                </div>
                ${detailsHtml}
                ${benefitContentHtml} ${actionButtons}
                <div class="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-700" dir="ltr">
                  ${toggleBtnHtml}
                  ${isAr ? "<div></div>" : ""}
                  <div class="flex items-center gap-4 card-actions z-10">
                    <button class="reset-btn text-slate-300 hover:text-red-500 transition-colors p-2 -m-2" aria-label="Reset this item"
                        data-i18n-aria="aria_reset_card"
                        title="Reset this item"
                        data-i18n-title="title_reset_card">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                    <div class="counter-display bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-400 px-5 py-2 rounded-xl font-black text-2xl min-w-[80px] text-center transition-colors">
                      <span class="counter">${initialVal}</span>
                      <span class="text-sm font-normal text-emerald-600 dark:text-emerald-500">/${item.repeat}</span>
                    </div>
                  </div>
                  <div class="card-progress-container">
                    <div class="card-progress-bar" style="width: ${(initialVal / item.repeat) * 100}%"></div>
                  </div>
                </div>
            `;

            const verifyLinkEl = card.querySelector(".verify-link");
            if (verifyLinkEl && item.verify_url && isNativeCapacitor()) {
                verifyLinkEl.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openExternal(item.verify_url);
                });
            }


            // Main card tap increment
            card.onclick = async (e) => {
                if (e.target.closest("button") || e.target.closest("a")) return;
                if (window.getSelection().toString().length > 0) return;

                const span = card.querySelector(".counter");
                let val = parseInt(span.innerText, 10);

                if (val < item.repeat) {
                    card.classList.add("card-pressed");
                    setTimeout(() => card.classList.remove("card-pressed"), 100);

                    val++;
                    span.innerText = String(val);

                    const bar = card.querySelector('.card-progress-bar');
                    if (bar) bar.style.width = `${(val / item.repeat) * 100}%`;

                    UI.smartHapticForCounter(val, item.repeat);
                    UI.announceMilestone(val, item.repeat);
                    await Storage.saveCardCountForCategory(progressCategory, item.id, val);

                    if (val === item.repeat) {
                        card.classList.add("card-done");
                        const bar = card.querySelector('.card-progress-bar');
                        if (bar) bar.classList.add('bar-completion-pulse');
                        await Storage.saveCardCompleteForCategory(progressCategory, item.id);
                        await UI.checkCategoryCompletion(App.currentCategory);
                    }
                }
            };

            const resetBtn = card.querySelector(".reset-btn");
            resetBtn.onclick = async (e) => {
                e.stopPropagation();
                await Storage.resetCardProgress(item.id);
                card.querySelector(".counter").innerText = "0";
                card.classList.remove("card-done");
                const bar = card.querySelector('.card-progress-bar');
                if (bar) {
                    bar.style.width = "0%";
                    bar.classList.remove('bar-completion-pulse');
                }
                await UI.checkCategoryCompletion(App.currentCategory);
                syncNavEffects();
            };

            const speakBtn = card.querySelector(".btn-speak");
            if (speakBtn) {
                speakBtn.onclick = (e) => {
                    e.stopPropagation();
                    UI.toggleSpeech(item.arabic);
                };
            }

            const copyBtn = card.querySelector(".btn-copy");
            if (copyBtn) {

                copyBtn.onclick = async (e) => {
                    e.stopPropagation();

                    let textToCopy = item.arabic;
                    if (App.currentLang !== "ar") {
                        textToCopy += `
                        ${item.transliteration}`;
                        const t = item.translation?.[App.currentLang] || item.translation?.en || "";
                        if (t) textToCopy += `
                        ${t}`;
                    }

                    const ok = await UI.copyToClipboard(textToCopy);
                    if (ok) {
                        UI.vibrate(20);
                        UI.toast(App.uiStrings[App.currentLang]?.toast_copied || "Copied", "success");
                    } else {
                        UI.toast(App.uiStrings[App.currentLang]?.copy_error || "Copy failed.", "error");
                    }
                };
            }

            const shareBtn = card.querySelector(".btn-share");
            if (shareBtn) {
                shareBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const shareText = UI.buildShareText(item);
                    const shareUrl = UI.buildShareUrl(item);

                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: App.uiStrings?.[App.currentLang]?.seo_title || "Wird",
                                text: shareText,
                                url: shareUrl,
                            });
                            return;
                        } catch {
                            // Fall back to menu (user cancelled or not supported fully)
                        }
                    }

                    UI.toggleShareMenu(shareBtn, {text: shareText, url: shareUrl});
                };
            }

            const heartBtn = card.querySelector(".btn-heart");
            if (heartBtn) {
                heartBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await Favorites.toggle(item.id);
                };
            }

            // ✨ Reward Toggle Logic (Listener)
            const benefitBtn = card.querySelector(".btn-benefit");
            if (benefitBtn) {
                benefitBtn.onclick = (e) => {
                    e.stopPropagation();
                    const box = card.querySelector(".benefit-box");
                    if (box) {
                        box.classList.toggle("hidden");
                        // Optional visual feedback for active state
                        benefitBtn.classList.toggle("text-amber-600");
                    }
                };
            }

            const focusBtn = card.querySelector(".btn-focus");
            if (focusBtn) {
                focusBtn.onclick = (e) => {
                    e.stopPropagation();
                    const currentVal = parseInt(card.querySelector(".counter").innerText, 10);
                    if (currentVal < item.repeat) Focus.open(item, currentVal);
                };
            }

            if (!isAr) {
                const toggleBtn = card.querySelector(".toggle-btn");
                if (toggleBtn) {
                    toggleBtn.onclick = (e) => {
                        e.stopPropagation();
                        const details = card.querySelector(".details-content");
                        details?.classList.toggle("open");
                        e.target.innerText = e.target.innerText === App.uiStrings[App.currentLang].show_details ? App.uiStrings[App.currentLang].hide_details : App.uiStrings[App.currentLang].show_details;
                    };
                }
            }

            return card;
        },

        showSkeletons() {
            const wrapper = el("card-wrapper");
            if (!wrapper) return;
            wrapper.innerHTML = `
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            `;
        },

        render(animate = true) {
            const container = el("adhkar-container");
            let cardWrapper = el("card-wrapper");
            if (!cardWrapper) {
                cardWrapper = document.createElement("div");
                cardWrapper.id = "card-wrapper";
                container?.appendChild(cardWrapper);
            }
            if (!cardWrapper) return;

            this.showSkeletons();

            const executeRender = async () => {
                if (animate) window.scrollTo(0, 0);
                cardWrapper.innerHTML = "";

                const savedState = Storage.getSavedState();
                this.updateStickyTitle();

                // Destructure correctly from getFilteredData
                const {filtered, displayed, isAr} = this.getFilteredData();

                // 1. Handle Empty States
                if (App.searchQuery && displayed.length === 0) {
                    this.renderEmptyState(cardWrapper, "search");
                    return;
                } else if (App.currentCategory === "favorites" && filtered.length === 0) {
                    this.renderEmptyState(cardWrapper, "favorites");
                    return;
                } else if (filtered.length === 0 && !App.searchQuery) {
                    this.renderEmptyState(cardWrapper, "normal");
                    return;
                }

                // 2. Completion Math (Uses `filtered`, completely ignoring search logic)
                let completedCount = filtered.filter((item) => savedState.completedIds.includes(Storage.getStorageKey(item.id))).length;
                const totalCount = filtered.length;

                if (completedCount >= totalCount && totalCount > 0) await Storage.saveCategoryComplete(App.currentCategory);

                const countersCtx = {completedCount, totalCount};

                // 3. Render Loop (Uses `displayed` to only show search matches)
                displayed.forEach((item) => {
                    const card = this.buildCard(item, savedState, isAr, countersCtx);
                    cardWrapper.appendChild(card);
                });

                this.applyUITranslations();
                await this.checkCategoryCompletion(App.currentCategory);
            };

            if (animate) {
                this.showSkeletons();
                setTimeout(executeRender, 150);
            } else {
                executeRender();
            }
        },
    };

    // ==========================================
    // 8.5. REMINDERS & NOTIFICATIONS
    // ==========================================
    const Reminders = {
        async init() {
            this.toggleEl = el("remindersToggle");
            this.timesContainer = el("remindersTimes");
            this.morningEl = el("timeMorning");
            this.eveningEl = el("timeEvening");
            this.webWarning = el("remindersWebWarning");

            if (!this.toggleEl) return;

            // 1. Load Saved State
            const isEnabled = Prefs.get("wird_reminders_enabled") === "true";
            const timeMorning = Prefs.get("wird_reminder_morning_time") || "07:00";
            const timeEvening = Prefs.get("wird_reminder_evening_time") || "17:00";

            this.toggleEl.checked = isEnabled;
            if (this.morningEl) this.morningEl.value = timeMorning;
            if (this.eveningEl) this.eveningEl.value = timeEvening;

            this.updateUI();

            // 2. Web Fallback & Validation
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) {
                // Not running in Capacitor with the plugin installed
                this.toggleEl.disabled = true;
                this.toggleEl.parentElement.style.opacity = "0.5";
                if (this.webWarning) {
                    this.webWarning.classList.remove("hidden");
                    this.webWarning.innerText = App.uiStrings[App.currentLang]?.notification_app_only || "Reminders are only available in the app.";
                }
            } else if (this.webWarning) {
                // Valid Native Platform - Hide warning completely
                this.webWarning.classList.add("hidden");
            }

            // 3. Listeners
            this.toggleEl.addEventListener("change", (e) => this.handleToggle(e.target.checked));
            if (this.morningEl) this.morningEl.addEventListener("change", (e) => this.handleTimeChange("morning", e.target.value));
            if (this.eveningEl) this.eveningEl.addEventListener("change", (e) => this.handleTimeChange("evening", e.target.value));

            // 4. Handle Deep Linking (App opens via Notification Tap)
            if (LN) {
                try {
                    LN.addListener('localNotificationActionPerformed', (notificationAction) => {
                        const payload = notificationAction.notification.extra;
                        if (payload && payload.category) {
                            App.currentCategory = payload.category;

                            // Let the app finish rendering before forcing scroll
                            setTimeout(() => {
                                UI.updateCategoryUI();
                                UI.render(true);
                                UI.scrollToActiveCategory();
                            }, 500);
                        }
                    });
                } catch (e) {
                    console.error("LocalNotifications listener error", e);
                }
            }
        },

        updateUI() {
            if (this.toggleEl.checked) {
                this.timesContainer?.classList.remove("hidden");
                this.timesContainer?.classList.add("flex");
            } else {
                this.timesContainer?.classList.add("hidden");
                this.timesContainer?.classList.remove("flex");
            }
        },

        async handleToggle(enabled) {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;

            if (enabled) {
                // Request Permission securely
                let permStatus = await LN.checkPermissions();
                if (permStatus.display !== 'granted') {
                    permStatus = await LN.requestPermissions();
                }

                if (permStatus.display !== 'granted') {
                    // Revert UI if denied
                    this.toggleEl.checked = false;
                    this.updateUI();
                    UI.toast(App.uiStrings[App.currentLang]?.notifications_denied || "Permission denied.", "error");
                    return;
                }

                await Prefs.set("wird_reminders_enabled", "true");
                this.updateUI();
                await this.scheduleAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_reminders_set || "Reminders enabled.", "success");
            } else {
                // Turn off
                await Prefs.set("wird_reminders_enabled", "false");
                this.updateUI();
                await this.cancelAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_reminders_off || "Reminders disabled.", "info");
            }
        },

        async handleTimeChange(type, timeVal) {
            if (!timeVal) return;
            await Prefs.set(`wird_reminder_${type}_time`, timeVal);
            if (this.toggleEl.checked) {
                await this.scheduleAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_time_updated || "Time updated.", "success");
            }
        },

        async scheduleAll() {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;

            // Clear old schedules first
            await this.cancelAll();

            const morningTime = Prefs.get("wird_reminder_morning_time") || "07:00";
            const eveningTime = Prefs.get("wird_reminder_evening_time") || "17:00";

            const [mHour, mMin] = morningTime.split(":").map(Number);
            const [eHour, eMin] = eveningTime.split(":").map(Number);

            const t = (key, fallback) => App.uiStrings[App.currentLang]?.[key] || fallback;
            const notifications = [];

            if (!isNaN(mHour) && !isNaN(mMin)) {
                notifications.push({
                    id: 1,
                    title: t("reminder_morning_title", "🌅 Morning Adhkar"),
                    body: t("reminder_morning_body", "Start your day with remembrance of Allah."),
                    schedule: {on: {hour: mHour, minute: mMin}},
                    extra: {category: "morning"}
                });
            }

            if (!isNaN(eHour) && !isNaN(eMin)) {
                notifications.push({
                    id: 2,
                    title: t("reminder_evening_title", "🌙 Evening Adhkar"),
                    body: t("reminder_evening_body", "End your day with remembrance of Allah."),
                    schedule: {on: {hour: eHour, minute: eMin}},
                    extra: {category: "evening"}
                });
            }

            if (notifications.length > 0) {
                try {
                    await LN.schedule({notifications});
                } catch (e) {
                    console.error("Failed to schedule notifications", e);
                }
            }
        },

        async cancelAll() {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;
            try {
                await LN.cancel({notifications: [{id: 1}, {id: 2}]});
            } catch (e) {
            }
        }
    };

    // ==========================================
    // 9. SETTINGS MODAL
    // ==========================================
    function initSettingsUI() {
        const modal = el("settingsModal");
        const panel = el("modalContent");
        const openBtn = el("settingsBtn");
        const closeBtn = el("settingsCloseBtn");

        let lastFocus = null;
        let isOpen = false;

        const getFocusable = () => {
            if (!panel) return [];
            return qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel)
                .filter((n) => !n.disabled && n.offsetParent !== null);
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

            // FIX: Move focus OUT of the modal before hiding it
            // This completely resolves the "Blocked aria-hidden" browser error
            // and fixes the bug where Edge refuses to close the modal.
            if (lastFocus && lastFocus.focus) {
                lastFocus.focus();
            } else if (document.activeElement) {
                document.activeElement.blur();
            }

            // Now it's safely blurred, we can hide it from screen readers
            panel.setAttribute("aria-hidden", "true");

            // Trigger visual CSS animations
            modal.classList.add("opacity-0");
            panel.classList.add("scale-95");
            document.body.classList.remove("modal-open");

            setTimeout(() => {
                modal.classList.add("hidden");
            }, 300);
        };

        if (openBtn) openBtn.onclick = open;
        if (closeBtn) closeBtn.onclick = (e) => {
            e.stopPropagation();
            close();
        };

        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) close();
            };
        }

        // Esc + focus trap
        document.addEventListener("keydown", (e) => {
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

    // ==========================================
    // 10. INIT (Updated for SEO & Capacitor Safety)
    // ==========================================
    async function init() {
        try {
            // --- 0. PREFERENCES & MIGRATION ---
            await Prefs.migrate();
            await Prefs.loadAll();

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
                const swResponse = await fetch("sw.js");
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
                [adhkarRes, stringsRes] = await Promise.all([fetch("data.json"), fetch("strings.json")]);
            } catch {
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
            initSettingsUI();
            await Reminders.init();
            await Streak.awardForToday();

        } catch (e) {
            console.error("Init error:", e);
        }
    }

    // ==========================================
    // 11. GLOBAL LISTENERS (preserved)
    // ==========================================
    function wireGlobalListeners() {
        // --- A11Y: Skip Link ---
        const skipLink = document.querySelector('.skip-link');
        if (skipLink) {
            skipLink.onclick = (e) => {
                e.preventDefault();
                const target = el('adhkar-container');
                if (target) {
                    target.focus();
                    target.scrollIntoView();
                }
            };
        }

        // --- SEARCH NAVBAR LOGIC ---
        const searchToggleBtn = el("searchToggleBtn");
        const searchCloseBtn = el("searchCloseBtn");
        const searchInput = el("searchInput");
        const defaultNav = el("defaultNavContent");
        const searchNav = el("searchNavContent");
        let searchTimeout;

        const openSearch = () => {
            if (defaultNav && searchNav) {
                // Hardcode pointer events to avoid Tailwind compilation issues
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
            searchInput.addEventListener("input", (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    App.searchQuery = e.target.value.trim();
                    UI.render(false);
                }, 200);
            });

            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Escape") closeSearch();
            });
        }

        // --- CATEGORY BUTTONS ---
        let pendingCategory = null;
        ["favorites", "morning", "evening", "waking", "sleep"].forEach((cat) => {
            const btn = el(`btn-${cat}`);
            if (btn) {
                btn.onclick = () => {
                    const wrapper = el("card-wrapper");
                    if (!wrapper) return;

                    if (window.speechSynthesis) window.speechSynthesis.cancel();

                    // Reset Search safely if it's open
                    if (App.searchQuery) {
                        closeSearch();
                    }

                    pendingCategory = cat;

                    // If already fading out, just update the target and let the existing listener handle it
                    if (wrapper.classList.contains("fade-out-left")) return;

                    // 1. Start Fade Out
                    wrapper.classList.remove("fade-out-right");
                    wrapper.classList.add("fade-out-left");

                    let transitionFinished = false;
                    const onTransitionEnd = (e) => {
                        if (transitionFinished) return;
                        // Filter out children events
                        if (e && e.target !== wrapper) return;

                        transitionFinished = true;
                        if (safetyTimeout) clearTimeout(safetyTimeout);
                        wrapper.removeEventListener("transitionend", onTransitionEnd);

                        // 2. Swap Data (Always use the LATEST clicked category)
                        App.currentCategory = pendingCategory;
                        UI.updateCategoryUI();
                        UI.render(true);

                        // 3. Start Fade In
                        wrapper.classList.remove("fade-out-left");
                        wrapper.classList.add("fade-out-right");
                        void wrapper.offsetWidth; // Force reflow
                        wrapper.classList.remove("fade-out-right");
                    };

                    // 4. Attach Listener + Safety Fallback
                    wrapper.addEventListener("transitionend", onTransitionEnd);
                    const safetyTimeout = setTimeout(onTransitionEnd, 400);
                };
            }
        });

        const kidsToggle = el("kidsToggle");
        if (kidsToggle) {
            // Apply initial state
            document.body.classList.toggle('theme-kids', App.isKidsMode);
            kidsToggle.onchange = async (e) => {
                App.isKidsMode = e.target.checked;
                await Prefs.set("isKidsMode", String(App.isKidsMode));
                // ADDED: Toggle the CSS class for visual changes
                document.body.classList.toggle('theme-kids', App.isKidsMode);
                UI.render();
            };
        }

        // ADDED: The Seasonal Decorations Toggle
        const decorationsToggle = el("decorationsToggle");
        if (decorationsToggle) {
            const savedDeco = Prefs.get("wird_show_decorations") !== "false";
            decorationsToggle.checked = savedDeco;
            decorationsToggle.onchange = async (e) => {
                await Prefs.set("wird_show_decorations", String(e.target.checked));
                App.checkFestivals(); // Run immediately to show/hide lantern
            };
        }

        const langSelect = el("langSelect");
        if (langSelect) {
            langSelect.onchange = async (e) => {
                App.currentLang = e.target.value;
                await Prefs.set("userLang", App.currentLang);
                UI.applyUITranslations();
                UI.updateCategoryUI();
                UI.render();
            };
        }

        const resetFabBtn = el("resetFabBtn");
        if (resetFabBtn) {
            resetFabBtn.onclick = async (e) => {
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

            scrollTopBtn.onclick = (e) => {
                e.stopPropagation();
                window.scrollTo({top: 0, behavior: "smooth"});
            };
        }

        const focusModal = el("focusModal");
        if (focusModal) focusModal.addEventListener("click", (e) => Focus.handleTap(e));

        const closeFocusBtn = el("closeFocusBtn");
        if (closeFocusBtn) {
            closeFocusBtn.onclick = (e) => {
                e.stopPropagation();
                Focus.close();
            };
        }

        const exportBtn = el("exportBtn");
        if (exportBtn) {
            exportBtn.onclick = (e) => {
                e.stopPropagation();
                Backup.exportData();
            };
        }

        const importBtn = el("importBtn");
        const importInput = el("importInput");
        if (importBtn && importInput) {
            importBtn.onclick = (e) => {
                e.stopPropagation();
                importInput.click();
            };
            importInput.onchange = (e) => {
                Backup.importData(e);
                importInput.value = "";
            };
        }

        // Share App CTA
        const shareAppBtn = el("shareAppBtn");
        if (shareAppBtn) {
            shareAppBtn.onclick = async (e) => {
                e.stopPropagation();

                const title = App.uiStrings?.[App.currentLang]?.app_name || "Wird";
                const text = App.uiStrings?.[App.currentLang]?.share_app_text || "Check out Wird: a free, offline, and ad-free Islamic Adhkar app.";

                // FIX: Generate localized URL (e.g., ?lang=fr)
                const lang = App.currentLang || "en";
                const url = lang === "en" ? `${projectUrl()}/` : `${projectUrl()}/?lang=${encodeURIComponent(lang)}`;

                if (navigator.share) {
                    try {
                        await navigator.share({title, text, url});
                    } catch (err) {
                        // User cancelled or unsupported
                    }
                } else {
                    // Fallback to clipboard if Web Share API is missing
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

        // ----------------------------
        // Install App button (PWA & iOS)
        // ----------------------------
        const installBtn = el("installAppBtn");
        if (installBtn) {
            installBtn.style.display = "none";

            // 1. Is it already installed (PWA)?
            const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || !!window.navigator.standalone;

            // 2. Is it running as a Native Capacitor app?
            const isNative = window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" ? window.Capacitor.isNativePlatform() : false;

            // 3. Robust iOS Detection (Fixes the iPadOS Desktop Mode bug)
            const ua = navigator.userAgent || "";
            const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isSafari = isIOS && /WebKit/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);

            // Hide permanently if already installed
            if (isStandalone || isNative) {
                installBtn.style.display = "none";
            } else {

                // Show button immediately for iOS Safari (because they don't fire the 'beforeinstallprompt' event)
                if (isSafari) {
                    installBtn.style.display = "flex";
                }

                // Chrome/Android: Listen for the standard install prompt
                window.addEventListener("beforeinstallprompt", (e) => {
                    e.preventDefault();
                    App.deferredInstallPrompt = e;
                    installBtn.style.display = "flex";
                });

                // Hide button globally once installed
                window.addEventListener("appinstalled", () => {
                    App.deferredInstallPrompt = null;
                    installBtn.style.display = "none";
                });

                installBtn.onclick = async (e) => {
                    e.stopPropagation();

                    // Android / Chrome Native Flow
                    if (App.deferredInstallPrompt) {
                        App.deferredInstallPrompt.prompt();
                        try {
                            const outcome = await App.deferredInstallPrompt.userChoice;
                            if (outcome.outcome === 'accepted') {
                                installBtn.style.display = "none";
                            }
                        } catch (_) {
                        }
                        App.deferredInstallPrompt = null;
                        return;
                    }

                    // iOS Safari Custom Visual Flow
                    if (isSafari) {
                        const step1 = App.uiStrings?.[App.currentLang]?.install_ios_step1 || "Tap the Share icon at the bottom";
                        const step2 = App.uiStrings?.[App.currentLang]?.install_ios_step2 || "Select 'Add to Home Screen'";

                        // Using raw style strings as a backup in case Tailwind compilation is missing these specific classes
                        const iosHtml = `
                            <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
                                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">
                                    <svg style="width:24px; height:24px; color:#3b82f6; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                                    </svg>
                                    <span style="font-size:0.9rem; font-weight:600; text-align:start;">1. ${step1}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">
                                    <svg style="width:24px; height:24px; color:inherit; opacity:0.7; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                                    </svg>
                                    <span style="font-size:0.9rem; font-weight:600; text-align:start;">2. ${step2}</span>
                                </div>
                            </div>
                        `;

                        UI.info(iosHtml, {isHtml: true});
                        return;
                    }

                    // Fallback for browsers that don't support either but somehow clicked the button
                    const msg = App.uiStrings?.[App.currentLang]?.install_help || "To install: open your browser menu and choose 'Add to Home Screen'.";
                    UI.info(msg);
                };
            }
        }
    }

// ==========================================
// 12. SERVICE WORKER (preserved)
    // ==========================================
    function initServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        // Skip for Native App
        if (window.Capacitor && window.Capacitor.isNativePlatform()) return;

        let updateRequested = false;
        let updatePromptShown = false;

        const getUpdateMsg = () => {
            try {
                return (App.uiStrings?.[App.currentLang]?.update_msg) || "New version available! Update?";
            } catch {
                return "New version available! Update?";
            }
        };

        const promptUpdate = (reg) => {
            if (updatePromptShown) return;
            updatePromptShown = true;

            const msg = getUpdateMsg();
            const btn = App.uiStrings?.[App.currentLang]?.btn_update || "Update";

            UI.toastAction(msg, btn, () => {
                updateRequested = true;
                if (reg.waiting) reg.waiting.postMessage({type: "SKIP_WAITING"});
                else if (reg.installing) reg.installing.postMessage({type: "SKIP_WAITING"});
                else window.location.reload();
            }, "info", 9000);

            // Allow another prompt later if user ignores
            setTimeout(() => {
                updatePromptShown = false;
            }, 10000);
        };

        navigator.serviceWorker
            .register("sw.js")
            .then((reg) => {
                console.log("✅ Service Worker Registered!", reg);

                // If there is already an update waiting, prompt now
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
            })
            .catch((err) => console.error("❌ SW Registration Failed:", err));

        // Reload only if user accepted the update
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (updateRequested) window.location.reload();
        });
    }

    // ==========================================
    // 13. BOOT
    // ==========================================
    (async () => {
        await init();
        wireGlobalListeners();
        initServiceWorker();
    })();
})();
