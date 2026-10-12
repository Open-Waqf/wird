// ==========================================
// STORAGE — Daily progress tracking with 3 AM rollover
// Key pattern: wird_data_YYYY-M-DD
// All side-effect methods (reset, complete, reward) pull live deps via getDeps()
// so circular references with UI/Streak/Reminders are resolved at call-time.
// ==========================================
export function createStorage(getDeps) {
    return {
        getStorageKey(cardId) {
            const { App } = getDeps();
            return `${App.currentCategory}_${cardId}`;
        },

        getStorageKeyForCategory(category, cardId) {
            return `${category}_${cardId}`;
        },

        // When browsing Favorites, progress is stored under the item's real category (not "favorites")
        getProgressCategoryForItem(item) {
            const { App, MAIN_CATEGORIES } = getDeps();
            if (App.currentCategory !== "favorites") return App.currentCategory;
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            const preferred = cats.find((c) => MAIN_CATEGORIES.includes(c));
            return preferred || cats[0] || "morning";
        },

        getTodayKey() {
            return this.getDayKey(new Date());
        },

        // Day key for any moment. ROLLOVER: before 3:00 AM counts as the previous day.
        getDayKey(date) {
            const d = new Date(date);
            d.setHours(d.getHours() - 3);
            return `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        },

        getSavedState() {
            const { Prefs } = getDeps();
            const key = this.getTodayKey();
            const defaultState = { completedIds: [], categoriesDone: {}, cardCounts: {} };
            const raw = Prefs.get(key);

            let saved = null;
            try {
                saved = raw ? JSON.parse(raw) : null;
            } catch {
                saved = null;
            }

            return { ...defaultState, ...(saved || {}) };
        },

        async saveState(state) {
            const { Prefs } = getDeps();
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
            const { App, UI, syncNavEffects } = getDeps();
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
            const { App, UI, syncNavEffects } = getDeps();
            const confirmMsg = App.uiStrings[App.currentLang]?.reset_confirm || "Reset this category?";
            const ok = await UI.confirm(confirmMsg);
            if (!ok) return;

            const state = this.getSavedState();

            if (App.currentCategory === "favorites") {
                // Reset progress for ALL favorite items across any category keys
                const favIds = new Set(App.favorites || []);
                state.completedIds = state.completedIds.filter((k) => {
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
            const { UI, Streak, Reminders, syncNavEffects } = getDeps();
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

            // Smart Reminders: Update schedules (skips today if done)
            if (category === "morning" || category === "evening") {
                await Reminders.scheduleAll();
            }
        },

        // Each day leaves a wird_data_* key (plus a reward_played_* flag) that is never
        // read again, and on Android every key costs a native call at startup. Days
        // older than 7 are summarised into ONE key (wird_history: categories done +
        // cards done per day) and their keys removed. Safe for live data: the summary
        // is saved before anything is deleted, unreadable days are left untouched,
        // and running it twice gives the same result.
        async compactOldDays() {
            const { Prefs } = getDeps();
            const todayKey = this.getTodayKey();
            if (Prefs.get("wird_history_compacted") === todayKey) return; // once per day

            const today = new Date();
            today.setHours(today.getHours() - 3); // same 3 AM rollover as getTodayKey
            const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
            const parseDay = (key, prefix) => {
                const m = key.slice(prefix.length).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
            };
            const pad = (n) => String(n).padStart(2, "0");

            let history = {};
            try {
                history = JSON.parse(Prefs.get("wird_history") || "{}") || {};
            } catch {
                return; // never overwrite a history we cannot read
            }

            const dayKeys = [];
            const oldFlags = [];
            for (const key of Prefs.keys()) {
                if (key.startsWith("wird_data_")) {
                    const day = parseDay(key, "wird_data_");
                    if (!day || day >= cutoff) continue;
                    let state;
                    try {
                        state = JSON.parse(Prefs.get(key));
                    } catch {
                        continue; // unreadable: keep it as is
                    }
                    if (!state || typeof state !== "object") continue;
                    const done = Object.keys(state.categoriesDone || {}).filter((c) => state.categoriesDone[c]);
                    const cards = Array.isArray(state.completedIds) ? state.completedIds.length : 0;
                    history[`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`] = { done, cards };
                    dayKeys.push(key);
                } else if (key.startsWith("reward_played_wird_data_") && key !== `reward_played_${todayKey}`) {
                    oldFlags.push(key); // "confetti already played" for a past day: no longer needed
                }
            }

            if (dayKeys.length) await Prefs.set("wird_history", JSON.stringify(history));
            for (const key of [...dayKeys, ...oldFlags]) await Prefs.remove(key);
            await Prefs.set("wird_history_compacted", todayKey);
        },

        async triggerNavReward() {
            const { App, Prefs, UI, HapticsEngine } = getDeps();
            const nav = document.querySelector('nav');
            const state = this.getSavedState();

            // Check if ALL main categories are done
            const mainCategories = ["morning", "evening", "waking", "sleep"];
            const allDone = mainCategories.every(cat => state.categoriesDone[cat]);

            if (allDone) {
                // High Tier Reward: Golden Shimmer
                nav.classList.remove('nav-reward-category');
                nav.classList.add('nav-reward-all-done');

                // Celebration Trigger (Once per day)
                const todayKey = this.getTodayKey();
                const rewardKey = `reward_played_${todayKey}`;
                if (Prefs.get(rewardKey) !== "true") {
                    await Prefs.set(rewardKey, "true");
                    UI.confetti();
                    HapticsEngine.celebrationSequence();
                }
            } else {
                // Standard Reward: Green Pulse
                nav.classList.add('nav-reward-category');
                // Remove it after animation ends so it can be re-triggered
                setTimeout(() => nav.classList.remove('nav-reward-category'), 1500);
            }
        }
    };
}
