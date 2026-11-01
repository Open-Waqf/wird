// ==========================================
// HOME-SCREEN WIDGETS — "Add widget" buttons in Settings (Android app only)
// Android shows its own "Add to home screen?" dialog. Where the launcher cannot do
// that, a tip explains how to add the widget by hand.
// ==========================================
export function initHomeWidgets({ App, UI, isNativeCapacitor }) {
    const section = document.getElementById("widgetsSection");
    const plugin = window.Capacitor?.Plugins?.WidgetUpdater;
    // Website and iPhone have no widgets: the section stays hidden there.
    if (!section || !isNativeCapacitor() || typeof plugin?.pin !== "function") return;
    section.classList.remove("hidden");

    const add = async (type) => {
        let requested = false;
        try {
            ({ requested } = await plugin.pin({ type }));
        } catch {
            requested = false;
        }
        if (!requested) {
            const tip = App.uiStrings[App.currentLang]?.widgets_manual_tip
                || "Long-press your home screen, then Widgets, then Wird.";
            UI.toast(tip, "info", 5000);
        }
    };

    document.getElementById("addTasbeehWidgetBtn")?.addEventListener("click", () => add("tasbeeh"));
    document.getElementById("addStreakWidgetBtn")?.addEventListener("click", () => add("streak"));
}
