import { App } from './app.js';
import { el } from './utils.js';

export function wireGlobalListeners(getDeps) {
    const { Storage, UI, Reminders, Focus, Backup, projectUrl } = getDeps();

    // --- A11Y: Skip Link ---
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
        skipLink.onclick = (e) => {
            e.preventDefault();
            const target = el('adhkar-container');
            if (target) {
                target.focus();
                target.scrollIntoView();
            }
        };
    }

    // --- SEARCH NAVBAR LOGIC ---
    const searchToggleBtn = el("searchToggleBtn");
    const searchCloseBtn = el("searchCloseBtn");
    const searchInput = el("searchInput");
    const defaultNav = el("defaultNavContent");
    const searchNav = el("searchNavContent");
    let searchTimeout;

    const openSearch = () => {
        if (defaultNav && searchNav) {
            // Hardcode pointer events to avoid Tailwind compilation issues
            defaultNav.style.pointerEvents = "none";
            defaultNav.classList.add("opacity-0");
            // Take the (now hidden) default nav out of the tab order / a11y tree,
            // and put the search bar back in.
            defaultNav.inert = true;

            searchNav.style.pointerEvents = "auto";
            searchNav.classList.remove("opacity-0");
            searchNav.inert = false;
            setTimeout(() => searchInput?.focus(), 50);
        }
    };

    const closeSearch = () => {
        if (defaultNav && searchNav) {
            // Only pull focus back to the toggle when focus was actually inside the
            // search bar (Escape / close button) — not when closing is a side effect
            // of, e.g., tapping a category button.
            const focusWasInSearch = searchNav.contains(document.activeElement);

            defaultNav.style.pointerEvents = "auto";
            defaultNav.classList.remove("opacity-0");

            searchNav.style.pointerEvents = "none";
            searchNav.classList.add("opacity-0");
            // Hidden search bar leaves the tab order; default nav returns to it.
            searchNav.inert = true;
            defaultNav.inert = false;

            if (App.searchQuery) {
                App.searchQuery = "";
                if (searchInput) searchInput.value = "";
                UI.render(false);
            }

            if (focusWasInSearch) searchToggleBtn?.focus();
        }
    };

    if (searchToggleBtn) searchToggleBtn.addEventListener("click", openSearch);
    if (searchCloseBtn) searchCloseBtn.addEventListener("click", closeSearch);

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                App.searchQuery = e.target.value.trim();
                UI.render(false);
            }, 200);
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeSearch();
        });
    }

    // --- CATEGORY BUTTONS ---
    let pendingCategory = null;
    ["favorites", "morning", "evening", "waking", "sleep"].forEach((cat) => {
        const btn = el(`btn-${cat}`);
        if (btn) {
            btn.onclick = () => {
                const wrapper = el("card-wrapper");
                if (!wrapper) return;

                if (window.speechSynthesis) window.speechSynthesis.cancel();

                // Reset Search safely if it's open
                if (App.searchQuery) {
                    closeSearch();
                }

                pendingCategory = cat;

                // If already fading out, just update the target and let the existing listener handle it
                if (wrapper.classList.contains("fade-out-left")) return;

                // 1. Start Fade Out
                wrapper.classList.remove("fade-out-right");
                wrapper.classList.add("fade-out-left");

                let transitionFinished = false;
                const onTransitionEnd = (e) => {
                    if (transitionFinished) return;
                    // Filter out children events
                    if (e && e.target !== wrapper) return;

                    transitionFinished = true;
                    if (safetyTimeout) clearTimeout(safetyTimeout);
                    wrapper.removeEventListener("transitionend", onTransitionEnd);

                    // 2. Swap Data (Always use the LATEST clicked category)
                    App.currentCategory = pendingCategory;
                    UI.updateCategoryUI();
                    UI.render(true);

                    // 3. Start Fade In
                    wrapper.classList.remove("fade-out-left");
                    wrapper.classList.add("fade-out-right");
                    void wrapper.offsetWidth; // Force reflow
                    wrapper.classList.remove("fade-out-right");
                };

                // 4. Attach Listener + Safety Fallback
                wrapper.addEventListener("transitionend", onTransitionEnd);
                const safetyTimeout = setTimeout(onTransitionEnd, 400);
            };
        }
    });

    const kidsToggle = el("kidsToggle");
    if (kidsToggle) {
        // Apply initial state
        kidsToggle.checked = App.isKidsMode;
        document.body.classList.toggle('theme-kids', App.isKidsMode);
        kidsToggle.onchange = async (e) => {
            const { Prefs } = getDeps();
            App.isKidsMode = e.target.checked;
            await Prefs.set("isKidsMode", String(App.isKidsMode));
            // ADDED: Toggle the CSS class for visual changes
            document.body.classList.toggle('theme-kids', App.isKidsMode);
            UI.render();
        };
    }

    // ADDED: The Seasonal Decorations Toggle
    // --- TRANSLITERATION TOGGLE ---
    const transliterationToggle = el("transliterationToggle");
    if (transliterationToggle) {
        const { Prefs } = getDeps();
        transliterationToggle.checked = App.showDetails;
        transliterationToggle.onchange = async (e) => {
            const { Prefs: P } = getDeps();
            App.showDetails = e.target.checked;
            await P.set("showDetails", String(App.showDetails));
            UI.render(false);
        };
    }

    const decorationsToggle = el("decorationsToggle");
    if (decorationsToggle) {
        const { Prefs } = getDeps();
        const savedDeco = Prefs.get("wird_show_decorations") !== "false";
        decorationsToggle.checked = savedDeco;
        decorationsToggle.onchange = async (e) => {
            const { Prefs: P } = getDeps();
            await P.set("wird_show_decorations", String(e.target.checked));
            App.checkFestivals(); // Run immediately to show/hide lantern
        };
    }

    const langSelect = el("langSelect");
    if (langSelect) {
        langSelect.onchange = async (e) => {
            const { Prefs } = getDeps();
            App.currentLang = e.target.value;
            await Prefs.set("userLang", App.currentLang);
            UI.applyUITranslations();
            UI.updateCategoryUI();
            UI.render();
            if (Prefs.get("wird_reminders_enabled") === "true") {
                await Reminders.scheduleAll();
            }
        };
    }

    const resetFabBtn = el("resetFabBtn");
    if (resetFabBtn) {
        resetFabBtn.onclick = async (e) => {
            e.stopPropagation();
            await Storage.resetCurrentCategory();
        };
    }

    const fabContainer = el("fabContainer");
    const navTitleContainer = el("navTitleContainer");
    const scrollTopBtn = el("scrollTopBtn");

    if (scrollTopBtn) {
        window.onscroll = () => {
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            if (scrollY > 300) fabContainer?.classList.add("visible"); else fabContainer?.classList.remove("visible");

            if (navTitleContainer) {
                if (scrollY > 100) {
                    navTitleContainer.classList.remove("nav-state-app");
                    navTitleContainer.classList.add("nav-state-cat");
                } else {
                    navTitleContainer.classList.add("nav-state-app");
                    navTitleContainer.classList.remove("nav-state-cat");
                }
            }
        };

        scrollTopBtn.onclick = (e) => {
            e.stopPropagation();
            window.scrollTo({top: 0, behavior: "smooth"});
        };
    }

    const focusModal = el("focusModal");
    if (focusModal) focusModal.addEventListener("click", (e) => Focus.handleTap(e));

    const closeFocusBtn = el("closeFocusBtn");
    if (closeFocusBtn) {
        closeFocusBtn.onclick = (e) => {
            e.stopPropagation();
            Focus.close();
        };
    }

    const exportBtn = el("exportBtn");
    if (exportBtn) {
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            Backup.exportData();
        };
    }

    const importBtn = el("importBtn");
    const importInput = el("importInput");
    if (importBtn && importInput) {
        importBtn.onclick = (e) => {
            e.stopPropagation();
            importInput.click();
        };
        importInput.onchange = (e) => {
            Backup.importData(e);
            importInput.value = "";
        };
    }

    // Share App CTA
    const shareAppBtn = el("shareAppBtn");
    if (shareAppBtn) {
        shareAppBtn.onclick = async (e) => {
            e.stopPropagation();

            const title = App.uiStrings?.[App.currentLang]?.app_name || "Wird";
            const text = App.uiStrings?.[App.currentLang]?.share_app_text || "Check out Wird: a free, offline, and ad-free Islamic Adhkar app.";

            // FIX: Generate localized URL (e.g., ?lang=fr)
            const lang = App.currentLang || "en";
            const url = lang === "en" ? `${projectUrl()}/` : `${projectUrl()}/?lang=${encodeURIComponent(lang)}`;

            if (navigator.share) {
                try {
                    await navigator.share({title, text, url});
                } catch (err) {
                    // User cancelled or unsupported
                }
            } else {
                // Fallback to clipboard if Web Share API is missing
                await UI.copyToClipboard(`${text} ${url}`);
                UI.toast(App.uiStrings?.[App.currentLang]?.toast_copied || "Copied", "success");
            }
        };
    }

    const hapticToggle = el("hapticToggle");
    if (hapticToggle) {
        hapticToggle.checked = !!App.isHapticEnabled;
        hapticToggle.onchange = async () => {
            const { Prefs } = getDeps();
            App.isHapticEnabled = !!hapticToggle.checked;
            await Prefs.set("isHapticEnabled", App.isHapticEnabled ? "true" : "false");
        };
    }

    // ----------------------------
    // Install App button (PWA & iOS)
    // ----------------------------
    const installBtn = el("installAppBtn");
    if (installBtn) {
        installBtn.style.display = "none";

        // 1. Is it already installed (PWA)?
        const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || !!window.navigator.standalone;

        // 2. Is it running as a Native Capacitor app?
        const isNative = window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" ? window.Capacitor.isNativePlatform() : false;

        // 3. Robust iOS Detection (Fixes the iPadOS Desktop Mode bug)
        const ua = navigator.userAgent || "";
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = isIOS && /WebKit/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);

        // Hide permanently if already installed
        if (isStandalone || isNative) {
            installBtn.style.display = "none";
        } else {

            // Show button immediately for iOS Safari (because they don't fire the 'beforeinstallprompt' event)
            if (isSafari) {
                installBtn.style.display = "flex";
            }

            // Chrome/Android: Listen for the standard install prompt
            window.addEventListener("beforeinstallprompt", (e) => {
                e.preventDefault();
                App.deferredInstallPrompt = e;
                installBtn.style.display = "flex";
            });

            // Hide button globally once installed
            window.addEventListener("appinstalled", () => {
                App.deferredInstallPrompt = null;
                installBtn.style.display = "none";
            });

            installBtn.onclick = async (e) => {
                e.stopPropagation();

                // Android / Chrome Native Flow
                if (App.deferredInstallPrompt) {
                    App.deferredInstallPrompt.prompt();
                    try {
                        const outcome = await App.deferredInstallPrompt.userChoice;
                        if (outcome.outcome === 'accepted') {
                            installBtn.style.display = "none";
                        }
                    } catch (_) {
                    }
                    App.deferredInstallPrompt = null;
                    return;
                }

                // iOS Safari Custom Visual Flow
                if (isSafari) {
                    const step1 = App.uiStrings?.[App.currentLang]?.install_ios_step1 || "Tap the Share icon at the bottom";
                    const step2 = App.uiStrings?.[App.currentLang]?.install_ios_step2 || "Select 'Add to Home Screen'";

                    // Using raw style strings as a backup in case Tailwind compilation is missing these specific classes
                    const iosHtml = `
                        <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
                            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">
                                <svg style="width:24px; height:24px; color:#3b82f6; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                                </svg>
                                <span style="font-size:0.9rem; font-weight:600; text-align:start;">1. ${step1}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(148,163,184,0.1); border-radius:12px;">
                                <svg style="width:24px; height:24px; color:inherit; opacity:0.7; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                                </svg>
                                <span style="font-size:0.9rem; font-weight:600; text-align:start;">2. ${step2}</span>
                            </div>
                        </div>
                    `;

                    UI.info(iosHtml, {isHtml: true});
                    return;
                }

                // Fallback for browsers that don't support either but somehow clicked the button
                const msg = App.uiStrings?.[App.currentLang]?.install_help || "To install: open your browser menu and choose 'Add to Home Screen'.";
                UI.info(msg);
            };
        }
    }
}
