import { App } from './app.js';

export const MAIN_CATEGORIES = ["morning", "evening", "waking", "sleep"];

export const el  = (id) => document.getElementById(id);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Injected after Storage is created in script.js
let _Storage = null;
export function connectStorage(s) { _Storage = s; }

export function normalizeText(str) {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove Latin diacritics
        .replace(/[\u0617-\u061A\u064B-\u0652]/g, "") // Remove Arabic harakat
        .toLowerCase();
}

export function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

export function highlightText(text, query) {
    if (!query || !text) return escapeHTML(text);
    const escapedText = escapeHTML(text);
    const escapedQuery = escapeHTML(query).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

export function formatShortDate(dStr) {
    try {
        const d = new Date(dStr);
        if (Number.isNaN(d.getTime())) return dStr;
        return d.toLocaleDateString(App.currentLang || "en", {year: "numeric", month: "short", day: "numeric"});
    } catch {
        return dStr;
    }
}

export function isItemDoneInCategory(state, category, itemId) {
    const key = _Storage.getStorageKeyForCategory(category, itemId);
    return state.completedIds.includes(key);
}

export function isItemDoneAnywhere(state, item) {
    const cats = Array.isArray(item.category) ? item.category : [item.category];
    for (const c of cats) {
        if (MAIN_CATEGORIES.includes(c) && isItemDoneInCategory(state, c, item.id)) return true;
    }
    // fallback: any key ending with _id (covers legacy/favorites mistakes)
    const suffix = `_${item.id}`;
    return state.completedIds.some((k) => k.endsWith(suffix));
}

export function isCategoryCompleteDynamic(state, category) {
    if (category === "favorites") {
        const favs = (App.favorites || [])
            .map((id) => App.adhkarData.find((x) => x.id === id))
            .filter(Boolean);
        if (favs.length === 0) return false;
        return favs.every((it) => isItemDoneAnywhere(state, it));
    }

    const target = App.adhkarData.filter((item) => {
        const cats = Array.isArray(item.category) ? item.category : [item.category];
        if (!cats.includes(category)) return false;
        if (App.isKidsMode && !item.is_kids) return false;
        return true;
    });

    if (target.length === 0) return false;
    return target.every((it) => isItemDoneInCategory(state, category, it.id));
}

export function syncNavEffects() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    const state = _Storage.getSavedState();

    // Dynamic completion (respects Kids Mode)
    const allDone = MAIN_CATEGORIES.every(cat => isCategoryCompleteDynamic(state, cat));

    if (allDone) {
        nav.classList.add('nav-reward-all-done');
    } else {
        nav.classList.remove('nav-reward-all-done');
    }
}
