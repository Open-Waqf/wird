import { App } from './app.js';

export function initServiceWorker(getDeps) {
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

        const { UI } = getDeps();
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
