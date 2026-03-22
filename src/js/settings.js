import { el, qsa } from './utils.js';

export function initSettingsUI() {
    const modal = el("settingsModal");
    const panel = el("modalContent");
    const openBtn = el("settingsBtn");
    const closeBtn = el("settingsCloseBtn");

    let lastFocus = null;
    let isOpen = false;

    const getFocusable = () => {
        if (!panel) return [];
        return qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel)
            .filter((n) => !n.disabled && n.offsetParent !== null);
    };

    const open = () => {
        if (!modal || !panel) return;
        lastFocus = document.activeElement;
        isOpen = true;

        document.body.classList.add("modal-open");
        panel.setAttribute("aria-hidden", "false");

        modal.classList.remove("hidden");
        setTimeout(() => {
            modal.classList.remove("opacity-0");
            panel.classList.remove("scale-95");
            const focusables = getFocusable();
            (focusables[0] || panel).focus?.();
        }, 10);
    };

    const close = () => {
        if (!modal || !panel) return;
        isOpen = false;

        // FIX: Move focus OUT of the modal before hiding it
        // This completely resolves the "Blocked aria-hidden" browser error
        // and fixes the bug where Edge refuses to close the modal.
        if (lastFocus && lastFocus.focus) {
            lastFocus.focus();
        } else if (document.activeElement) {
            document.activeElement.blur();
        }

        // Now it's safely blurred, we can hide it from screen readers
        panel.setAttribute("aria-hidden", "true");

        // Trigger visual CSS animations
        modal.classList.add("opacity-0");
        panel.classList.add("scale-95");
        document.body.classList.remove("modal-open");

        setTimeout(() => {
            modal.classList.add("hidden");
        }, 300);
    };

    if (openBtn) openBtn.onclick = open;
    if (closeBtn) closeBtn.onclick = (e) => {
        e.stopPropagation();
        close();
    };

    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) close();
        };
    }

    // Esc + focus trap
    document.addEventListener("keydown", (e) => {
        if (!isOpen) return;
        if (e.key === "Escape") {
            e.preventDefault();
            close();
            return;
        }
        if (e.key === "Tab") {
            const focusables = getFocusable();
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, true);
}
