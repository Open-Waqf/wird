// ==========================================
// UI — Rendering, interactions, dialogs, audio, translations
// ==========================================
export function createUI(getDeps) {
    const el = (id) => document.getElementById(id);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    return {
        scrollToActiveCategory() {
            const container = el('category-nav-container');
            const activeBtn = container?.querySelector('.bg-emerald-100, .dark\\:bg-emerald-900');

            if (activeBtn && container) {
                const offset = activeBtn.offsetLeft - (container.clientWidth / 2) + (activeBtn.clientWidth / 2);
                container.scrollTo({
                    left: offset,
                    behavior: 'smooth'
                });
            }
        },

        vibrate(pattern) {
            const { App, HapticsEngine } = getDeps();
            if (!App.isHapticEnabled) return;

            if (Array.isArray(pattern)) {
                if (navigator.vibrate) navigator.vibrate(pattern);
                return;
            }

            if (typeof pattern === "number") {
                HapticsEngine.pulseMs(pattern);
            }
        },

        // Screen reader milestones (Polite so it doesn't spam)
        announceMilestone(currentVal, targetVal) {
            const { App } = getDeps();
            const announcer = el("a11y-announcer");
            if (!announcer) return;

            if (currentVal >= targetVal) {
                const doneTxt = App.uiStrings?.[App.currentLang]?.completed || "Completed";
                announcer.innerText = `${currentVal}. ${doneTxt}.`;
                return;
            }

            // Announce EVERY increment (like a physical tasbih) so screen-reader users
            // hear each count, not only every tenth.
            announcer.innerText = String(currentVal);
        },

        // Smart vibration rules
        smartHapticForCounter(currentVal, targetVal) {
            const { App, HapticsEngine } = getDeps();
            if (!App.isHapticEnabled) return;

            if (currentVal >= targetVal) {
                HapticsEngine.completionPulse();
                return;
            }

            if (currentVal % 10 === 0) {
                HapticsEngine.milestoneThump();
                return;
            }

            HapticsEngine.lightTap();
        },

        confetti() {
            // A11Y: skip the celebratory motion entirely when the user asked the OS
            // to reduce motion.
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const container = document.body;
            const colors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];
            const particleCount = 40;

            for (let i = 0; i < particleCount; i++) {
                const p = document.createElement('div');
                p.className = 'confetti-particle';
                p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                p.style.left = Math.random() * 100 + 'vw';
                p.style.top = '-10px';
                p.style.transform = `scale(${Math.random()})`;
                p.style.setProperty('--x', (Math.random() - 0.5) * 200 + 'px');
                p.style.setProperty('--r', Math.random() * 360 + 'deg');

                const duration = 2 + Math.random() * 2;
                p.style.animation = `confetti-fall ${duration}s ease-out forwards`;

                container.appendChild(p);
                setTimeout(() => p.remove(), duration * 1000);
            }
        },

        initFontSize() {
            const { Prefs } = getDeps();
            const slider = el("fontSizeSlider");
            const label = el("fontSizeLabel");
            const savedScale = Prefs.get("fontScale") || "1";

            document.documentElement.style.setProperty("--arabic-scale", savedScale);
            if (slider) {
                slider.value = savedScale;
                if (label) label.innerText = Math.round(parseFloat(savedScale) * 100) + "%";
                slider.oninput = async (e) => {
                    const val = e.target.value;
                    document.documentElement.style.setProperty("--arabic-scale", val);
                    if (label) label.innerText = Math.round(parseFloat(val) * 100) + "%";
                    await Prefs.set("fontScale", val);
                };
            }
        },

        initVoiceSpeed() {
            const { Prefs } = getDeps();
            const slider = el("voiceSpeedSlider");
            const label = el("voiceSpeedLabel");
            const savedSpeed = Prefs.get("wird_tts_speed") || "0.85";

            if (slider) {
                slider.value = savedSpeed;
                if (label) label.innerText = savedSpeed + "x";
                slider.oninput = async (e) => {
                    const val = e.target.value;
                    if (label) label.innerText = val + "x";
                    await Prefs.set("wird_tts_speed", val);
                };
            }
        },

        async checkCategoryCompletion(category) {
            const { Storage } = getDeps();
            const state = Storage.getSavedState();
            const {filtered} = this.getFilteredData();

            if (filtered.length === 0) return;

            const completedCount = filtered.filter(item => {
                const key = Storage.getStorageKeyForCategory(category, item.id);
                return state.completedIds.includes(key);
            }).length;

            // Only fire on the TRANSITION to complete. Re-firing on every render of an
            // already-complete category needlessly re-runs Reminders.scheduleAll() and
            // the nav-reward animation (e.g. on each search keystroke / toggle).
            // Only fire on the TRANSITION to complete. Re-firing on every render of an
            // already-complete category needlessly re-runs Reminders.scheduleAll() and
            // the nav-reward animation (e.g. on each search keystroke / toggle).
            if (completedCount >= filtered.length && !state.categoriesDone[category]) {
                await Storage.saveCategoryComplete(category);
            }
        },

        updateStickyTitle() {
            const { App } = getDeps();
            const stickyTitle = el("stickyCategoryTitle");
            if (!stickyTitle) return;

            const label = App.uiStrings?.[App.currentLang]?.[App.currentCategory] || App.currentCategory;

            stickyTitle.innerText = label;
        },

        updateCategoryUI() {
            const { App, Storage, MAIN_CATEGORIES, isCategoryCompleteDynamic } = getDeps();
            const categories = ["favorites", ...MAIN_CATEGORIES];
            const state = Storage.getSavedState();

            const activeClass = ["bg-emerald-100", "text-emerald-700", "shadow-sm", "dark:bg-emerald-900", "dark:text-emerald-300", "border-emerald-200", "dark:border-emerald-700", "border"];
            const inactiveClass = ["bg-slate-200", "text-slate-500", "hover:bg-slate-300", "dark:bg-slate-700", "dark:text-slate-400", "dark:hover:bg-slate-600"];
            const completedClass = ["ring-2", "ring-emerald-500", "ring-offset-1", "dark:ring-offset-slate-900"];

            categories.forEach((cat) => {
                const btn = el(`btn-${cat}`);
                if (!btn) return;

                btn.className = "flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 border border-transparent whitespace-nowrap snap-start";

                let label = App.uiStrings[App.currentLang]?.[cat] || cat;
                if (cat === "favorites" && !App.uiStrings[App.currentLang]?.[cat]) label = "Favorites";
                if (cat === "morning" && !App.uiStrings[App.currentLang]?.[cat]) label = "Morning";

                const isComplete = isCategoryCompleteDynamic(state, cat);

                if (isComplete && cat !== "favorites") {
                    btn.innerHTML = `<span class="inline-block text-emerald-500">✓</span> ${label}`;
                    btn.classList.add(...completedClass);
                } else {
                    if (cat === "favorites") btn.innerHTML = `❤️ ${label}`;
                    else btn.innerHTML = label;
                }

                if (App.currentCategory === cat) btn.classList.add(...activeClass);
                else btn.classList.add(...inactiveClass);
            });
        },

        ensureToastContainer() {
            let c = document.getElementById("toast-container");
            if (!c) {
                c = document.createElement("div");
                c.id = "toast-container";
                c.setAttribute("aria-live", "polite");
                c.setAttribute("aria-atomic", "true");
                document.body.appendChild(c);
            }
            return c;
        },

        toast(message, type = "info", duration = 2200) {
            const { App } = getDeps();
            if (!message) return;
            const c = this.ensureToastContainer();

            const t = document.createElement("div");
            t.className = `toast ${type}`;
            t.dir = (App.currentLang === "ar") ? "rtl" : "ltr";
            t.textContent = message;

            c.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));

            window.setTimeout(() => {
                t.classList.remove("show");
                window.setTimeout(() => t.remove(), 200);
            }, duration);
        },

        toastAction(message, actionText, onAction, type = "info", duration = 8000) {
            const { App } = getDeps();
            if (!message) return;
            const c = this.ensureToastContainer();

            const t = document.createElement("div");
            t.className = `toast ${type}`;
            t.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

            const row = document.createElement("div");
            row.className = "toast-row";

            const msg = document.createElement("div");
            msg.textContent = message;

            const btn = document.createElement("button");
            btn.className = "toast-action";
            btn.type = "button";
            btn.textContent = actionText || (App.uiStrings?.[App.currentLang]?.btn_ok || "OK");
            btn.onclick = () => {
                try {
                    onAction && onAction();
                } catch {
                }
                t.classList.remove("show");
                setTimeout(() => t.remove(), 200);
            };

            row.appendChild(msg);
            row.appendChild(btn);
            t.appendChild(row);

            c.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));

            window.setTimeout(() => {
                if (!t.isConnected) return;
                t.classList.remove("show");
                window.setTimeout(() => t.remove(), 200);
            }, duration);
        },

        // Promise-based confirm dialog
        confirm(message, opts = {}) {
            const { App } = getDeps();
            return new Promise((resolve) => {
                const okText = opts.okText || App.uiStrings?.[App.currentLang]?.btn_ok || "OK";
                const cancelText = opts.cancelText || App.uiStrings?.[App.currentLang]?.btn_cancel || "Cancel";

                const overlay = document.createElement("div");
                overlay.className = "dialog-overlay";
                overlay.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

                const dialog = document.createElement("div");
                dialog.className = "dialog";
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "true");

                const body = document.createElement("div");
                body.className = "dialog-body";
                body.textContent = message || "";

                const actions = document.createElement("div");
                actions.className = "dialog-actions";

                const btnCancel = document.createElement("button");
                btnCancel.className = "dialog-btn cancel";
                btnCancel.type = "button";
                btnCancel.textContent = cancelText;

                const btnOk = document.createElement("button");
                btnOk.className = "dialog-btn ok";
                btnOk.type = "button";
                btnOk.textContent = okText;

                const cleanup = (val) => {
                    overlay.remove();
                    document.removeEventListener("keydown", onKeyDown, true);
                    resolve(val);
                };

                const onKeyDown = (e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        cleanup(false);
                    }
                    if (e.key === "Tab") {
                        const active = document.activeElement;
                        if (e.shiftKey && active === btnCancel) {
                            e.preventDefault();
                            btnOk.focus();
                        } else if (!e.shiftKey && active === btnOk) {
                            e.preventDefault();
                            btnCancel.focus();
                        }
                    }
                    if (e.key === "Enter" && (document.activeElement === btnOk || document.activeElement === btnCancel)) {
                        e.preventDefault();
                        cleanup(document.activeElement === btnOk);
                    }
                };

                btnCancel.onclick = () => cleanup(false);
                btnOk.onclick = () => cleanup(true);

                overlay.onclick = (e) => {
                    if (e.target === overlay) cleanup(false);
                };

                actions.appendChild(btnCancel);
                actions.appendChild(btnOk);
                dialog.appendChild(body);
                dialog.appendChild(actions);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                document.addEventListener("keydown", onKeyDown, true);

                setTimeout(() => btnOk.focus(), 0);
            });
        },

        // Info dialog (no cancel)
        info(message, opts = {}) {
            const { App } = getDeps();
            return new Promise((resolve) => {
                const okText = opts.okText || App.uiStrings?.[App.currentLang]?.btn_ok || "OK";

                const overlay = document.createElement("div");
                overlay.className = "dialog-overlay";
                overlay.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

                const dialog = document.createElement("div");
                dialog.className = "dialog";
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "true");

                const body = document.createElement("div");
                body.className = "dialog-body";
                if (opts.isHtml) {
                    body.innerHTML = message || "";
                } else {
                    body.textContent = message || "";
                }

                const actions = document.createElement("div");
                actions.className = "dialog-actions";

                const btnOk = document.createElement("button");
                btnOk.className = "dialog-btn ok";
                btnOk.type = "button";
                btnOk.textContent = okText;

                const cleanup = () => {
                    overlay.remove();
                    document.removeEventListener("keydown", onKeyDown, true);
                    resolve();
                };

                const onKeyDown = (e) => {
                    if (e.key === "Escape" || e.key === "Enter") {
                        e.preventDefault();
                        cleanup();
                    }
                };

                btnOk.onclick = cleanup;
                overlay.onclick = (e) => {
                    if (e.target === overlay) cleanup();
                };

                actions.appendChild(btnOk);
                dialog.appendChild(body);
                dialog.appendChild(actions);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                document.addEventListener("keydown", onKeyDown, true);
                setTimeout(() => btnOk.focus(), 0);
            });
        },

        async copyToClipboard(text) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            } catch {
                // fall back below
            }

            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand("copy");
                document.body.removeChild(ta);
                return !!ok;
            } catch {
                return false;
            }
        },

        applyUITranslations() {
            const { App } = getDeps();
            if (!App.uiStrings[App.currentLang]) return;

            const isAr = App.currentLang === "ar";
            document.documentElement.dir = isAr ? "rtl" : "ltr";
            document.documentElement.lang = App.currentLang;

            qsa("[data-i18n]").forEach((node) => {
                const key = node.getAttribute("data-i18n");
                if (key && App.uiStrings[App.currentLang][key]) node.innerText = App.uiStrings[App.currentLang][key];
            });

            qsa("[data-i18n-aria]").forEach((node) => {
                const key = node.getAttribute("data-i18n-aria");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("aria-label", val);
            });

            qsa("[data-i18n-title]").forEach((node) => {
                const key = node.getAttribute("data-i18n-title");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("title", val);
            });

            qsa("[data-i18n-placeholder]").forEach((node) => {
                const key = node.getAttribute("data-i18n-placeholder");
                const val = key && App.uiStrings[App.currentLang]?.[key];
                if (val) node.setAttribute("placeholder", val);
            });

            // Hide transliteration setting for Arabic (cards don't show transliteration in Arabic)
            const transliterationRow = document.getElementById("transliterationToggle")?.closest(".flex.justify-between");
            if (transliterationRow) transliterationRow.style.display = isAr ? "none" : "";

            this.updateMetaTags();
        },

        updateMetaTags() {
            const { App, projectUrl } = getDeps();
            const strings = App.uiStrings[App.currentLang];
            if (!strings) return;

            const baseTitle = strings.seo_title || document.title || "Wird";
            const catLabel = strings[App.currentCategory] || App.currentCategory;
            document.title = `${baseTitle} - ${catLabel}`;

            const desc = strings.seo_description || "Islamic Adhkar App";
            const descTag = document.querySelector('meta[name="description"]');
            const ogDesc = document.querySelector('meta[property="og:description"]');
            const twDesc = document.querySelector('meta[name="twitter:description"]');
            if (descTag) descTag.setAttribute("content", desc);
            if (ogDesc) ogDesc.setAttribute("content", desc);
            if (twDesc) twDesc.setAttribute("content", desc);

            const ogTitle = document.querySelector('meta[property="og:title"]');
            const twTitle = document.querySelector('meta[name="twitter:title"]');
            if (ogTitle) ogTitle.setAttribute("content", baseTitle);
            if (twTitle) twTitle.setAttribute("content", baseTitle);

            const keyTag = document.querySelector('meta[name="keywords"]');
            if (keyTag && strings.seo_keywords) keyTag.setAttribute("content", strings.seo_keywords);

            const lang = App.currentLang || "en";
            const url = lang === "en" ? `${projectUrl()}/` : `${projectUrl()}/?lang=${encodeURIComponent(lang)}`;

            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) canonical.setAttribute("href", url);

            const ogUrl = document.querySelector('meta[property="og:url"]');
            if (ogUrl) ogUrl.setAttribute("content", url);

            const imgAlt = strings.seo_image_alt || "Wird app preview";
            const twAlt = document.querySelector('meta[name="twitter:image:alt"]');
            if (twAlt) twAlt.setAttribute("content", imgAlt);
            const ogImgAlt = document.querySelector('meta[property="og:image:alt"]');
            if (ogImgAlt) ogImgAlt.setAttribute("content", imgAlt);
        },

        stopAllAudio() {
            const { App, AudioController } = getDeps();
            AudioController.stop();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            App.currentAudioId = null;
            App.currentUtterance = null;
            AudioController.syncUI();
        },

        toggleSpeech(text, id = null, options = {}) {
            const { App, Prefs, AudioController } = getDeps();
            const synth = window.speechSynthesis;
            const forceStart = !!options.forceStart;
            const ttsUnavailableMsg = App.uiStrings[App.currentLang]?.tts_unavailable || "Text-to-speech unavailable on this device.";
            if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
                this.toast(ttsUnavailableMsg, "error");
                return;
            }

            if (synth.speaking && App.currentAudioId === id) {
                if (forceStart) return;
                this.stopAllAudio();
                return;
            }

            this.stopAllAudio();

            const utterance = new SpeechSynthesisUtterance(text);
            const voices = typeof synth.getVoices === "function" ? synth.getVoices() : [];
            const arVoice = voices.find(v => /^ar([-_]|$)/i.test(v.lang || "")) ||
                voices.find(v => (v.lang || "").toLowerCase().includes("ar"));
            if (arVoice) utterance.voice = arVoice;
            utterance.lang = arVoice?.lang || "ar";
            const savedSpeed = parseFloat(Prefs.get("wird_tts_speed") || "0.85");
            utterance.rate = savedSpeed;

            utterance.onstart = () => {
                App.currentAudioId = id;
                App.currentUtterance = text;
                AudioController.syncUI();
            };
            utterance.onend = () => {
                if (App.currentAudioId === id) {
                    App.currentAudioId = null;
                    App.currentUtterance = null;
                }
                AudioController.syncUI();
            };
            utterance.onerror = () => {
                this.stopAllAudio();
                this.toast(ttsUnavailableMsg, "error");
            };

            try {
                synth.speak(utterance);
            } catch (e) {
                console.warn("TTS speak() failed", e);
                this.stopAllAudio();
                this.toast(ttsUnavailableMsg, "error");
            }
        },

        buildShareUrl(item) {
            const { projectUrl } = getDeps();
            return `${projectUrl()}/?adhkar=${encodeURIComponent(item.id)}`;
        },

        buildVerifyUrl(item) {
            const { projectUrl } = getDeps();
            return `${projectUrl()}/?verify=${encodeURIComponent(item.id)}`;
        },

        buildShareText(item) {
            const { App } = getDeps();
            const parts = [];

            if (item.arabic) parts.push(item.arabic);
            if (item.transliteration) parts.push(item.transliteration);

            const t = item.translation?.[App.currentLang] || item.translation?.en || "";
            if (t) parts.push(t);

            parts.push(this.buildShareUrl(item));

            return parts.join("\n\n");
        },

        toggleShareMenu(button, data) {
            const { App, projectUrl } = getDeps();
            // The menu is appended as a SIBLING of the button (not inside it):
            // interactive <a>/<button> menu items nested in a <button> is invalid HTML
            // and makes activation unreliable. The menu stays position:absolute with
            // the card as offset parent, so its placement is unchanged.
            const host = button.parentNode || button;
            const existing = host.querySelector(".share-menu");
            if (existing) {
                existing.remove();
                button.setAttribute("aria-expanded", "false");
                return;
            }

            qsa(".share-menu").forEach((m) => m.remove());
            qsa(".btn-share[aria-expanded='true']").forEach((b) => b.setAttribute("aria-expanded", "false"));

            const url = data.url || projectUrl();
            const text = data.text || "";

            const t = (key, fallback) =>
                App.uiStrings?.[App.currentLang]?.[key] ??
                App.uiStrings?.en?.[key] ??
                fallback;

            const menu = document.createElement("div");
            menu.className = "share-menu";
            menu.setAttribute("role", "menu");
            menu.setAttribute("aria-label", t("aria_share_menu", "Share options"));
            menu.dir = (App.currentLang === "ar") ? "rtl" : "ltr";

            const mkLink = (href, label) => {
                const a = document.createElement("a");
                a.href = href;
                a.target = "_blank";
                a.rel = "noopener";
                a.className = "share-item";
                a.setAttribute("role", "menuitem");
                a.textContent = label;
                a.onclick = () => close();
                return a;
            };

            const mkBtn = (label, onClick) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "share-item";
                b.setAttribute("role", "menuitem");
                b.textContent = label;
                b.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await onClick();
                    close();
                };
                return b;
            };

            const close = () => {
                menu.remove();
                button.setAttribute("aria-expanded", "false");
                try {
                    button.focus?.();
                } catch {
                }
                document.removeEventListener("click", onDocClick, true);
                document.removeEventListener("keydown", onKeyDown, true);
            };

            const onDocClick = (e) => {
                if (!menu.contains(e.target) && !button.contains(e.target)) close();
            };

            const onKeyDown = (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                    return;
                }

                const items = qsa(".share-item", menu);
                const idx = items.indexOf(document.activeElement);

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = items[(idx + 1) % items.length] || items[0];
                    next?.focus?.();
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prev = items[(idx - 1 + items.length) % items.length] || items[items.length - 1];
                    prev?.focus?.();
                } else if (e.key === "Home") {
                    e.preventDefault();
                    items[0]?.focus?.();
                } else if (e.key === "End") {
                    e.preventDefault();
                    items[items.length - 1]?.focus?.();
                }
            };

            menu.appendChild(
                mkLink(
                    `https://wa.me/?text=${encodeURIComponent(text)}`,
                    t("share_whatsapp", "WhatsApp")
                )
            );

            menu.appendChild(
                mkLink(
                    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
                    t("share_telegram", "Telegram")
                )
            );

            menu.appendChild(
                mkBtn(t("share_copy_link", "Copy link"), async () => {
                    try {
                        await navigator.clipboard.writeText(url);
                        this.toast(t("toast_link_copied", "Link copied"), "success");
                        this.vibrate(20);
                    } catch {
                        this.toast(t("copy_error", "Copy failed."), "error");
                    }
                })
            );

            host.appendChild(menu);
            button.setAttribute("aria-expanded", "true");

            setTimeout(() => {
                document.addEventListener("click", onDocClick, true);
                document.addEventListener("keydown", onKeyDown, true);

                const first = menu.querySelector(".share-item");
                if (first) first.focus?.();
            }, 0);
        },

        getHeartIcon(isFav) {
            if (isFav) {
                return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
            }
            return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
        },

        getFilteredData() {
            const { App, normalizeText } = getDeps();
            const isAr = App.currentLang === "ar";

            let baseFiltered = [];

            if (App.currentCategory === "favorites") {
                baseFiltered = App.adhkarData.filter((item) => App.favorites.includes(item.id));
            } else {
                baseFiltered = App.adhkarData.filter((item) => {
                    const cats = Array.isArray(item.category) ? item.category : [item.category];
                    if (!cats.includes(App.currentCategory)) return false;
                    return !(App.isKidsMode && !item.is_kids);
                });
            }

            let displayed = baseFiltered;
            if (App.searchQuery) {
                const q = normalizeText(App.searchQuery);
                displayed = baseFiltered.filter(item => {
                    const ar = normalizeText(item.arabic);
                    const trans = normalizeText(item.transliteration);
                    const t = normalizeText(item.translation?.[App.currentLang] || item.translation?.en);
                    const ref = normalizeText(item.reference);
                    return ar.includes(q) || trans.includes(q) || t.includes(q) || ref.includes(q);
                });
            }

            return {filtered: baseFiltered, displayed, isAr};
        },

        renderEmptyState(cardWrapper, type) {
            const { App, escapeHTML } = getDeps();
            if (type === "search") {
                const msgTemplate = App.uiStrings[App.currentLang]?.search_no_results || 'No results found for "{query}"';
                const msg = msgTemplate.replace("{query}", escapeHTML(App.searchQuery));
                const clearBtn = App.uiStrings[App.currentLang]?.clear_search || "Clear search";

                cardWrapper.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-400 px-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <p class="text-center text-sm mb-6">${msg}</p>
                      <button id="emptyClearSearchBtn" class="px-5 py-2 rounded-xl font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 active:scale-95 transition-all">${clearBtn}</button>
                    </div>`;

                setTimeout(() => {
                    const btn = el("emptyClearSearchBtn");
                    if (btn) btn.onclick = () => {
                        const input = el("searchInput");
                        if (input) {
                            input.value = "";
                            input.dispatchEvent(new Event('input'));
                        }
                    };
                }, 0);
            } else if (type === "favorites") {
                const msg = App.uiStrings[App.currentLang]?.no_favorites || "No favorites yet.";
                const cta = App.uiStrings[App.currentLang]?.cta_browse_adhkar || "Browse Adhkar";
                cardWrapper.innerHTML = `
                  <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-50"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <p class="text-center text-sm mb-4">${msg}</p>
                    <button class="browse-adhkar-btn px-5 py-2 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all">${cta}</button>
                  </div>`;
                const btn = cardWrapper.querySelector(".browse-adhkar-btn");
                if (btn) {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        App.currentCategory = "morning";
                        this.updateCategoryUI();
                        this.render(true);
                        setTimeout(() => this.scrollToActiveCategory(), 250);
                    };
                }
            } else {
                const msg = App.uiStrings[App.currentLang]?.no_adkhar_found || "No Adhkar found";
                cardWrapper.innerHTML = `<div class="text-center text-slate-400 py-10">${msg}</div>`;
            }
        },

        buildCard(item, savedState, isAr, countersCtx) {
            const { App, Prefs, Storage, Favorites, Focus, AudioController, highlightText, isNativeCapacitor, openExternal, syncNavEffects } = getDeps();
            const card = document.createElement("div");
            const progressCategory = Storage.getProgressCategoryForItem(item);
            const storageKey = Storage.getStorageKeyForCategory(progressCategory, item.id);

            const isDone = savedState.completedIds.includes(storageKey);
            const isFav = App.favorites.includes(item.id);

            card.className = `adhkar-card rounded-3xl p-6 shadow-sm mb-6 bg-white dark:bg-slate-800 border dark:border-slate-700 relative ${isDone ? "card-done" : ""}`;

            const benefitText = (item.benefit && item.benefit[App.currentLang]) ? item.benefit[App.currentLang] : "";
            const hasBenefit = benefitText && benefitText.trim().length > 0;

            const preTextHtml = item.pre_text ? `<p class="text-right text-emerald-600/70 font-serif text-lg mb-2" dir="rtl" lang="ar">${item.pre_text}</p>` : "";

            const focusBtnHtml = item.repeat > 10 ? `
                <button class="btn-focus text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Focus mode"
                  data-i18n-title="title_focus_mode"
                  aria-label="Focus mode"
                  data-i18n-aria="aria_focus_mode" data-id="${item.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            ` : "";

            const heartBtnHtml = `
                <button class="btn-heart text-xs flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors ${isFav ? "active" : ""}" title="Toggle favorite"
                  aria-pressed="${isFav ? "true" : "false"}"
                  data-i18n-title="title_toggle_favorite"
                  aria-label="Toggle favorite"
                  data-i18n-aria="aria_toggle_favorite" data-id="${item.id}">
                  ${this.getHeartIcon(isFav)}
                </button>
            `;

            const benefitBtnHtml = hasBenefit ? `
                <button class="btn-benefit text-xs flex items-center gap-1 text-amber-400 hover:text-amber-500 transition-colors" title="View reward"
                  data-i18n-title="title_view_reward"
                  aria-label="View reward"
                  data-i18n-aria="aria_view_reward">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
                </button>
            ` : "";

            const benefitContentHtml = hasBenefit ? `
                <div class="benefit-box hidden" dir="${isAr ? "rtl" : "ltr"}">
                    <div class="flex items-start gap-2">
                        <span class="text-xl">✨</span>
                        <p class="font-serif italic">${benefitText}</p>
                    </div>
                </div>
            ` : "";

            const actionButtons = `
                <div class="flex gap-4 mt-4 card-actions" dir="ltr">
                  ${heartBtnHtml}
                  ${benefitBtnHtml}
                  ${focusBtnHtml}
                  <button class="btn-speak text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Read aloud"
                    data-i18n-aria="aria_speak"
                    title="Read aloud"
                    data-i18n-title="title_speak"
                    data-id="${item.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                  <button class="btn-share text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Share"
                    data-i18n-aria="aria_share"
                    title="Share"
                    data-i18n-title="title_share"
                    aria-haspopup="menu"
                    aria-expanded="false">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                  <button class="btn-copy text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Copy"
                    data-i18n-aria="aria_copy"
                    title="Copy"
                    data-i18n-title="title_copy">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"/></svg>
                    <span class="copy-text hidden sm:inline">${App.uiStrings[App.currentLang].copy || "Copy"}</span>
                  </button>
                </div>
            `;

            const displayTransliteration = highlightText(item.transliteration, App.searchQuery);
            const displayTranslation = highlightText(item.translation?.[App.currentLang] || item.translation?.en || "", App.searchQuery);

            const detailsHtml = !isAr ? `
                <div class="details-content ${App.showDetails ? "open" : ""}">
                  <p class="text-emerald-600 dark:text-emerald-400 text-sm italic mb-3">${displayTransliteration}</p>
                  <p class="text-slate-600 dark:text-slate-300 text-sm mb-5" dir="${isAr ? "rtl" : "ltr"}">${displayTranslation}</p>
                </div>
            ` : "";

            const toggleBtnHtml = !isAr ? `
                <button class="toggle-btn text-xs text-slate-400 underline p-2 -m-2 z-10 hover:text-emerald-600">
                  ${App.showDetails ? App.uiStrings[App.currentLang].hide_details : App.uiStrings[App.currentLang].show_details}
                </button>
            ` : "";

            let initialVal = savedState.cardCounts[storageKey] || 0;
            if (isDone) initialVal = item.repeat;

            const verifyHref = this.buildVerifyUrl(item);

            card.innerHTML = `
                ${preTextHtml}
                <p class="arabic-text" dir="rtl" lang="ar">${item.arabic}</p>
                <div class="mb-2 flex items-center gap-1 ${isAr ? "justify-end" : "justify-start"}">
                  <span class="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-medium select-none">${item.reference}</span>
                  <a href="${verifyHref}" target="_blank" rel="noopener"
                     class="verify-link inline-flex items-center text-emerald-500 hover:text-emerald-600 dark:text-emerald-600 dark:hover:text-emerald-400 z-10 p-2 rounded transition-colors"
                     aria-label="Verify source"
                     data-i18n-aria="aria_verify"
                     title="Verify source"
                     data-i18n-title="title_verify">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                </div>
                ${detailsHtml}
                ${benefitContentHtml} ${actionButtons}
                <div class="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-700" dir="ltr">
                  ${toggleBtnHtml}
                  ${isAr ? "<div></div>" : ""}
                  <div class="flex items-center gap-4 card-actions z-10">
                    <button class="reset-btn text-slate-300 hover:text-red-500 transition-colors p-2 -m-2" aria-label="Reset this item"
                        data-i18n-aria="aria_reset_card"
                        title="Reset this item"
                        data-i18n-title="title_reset_card">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                    <div class="counter-display bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-400 px-5 py-2 rounded-xl font-black text-2xl min-w-[80px] text-center transition-colors">
                      <span class="counter">${initialVal}</span>
                      <span class="text-sm font-normal text-emerald-600 dark:text-emerald-500">/${item.repeat}</span>
                    </div>
                  </div>
                  <div class="card-progress-container">
                    <div class="card-progress-bar" style="width: ${(initialVal / item.repeat) * 100}%"></div>
                  </div>
                </div>
            `;

            const verifyLinkEl = card.querySelector(".verify-link");
            if (verifyLinkEl && item.verify_url && isNativeCapacitor()) {
                verifyLinkEl.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openExternal(item.verify_url);
                });
            }

            // Main card tap increment
            card.onclick = async (e) => {
                if (e.target.closest("button") || e.target.closest("a")) return;
                // Only suppress the tap if the user is actively selecting text INSIDE
                // this card — a stray selection elsewhere on the page must not block
                // counting. (Previously any page-wide selection killed the tap.)
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed && sel.toString().length > 0 && sel.anchorNode && card.contains(sel.anchorNode)) return;

                const span = card.querySelector(".counter");
                let val = parseInt(span.innerText, 10);

                if (val < item.repeat) {
                    card.classList.add("card-pressed");
                    setTimeout(() => card.classList.remove("card-pressed"), 100);

                    val++;
                    span.innerText = String(val);

                    const bar = card.querySelector('.card-progress-bar');
                    if (bar) bar.style.width = `${(val / item.repeat) * 100}%`;

                    this.smartHapticForCounter(val, item.repeat);
                    this.announceMilestone(val, item.repeat);
                    await Storage.saveCardCountForCategory(progressCategory, item.id, val);

                    if (val === item.repeat) {
                        card.classList.add("card-done");
                        const bar = card.querySelector('.card-progress-bar');
                        if (bar) bar.classList.add('bar-completion-pulse');
                        await Storage.saveCardCompleteForCategory(progressCategory, item.id);
                        await this.checkCategoryCompletion(App.currentCategory);
                    }
                }
            };

            const resetBtn = card.querySelector(".reset-btn");
            resetBtn.onclick = async (e) => {
                e.stopPropagation();
                await Storage.resetCardProgress(item.id);
                card.querySelector(".counter").innerText = "0";
                card.classList.remove("card-done");
                const bar = card.querySelector('.card-progress-bar');
                if (bar) {
                    bar.style.width = "0%";
                    bar.classList.remove('bar-completion-pulse');
                }
                await this.checkCategoryCompletion(App.currentCategory);
                syncNavEffects();
            };

            const speakBtn = card.querySelector(".btn-speak");
            if (speakBtn) {
                speakBtn.onclick = (e) => {
                    e.stopPropagation();
                    AudioController.play(item);
                };
            }

            const copyBtn = card.querySelector(".btn-copy");
            if (copyBtn) {
                copyBtn.onclick = async (e) => {
                    e.stopPropagation();

                    let textToCopy = item.arabic;
                    if (App.currentLang !== "ar") {
                        textToCopy += `
                        ${item.transliteration}`;
                        const t = item.translation?.[App.currentLang] || item.translation?.en || "";
                        if (t) textToCopy += `
                        ${t}`;
                    }

                    const ok = await this.copyToClipboard(textToCopy);
                    if (ok) {
                        this.vibrate(20);
                        this.toast(App.uiStrings[App.currentLang]?.toast_copied || "Copied", "success");
                    } else {
                        this.toast(App.uiStrings[App.currentLang]?.copy_error || "Copy failed.", "error");
                    }
                };
            }

            const shareBtn = card.querySelector(".btn-share");
            if (shareBtn) {
                shareBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const shareText = this.buildShareText(item);
                    const shareUrl = this.buildShareUrl(item);

                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: App.uiStrings?.[App.currentLang]?.seo_title || "Wird",
                                text: shareText,
                                url: shareUrl,
                            });
                            return;
                        } catch {
                            // Fall back to menu (user cancelled or not supported fully)
                        }
                    }

                    this.toggleShareMenu(shareBtn, {text: shareText, url: shareUrl});
                };
            }

            const heartBtn = card.querySelector(".btn-heart");
            if (heartBtn) {
                heartBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await Favorites.toggle(item.id);
                };
            }

            const benefitBtn = card.querySelector(".btn-benefit");
            if (benefitBtn) {
                benefitBtn.onclick = (e) => {
                    e.stopPropagation();
                    const box = card.querySelector(".benefit-box");
                    if (box) {
                        box.classList.toggle("hidden");
                        benefitBtn.classList.toggle("text-amber-600");
                    }
                };
            }

            if (!isAr) {
                const toggleBtn = card.querySelector(".toggle-btn");
                if (toggleBtn) {
                    toggleBtn.onclick = (e) => {
                        e.stopPropagation();
                        const details = card.querySelector(".details-content");
                        details?.classList.toggle("open");
                        e.target.innerText = e.target.innerText === App.uiStrings[App.currentLang].show_details
                            ? App.uiStrings[App.currentLang].hide_details
                            : App.uiStrings[App.currentLang].show_details;
                    };
                }
            }

            const focusBtn = card.querySelector(".btn-focus");
            if (focusBtn) {
                focusBtn.onclick = (e) => {
                    e.stopPropagation();
                    const currentVal = parseInt(card.querySelector(".counter").innerText, 10);
                    if (currentVal < item.repeat) Focus.open(item, currentVal);
                };
            }


            return card;
        },

        showSkeletons() {
            const wrapper = el("card-wrapper");
            if (!wrapper) return;
            wrapper.innerHTML = `
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            `;
        },

        render(animate = true) {
            const { App, Storage } = getDeps();
            const container = el("adhkar-container");
            let cardWrapper = el("card-wrapper");
            if (!cardWrapper) {
                cardWrapper = document.createElement("div");
                cardWrapper.id = "card-wrapper";
                container?.appendChild(cardWrapper);
            }
            if (!cardWrapper) return;

            this.showSkeletons();

            const executeRender = async () => {
                if (animate) window.scrollTo(0, 0);
                cardWrapper.innerHTML = "";

                const savedState = Storage.getSavedState();
                this.updateStickyTitle();

                const {filtered, displayed, isAr} = this.getFilteredData();

                // 1. Handle Empty States
                if (App.searchQuery && displayed.length === 0) {
                    this.renderEmptyState(cardWrapper, "search");
                    return;
                } else if (App.currentCategory === "favorites" && filtered.length === 0) {
                    this.renderEmptyState(cardWrapper, "favorites");
                    return;
                } else if (filtered.length === 0 && !App.searchQuery) {
                    this.renderEmptyState(cardWrapper, "normal");
                    return;
                }

                // 2. Completion Math (Uses `filtered`, completely ignoring search logic)
                let completedCount = filtered.filter((item) => savedState.completedIds.includes(Storage.getStorageKey(item.id))).length;
                const totalCount = filtered.length;

                if (completedCount >= totalCount && totalCount > 0 && !savedState.categoriesDone[App.currentCategory]) await Storage.saveCategoryComplete(App.currentCategory);

                const countersCtx = {completedCount, totalCount};

                // 3. Render Loop (Uses `displayed` to only show search matches)
                displayed.forEach((item) => {
                    const card = this.buildCard(item, savedState, isAr, countersCtx);
                    cardWrapper.appendChild(card);
                });

                this.applyUITranslations();
                await this.checkCategoryCompletion(App.currentCategory);
            };

            if (animate) {
                this.showSkeletons();
                setTimeout(executeRender, 150);
            } else {
                executeRender();
            }
        },
    };
}
