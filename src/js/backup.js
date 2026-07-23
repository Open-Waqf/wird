// ==========================================
// BACKUP — Export/import progress as JSON
// Native: Capacitor Filesystem + Share; Web: Blob download
// ==========================================
export function createBackup(getDeps) {
    return {
        async exportData() {
            const { App, Prefs, Storage, UI } = getDeps();
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
                    activeDates: Prefs.get("wird_active_dates"),
                },
            };

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
            const { App, Prefs, Storage, UI } = getDeps();
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
                        if (data.settings?.activeDates) await Prefs.set("wird_active_dates", data.settings.activeDates);

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
}
