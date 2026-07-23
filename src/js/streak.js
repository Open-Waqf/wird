// ==========================================
// STREAK — Daily streak counter, 7-day habit visualizer, capped 30-day history
// Keys: wird_streak, wird_last_active_date, wird_active_dates
// ==========================================
export function createStreak(getDeps) {
    return {
        getCurrentStreak() {
            const { Prefs } = getDeps();
            const stored = parseInt(Prefs.get("wird_streak") || "0", 10);

            // Decay: a streak is only "live" if the last active day was today or
            // yesterday (3 AM-adjusted). Once a day is missed the stored value is
            // stale, so display 0 until a new category completion re-arms it.
            // Only decay when we actually have a last-active date to compare.
            const lastDateStr = Prefs.get("wird_last_active_date");
            if (!lastDateStr || stored === 0) return stored;

            const now = new Date();
            now.setHours(now.getHours() - 3); // 3 AM rollover
            const todayStr = now.toDateString();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            if (lastDateStr === todayStr || lastDateStr === yesterday.toDateString()) return stored;
            return 0;
        },

        refreshUI() {
            const { App, Prefs, formatShortDate } = getDeps();

            const streakEl = document.getElementById("streakValue");
            if (streakEl) streakEl.innerText = String(this.getCurrentStreak());

            const sub = document.getElementById("streakSub");
            const lastDateStr = Prefs.get("wird_last_active_date");
            if (sub) {
                if (lastDateStr) {
                    const template = App.uiStrings?.[App.currentLang]?.streak_last_active || "Last active: {date}";
                    sub.innerText = template.replace("{date}", formatShortDate(lastDateStr));
                } else {
                    sub.innerText = "";
                }
            }

            // --- HABIT VISUALIZER (7-DAY) ---
            const visualizer = document.getElementById("habitVisualizer");
            if (visualizer) {
                visualizer.innerHTML = "";

                let activeDates = [];
                try {
                    activeDates = JSON.parse(Prefs.get("wird_active_dates") || "[]");
                } catch {
                    activeDates = [];
                }

                // Reference date using 3 AM rollover
                const now = new Date();
                now.setHours(now.getHours() - 3);

                const daysMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

                // Generate last 7 days
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(now);
                    d.setDate(d.getDate() - i);

                    const dStr = d.toDateString();
                    const isDone = activeDates.includes(dStr);
                    const dayKey = `day_${daysMap[d.getDay()]}`;
                    const dayLabel = App.uiStrings[App.currentLang]?.[dayKey] || daysMap[d.getDay()].charAt(0).toUpperCase();

                    const dayCircle = document.createElement("div");
                    dayCircle.className = "flex flex-col items-center gap-1 flex-1";

                    const statusClass = isDone ? "bg-emerald-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-transparent";
                    const todayRing = i === 0 ? "ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-800" : "";

                    dayCircle.innerHTML = `
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${statusClass} ${todayRing}">
                            ${isDone ? "✓" : ""}
                        </div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase">${dayLabel}</span>
                    `;
                    visualizer.appendChild(dayCircle);
                }
            }
        },

        // Award streak only when the user completes a main category (once per day)
        async awardForToday() {
            const { Prefs, WidgetSync } = getDeps();
            const streakKey = "wird_streak";
            const lastDateKey = "wird_last_active_date";
            const activeDatesKey = "wird_active_dates";

            const now = new Date();
            now.setHours(now.getHours() - 3); // 3 AM rollover
            const todayStr = now.toDateString();

            const lastDateStr = Prefs.get(lastDateKey);
            let currentStreak = parseInt(Prefs.get(streakKey) || "0", 10);

            // 1. Maintain Active Dates List (History)
            let activeDates = [];
            try {
                activeDates = JSON.parse(Prefs.get(activeDatesKey) || "[]");
            } catch {
                activeDates = [];
            }

            if (!activeDates.includes(todayStr)) {
                activeDates.push(todayStr);
                // Cap at 30 days to avoid storage bloat
                if (activeDates.length > 30) activeDates = activeDates.slice(-30);
                await Prefs.set(activeDatesKey, JSON.stringify(activeDates));
            }

            // 2. Increment Streak
            if (lastDateStr !== todayStr) {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);

                if (lastDateStr === yesterday.toDateString()) currentStreak++;
                else currentStreak = 1;

                await Prefs.set(streakKey, String(currentStreak));
                await Prefs.set(lastDateKey, todayStr);
            }

            this.refreshUI();
            await WidgetSync.requestUpdate();
        },
    };
}
