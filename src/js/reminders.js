// ==========================================
// REMINDERS — Capacitor LocalNotifications wrapper
// Books one reminder per day for the next DAYS_AHEAD days (morning + evening), skipping
// today's if that category is already done. Re-booked on every app open / resume.
// (A single repeating reminder cannot skip a day: the plugin's "at + repeats" turns the
// interval into "time until the first reminder", so it drifted earlier every day.)
// ==========================================
const DAYS_AHEAD = 30;
const REMINDERS = [
    {category: "morning", idBase: 1000, timeKey: "wird_reminder_morning_time", defaultTime: "07:00",
        titleKey: "reminder_morning_title", title: "🌅 Morning Adhkar",
        bodyKey: "reminder_morning_body", body: "Start your day with remembrance of Allah."},
    {category: "evening", idBase: 2000, timeKey: "wird_reminder_evening_time", defaultTime: "17:00",
        titleKey: "reminder_evening_title", title: "🌙 Evening Adhkar",
        bodyKey: "reminder_evening_body", body: "End your day with remembrance of Allah."},
];

export function createReminders(getDeps) {
    return {
        async init() {
            this.toggleEl      = document.getElementById("remindersToggle");
            this.timesContainer = document.getElementById("remindersTimes");
            this.morningEl     = document.getElementById("timeMorning");
            this.eveningEl     = document.getElementById("timeEvening");
            this.webWarning    = document.getElementById("remindersWebWarning");

            if (!this.toggleEl) return;

            const { App, Prefs, UI } = getDeps();

            // 1. Load Saved State
            const isEnabled  = Prefs.get("wird_reminders_enabled") === "true";
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

            // 4. Keep the next DAYS_AHEAD days booked: on every open, and when the app comes
            // back from the background (it can stay in memory for days). Not awaited: never
            // slows startup.
            if (LN && isEnabled) this.scheduleAll().catch((e) => console.warn("Reminder refresh failed", e));
            window.Capacitor?.Plugins?.App?.addListener?.("resume", () => {
                if (Prefs.get("wird_reminders_enabled") === "true") {
                    this.scheduleAll().catch((e) => console.warn("Reminder refresh failed", e));
                }
            });

            // 5. Handle Deep Linking (App opens via Notification Tap)
            if (LN) {
                try {
                    LN.addListener('localNotificationActionPerformed', (notificationAction) => {
                        const { App, UI } = getDeps();
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
            const { App, Prefs, UI } = getDeps();
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
            const { App, Prefs, UI } = getDeps();
            if (!timeVal) return;
            await Prefs.set(`wird_reminder_${type}_time`, timeVal);
            if (this.toggleEl.checked) {
                await this.scheduleAll();
                UI.toast(App.uiStrings[App.currentLang]?.toast_time_updated || "Time updated.", "success");
            }
        },

        async scheduleAll() {
            const { App, Prefs, Storage } = getDeps();
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;

            // Clear old schedules first (including the old repeating ones, ids 1 and 2)
            await this.cancelAll();

            const t = (key, fallback) => App.uiStrings[App.currentLang]?.[key] || fallback;
            const RTL_LANGS = new Set(["ar"]);
            const dir = (str) => RTL_LANGS.has(App.currentLang) ? str : `\u200E${str}`;
            const state = Storage.getSavedState();
            const now = new Date();
            const notifications = [];

            for (const r of REMINDERS) {
                const [hour, minute] = (Prefs.get(r.timeKey) || r.defaultTime).split(":").map(Number);
                if (isNaN(hour) || isNaN(minute)) continue;
                const doneToday = state.categoriesDone?.[r.category] === true;

                for (let day = 0; day < DAYS_AHEAD; day++) {
                    const at = new Date(now);
                    at.setDate(now.getDate() + day);
                    at.setHours(hour, minute, 0, 0);
                    if (at <= now) continue;
                    // Already done today (same 3 AM-adjusted day): no reminder for it
                    if (doneToday && Storage.getDayKey(at) === Storage.getTodayKey()) continue;

                    notifications.push({
                        id: r.idBase + day,
                        title: dir(t(r.titleKey, r.title)),
                        body: dir(t(r.bodyKey, r.body)),
                        schedule: {at, allowWhileIdle: true},
                        extra: {category: r.category},
                    });
                }
            }

            if (notifications.length > 0) {
                try {
                    await LN.schedule({ notifications });
                } catch (e) {
                    console.error("Failed to schedule notifications", e);
                }
            }
        },

        // Cancels every pending reminder this app booked (the app books nothing else).
        async cancelAll() {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;
            try {
                const { notifications } = await LN.getPending();
                if (notifications?.length) {
                    await LN.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
                }
            } catch (e) {
                // Fallback: at least the old repeating reminders
                try {
                    await LN.cancel({ notifications: [{ id: 1 }, { id: 2 }] });
                } catch {
                }
            }
        }
    };
}
