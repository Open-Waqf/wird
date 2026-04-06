import { Prefs } from './prefs.js';

export const App = {
    adhkarData: [],
    uiStrings: {},
    currentLang: "en",
    showDetails: true,
    currentCategory: "morning",
    isKidsMode: false,
    isHapticEnabled: true,
    currentUtterance: null,
    currentAudioId: null, // Unified tracker for highlights and toggles
    deferredPrompt: null,
    favorites: [],
    focusState: {currentVal: 0, targetVal: 0, cardId: null},
    searchQuery: "",
    checkFestivals() {
        const bBody = document.body;
        bBody.classList.remove('fest-ramadan', 'fest-eid-fitr', 'fest-eid-adha', 'fest-hajj');
        if (Prefs.get("wird_show_decorations") === "false") return;

        // --- Math-based Hijri Calculation (Kuwaiti Algorithm) ---
        const date = new Date();
        let day = date.getDate();
        let month = date.getMonth();
        let year = date.getFullYear();

        if (year < 1700) return; // Guard

        let m = month + 1;
        let y = year;
        if (m < 3) {
            y -= 1;
            m += 12;
        }

        let a = Math.floor(y / 100);
        let b = 2 - a + Math.floor(a / 4);
        let jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;

        let z = jd + 1;
        let cyc = Math.floor((z - 1948440) / 10631);
        let rem = (z - 1948440) % 10631;
        let yyc = Math.floor((rem) / 354);
        let rrem = (rem) % 354;

        let hMonth = 1;
        let hDay = rrem;

        for (let i = 0; i < 12; i++) {
            let duration = (i % 2 === 0) ? 30 : 29;
            if (hDay <= duration) {
                hMonth = i + 1;
                break;
            }
            hDay -= duration;
        }
        if (hMonth === 9) bBody.classList.add('fest-ramadan');
        else if (hMonth === 10 && hDay <= 3) bBody.classList.add('fest-eid-fitr');
        else if (hMonth === 12) {
            if (hDay <= 9) bBody.classList.add('fest-hajj');
            else if (hDay <= 13) bBody.classList.add('fest-eid-adha');
        }
    },
};
