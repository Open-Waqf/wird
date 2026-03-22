// ==========================================
// REMINDERS — Capacitor LocalNotifications wrapper
// Smart scheduling: if a category is done today → push reminder to tomorrow
// ==========================================
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

            // 4. Handle Deep Linking (App opens via Notification Tap)
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

            // Clear old schedules first
            await this.cancelAll();

            const morningTime = Prefs.get("wird_reminder_morning_time") || "07:00";
            const eveningTime = Prefs.get("wird_reminder_evening_time") || "17:00";

            const [mHour, mMin] = morningTime.split(":").map(Number);
            const [eHour, eMin] = eveningTime.split(":").map(Number);

            const t = (key, fallback) => App.uiStrings[App.currentLang]?.[key] || fallback;
            const RTL_LANGS = new Set(["ar"]);
            const dir = (str) => RTL_LANGS.has(App.currentLang) ? str : `\u200E${str}`;
            const notifications = [];

            // Get current daily state to check if already done
            const state = Storage.getSavedState();

            if (!isNaN(mHour) && !isNaN(mMin)) {
                const isMorningDone = state.categoriesDone?.morning === true;
                const schedule = { on: { hour: mHour, minute: mMin } };

                // If done today, schedule for tomorrow
                if (isMorningDone) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(mHour, mMin, 0, 0);
                    schedule.at = tomorrow;
                    delete schedule.on; // Use 'at' for specific future timestamp
                }

                notifications.push({
                    id: 1,
                    title: dir(t("reminder_morning_title", "🌅 Morning Adhkar")),
                    body:  dir(t("reminder_morning_body", "Start your day with remembrance of Allah.")),
                    schedule: schedule,
                    extra: { category: "morning" }
                });
            }

            if (!isNaN(eHour) && !isNaN(eMin)) {
                const isEveningDone = state.categoriesDone?.evening === true;
                const schedule = { on: { hour: eHour, minute: eMin } };

                // If done today, schedule for tomorrow
                if (isEveningDone) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(eHour, eMin, 0, 0);
                    schedule.at = tomorrow;
                    delete schedule.on; // Use 'at' for specific future timestamp
                }

                notifications.push({
                    id: 2,
                    title: dir(t("reminder_evening_title", "🌙 Evening Adhkar")),
                    body:  dir(t("reminder_evening_body", "End your day with remembrance of Allah.")),
                    schedule: schedule,
                    extra: { category: "evening" }
                });
            }

            if (notifications.length > 0) {
                try {
                    await LN.schedule({ notifications });
                } catch (e) {
                    console.error("Failed to schedule notifications", e);
                }
            }
        },

        async cancelAll() {
            const LN = window.Capacitor?.Plugins?.LocalNotifications;
            if (!LN) return;
            try {
                await LN.cancel({ notifications: [{ id: 1 }, { id: 2 }] });
            } catch (e) {
            }
        }
    };
}
