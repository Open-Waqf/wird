// ==========================================
// BACKUP — Export/import progress as JSON
// Native: Capacitor Filesystem + Share; Web: Blob download
// ==========================================
const BACKUP_VERSION = 2;
const DAY_KEY = /^wird_data_\d{4}-\d{1,2}-\d{1,2}$/;
const HISTORY_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Settings saved in a backup. "wird_reminders_enabled" is left out on purpose: a new
// device has no notification permission yet, so it would show "on" but never fire.
const SETTING_KEYS = [
    "userLang", "darkMode", "oledMode", "fontScale", "showDetails", "isKidsMode", "isHapticEnabled",
    "wird_tts_speed", "wird_show_decorations", "wird_reminder_morning_time", "wird_reminder_evening_time",
];
const STREAK_KEYS = ["wird_streak", "wird_last_active_date", "wird_active_dates"];
// Version 1 backups (before 1.74) used short names for a few settings.
const V1_SETTINGS = {
    lang: "userLang", darkMode: "darkMode", oledMode: "oledMode", fontSize: "fontScale",
    streak: "wird_streak", lastActive: "wird_last_active_date", activeDates: "wird_active_dates",
};

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// A day's progress, with only the expected fields and types. Null if it is not one.
function cleanDayState(v) {
    if (!isObject(v)) return null;
    const completedIds = Array.isArray(v.completedIds) ? v.completedIds.filter((x) => typeof x === "string") : [];
    const categoriesDone = isObject(v.categoriesDone) ? v.categoriesDone : {};
    const cardCounts = isObject(v.cardCounts) ? v.cardCounts : {};
    return {completedIds, categoriesDone, cardCounts};
}

export function createBackup(getDeps) {
    return {
        buildBackup() {
            const { App, Prefs, Storage } = getDeps();
            const pick = (keys) => Object.fromEntries(keys.filter((k) => Prefs.get(k) !== null).map((k) => [k, Prefs.get(k)]));

            const days = {};
            for (const key of Prefs.keys().filter((k) => DAY_KEY.test(k))) {
                try {
                    days[key] = JSON.parse(Prefs.get(key));
                } catch {
                    // Unreadable day: leave it out of the backup.
                }
            }
            let history = {};
            try {
                history = JSON.parse(Prefs.get("wird_history") || "{}");
            } catch {
                history = {};
            }

            return {
                key: "wird_backup",
                version: BACKUP_VERSION,
                date: new Date().toISOString(),
                days,
                history,
                favorites: App.favorites,
                settings: pick(SETTING_KEYS),
                streak: pick(STREAK_KEYS),
                // For app versions before 1.74, which only read today's progress from here.
                state: Storage.getSavedState(),
            };
        },

        // Turns a backup file into the exact {key: value} pairs to store, keeping only
        // known keys with the right types. Throws if it is not a usable Wird backup.
        parseBackup(data) {
            const { Prefs, Storage } = getDeps();
            if (!isObject(data) || data.key !== "wird_backup") throw new Error("Not a Wird backup");
            const version = data.version ?? 1;
            if (typeof version !== "number" || version > BACKUP_VERSION) throw new Error("Backup from a newer app version");

            const out = {};
            const setString = (key, v) => {
                if (typeof v === "string") out[key] = v;
            };

            if (version === 1) {
                // Old backups held one day of progress: restore it under the day it was saved.
                const state = cleanDayState(data.state);
                const saved = new Date(data.date);
                if (state) out[Storage.getDayKey(Number.isNaN(saved.getTime()) ? new Date() : saved)] = JSON.stringify(state);
                const settings = isObject(data.settings) ? data.settings : {};
                for (const [oldName, key] of Object.entries(V1_SETTINGS)) setString(key, settings[oldName]);
            } else {
                for (const [key, v] of Object.entries(isObject(data.days) ? data.days : {})) {
                    const state = DAY_KEY.test(key) && cleanDayState(v);
                    if (state) out[key] = JSON.stringify(state);
                }
                // History is merged: days already on this device are kept.
                if (isObject(data.history)) {
                    let current = {};
                    try {
                        current = JSON.parse(Prefs.get("wird_history") || "{}") || {};
                    } catch {
                        current = {};
                    }
                    for (const [date, v] of Object.entries(data.history)) {
                        if (HISTORY_DATE.test(date) && isObject(v) && Array.isArray(v.done) && typeof v.cards === "number") {
                            current[date] = {done: v.done.filter((c) => typeof c === "string"), cards: v.cards};
                        }
                    }
                    out.wird_history = JSON.stringify(current);
                }
                const settings = isObject(data.settings) ? data.settings : {};
                SETTING_KEYS.forEach((k) => setString(k, settings[k]));
                const streak = isObject(data.streak) ? data.streak : {};
                STREAK_KEYS.forEach((k) => setString(k, streak[k]));
            }

            if (Array.isArray(data.favorites)) {
                out.wird_favorites = JSON.stringify(data.favorites.filter((x) => typeof x === "string"));
            }
            return out;
        },

        async exportData() {
            const { App, UI } = getDeps();
            const data = this.buildBackup();

            const jsonStr = JSON.stringify(data, null, 2);
            const fileName = `wird-backup-${new Date().toISOString().slice(0, 10)}.json`;

            // --- NATIVE ANDROID/IOS FLOW ---
            const cap = window.Capacitor;
            if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
                const Filesystem = cap.Plugins.Filesystem;
                const Share = cap.Plugins.Share;

                if (Filesystem && Share) {
                    let result;
                    // 1. Write the file securely to the app's cache directory.
                    // A genuine write failure IS an export error → notify the user.
                    try {
                        result = await Filesystem.writeFile({
                            path: fileName,
                            data: jsonStr,
                            directory: 'CACHE',
                            encoding: 'utf8'
                        });
                    } catch (e) {
                        console.error("Native export error:", e);
                        UI.toast(App.uiStrings[App.currentLang]?.copy_error || "Export failed.", "error");
                        return;
                    }

                    // 2. Open the Native "Save/Share" dialog. Dismissing/cancelling the
                    // share sheet rejects the promise — that is NOT an export failure
                    // (the file wrote fine), so swallow it silently.
                    try {
                        await Share.share({
                            title: 'Wird Backup',
                            text: 'Here is your Wird backup file.',
                            url: result.uri,
                            dialogTitle: 'Save Wird Backup'
                        });
                    } catch (e) {
                        // User cancelled the share sheet — no-op.
                    }
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

            setTimeout(() => URL.revokeObjectURL(url), 100);
        },

        importData(event) {
            const { App, Prefs, UI } = getDeps();
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    // Check the whole file before asking or changing anything.
                    const entries = this.parseBackup(JSON.parse(e.target.result));

                    const confirmMsg = App.uiStrings[App.currentLang]?.overwrite_confirm || "Overwrite current progress?";
                    const ok = await UI.confirm(confirmMsg);
                    if (ok) {
                        for (const [key, value] of Object.entries(entries)) await Prefs.set(key, value);
                        // Let the next start fold any restored old days into the history.
                        await Prefs.remove("wird_history_compacted");

                        const successMsg = App.uiStrings[App.currentLang]?.backup_restored || "Data restored successfully!";
                        UI.toast(successMsg, "success");
                        location.reload();
                    }
                } catch {
                    const errorMsg = App.uiStrings[App.currentLang]?.import_error || "Error importing file.";
                    UI.toast(errorMsg, "error");
                }
            };
            reader.onerror = () => {
                // File handle unreadable — surface it instead of failing silently.
                const errorMsg = App.uiStrings[App.currentLang]?.import_error || "Error importing file.";
                UI.toast(errorMsg, "error");
            };
            reader.readAsText(file);
        },
    };
}
