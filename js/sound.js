// sound.js
// SoundEngine — all audio synthesis for Mary on Mahjong.
// Self-contained: no dependencies on game state or other modules.

// ========================================
// SOUND ENGINE
// ========================================

const SoundEngine = {
    _ctx: null,
    _muted: localStorage.getItem('mahjong_muted') === 'true',

    get ctx() {
        if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        return this._ctx;
    },

    get muted() { return this._muted; },

    toggleMute() {
        this._muted = !this._muted;
        localStorage.setItem('mahjong_muted', this._muted);
        // Update corner menu button label
        const btn = document.getElementById('muteBtn');
        if (btn) btn.textContent = this._muted ? '🔇 Unmute' : '🔊 Mute';
    },

    // Low-level helpers
    _osc(type, freq, startTime, duration, gainVal, ctx) {
        const g = ctx.createGain();
        g.connect(ctx.destination);
        g.gain.setValueAtTime(gainVal, startTime);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, startTime);
        o.connect(g);
        o.start(startTime);
        o.stop(startTime + duration);
    },

    _noise(startTime, duration, gainVal, ctx) {
        const bufSize = ctx.sampleRate * duration;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gainVal, startTime);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        src.connect(g);
        g.connect(ctx.destination);
        src.start(startTime);
        src.stop(startTime + duration);
    },

    // ── Individual sounds ──

    tileClick() {
        if (this._muted) return;
        try {
            const ctx = this.ctx;
            const t = ctx.currentTime;
            // Soft low thud — slightly louder
            this._osc('sine', 180, t, 0.12, 0.14, ctx);
            this._osc('sine', 120, t, 0.10, 0.08, ctx);
        } catch(e) {}
    },

    botCall() {
        if (this._muted) return;
        try {
            const ctx = this.ctx;
            const t = ctx.currentTime;
            // Two ascending tones — alert chime
            this._osc('sine', 520, t,        0.18, 0.12, ctx);
            this._osc('sine', 780, t + 0.14, 0.22, 0.10, ctx);
        } catch(e) {}
    },

    jokerExchange() {
        if (this._muted) return;
        try {
            const ctx = this.ctx;
            const t = ctx.currentTime;
            // Quick rising arpeggio — sparkle
            [523, 659, 784, 1047].forEach((freq, i) => {
                this._osc('sine', freq, t + i * 0.06, 0.15, 0.08, ctx);
            });
        } catch(e) {}
    },

    playerWins() {
        if (this._muted) return;
        try {
            const ctx = this.ctx;
            const t = ctx.currentTime;
            // Gentle fanfare — ascending phrase with a final chord
            const melody = [523, 659, 784, 659, 784, 1047];
            const times  = [0,   0.18, 0.36, 0.54, 0.72, 0.90];
            melody.forEach((freq, i) => {
                this._osc('sine', freq, t + times[i], 0.25, 0.10, ctx);
                // Soft harmony a fifth below on the last note
                if (i === melody.length - 1) {
                    this._osc('sine', freq * 0.75, t + times[i], 0.35, 0.06, ctx);
                }
            });
        } catch(e) {}
    },

    botWins() {
        if (this._muted) return;
        try {
            const ctx = this.ctx;
            const t = ctx.currentTime;
            // Gentle descending sine tones — soft and sad, not harsh
            this._osc('sine', 392, t,        0.45, 0.07, ctx);
            this._osc('sine', 330, t + 0.35, 0.50, 0.06, ctx);
            this._osc('sine', 262, t + 0.70, 0.60, 0.05, ctx);
        } catch(e) {}
    },
};
