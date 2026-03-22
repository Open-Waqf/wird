// ==========================================
// CAPACITOR PREFERENCES (Async Storage Engine)
// Dual-layer: Capacitor Preferences (native) → localStorage (web fallback)
// All reads are synchronous from _cache (populated at startup via loadAll).
// ==========================================
export const Prefs = {
    _cache: {},
    async loadAll() {
        const cap = window.Capacitor;
        const P = cap?.Plugins?.Preferences;
        if (P) {
            try {
                const { keys } = await P.keys();
                for (const key of keys) {
                    const { value } = await P.get({ key });
                    this._cache[key] = value;
                }
            } catch (e) {
                console.error("Failed to load preferences:", e);
            }
        } else {
            // Fallback: Populate cache from localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                this._cache[key] = localStorage.getItem(key);
            }
        }
    },
    get(key) {
        // Synchronous read from cache
        return this._cache[key] || null;
    },
    async set(key, value) {
        this._cache[key] = String(value);
        const cap = window.Capacitor;
        const P = cap?.Plugins?.Preferences;
        if (P) {
            await P.set({ key, value: String(value) });
        } else {
            localStorage.setItem(key, String(value));
        }
    },
    async remove(key) {
        delete this._cache[key];
        const cap = window.Capacitor;
        const P = cap?.Plugins?.Preferences;
        if (P) {
            await P.remove({ key });
        } else {
            localStorage.removeItem(key);
        }
    },
    async migrate() {
        const cap = window.Capacitor;
        const P = cap?.Plugins?.Preferences;
        if (!P || !cap.isNativePlatform()) return;

        const migratedKey = "wird_storage_migrated";
        const { value: alreadyMigrated } = await P.get({ key: migratedKey });
        if (alreadyMigrated === "true") return;

        console.log("🚀 Starting storage migration...");
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === migratedKey) continue;
            const value = localStorage.getItem(key);
            await P.set({ key, value });
        }

        // Clear localStorage AFTER migration
        localStorage.clear();

        await P.set({ key: migratedKey, value: "true" });
        console.log("✅ Storage migration complete.");
    }
};
