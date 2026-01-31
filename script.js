(() => {
    const SUPPORTED_LANGS = new Set([ "en", "ar", "fr", "it", "es" ]);
    const el = id => document.getElementById(id);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
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
        const mainCategories = [ "morning", "evening", "waking", "sleep" ];
        const allDone = mainCategories.every(cat => state.categoriesDone[cat]);
        if (allDone) {
            nav.classList.add("nav-reward-all-done");
        } else {
            nav.classList.remove("nav-reward-all-done");
        }
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
        }
    };
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
        saveCardComplete(cardId) {
            const state = this.getSavedState();
            const key = this.getStorageKey(cardId);
            if (!state.completedIds.includes(key)) state.completedIds.push(key);
            this.saveState(state);
        },
        resetCardProgress(cardId) {
            const state = this.getSavedState();
            const key = this.getStorageKey(cardId);
            state.completedIds = state.completedIds.filter(id => id !== key);
            if (state.cardCounts[key]) delete state.cardCounts[key];
            if (state.categoriesDone[App.currentCategory]) {
                delete state.categoriesDone[App.currentCategory];
                UI.updateCategoryUI();
            }
            this.saveState(state);
        },
        resetCurrentCategory() {
            const confirmMsg = App.uiStrings[App.currentLang]?.reset_confirm || "Reset this category?";
            if (!confirm(confirmMsg)) return;
            const state = this.getSavedState();
            let targetCards = [];
            if (App.currentCategory === "favorites") {
                targetCards = App.adhkarData.filter(item => App.favorites.includes(item.id));
            } else {
                targetCards = App.adhkarData.filter(item => {
                    const cats = Array.isArray(item.category) ? item.category : [ item.category ];
                    return cats.includes(App.currentCategory);
                });
            }
            targetCards.forEach(item => {
                const key = this.getStorageKey(item.id);
                state.completedIds = state.completedIds.filter(id => id !== key);
                if (state.cardCounts[key]) delete state.cardCounts[key];
            });
            if (state.categoriesDone[App.currentCategory]) delete state.categoriesDone[App.currentCategory];
            document.querySelector("nav").classList.remove("nav-reward-all-done");
            this.saveState(state);
            UI.updateCategoryUI();
            UI.render();
            syncNavEffects();
            UI.vibrate(50);
        },
        saveCategoryComplete(category) {
            if (category === "favorites") return;
            const state = this.getSavedState();
            state.categoriesDone[category] = true;
            this.saveState(state);
            UI.updateCategoryUI();
            syncNavEffects();
            this.triggerNavReward();
            Streak.updateStreak();
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
                }
            }
        }
    };
    const Backup = {
        exportData() {
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
            const blob = new Blob([ JSON.stringify(data, null, 2) ], {
                type: "application/json"
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `wird-backup-${(new Date).toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },
        importData(event) {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader;
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.key !== "wird_backup") throw new Error("Invalid file");
                    const confirmMsg = App.uiStrings[App.currentLang]?.overwrite_confirm || "Overwrite current progress?";
                    if (confirm(confirmMsg)) {
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
                        alert(successMsg);
                        location.reload();
                    }
                } catch {
                    const errorMsg = App.uiStrings[App.currentLang]?.import_error || "Error importing file.";
                    alert(errorMsg);
                }
            };
            reader.readAsText(file);
        }
    };
    const Streak = {
        updateStreak() {
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
            const streakEl = el("streakValue");
            if (streakEl) streakEl.innerText = String(currentStreak);
        }
    };
    const Focus = {
        open(item, currentVal) {
            const modal = el("focusModal");
            const counterEl = el("focusCounter");
            const targetEl = el("focusTarget");
            const progressEl = el("focusProgressBar");
            App.focusState = {
                currentVal: currentVal,
                targetVal: item.repeat,
                cardId: item.id
            };
            if (counterEl) counterEl.innerText = String(App.focusState.currentVal);
            if (targetEl) targetEl.innerText = `/ ${App.focusState.targetVal}`;
            if (progressEl) this.updateProgress(progressEl);
            modal?.classList.remove("hidden");
            modal?.classList.add("flex");
        },
        updateProgress(bar) {
            const pct = App.focusState.currentVal / App.focusState.targetVal * 100;
            bar.style.width = `${pct}%`;
        },
        createRipple(e, container) {
            const circle = document.createElement("span");
            const diameter = Math.max(container.clientWidth, container.clientHeight);
            const radius = diameter / 2;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
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
                Storage.saveCardCount(App.focusState.cardId, App.focusState.currentVal);
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
                            Storage.saveCardComplete(App.focusState.cardId);
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
            modal?.classList.add("hidden");
            modal?.classList.remove("flex");
            UI.updateCategoryUI();
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
                const key = Storage.getStorageKey(item.id);
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
            const categories = [ "favorites", "morning", "evening", "waking", "sleep" ];
            const state = Storage.getSavedState();
            const activeClass = [ "bg-emerald-100", "text-emerald-700", "shadow-sm", "dark:bg-emerald-900", "dark:text-emerald-300", "border-emerald-200", "dark:border-emerald-700", "border" ];
            const inactiveClass = [ "bg-slate-200", "text-slate-500", "hover:bg-slate-300", "dark:bg-slate-700", "dark:text-slate-400", "dark:hover:bg-slate-600" ];
            const completedClass = [ "ring-2", "ring-emerald-500", "ring-offset-1", "dark:ring-offset-slate-900" ];
            categories.forEach(cat => {
                const btn = el(`btn-${cat}`);
                if (!btn) return;
                btn.className = "flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 border border-transparent whitespace-nowrap snap-start";
                let label = App.uiStrings[App.currentLang] && App.uiStrings[App.currentLang][cat] ? App.uiStrings[App.currentLang][cat] : cat;
                if (cat === "morning" && !App.uiStrings[App.currentLang]?.[cat]) label = "Morning";
                if (cat === "favorites" && !App.uiStrings[App.currentLang]?.[cat]) label = "Favorites";
                if (state.categoriesDone[cat] && cat !== "favorites") {
                    btn.innerHTML = `<span class="inline-block text-emerald-500">✓</span> ${label}`;
                    btn.classList.add(...completedClass);
                } else {
                    if (cat === "favorites") btn.innerHTML = `❤️ ${label}`; else btn.innerHTML = label;
                }
                if (App.currentCategory === cat) btn.classList.add(...activeClass); else btn.classList.add(...inactiveClass);
            });
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
                return;
            }
            qsa(".share-menu").forEach(m => m.remove());
            const url = data.url || projectUrl();
            const text = data.text || "";
            const menu = document.createElement("div");
            menu.className = "share-menu";
            menu.innerHTML = `\n        <a href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" class="share-item">WhatsApp</a>\n        <a href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}" target="_blank" class="share-item">Telegram</a>\n      `;
            button.appendChild(menu);
            setTimeout(() => {
                const close = e => {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener("click", close);
                    }
                };
                document.addEventListener("click", close);
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
            if (App.currentCategory === "favorites") {
                const filtered = App.adhkarData.filter(item => App.favorites.includes(item.id));
                return {
                    filtered: filtered,
                    isAr: isAr
                };
            }
            const filtered = App.adhkarData.filter(item => {
                const cats = Array.isArray(item.category) ? item.category : [ item.category ];
                if (!cats.includes(App.currentCategory)) return false;
                if (App.isKidsMode && !item.is_kids) return false;
                return true;
            });
            return {
                filtered: filtered,
                isAr: isAr
            };
        },
        renderEmptyState(cardWrapper, type) {
            if (type === "favorites") {
                const msg = App.uiStrings[App.currentLang]?.no_favorites || "No favorites yet.";
                cardWrapper.innerHTML = `\n          <div class="flex flex-col items-center justify-center py-20 text-slate-400">\n            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>\n            <p class="text-center text-sm">${msg}</p>\n          </div>`;
            } else {
                const msg = App.uiStrings[App.currentLang]?.no_adkhar_found || "No Adhkar found";
                cardWrapper.innerHTML = `<div class="text-center text-slate-400 py-10">${msg}</div>`;
            }
        },
        buildCard(item, savedState, isAr, countersCtx) {
            const card = document.createElement("div");
            const storageKey = Storage.getStorageKey(item.id);
            const isDone = savedState.completedIds.includes(storageKey);
            const isFav = App.favorites.includes(item.id);
            card.className = `adhkar-card rounded-3xl p-6 shadow-sm mb-6 bg-white dark:bg-slate-800 border dark:border-slate-700 relative ${isDone ? "card-done" : ""}`;
            const preTextHtml = item.pre_text ? `<p class="text-right text-emerald-600/70 font-serif text-lg mb-2" dir="rtl">${item.pre_text}</p>` : "";
            const focusBtnHtml = item.repeat > 10 ? `\n        <button class="btn-focus text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Focus Mode" data-id="${item.id}">\n          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>\n        </button>\n      ` : "";
            const heartBtnHtml = `\n        <button class="btn-heart text-xs flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors ${isFav ? "active" : ""}" title="Favorite" data-id="${item.id}">\n          ${UI.getHeartIcon(isFav)}\n        </button>\n      `;
            const actionButtons = `\n        <div class="flex gap-4 mt-4 card-actions" dir="ltr">\n          ${heartBtnHtml}\n          ${focusBtnHtml}\n          <button class="btn-speak text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors">\n            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>\n          </button>\n          <button class="btn-share text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors">\n            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>\n          </button>\n          <button class="btn-copy text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors">\n            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"/></svg>\n            <span class="copy-text hidden sm:inline">${App.uiStrings[App.currentLang].copy || "Copy"}</span>\n          </button>\n        </div>\n      `;
            const detailsHtml = !isAr ? `\n        <div class="details-content ${App.showDetails ? "open" : ""}">\n          <p class="text-emerald-600 dark:text-emerald-400 text-sm italic mb-3">${item.transliteration}</p>\n          <p class="text-slate-600 dark:text-slate-300 text-sm mb-5" dir="${isAr ? "rtl" : "ltr"}">${item.translation?.[App.currentLang] || item.translation?.en || ""}</p>\n        </div>\n      ` : "";
            const toggleBtnHtml = !isAr ? `\n        <button class="toggle-btn text-xs text-slate-400 underline p-2 -m-2 z-10 hover:text-emerald-600">\n          ${App.showDetails ? App.uiStrings[App.currentLang].hide_details : App.uiStrings[App.currentLang].show_details}\n        </button>\n      ` : "";
            let initialVal = savedState.cardCounts[storageKey] || 0;
            if (isDone) initialVal = item.repeat;
            const verifyHref = UI.buildVerifyUrl(item);
            card.innerHTML = `\n        ${preTextHtml}\n        <p class="arabic-text" dir="rtl">${item.arabic}</p>\n        <div class="mb-2 flex ${isAr ? "justify-end" : "justify-start"}">\n          <a href="${verifyHref}" target="_blank" class="verify-link text-[10px] uppercase tracking-widest text-emerald-600 font-bold hover:underline z-10 p-2 -m-2 block">${item.reference} 🔗</a>\n        </div>\n        ${detailsHtml}\n        ${actionButtons}\n        <div class="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-700" dir="ltr">\n          ${toggleBtnHtml}\n          ${isAr ? "<div></div>" : ""}\n          <div class="flex items-center gap-4 card-actions z-10">\n            <button class="reset-btn text-slate-300 hover:text-red-500 transition-colors p-2 -m-2">\n              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>\n            </button>\n            <div class="counter-display bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-400 px-5 py-2 rounded-xl font-black text-2xl min-w-[80px] text-center transition-colors">\n              <span class="counter">${initialVal}</span>\n              <span class="text-sm font-normal text-emerald-600 dark:text-emerald-500">/${item.repeat}</span>\n            </div>\n          </div>\n          <div class="card-progress-container">\n            <div class="card-progress-bar" style="width: ${initialVal / item.repeat * 100}%"></div>\n          </div>\n        </div>\n      `;
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
                    Storage.saveCardCount(item.id, val);
                    if (val === item.repeat) {
                        card.classList.add("card-done");
                        const bar = card.querySelector(".card-progress-bar");
                        if (bar) bar.classList.add("bar-completion-pulse");
                        Storage.saveCardComplete(item.id);
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
                        textToCopy += `\n\n${item.transliteration}`;
                        const t = item.translation?.[App.currentLang] || item.translation?.en || "";
                        if (t) textToCopy += `\n\n${t}`;
                    }
                    await navigator.clipboard.writeText(textToCopy);
                    const label = copyBtn.querySelector(".copy-text");
                    const original = label.innerText;
                    label.innerText = "✓";
                    setTimeout(() => label.innerText = original, 1e3);
                };
            }
            const shareBtn = card.querySelector(".btn-share");
            if (shareBtn) {
                shareBtn.onclick = e => {
                    e.stopPropagation();
                    const shareText = UI.buildShareText(item);
                    const shareUrl = UI.buildShareUrl(item);
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
        render() {
            const container = el("adhkar-container");
            let cardWrapper = el("card-wrapper");
            if (!cardWrapper) {
                cardWrapper = document.createElement("div");
                cardWrapper.id = "card-wrapper";
                container?.appendChild(cardWrapper);
            }
            if (!cardWrapper) return;
            this.showSkeletons();
            setTimeout(() => {
                window.scrollTo(0, 0);
                cardWrapper.innerHTML = "";
                const savedState = Storage.getSavedState();
                this.updateStickyTitle();
                const {filtered: filtered, isAr: isAr} = this.getFilteredData();
                if (App.currentCategory === "favorites") {
                    if (filtered.length === 0) {
                        this.renderEmptyState(cardWrapper, "favorites");
                        return;
                    }
                } else {
                    if (filtered.length === 0) {
                        this.renderEmptyState(cardWrapper, "normal");
                        return;
                    }
                }
                let completedCount = filtered.filter(item => savedState.completedIds.includes(Storage.getStorageKey(item.id))).length;
                const totalCount = filtered.length;
                if (completedCount >= totalCount && totalCount > 0) Storage.saveCategoryComplete(App.currentCategory);
                const countersCtx = {
                    completedCount: completedCount,
                    totalCount: totalCount
                };
                filtered.forEach(item => {
                    const card = this.buildCard(item, savedState, isAr, countersCtx);
                    cardWrapper.appendChild(card);
                });
                this.checkCategoryCompletion(App.currentCategory);
            }, 150);
        }
    };
    function initSettingsUI() {
        const modal = el("settingsModal");
        const openBtn = el("settingsBtn");
        if (openBtn) {
            openBtn.onclick = () => {
                modal.classList.remove("hidden");
                setTimeout(() => {
                    modal.classList.remove("opacity-0");
                    modal.children[0].classList.remove("scale-95");
                }, 10);
            };
        }
        const close = () => {
            modal.classList.add("opacity-0");
            modal.children[0].classList.add("scale-95");
            setTimeout(() => modal.classList.add("hidden"), 300);
        };
        if (modal) {
            modal.onclick = e => {
                if (e.target === modal) close();
            };
        }
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
                if (versionEl) {
                    const cleanVersion = version.replace("wird-", "");
                    versionEl.innerText = `${cleanVersion}`;
                }
            } catch {
                console.log("✅ Wird App Script Loaded (Dev Mode)");
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
            const urlParams = new URLSearchParams(window.location.search);
            const verifyId = urlParams.get("verify");
            if (verifyId) {
                const it = App.adhkarData.find(x => x.id === verifyId);
                if (it?.verify_url) {
                    window.location.href = it.verify_url;
                    return;
                }
            }
            const contactBtn = el("contactBtn");
            if (contactBtn) {
                const email = contactEmail();
                const mailto = `mailto:${email}`;
                contactBtn.href = mailto;
                contactBtn.addEventListener("click", e => {
                    if (!isNativeCapacitor()) return;
                    e.preventDefault();
                    openExternal(mailto);
                });
            }
            const apkLink = el("apkDownloadLink");
            if (apkLink) {
                const url = apkUrl();
                apkLink.href = url;
                apkLink.addEventListener("click", e => {
                    if (!isNativeCapacitor()) return;
                    e.preventDefault();
                    openExternal(url);
                });
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
            const cap = window.Capacitor;
            const capApp = cap?.Plugins?.App;
            if (capApp) {
                capApp.addListener("backButton", ({canGoBack: canGoBack}) => {
                    const focusModal = el("focusModal");
                    const settingsModal = el("settingsModal");
                    if (focusModal && !focusModal.classList.contains("hidden")) {
                        Focus.close();
                    } else if (settingsModal && !settingsModal.classList.contains("hidden")) {
                        settingsModal.classList.add("hidden");
                    } else if (canGoBack) {
                        window.history.back();
                    } else {
                        capApp.exitApp();
                    }
                });
            }
            const exportBtn = el("exportBtn");
            const importBtn = el("importBtn");
            const importInput = el("importInput");
            if (exportBtn) exportBtn.onclick = () => Backup.exportData();
            if (importBtn) importBtn.onclick = () => importInput.click();
            if (importInput) importInput.onchange = e => Backup.importData(e);
            const kidsToggle = el("kidsToggle");
            if (kidsToggle) kidsToggle.checked = App.isKidsMode;
            const hapticToggle = el("hapticToggle");
            if (hapticToggle) {
                hapticToggle.checked = App.isHapticEnabled;
                hapticToggle.onchange = e => {
                    App.isHapticEnabled = e.target.checked;
                    localStorage.setItem("isHapticEnabled", String(App.isHapticEnabled));
                    if (App.isHapticEnabled) HapticsEngine.lightTap();
                };
            }
            const installBtn = el("installAppBtn");
            window.addEventListener("beforeinstallprompt", e => {
                e.preventDefault();
                App.deferredPrompt = e;
                if (installBtn) installBtn.classList.remove("hidden");
            });
            if (installBtn) {
                installBtn.addEventListener("click", async () => {
                    if (!App.deferredPrompt) return;
                    App.deferredPrompt.prompt();
                    const {outcome: outcome} = await App.deferredPrompt.userChoice;
                    App.deferredPrompt = null;
                    if (outcome === "accepted") installBtn.classList.add("hidden");
                });
            }
            const shortcutCat = urlParams.get("category");
            const validCats = [ "morning", "evening", "waking", "sleep", "favorites" ];
            if (shortcutCat && validCats.includes(shortcutCat)) {
                App.currentCategory = shortcutCat;
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                const hour = (new Date).getHours();
                if (hour >= 18 || hour < 4) App.currentCategory = "sleep"; else if (hour >= 12) App.currentCategory = "evening"; else App.currentCategory = "morning";
            }
            const langSelect = el("langSelect");
            if (langSelect) langSelect.value = App.currentLang;
            applyTheme();
            UI.applyUITranslations();
            UI.render();
            UI.updateCategoryUI();
            setTimeout(() => {
                UI.scrollToActiveCategory();
            }, 300);
            syncNavEffects();
            UI.initFontSize();
            initSettingsUI();
            Streak.updateStreak();
        } catch (e) {
            console.error("Init error:", e);
        }
    }
    function wireGlobalListeners() {
        [ "favorites", "morning", "evening", "waking", "sleep" ].forEach(cat => {
            const btn = el(`btn-${cat}`);
            if (btn) {
                btn.onclick = () => {
                    const wrapper = el("card-wrapper");
                    wrapper.classList.add("fade-out-left");
                    setTimeout(() => {
                        App.currentCategory = cat;
                        UI.updateCategoryUI();
                        UI.render();
                        wrapper.classList.remove("fade-out-left");
                        wrapper.classList.add("fade-out-right");
                        void wrapper.offsetWidth;
                        wrapper.classList.remove("fade-out-right");
                        window.speechSynthesis.cancel();
                    }, 150);
                };
            }
        });
        const kidsToggle = el("kidsToggle");
        if (kidsToggle) {
            kidsToggle.onchange = e => {
                App.isKidsMode = e.target.checked;
                localStorage.setItem("isKidsMode", String(App.isKidsMode));
                UI.render();
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
            resetFabBtn.onclick = e => {
                e.stopPropagation();
                Storage.resetCurrentCategory();
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
    }
    function initServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        if (isNativeCapacitor()) {
            console.log("📱 Native App detected: Skipping Service Worker to prevent bundling issues.");
            return;
        }
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (!refreshing) {
                refreshing = true;
                console.log("🔄 New version detected. Refreshing...");
                window.location.reload();
            }
        });
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("sw.js").then(() => console.log("✅ Service Worker Registered")).catch(err => console.error("❌ SW Error:", err));
        });
    }
    wireGlobalListeners();
    init();
    initServiceWorker();
})();