// ==========================================
// FAVORITES — Toggle, persist, and reflect heart state
// Stored as JSON array under "wird_favorites" in Prefs
// ==========================================
export function createFavorites(getDeps) {
    return {
        async persist() {
            const { App, Prefs } = getDeps();
            await Prefs.set("wird_favorites", JSON.stringify(App.favorites));
        },

        async toggle(id) {
            const { App, HapticsEngine, UI } = getDeps();
            if (App.favorites.includes(id)) {
                App.favorites = App.favorites.filter((favId) => favId !== id);
            } else {
                App.favorites.push(id);
                // nice feedback, respects toggle
                HapticsEngine.lightTap();
            }
            await this.persist();

            if (App.currentCategory === "favorites") {
                UI.render();
            } else {
                const btn = document.querySelector(`.btn-heart[data-id="${id}"]`);
                if (btn) {
                    const isFav = App.favorites.includes(id);
                    btn.innerHTML = UI.getHeartIcon(isFav);
                    btn.classList.toggle("active", isFav);
                    btn.style.color = isFav ? "#ef4444" : "";
                    btn.setAttribute("aria-pressed", isFav ? "true" : "false");
                }
            }
        },
    };
}
