// ==========================================
// FOCUS — Full-screen tasbih counter with haptic feedback
// ==========================================
export function createFocus(getDeps) {
    return {
        _keyHandler: null,
        _lastFocus: null,

        open(item, currentVal) {
            const { App, Storage } = getDeps();
            const modal = document.getElementById("focusModal");
            const counterEl = document.getElementById("focusCounter");
            const targetEl = document.getElementById("focusTarget");
            const progressEl = document.getElementById("focusProgressBar");

            App.focusState = {
                currentVal,
                targetVal: item.repeat,
                cardId: item.id,
                category: Storage.getProgressCategoryForItem(item)
            };

            if (counterEl) counterEl.innerText = String(App.focusState.currentVal);
            if (targetEl) targetEl.innerText = `/ ${App.focusState.targetVal}`;
            if (progressEl) this.updateProgress(progressEl);

            modal?.classList.remove("hidden");
            modal?.classList.add("flex");

            if (modal) {
                if (this._keyHandler) {
                    document.removeEventListener("keydown", this._keyHandler, true);
                    this._keyHandler = null;
                }
                this._lastFocus = document.activeElement;
                modal.setAttribute("aria-hidden", "false");
                document.body.classList.add("modal-open");
                setTimeout(() => modal.focus?.(), 0);

                this._keyHandler = async (ev) => {
                    if (ev.key === "Escape") {
                        ev.preventDefault();
                        this.close();
                        return;
                    }
                    if (ev.key === " " || ev.key === "Enter") {
                        ev.preventDefault();
                        // If the close button is focused, activate IT (Enter/Space)
                        // instead of counting — otherwise the button is dead to keyboard.
                        const closeBtn = document.getElementById("closeFocusBtn");
                        if (document.activeElement === closeBtn) {
                            this.close();
                        } else {
                            await this.handleTap(ev);
                        }
                    }
                    if (ev.key === "Tab") {
                        const closeBtn = document.getElementById("closeFocusBtn");
                        const active = document.activeElement;
                        if (ev.shiftKey) {
                            if (active === modal) {
                                ev.preventDefault();
                                closeBtn?.focus?.();
                            } else {
                                ev.preventDefault();
                                modal.focus?.();
                            }
                        } else {
                            if (active === closeBtn) {
                                ev.preventDefault();
                                modal.focus?.();
                            } else {
                                ev.preventDefault();
                                closeBtn?.focus?.();
                            }
                        }
                    }
                };
                document.addEventListener("keydown", this._keyHandler, true);
            }
        },

        updateProgress(bar) {
            const { App } = getDeps();
            const pct = (App.focusState.currentVal / App.focusState.targetVal) * 100;
            bar.style.width = `${pct}%`;
        },

        createRipple(e, container) {
            const circle = document.createElement("span");
            const diameter = Math.max(container.clientWidth, container.clientHeight);
            const radius = diameter / 2;
            const rect = container.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : (typeof e.clientX === "number" ? e.clientX : rect.left + rect.width / 2);
            const clientY = e.touches ? e.touches[0].clientY : (typeof e.clientY === "number" ? e.clientY : rect.top + rect.height / 2);

            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${clientX - radius}px`;
            circle.style.top = `${clientY - radius}px`;
            circle.classList.add("ripple");

            container.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
        },

        async handleTap(e) {
            const { App, Storage, UI } = getDeps();
            if (e.target.closest("#closeFocusBtn")) return;

            const modal = document.getElementById("focusModal");
            const counterEl = document.getElementById("focusCounter");
            const progressEl = document.getElementById("focusProgressBar");

            if (App.focusState.currentVal < App.focusState.targetVal) {
                App.focusState.currentVal++;

                if (counterEl) {
                    counterEl.innerText = String(App.focusState.currentVal);
                    counterEl.style.transform = "scale(1.2)";
                    setTimeout(() => (counterEl.style.transform = "scale(1)"), 100);
                }
                if (modal) this.createRipple(e, modal);
                if (progressEl) this.updateProgress(progressEl);

                UI.smartHapticForCounter(App.focusState.currentVal, App.focusState.targetVal);
                UI.announceMilestone(App.focusState.currentVal, App.focusState.targetVal);

                await Storage.saveCardCountForCategory(App.focusState.category || App.currentCategory, App.focusState.cardId, App.focusState.currentVal);

                // Best-effort: mirror the count onto the underlying card if it's still
                // in the DOM. A re-render (search, kids-mode, language) can remove it.
                const focusBtn = document.querySelector(`.btn-focus[data-id="${App.focusState.cardId}"]`);
                const card = focusBtn?.closest(".adhkar-card");
                if (card) {
                    const span = card.querySelector(".counter");
                    if (span) span.innerText = String(App.focusState.currentVal);

                    const cardBar = card.querySelector('.card-progress-bar');
                    if (cardBar) {
                        const pct = (App.focusState.currentVal / App.focusState.targetVal) * 100;
                        cardBar.style.width = `${pct}%`;
                    }
                }

                // Completion must run off focusState — NOT be nested inside the
                // card-present check — so a mid-session re-render can't orphan the
                // completion save + auto-close.
                if (App.focusState.currentVal === App.focusState.targetVal) {
                    if (card) {
                        card.classList.add("card-done");
                        const bar = card.querySelector('.card-progress-bar');
                        if (bar) bar.classList.add('bar-completion-pulse');
                    }
                    await Storage.saveCardCompleteForCategory(App.focusState.category || App.currentCategory, App.focusState.cardId);

                    // Data-driven category completion. Using live DOM node counts here
                    // would let an active search filter (fewer cards shown) falsely mark
                    // the whole category complete.
                    if (App.currentCategory !== "favorites") {
                        await UI.checkCategoryCompletion(App.currentCategory);
                    }

                    setTimeout(() => this.close(), 500);
                }
            }
        },

        close() {
            const { App, UI } = getDeps();
            const modal = document.getElementById("focusModal");

            const focusBtn = document.querySelector(`.btn-focus[data-id="${App.focusState.cardId}"]`);
            if (focusBtn) {
                const card = focusBtn.closest(".adhkar-card");
                const span = card?.querySelector(".counter");
                if (card && span) {
                    span.innerText = String(App.focusState.currentVal);
                    if (App.focusState.currentVal >= App.focusState.targetVal) card.classList.add("card-done");
                }
            }

            modal?.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");
            if (this._keyHandler) {
                document.removeEventListener("keydown", this._keyHandler, true);
                this._keyHandler = null;
            }

            modal?.classList.add("hidden");
            modal?.classList.remove("flex");
            UI.updateCategoryUI();

            if (this._lastFocus && this._lastFocus.focus) this._lastFocus.focus();
        },
    };
}
