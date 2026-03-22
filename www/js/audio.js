// ==========================================
// AUDIO CONTROLLER — Human recitations with TTS fallback
// HTML5 Audio + per-item audio_url resolution + speechSynthesis fallback
// ==========================================
export function createAudioController(getDeps) {
    return {
        _audio: new Audio(),
        _isPlaying: false,
        _lastFallbackId: null,

        init() {
            this._audio.preload = "none";
            this.bar          = document.getElementById("audioPlayerBar");
            this.title        = document.getElementById("audioTitle");
            this.progress     = document.getElementById("audioProgress");
            this.playPauseBtn = document.getElementById("audioPlayPauseBtn");
            this.stopBtn      = document.getElementById("audioStopBtn");
            this.playIcon     = document.getElementById("playIcon");
            this.pauseIcon    = document.getElementById("pauseIcon");

            this._audio.addEventListener("timeupdate", () => this.updateProgress());
            this._audio.addEventListener("ended",      () => this.stop());
            this._audio.addEventListener("error",      () => this.handleError());

            const { UI } = getDeps();
            if (this.playPauseBtn) this.playPauseBtn.onclick = () => this.toggle();
            if (this.stopBtn)      this.stopBtn.onclick      = () => UI.stopAllAudio();
        },

        getAudioUrl(item) {
            const { projectUrl } = getDeps();
            if (!item?.id) return null;
            const raw = typeof item.audio_url === "string" ? item.audio_url.trim() : "";
            if (raw) {
                // Full URL provided in data
                if (/^https?:\/\//i.test(raw)) return raw;
                // Otherwise treat it as an audio file ID and resolve from public base
                const normalizedId = raw.replace(/\.mp3$/i, "");
                return `${projectUrl()}/audio/${encodeURIComponent(normalizedId)}.mp3`;
            }
            // No audio_url provided: resolve from local card ID
            return `./audio/${encodeURIComponent(item.id)}.mp3`;
        },

        async play(item) {
            const { App, UI } = getDeps();
            // TOGGLE STOP: If clicking the SAME item that is already active, stop everything.
            if (App.currentAudioId === item.id) {
                UI.stopAllAudio();
                return;
            }

            // Stop any existing audio first
            UI.stopAllAudio();

            const url = this.getAudioUrl(item);
            if (!url) {
                this.fallback(item);
                return;
            }

            // Stop current if any
            this._audio.pause();
            this._audio.src = url;
            this._audio.load(); // Force reset state
            App.currentAudioId = item.id;
            if (this.title) this.title.innerText = item.arabic.substring(0, 30) + "...";

            try {
                // We do NOT handle fallback here to avoid double trigger with 'error' event
                await this._audio.play();
                this._isPlaying = true;
                this.showPlayer();
                this.syncUI();
            } catch (e) {
                console.warn("Audio play attempt failed, waiting for error event...", e);
                // Some browsers reject play() without firing "error"; recover and fallback once.
                const currentId = App.currentAudioId;
                this.stop();
                App.currentAudioId = null;
                if (currentId === item.id) this.fallback(item);
            }
        },

        toggle() {
            if (!this._audio.src) return;
            if (this._isPlaying) {
                this._audio.pause();
                this._isPlaying = false;
            } else {
                this._audio.play().catch(e => console.error("Resume failed", e));
                this._isPlaying = true;
            }
            this.syncUI();
        },

        stop() {
            this._audio.pause();
            // Fully detach source without calling load() (avoids Firefox "Invalid URI" noise).
            this._audio.removeAttribute("src");
            try {
                this._audio.currentTime = 0;
            } catch {
            }
            this._isPlaying = false;
            this.hidePlayer();
            this.syncUI();
        },

        updateProgress() {
            if (!this._audio.duration || !isFinite(this._audio.duration)) return;
            const pct = (this._audio.currentTime / this._audio.duration) * 100;
            if (this.progress) this.progress.style.width = `${pct}%`;
        },

        syncUI() {
            const { App, CFG } = getDeps();
            // Update Mini Player
            if (this._isPlaying) {
                this.playIcon?.classList.add("hidden");
                this.pauseIcon?.classList.remove("hidden");
            } else {
                this.playIcon?.classList.remove("hidden");
                this.pauseIcon?.classList.add("hidden");
            }
            const playPauseLabel = this._isPlaying
                ? CFG("aria_pause", "Pause")
                : CFG("aria_play", "Play");
            if (this.playPauseBtn) this.playPauseBtn.setAttribute("aria-label", playPauseLabel);

            // Update All Speaker Buttons on page
            document.querySelectorAll(".btn-speak").forEach(btn => {
                const btnId = btn.getAttribute("data-id");
                // Active if match global ID AND either human playing or synth speaking
                const synthSpeaking = !!window.speechSynthesis?.speaking;
                const isActive = (btnId === App.currentAudioId && (this._isPlaying || synthSpeaking));
                btn.classList.toggle("active", isActive);
            });
        },

        showPlayer() {
            this.bar?.classList.remove("translate-y-full");
            this.bar?.classList.add("flex"); // Ensure it's flex when shown
            // Add padding to container so footer/content isn't blocked
            const container = document.getElementById("adhkar-container");
            if (container) container.style.paddingBottom = "100px";
        },

        hidePlayer() {
            this.bar?.classList.add("translate-y-full");
            const container = document.getElementById("adhkar-container");
            if (container) container.style.paddingBottom = "0px";
        },

        handleError() {
            const { App } = getDeps();
            // Ignore stale/cleanup errors when no source is attached.
            if (!this._audio.getAttribute("src")) return;
            // Only fallback if we actually have an ID and it's not a source-clear event
            if (App.currentAudioId) {
                const item = App.adhkarData.find(x => x.id === App.currentAudioId);
                if (item) this.fallback(item);
            }
            this.stop();
        },

        fallback(item) {
            const { App, UI } = getDeps();
            // Guard against multiple fallback triggers for same item
            if (this._lastFallbackId === item.id) return;
            // If already speaking this card via TTS, do not retrigger (prevents self-cut).
            if (window.speechSynthesis?.speaking && App.currentAudioId === item.id) return;
            this._lastFallbackId = item.id;
            setTimeout(() => this._lastFallbackId = null, 3000);

            UI.toast(App.uiStrings[App.currentLang]?.tts_fallback || "Audio unavailable: using robotic voice", "info");
            UI.toggleSpeech(item.arabic, item.id, { forceStart: true });
        }
    };
}
