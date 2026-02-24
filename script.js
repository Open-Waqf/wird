(() => {
    const SUPPORTED_LANGS = new Set([ "en", "ar", "fr", "it", "es" ]);
    const el = id => document.getElementById(id);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const MAIN_CATEGORIES = [ "morning", "evening", "waking", "sleep" ];
    function detectSystemLang() {
        const raw = (navigator.language || "en").toLowerCase();
        const primary = raw.split("-")[0];
        return SUPPORTED_LANGS.has(primary) ? primary : "en";
    }
    function initFirstRunLanguage() {
        const saved = localStorage.getItem("userLang");
        if (saved && SUPPORTED_LANGS.has(saved)) return saved;
        if (!saved) {
            const detected = detectSystemLang();
            localStorage.setItem("userLang", detected);
            return detected;
        }
        localStorage.setItem("userLang", "en");
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
    const initialLang = initFirstRunLanguage();
    document.documentElement.lang = initialLang;
    document.documentElement.dir = initialLang === "ar" ? "rtl" : "ltr";
    const App = {
        adhkarData: [],
        uiStrings: {},
        currentLang: initialLang,
        showDetails: localStorage.getItem("showDetails") === "true",
        currentCategory: "morning",
        isKidsMode: localStorage.getItem("isKidsMode") === "true",
        isHapticEnabled: localStorage.getItem("isHapticEnabled") !== "false",
        currentUtterance: null,
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
            if (localStorage.getItem("wird_show_decorations") === "false") return;
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
    try {
        App.favorites = JSON.parse(localStorage.getItem("wird_favorites")) || [];
    } catch {
        App.favorites = [];
    }
    const HapticsEngine = (() => {
        let initPromise = null;
        const CAP_STYLES = {
            light: [ "LIGHT", "light" ],
            medium: [ "MEDIUM", "medium" ],
            heavy: [ "HEAVY", "heavy" ]
        };
        function getGlobalCapHaptics() {
            const cap = window.Capacitor;
            return cap?.Plugins?.Haptics || null;
        }
        async function init() {
            if (initPromise) return initPromise;
            initPromise = (async () => {
                const global = getGlobalCapHaptics();
                if (global) return global;
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
                        await h.impact({
                            style: style
                        });
                        return;
                    } catch {}
                }
            }
            if (navigator.vibrate) navigator.vibrate(webFallbackMs);
        }
        async function pulse(ms) {
            if (!App.isHapticEnabled) return;
            const h = await init();
            if (h?.vibrate) {
                try {
                    await h.vibrate({
                        duration: ms
                    });
                    return;
                } catch {
                    try {
                        await h.vibrate();
                        return;
                    } catch {}
                }
            }
            if (navigator.vibrate) navigator.vibrate(ms);
        }
        return {
            lightTap() {
                impact(CAP_STYLES.light, 10);
            },
            milestoneThump() {
                impact(CAP_STYLES.medium, 40);
            },
            completionPulse() {
                pulse(300);
            },
            pulseMs(ms) {
                pulse(ms);
            }
        };
    })();
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
    const Storage = {
        getStorageKey(cardId) {
            return `${App.currentCategory}_${cardId}`;
        },
        getStorageKeyForCategory(category, cardId) {
            return `${category}_${cardId}`;
        },
        getProgressCategoryForItem(item) {
            if (App.currentCategory !== "favorites") return App.currentCategory;
            const cats = Array.isArray(item.category) ? item.category : [ item.category ];
            const preferred = cats.find(c => MAIN_CATEGORIES.includes(c));
            return preferred || cats[0] || "morning";
        },
        getTodayKey() {
            const d = new Date;
            return `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        },
        getSavedState() {
            const key = this.getTodayKey();
            const defaultState = {
                completedIds: [],
                categoriesDone: {},
                cardCounts: {}
            };
            const raw = localStorage.getItem(key);
            let saved = null;
            try {
                saved = raw ? JSON.parse(raw) : null;
            } catch {
                saved = null;
            }
            return {
                ...defaultState,
                ...saved || {}
            };
        },
        saveState(state) {
            localStorage.setItem(this.getTodayKey(), JSON.stringify(state));
        },
        saveCardCount(cardId, count) {
            const state = this.getSavedState();
            const key = this.getStorageKey(cardId);
            state.cardCounts[key] = count;
            this.saveState(state);
        },
        saveCardCountForCategory(category, cardId, count) {
            const state = this.getSavedState();
            const key = this.getStorageKeyForCategory(category, cardId);
            state.cardCounts[key] = count;
            this.saveState(state);
        },
        saveCardComplete(cardId) {
            const state = this.getSavedState();
            const key = this.getStorageKey(cardId);
            if (!state.completedIds.includes(key)) state.completedIds.push(key);
            this.saveState(state);
        },
        saveCardCompleteForCategory(category, cardId) {
            const state = this.getSavedState();
            const key = this.getStorageKeyForCategory(category, cardId);
            if (!state.completedIds.includes(key)) state.completedIds.push(key);
            this.saveState(state);
        },
        resetCardProgress(cardId) {
            const state = this.getSavedState();
            if (App.currentCategory === "favorites") {
                const suffix = `_${cardId}`;
                state.completedIds = state.completedIds.filter(id => !id.endsWith(suffix));
                Object.keys(state.cardCounts).forEach(k => {
                    if (k.endsWith(suffix)) delete state.cardCounts[k];
                });
                this.saveState(state);
                UI.updateCategoryUI();
                UI.render();
                UI.updateCategoryUI();
                syncNavEffects();
                syncNavEffects();
                return;
            }
            const key = this.getStorageKey(cardId);
            state.completedIds = state.completedIds.filter(id => id !== key);
            if (state.cardCounts[key]) delete state.cardCounts[key];
            if (state.categoriesDone[App.currentCategory]) {
                delete state.categoriesDone[App.currentCategory];
                UI.updateCategoryUI();
            }
            this.saveState(state);
        },
        async resetCurrentCategory() {
            const confirmMsg = App.uiStrings[App.currentLang]?.reset_confirm || "Reset this category?";
            const ok = await UI.confirm(confirmMsg);
            if (!ok) return;
            const state = this.getSavedState();
            if (App.currentCategory === "favorites") {
                const favIds = new Set(App.favorites || []);
                state.completedIds = state.completedIds.filter(k => {
                    for (const id of favIds) {
                        if (k.endsWith(`_${id}`)) return false;
                    }
                    return true;
                });
                Object.keys(state.cardCounts).forEach(k => {
                    for (const id of favIds) {
                        if (k.endsWith(`_${id}`)) {
                            delete state.cardCounts[k];
                            break;
                        }
                    }
                });
                this.saveState(state);
                UI.updateCategoryUI();
                UI.render();
                syncNavEffects();
                UI.toast(App.uiStrings[App.currentLang]?.toast_reset_done || "Progress reset.", "success");
                UI.vibrate(40);
                return;
            }
            const targetCards = App.adhkarData.filter(item => {
                const cats = Array.isArray(item.category) ? item.category : [ item.category ];
                return cats.includes(App.currentCategory);
            });
            targetCards.forEach(item => {
                const key = this.getStorageKey(item.id);
                state.completedIds = state.completedIds.filter(id => id !== key);
                if (state.cardCounts[key]) delete state.cardCounts[key];
            });
            if (state.categoriesDone[App.currentCategory]) delete state.categoriesDone[App.currentCategory];
            document.querySelector("nav")?.classList.remove("nav-reward-all-done");
            this.saveState(state);
            UI.updateCategoryUI();
            UI.render();
            syncNavEffects();
            UI.toast(App.uiStrings[App.currentLang]?.toast_reset_done || "Progress reset.", "success");
            UI.vibrate(40);
        },
        saveCategoryComplete(category) {
            if (category === "favorites") return;
            const state = this.getSavedState();
            state.categoriesDone[category] = true;
            this.saveState(state);
            UI.updateCategoryUI();
            syncNavEffects();
            this.triggerNavReward();
            Streak.awardForToday();
        },
        triggerNavReward() {
            const nav = document.querySelector("nav");
            const state = this.getSavedState();
            const mainCategories = [ "morning", "evening", "waking", "sleep" ];
            const allDone = mainCategories.every(cat => state.categoriesDone[cat]);
            if (allDone) {
                nav.classList.remove("nav-reward-category");
                nav.classList.add("nav-reward-all-done");
            } else {
                nav.classList.add("nav-reward-category");
                setTimeout(() => nav.classList.remove("nav-reward-category"), 1500);
            }
        }
    };
    const Favorites = {
        persist() {
            localStorage.setItem("wird_favorites", JSON.stringify(App.favorites));
        },
        toggle(id) {
            if (App.favorites.includes(id)) {
                App.favorites = App.favorites.filter(favId => favId !== id);
            } else {
                App.favorites.push(id);
                HapticsEngine.lightTap();
            }
            this.persist();
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
        }
    };
    const Backup = {
        async exportData() {
            const data = {
                key: "wird_backup",
                date: (new Date).toISOString(),
                state: Storage.getSavedState(),
                favorites: App.favorites,
                settings: {
                    lang: localStorage.getItem("userLang"),
                    darkMode: localStorage.getItem("darkMode"),
                    oledMode: localStorage.getItem("oledMode"),
                    fontSize: localStorage.getItem("fontScale"),
                    streak: localStorage.getItem("wird_streak"),
                    lastActive: localStorage.getItem("wird_last_active_date")
                }
            };
            const jsonStr = JSON.stringify(data, null, 2);
            const fileName = `wird-backup-${(new Date).toISOString().slice(0, 10)}.json`;
            const cap = window.Capacitor;
            if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
                try {
                    const Filesystem = cap.Plugins.Filesystem;
                    const Share = cap.Plugins.Share;
                    if (Filesystem && Share) {
                        const result = await Filesystem.writeFile({
                            path: fileName,
                            data: jsonStr,
                            directory: "CACHE",
                            encoding: "utf8"
                        });
                        await Share.share({
                            title: "Wird Backup",
                            text: "Here is your Wird backup file.",
                            url: result.uri,
                            dialogTitle: "Save Wird Backup"
                        });
                        return;
                    }
                } catch (e) {
                    console.error("Native export error:", e);
                    UI.toast(App.uiStrings[App.currentLang]?.copy_error || "Export failed.", "error");
                    return;
                }
            }
            const blob = new Blob([ jsonStr ], {
                type: "application/json"
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        },
        importData(event) {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader;
            reader.onload = async e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.key !== "wird_backup") throw new Error("Invalid file");
                    const confirmMsg = App.uiStrings[App.currentLang]?.overwrite_confirm || "Overwrite current progress?";
                    const ok = await UI.confirm(confirmMsg);
                    if (ok) {
                        localStorage.setItem(Storage.getTodayKey(), JSON.stringify(data.state));
                        if (Array.isArray(data.favorites)) {
                            localStorage.setItem("wird_favorites", JSON.stringify(data.favorites));
                        }
                        if (data.settings?.lang) localStorage.setItem("userLang", data.settings.lang);
                        if (data.settings?.darkMode) localStorage.setItem("darkMode", data.settings.darkMode);
                        if (data.settings?.oledMode) localStorage.setItem("oledMode", data.settings.oledMode);
                        if (data.settings?.fontSize) localStorage.setItem("fontScale", data.settings.fontSize);
                        if (data.settings?.streak) localStorage.setItem("wird_streak", data.settings.streak);
                        if (data.settings?.lastActive) localStorage.setItem("wird_last_active_date", data.settings.lastActive);
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
        }
    };
    const Streak = {
        getCurrentStreak() {
            return parseInt(localStorage.getItem("wird_streak") || "0", 10);
        },
        refreshUI() {
            const streakEl = el("streakValue");
            if (streakEl) streakEl.innerText = String(this.getCurrentStreak());
            const sub = el("streakSub");
            const lastDateStr = localStorage.getItem("wird_last_active_date");
            if (sub) {
                if (lastDateStr) {
                    const template = App.uiStrings?.[App.currentLang]?.streak_last_active || "Last active: {date}";
                    sub.innerText = template.replace("{date}", formatShortDate(lastDateStr));
                } else {
                    sub.innerText = "";
                }
            }
        },
        awardForToday() {
            const streakKey = "wird_streak";
            const lastDateKey = "wird_last_active_date";
            const todayStr = (new Date).toDateString();
            const lastDateStr = localStorage.getItem(lastDateKey);
            let currentStreak = parseInt(localStorage.getItem(streakKey) || "0", 10);
            if (lastDateStr !== todayStr) {
                const yesterday = new Date;
                yesterday.setDate(yesterday.getDate() - 1);
                if (lastDateStr === yesterday.toDateString()) currentStreak++; else currentStreak = 1;
                localStorage.setItem(streakKey, String(currentStreak));
                localStorage.setItem(lastDateKey, todayStr);
            }
            this.refreshUI();
        }
    };
    const Focus = {
        _keyHandler: null,
        _lastFocus: null,
        open(item, currentVal) {
            const modal = el("focusModal");
            const counterEl = el("focusCounter");
            const targetEl = el("focusTarget");
            const progressEl = el("focusProgressBar");
            App.focusState = {
                currentVal: currentVal,
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
                Focus._keyHandler = ev => {
                    if (ev.key === "Escape") {
                        ev.preventDefault();
                        Focus.close();
                        return;
                    }
                    if (ev.key === " " || ev.key === "Enter") {
                        ev.preventDefault();
                        Focus.handleTap(ev);
                    }
                    if (ev.key === "Tab") {
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
            const pct = App.focusState.currentVal / App.focusState.targetVal * 100;
            bar.style.width = `${pct}%`;
        },
        createRipple(e, container) {
            const circle = document.createElement("span");
            const diameter = Math.max(container.clientWidth, container.clientHeight);
            const radius = diameter / 2;
            const rect = container.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : typeof e.clientX === "number" ? e.clientX : rect.left + rect.width / 2;
            const clientY = e.touches ? e.touches[0].clientY : typeof e.clientY === "number" ? e.clientY : rect.top + rect.height / 2;
            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${clientX - radius}px`;
            circle.style.top = `${clientY - radius}px`;
            circle.classList.add("ripple");
            container.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
        },
        handleTap(e) {
            if (e.target.closest("#closeFocusBtn")) return;
            const modal = el("focusModal");
            const counterEl = el("focusCounter");
            const progressEl = el("focusProgressBar");
            if (App.focusState.currentVal < App.focusState.targetVal) {
                App.focusState.currentVal++;
                if (counterEl) {
                    counterEl.innerText = String(App.focusState.currentVal);
                    counterEl.style.transform = "scale(1.2)";
                    setTimeout(() => counterEl.style.transform = "scale(1)", 100);
                }
                if (modal) this.createRipple(e, modal);
                if (progressEl) this.updateProgress(progressEl);
                UI.smartHapticForCounter(App.focusState.currentVal, App.focusState.targetVal);
                UI.announceMilestone(App.focusState.currentVal, App.focusState.targetVal);
                Storage.saveCardCountForCategory(App.focusState.category || App.currentCategory, App.focusState.cardId, App.focusState.currentVal);
                const focusBtn = document.querySelector(`.btn-focus[data-id="${App.focusState.cardId}"]`);
                if (focusBtn) {
                    const card = focusBtn.closest(".adhkar-card");
                    if (card) {
                        const span = card.querySelector(".counter");
                        if (span) span.innerText = String(App.focusState.currentVal);
                        const cardBar = card.querySelector(".card-progress-bar");
                        if (cardBar) {
                            const pct = App.focusState.currentVal / App.focusState.targetVal * 100;
                            cardBar.style.width = `${pct}%`;
                        }
                        if (App.focusState.currentVal === App.focusState.targetVal) {
                            card.classList.add("card-done");
                            const bar = card.querySelector(".card-progress-bar");
                            if (bar) bar.classList.add("bar-completion-pulse");
                            Storage.saveCardCompleteForCategory(App.focusState.category || App.currentCategory, App.focusState.cardId);
                            if (App.currentCategory !== "favorites") {
                                const totalCount = document.querySelectorAll(".adhkar-card").length;
                                const completedCount = document.querySelectorAll(".adhkar-card.card-done").length;
                                if (completedCount >= totalCount) Storage.saveCategoryComplete(App.currentCategory);
                            }
                            setTimeout(() => this.close(), 500);
                        }
                    }
                }
            }
        },
        close() {
            const modal = el("focusModal");
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
        }
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
                await Browser.open({
                    url: url
                });
                return;
            } catch {}
        }
        window.open(url, "_blank", "noopener");
    }
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
    const UI = {
        scrollToActiveCategory() {
            const container = el("category-nav-container");
            const activeBtn = container?.querySelector(".bg-emerald-100, .dark\\:bg-emerald-900");
            if (activeBtn && container) {
                const offset = activeBtn.offsetLeft - container.clientWidth / 2 + activeBtn.clientWidth / 2;
                container.scrollTo({
                    left: offset,
                    behavior: "smooth"
                });
            }
        },
        vibrate(pattern) {
            if (!App.isHapticEnabled) return;
            if (Array.isArray(pattern)) {
                if (navigator.vibrate) navigator.vibrate(pattern);
                return;
            }
            if (typeof pattern === "number") {
                HapticsEngine.pulseMs(pattern);
            }
        },
        announceMilestone(currentVal, targetVal) {
            const announcer = el("a11y-announcer");
            if (!announcer) return;
            if (currentVal >= targetVal) {
                const doneTxt = App.uiStrings?.[App.currentLang]?.completed || "Completed";
                announcer.innerText = `${currentVal}. ${doneTxt}.`;
                return;
            }
            if (currentVal % 10 === 0) {
                announcer.innerText = String(currentVal);
            }
        },
        smartHapticForCounter(currentVal, targetVal) {
            if (!App.isHapticEnabled) return;
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
            const savedScale = localStorage.getItem("fontScale") || "1";
            document.documentElement.style.setProperty("--arabic-scale", savedScale);
            if (slider) {
                slider.value = savedScale;
                if (label) label.innerText = Math.round(parseFloat(savedScale) * 100) + "%";
                slider.oninput = e => {
                    const val = e.target.value;
                    document.documentElement.style.setProperty("--arabic-scale", val);
                    if (label) label.innerText = Math.round(parseFloat(val) * 100) + "%";
                    localStorage.setItem("fontScale", val);
                };
            }
        },
        checkCategoryCompletion(category) {
            const state = Storage.getSavedState();
            const {filtered: filtered} = this.getFilteredData();
            if (filtered.length === 0) return;
            const completedCount = filtered.filter(item => {
                const key = Storage.getStorageKeyForCategory(category, item.id);
                return state.completedIds.includes(key);
            }).length;
            if (completedCount >= filtered.length) {
                Storage.saveCategoryComplete(category);
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
            const categories = [ "favorites", ...MAIN_CATEGORIES ];
            const state = Storage.getSavedState();
            const activeClass = [ "bg-emerald-100", "text-emerald-700", "shadow-sm", "dark:bg-emerald-900", "dark:text-emerald-300", "border-emerald-200", "dark:border-emerald-700", "border" ];
            const inactiveClass = [ "bg-slate-200", "text-slate-500", "hover:bg-slate-300", "dark:bg-slate-700", "dark:text-slate-400", "dark:hover:bg-slate-600" ];
            const completedClass = [ "ring-2", "ring-emerald-500", "ring-offset-1", "dark:ring-offset-slate-900" ];
            categories.forEach(cat => {
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
                    if (cat === "favorites") btn.innerHTML = `❤️ ${label}`; else btn.innerHTML = label;
                }
                if (App.currentCategory === cat) btn.classList.add(...activeClass); else btn.classList.add(...inactiveClass);
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
            t.dir = App.currentLang === "ar" ? "rtl" : "ltr";
            t.textContent = message;
            c.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));
            window.setTimeout(() => {
                t.classList.remove("show");
                window.setTimeout(() => t.remove(), 200);
            }, duration);
        },
        toastAction(message, actionText, onAction, type = "info", duration = 8e3) {
            if (!message) return;
            const c = this.ensureToastContainer();
            const t = document.createElement("div");
            t.className = `toast ${type}`;
            t.dir = App.currentLang === "ar" ? "rtl" : "ltr";
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
                } catch {}
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
        confirm(message, opts = {}) {
            return new Promise(resolve => {
                const okText = opts.okText || App.uiStrings?.[App.currentLang]?.btn_ok || "OK";
                const cancelText = opts.cancelText || App.uiStrings?.[App.currentLang]?.btn_cancel || "Cancel";
                const overlay = document.createElement("div");
                overlay.className = "dialog-overlay";
                overlay.dir = App.currentLang === "ar" ? "rtl" : "ltr";
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
                const cleanup = val => {
                    overlay.remove();
                    document.removeEventListener("keydown", onKeyDown, true);
                    resolve(val);
                };
                const onKeyDown = e => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        cleanup(false);
                    }
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
                overlay.onclick = e => {
                    if (e.target === overlay) cleanup(false);
                };
                actions.appendChild(btnCancel);
                actions.appendChild(btnOk);
                dialog.appendChild(body);
                dialog.appendChild(actions);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);
                document.addEventListener("keydown", onKeyDown, true);
                setTimeout(() => btnOk.focus(), 0);
            });
        },
        info(message, opts = {}) {
            return new Promise(resolve => {
                const okText = opts.okText || App.uiStrings?.[App.currentLang]?.btn_ok || "OK";
                const overlay = document.createElement("div");
                overlay.className = "dialog-overlay";
                overlay.dir = App.currentLang === "ar" ? "rtl" : "ltr";
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
                const onKeyDown = e => {
                    if (e.key === "Escape" || e.key === "Enter") {
                        e.preventDefault();
                        cleanup();
                    }
                };
                btnOk.onclick = cleanup;
                overlay.onclick = e => {
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
            } catch {}
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
            qsa("[data-i18n]").forEach(node => {
                const key = node.getAttribute("data-i18n");
                if (key && App.uiStrings[App.currentLang][key]) node.innerText = App.uiStrings[App.currentLang][key];
            });
            qsa("[data-i18n-aria]").forEach(node => {
                const key = node.getAttribute("data-i18n-aria");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("aria-label", val);
            });
            qsa("[data-i18n-title]").forEach(node => {
                const key = node.getAttribute("data-i18n-title");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("title", val);
            });
            qsa("[data-i18n-placeholder]").forEach(node => {
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
            utterance.rate = .85;
            App.currentUtterance = text;
            synth.speak(utterance);
        },
        buildShareUrl(item) {
            return `${projectUrl()}/?adhkar=${encodeURIComponent(item.id)}`;
        },
        buildVerifyUrl(item) {
            return `${projectUrl()}/?verify=${encodeURIComponent(item.id)}`;
        },
        buildShareText(item) {
            const parts = [];
            if (item.arabic) parts.push(item.arabic);
            if (item.transliteration) parts.push(item.transliteration);
            const t = item.translation?.[App.currentLang] || item.translation?.en || "";
            if (t) parts.push(t);
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
            qsa(".share-menu").forEach(m => m.remove());
            qsa(".btn-share[aria-expanded='true']").forEach(b => b.setAttribute("aria-expanded", "false"));
            const url = data.url || projectUrl();
            const text = data.text || "";
            const t = (key, fallback) => App.uiStrings?.[App.currentLang]?.[key] ?? App.uiStrings?.en?.[key] ?? fallback;
            const menu = document.createElement("div");
            menu.className = "share-menu";
            menu.setAttribute("role", "menu");
            menu.setAttribute("aria-label", t("aria_share_menu", "Share options"));
            menu.dir = App.currentLang === "ar" ? "rtl" : "ltr";
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
                b.onclick = async e => {
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
                } catch {}
                document.removeEventListener("click", onDocClick, true);
                document.removeEventListener("keydown", onKeyDown, true);
            };
            const onDocClick = e => {
                if (!menu.contains(e.target) && !button.contains(e.target)) close();
            };
            const onKeyDown = e => {
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
            menu.appendChild(mkLink(`https://wa.me/?text=${encodeURIComponent(text)}`, t("share_whatsapp", "WhatsApp")));
            menu.appendChild(mkLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, t("share_telegram", "Telegram")));
            menu.appendChild(mkBtn(t("share_copy_link", "Copy link"), async () => {
                try {
                    await navigator.clipboard.writeText(url);
                    UI.toast(t("toast_link_copied", "Link copied"), "success");
                    UI.vibrate(20);
                } catch {
                    UI.toast(t("copy_error", "Copy failed."), "error");
                }
            }));
            button.appendChild(menu);
            button.setAttribute("aria-expanded", "true");
            setTimeout(() => {
                document.addEventListener("click", onDocClick, true);
                document.addEventListener("keydown", onKeyDown, true);
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
            let baseFiltered = [];
            if (App.currentCategory === "favorites") {
                baseFiltered = App.adhkarData.filter(item => App.favorites.includes(item.id));
            } else {
                baseFiltered = App.adhkarData.filter(item => {
                    const cats = Array.isArray(item.category) ? item.category : [ item.category ];
                    if (!cats.includes(App.currentCategory)) return false;
                    return !(App.isKidsMode && !item.is_kids);
                });
            }
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
            return {
                filtered: baseFiltered,
                displayed: displayed,
                isAr: isAr
            };
        },
        renderEmptyState(cardWrapper, type) {
            if (type === "search") {
                const msgTemplate = App.uiStrings[App.currentLang]?.search_no_results || 'No results found for "{query}"';
                const msg = msgTemplate.replace("{query}", escapeHTML(App.searchQuery));
                const clearBtn = App.uiStrings[App.currentLang]?.clear_search || "Clear search";
                cardWrapper.innerHTML = `\n                    <div class="flex flex-col items-center justify-center py-20 text-slate-400 px-6">\n                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>\n                      <p class="text-center text-sm mb-6">${msg}</p>\n                      <button id="emptyClearSearchBtn" class="px-5 py-2 rounded-xl font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 active:scale-95 transition-all">${clearBtn}</button>\n                    </div>`;
                setTimeout(() => {
                    const btn = el("emptyClearSearchBtn");
                    if (btn) btn.onclick = () => {
                        const input = el("searchInput");
                        if (input) {
                            input.value = "";
                            input.dispatchEvent(new Event("input"));
                        }
                    };
                }, 0);
            } else if (type === "favorites") {
                const msg = App.uiStrings[App.currentLang]?.no_favorites || "No favorites yet.";
                const cta = App.uiStrings[App.currentLang]?.cta_browse_adhkar || "Browse Adhkar";
                cardWrapper.innerHTML = `\n                  <div class="flex flex-col items-center justify-center py-20 text-slate-400">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>\n                    <p class="text-center text-sm mb-4">${msg}</p>\n                    <button class="browse-adhkar-btn px-5 py-2 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all">${cta}</button>\n                  </div>`;
                const btn = cardWrapper.querySelector(".browse-adhkar-btn");
                if (btn) {
                    btn.onclick = e => {
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
            const benefitText = item.benefit && item.benefit[App.currentLang] ? item.benefit[App.currentLang] : "";
            const hasBenefit = benefitText && benefitText.trim().length > 0;
            const preTextHtml = item.pre_text ? `<p class="text-right text-emerald-600/70 font-serif text-lg mb-2" dir="rtl">${item.pre_text}</p>` : "";
            const focusBtnHtml = item.repeat > 10 ? `\n                <button class="btn-focus text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Focus mode"\n                  data-i18n-title="title_focus_mode"\n                  aria-label="Focus mode"\n                  data-i18n-aria="aria_focus_mode" data-id="${item.id}">\n                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>\n                </button>\n            ` : "";
            const heartBtnHtml = `\n                <button class="btn-heart text-xs flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors ${isFav ? "active" : ""}" title="Toggle favorite"\n                  aria-pressed="${isFav ? "true" : "false"}"\n                  data-i18n-title="title_toggle_favorite"\n                  aria-label="Toggle favorite"\n                  data-i18n-aria="aria_toggle_favorite" data-id="${item.id}">\n                  ${UI.getHeartIcon(isFav)}\n                </button>\n            `;
            const benefitBtnHtml = hasBenefit ? `\n                <button class="btn-benefit text-xs flex items-center gap-1 text-amber-400 hover:text-amber-500 transition-colors" title="View reward"\n                  data-i18n-title="title_view_reward"\n                  aria-label="View reward"\n                  data-i18n-aria="aria_view_reward">\n                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>\n                </button>\n            ` : "";
            const benefitContentHtml = hasBenefit ? `\n                <div class="benefit-box hidden" dir="${isAr ? "rtl" : "ltr"}">\n                    <div class="flex items-start gap-2">\n                        <span class="text-xl">✨</span>\n                        <p class="font-serif italic">${benefitText}</p>\n                    </div>\n                </div>\n            ` : "";
            const actionButtons = `\n                <div class="flex gap-4 mt-4 card-actions" dir="ltr">\n                  ${heartBtnHtml}\n                  ${benefitBtnHtml}\n                  ${focusBtnHtml}\n                  <button class="btn-speak text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Read aloud"\n                    data-i18n-aria="aria_speak"\n                    title="Read aloud"\n                    data-i18n-title="title_speak">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>\n                  </button>\n                  <button class="btn-share text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Share"\n                    data-i18n-aria="aria_share"\n                    title="Share"\n                    data-i18n-title="title_share"\n                    aria-haspopup="menu"\n                    aria-expanded="false">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>\n                  </button>\n                  <button class="btn-copy text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Copy"\n                    data-i18n-aria="aria_copy"\n                    title="Copy"\n                    data-i18n-title="title_copy">\n                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"/></svg>\n                    <span class="copy-text hidden sm:inline">${App.uiStrings[App.currentLang].copy || "Copy"}</span>\n                  </button>\n                </div>\n            `;
            const displayTransliteration = highlightText(item.transliteration, App.searchQuery);
            const displayTranslation = highlightText(item.translation?.[App.currentLang] || item.translation?.en || "", App.searchQuery);
            const detailsHtml = !isAr ? `\n                <div class="details-content ${App.showDetails ? "open" : ""}">\n                  <p class="text-emerald-600 dark:text-emerald-400 text-sm italic mb-3">${displayTransliteration}</p>\n                  <p class="text-slate-600 dark:text-slate-300 text-sm mb-5" dir="${isAr ? "rtl" : "ltr"}">${displayTranslation}</p>\n                </div>\n            ` : "";
            const toggleBtnHtml = !isAr ? `\n                <button class="toggle-btn text-xs text-slate-400 underline p-2 -m-2 z-10 hover:text-emerald-600">\n                  ${App.showDetails ? App.uiStrings[App.currentLang].hide_details : App.uiStrings[App.currentLang].show_details}\n                </button>\n            ` : "";
            let initialVal = savedState.cardCounts[storageKey] || 0;
            if (isDone) initialVal = item.repeat;
            const verifyHref = UI.buildVerifyUrl(item);
            card.innerHTML = `\n                ${preTextHtml}\n                <p class="arabic-text" dir="rtl">${item.arabic}</p>\n                <div class="mb-2 flex ${isAr ? "justify-end" : "justify-start"}">\n                  <a href="${verifyHref}" target="_blank" rel="noopener" class="verify-link text-[10px] uppercase tracking-widest text-emerald-600 font-bold hover:underline z-10 p-2 -m-2 block">${item.reference} 🔗</a>\n                </div>\n                ${detailsHtml}\n                ${benefitContentHtml} ${actionButtons}\n                <div class="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-700" dir="ltr">\n                  ${toggleBtnHtml}\n                  ${isAr ? "<div></div>" : ""}\n                  <div class="flex items-center gap-4 card-actions z-10">\n                    <button class="reset-btn text-slate-300 hover:text-red-500 transition-colors p-2 -m-2" aria-label="Reset this item"\n                        data-i18n-aria="aria_reset_card"\n                        title="Reset this item"\n                        data-i18n-title="title_reset_card">\n                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>\n                    </button>\n                    <div class="counter-display bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-400 px-5 py-2 rounded-xl font-black text-2xl min-w-[80px] text-center transition-colors">\n                      <span class="counter">${initialVal}</span>\n                      <span class="text-sm font-normal text-emerald-600 dark:text-emerald-500">/${item.repeat}</span>\n                    </div>\n                  </div>\n                  <div class="card-progress-container">\n                    <div class="card-progress-bar" style="width: ${initialVal / item.repeat * 100}%"></div>\n                  </div>\n                </div>\n            `;
            const verifyLinkEl = card.querySelector(".verify-link");
            if (verifyLinkEl && item.verify_url && isNativeCapacitor()) {
                verifyLinkEl.addEventListener("click", e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openExternal(item.verify_url);
                });
            }
            card.onclick = e => {
                if (e.target.closest("button") || e.target.closest("a")) return;
                if (window.getSelection().toString().length > 0) return;
                const span = card.querySelector(".counter");
                let val = parseInt(span.innerText, 10);
                if (val < item.repeat) {
                    card.classList.add("card-pressed");
                    setTimeout(() => card.classList.remove("card-pressed"), 100);
                    val++;
                    span.innerText = String(val);
                    const bar = card.querySelector(".card-progress-bar");
                    if (bar) bar.style.width = `${val / item.repeat * 100}%`;
                    UI.smartHapticForCounter(val, item.repeat);
                    UI.announceMilestone(val, item.repeat);
                    Storage.saveCardCountForCategory(progressCategory, item.id, val);
                    if (val === item.repeat) {
                        card.classList.add("card-done");
                        const bar = card.querySelector(".card-progress-bar");
                        if (bar) bar.classList.add("bar-completion-pulse");
                        Storage.saveCardCompleteForCategory(progressCategory, item.id);
                        UI.checkCategoryCompletion(App.currentCategory);
                    }
                }
            };
            const resetBtn = card.querySelector(".reset-btn");
            resetBtn.onclick = e => {
                e.stopPropagation();
                Storage.resetCardProgress(item.id);
                card.querySelector(".counter").innerText = "0";
                card.classList.remove("card-done");
                const bar = card.querySelector(".card-progress-bar");
                if (bar) {
                    bar.style.width = "0%";
                    bar.classList.remove("bar-completion-pulse");
                }
                UI.checkCategoryCompletion(App.currentCategory);
                syncNavEffects();
            };
            const speakBtn = card.querySelector(".btn-speak");
            if (speakBtn) {
                speakBtn.onclick = e => {
                    e.stopPropagation();
                    UI.toggleSpeech(item.arabic);
                };
            }
            const copyBtn = card.querySelector(".btn-copy");
            if (copyBtn) {
                copyBtn.onclick = async e => {
                    e.stopPropagation();
                    let textToCopy = item.arabic;
                    if (App.currentLang !== "ar") {
                        textToCopy += `\n                        ${item.transliteration}`;
                        const t = item.translation?.[App.currentLang] || item.translation?.en || "";
                        if (t) textToCopy += `\n                        ${t}`;
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
                shareBtn.onclick = async e => {
                    e.stopPropagation();
                    const shareText = UI.buildShareText(item);
                    const shareUrl = UI.buildShareUrl(item);
                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: App.uiStrings?.[App.currentLang]?.seo_title || "Wird",
                                text: shareText,
                                url: shareUrl
                            });
                            return;
                        } catch {}
                    }
                    UI.toggleShareMenu(shareBtn, {
                        text: shareText,
                        url: shareUrl
                    });
                };
            }
            const heartBtn = card.querySelector(".btn-heart");
            if (heartBtn) {
                heartBtn.onclick = e => {
                    e.stopPropagation();
                    Favorites.toggle(item.id);
                };
            }
            const benefitBtn = card.querySelector(".btn-benefit");
            if (benefitBtn) {
                benefitBtn.onclick = e => {
                    e.stopPropagation();
                    const box = card.querySelector(".benefit-box");
                    if (box) {
                        box.classList.toggle("hidden");
                        benefitBtn.classList.toggle("text-amber-600");
                    }
                };
            }
            const focusBtn = card.querySelector(".btn-focus");
            if (focusBtn) {
                focusBtn.onclick = e => {
                    e.stopPropagation();
                    const currentVal = parseInt(card.querySelector(".counter").innerText, 10);
                    if (currentVal < item.repeat) Focus.open(item, currentVal);
                };
            }
            if (!isAr) {
                const toggleBtn = card.querySelector(".toggle-btn");
                if (toggleBtn) {
                    toggleBtn.onclick = e => {
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
            wrapper.innerHTML = `\n                <div class="skeleton-card"></div>\n                <div class="skeleton-card"></div>\n                <div class="skeleton-card"></div>\n            `;
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
            const executeRender = () => {
                if (animate) window.scrollTo(0, 0);
                cardWrapper.innerHTML = "";
                const savedState = Storage.getSavedState();
                this.updateStickyTitle();
                const {filtered: filtered, displayed: displayed, isAr: isAr} = this.getFilteredData();
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
                let completedCount = filtered.filter(item => savedState.completedIds.includes(Storage.getStorageKey(item.id))).length;
                const totalCount = filtered.length;
                if (completedCount >= totalCount && totalCount > 0) Storage.saveCategoryComplete(App.currentCategory);
                const countersCtx = {
                    completedCount: completedCount,
                    totalCount: totalCount
                };
                displayed.forEach(item => {
                    const card = this.buildCard(item, savedState, isAr, countersCtx);
                    cardWrapper.appendChild(card);
                });
                this.applyUITranslations();
                this.checkCategoryCompletion(App.currentCategory);
            };
            if (animate) {
                this.showSkeletons();
                setTimeout(executeRender, 150);
            } else {
                executeRender();
            }
        }
    };
    const Reminders = {
        async init() {
            this.toggleEl = el("remindersToggle");
            this.timesContainer = el("remindersTimes");
            this.morningEl = el("timeMorning");
            this.eveningEl = el("timeEvening");
            this.webWarning = el("remindersWebWarning");
            if (!this.toggleEl) return;
            const isEnabled = localStorage.getItem("wird_reminders_enabled") === "true";
            const timeMorning = localStorage.getItem("wird_reminder_morning_time") || "07:00";
            const timeEvening = localStorage.getItem("wird_reminder_evening_time") || "17:00";
            this.toggleEl.checked = isEnabled;
            if (this.morningEl) this.morningEl.value = timeMorning;
            if (this.eveningEl) this.eveningEl.value = timeEvening;
            this.updateUI();
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) {
                this.toggleEl.disabled = true;
                this.toggleEl.parentElement.style.opacity = "0.5";
                if (this.webWarning) {
                    this.webWarning.classList.remove("hidden");
                    this.webWarning.innerText = App.uiStrings[App.currentLang]?.notification_app_only || "Reminders are only available in the app.";
                }
            } else if (this.webWarning) {
                this.webWarning.classList.add("hidden");
            }
            this.toggleEl.addEventListener("change", e => this.handleToggle(e.target.checked));
            if (this.morningEl) this.morningEl.addEventListener("change", e => this.handleTimeChange("morning", e.target.value));
            if (this.eveningEl) this.eveningEl.addEventListener("change", e => this.handleTimeChange("evening", e.target.value));
            if (LN) {
                try {
                    LN.addListener("localNotificationActionPerformed", notificationAction => {
                        const payload = notificationAction.notification.extra;
                        if (payload && payload.category) {
                            App.currentCategory = payload.category;
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
                let permStatus = await LN.checkPermissions();
                if (permStatus.display !== "granted") {
                    permStatus = await LN.requestPermissions();
                }
                if (permStatus.display !== "granted") {
                    this.toggleEl.checked = false;
                    this.updateUI();
                    UI.toast(App.uiStrings[App.currentLang]?.notifications_denied || "Permission denied.", "error");
                    return;
                }
                localStorage.setItem("wird_reminders_enabled", "true");
                this.updateUI();
                await this.scheduleAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_reminders_set || "Reminders enabled.", "success");
            } else {
                localStorage.setItem("wird_reminders_enabled", "false");
                this.updateUI();
                await this.cancelAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_reminders_off || "Reminders disabled.", "info");
            }
        },
        async handleTimeChange(type, timeVal) {
            if (!timeVal) return;
            localStorage.setItem(`wird_reminder_${type}_time`, timeVal);
            if (this.toggleEl.checked) {
                await this.scheduleAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_time_updated || "Time updated.", "success");
            }
        },
        async scheduleAll() {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;
            await this.cancelAll();
            const morningTime = localStorage.getItem("wird_reminder_morning_time") || "07:00";
            const eveningTime = localStorage.getItem("wird_reminder_evening_time") || "17:00";
            const [mHour, mMin] = morningTime.split(":").map(Number);
            const [eHour, eMin] = eveningTime.split(":").map(Number);
            const t = (key, fallback) => App.uiStrings[App.currentLang]?.[key] || fallback;
            const notifications = [];
            if (!isNaN(mHour) && !isNaN(mMin)) {
                notifications.push({
                    id: 1,
                    title: t("reminder_morning_title", "🌅 Morning Adhkar"),
                    body: t("reminder_morning_body", "Start your day with remembrance of Allah."),
                    schedule: {
                        on: {
                            hour: mHour,
                            minute: mMin
                        }
                    },
                    extra: {
                        category: "morning"
                    }
                });
            }
            if (!isNaN(eHour) && !isNaN(eMin)) {
                notifications.push({
                    id: 2,
                    title: t("reminder_evening_title", "🌙 Evening Adhkar"),
                    body: t("reminder_evening_body", "End your day with remembrance of Allah."),
                    schedule: {
                        on: {
                            hour: eHour,
                            minute: eMin
                        }
                    },
                    extra: {
                        category: "evening"
                    }
                });
            }
            if (notifications.length > 0) {
                try {
                    await LN.schedule({
                        notifications: notifications
                    });
                } catch (e) {
                    console.error("Failed to schedule notifications", e);
                }
            }
        },
        async cancelAll() {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;
            try {
                await LN.cancel({
                    notifications: [ {
                        id: 1
                    }, {
                        id: 2
                    } ]
                });
            } catch (e) {}
        }
    };
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
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get("lang");
            if (urlLang && SUPPORTED_LANGS.has(urlLang)) {
                localStorage.setItem("userLang", urlLang);
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
                [adhkarRes, stringsRes] = await Promise.all([ fetch("data.json"), fetch("strings.json") ]);
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
                localStorage.setItem("userLang", "en");
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
                        localStorage.setItem("isKidsMode", "false");
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
            let isOled = localStorage.getItem("oledMode") === "true";
            let isDark = localStorage.getItem("darkMode") === "true";
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
                themeToggle.onclick = () => {
                    isDark = !isDark;
                    localStorage.setItem("darkMode", String(isDark));
                    applyTheme();
                };
            }
            if (oledToggle) {
                oledToggle.onchange = e => {
                    isOled = e.target.checked;
                    localStorage.setItem("oledMode", String(isOled));
                    if (isOled && !isDark) {
                        isDark = true;
                        localStorage.setItem("darkMode", "true");
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
            initSettingsUI();
            Reminders.init();
            Streak.awardForToday();
        } catch (e) {
            console.error("Init error:", e);
        }
    }
    function wireGlobalListeners() {
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
        [ "favorites", "morning", "evening", "waking", "sleep" ].forEach(cat => {
            const btn = el(`btn-${cat}`);
            if (btn) {
                btn.onclick = () => {
                    const wrapper = el("card-wrapper");
                    if (window.speechSynthesis) window.speechSynthesis.cancel();
                    if (App.searchQuery) {
                        closeSearch();
                    }
                    wrapper.classList.add("fade-out-left");
                    setTimeout(() => {
                        App.currentCategory = cat;
                        UI.updateCategoryUI();
                        UI.render(true);
                        wrapper.classList.remove("fade-out-left");
                        wrapper.classList.add("fade-out-right");
                        void wrapper.offsetWidth;
                        wrapper.classList.remove("fade-out-right");
                    }, 150);
                };
            }
        });
        const kidsToggle = el("kidsToggle");
        if (kidsToggle) {
            document.body.classList.toggle("theme-kids", App.isKidsMode);
            kidsToggle.onchange = e => {
                App.isKidsMode = e.target.checked;
                localStorage.setItem("isKidsMode", String(App.isKidsMode));
                document.body.classList.toggle("theme-kids", App.isKidsMode);
                UI.render();
            };
        }
        const decorationsToggle = el("decorationsToggle");
        if (decorationsToggle) {
            const savedDeco = localStorage.getItem("wird_show_decorations") !== "false";
            decorationsToggle.checked = savedDeco;
            decorationsToggle.onchange = e => {
                localStorage.setItem("wird_show_decorations", String(e.target.checked));
                App.checkFestivals();
            };
        }
        const langSelect = el("langSelect");
        if (langSelect) {
            langSelect.onchange = e => {
                App.currentLang = e.target.value;
                localStorage.setItem("userLang", App.currentLang);
                UI.applyUITranslations();
                UI.updateCategoryUI();
                UI.render();
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
            hapticToggle.onchange = () => {
                App.isHapticEnabled = !!hapticToggle.checked;
                localStorage.setItem("isHapticEnabled", App.isHapticEnabled ? "true" : "false");
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
    wireGlobalListeners();
    init();
    initServiceWorker();
})();