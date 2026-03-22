// ==========================================
// HAPTICS ENGINE (Capacitor first, Web fallback, never throws)
// Extracted module — imported by script.js
// ==========================================

/**
 * Creates the HapticsEngine, bound to a getter for the isHapticEnabled flag.
 * @param {() => boolean} isHapticEnabledFn - Returns current haptic preference.
 */
export function createHapticsEngine(isHapticEnabledFn) {
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
        if (!isHapticEnabledFn()) return;

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
        if (!isHapticEnabledFn()) return;

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
        },
        milestoneThump() {
            // Stronger on every 10th
            impact(CAP_STYLES.medium, 40);
        },
        completionPulse() {
            // Long distinct pulse when finished
            pulse(300);
        },
        celebrationSequence() {
            // Multi-step sequence for daily completion
            (async () => {
                await impact(CAP_STYLES.heavy, 60);
                setTimeout(async () => await impact(CAP_STYLES.medium, 40), 150);
                setTimeout(async () => await impact(CAP_STYLES.light, 20), 300);
            })();
        },
        // For legacy patterns you still use (numbers only). Arrays are handled via navigator.vibrate.
        pulseMs(ms) {
            pulse(ms);
        },
    };
}
