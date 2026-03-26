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

    // ── Speech system ──

    // Standard tile names — used as fallback when personality has no override
    TILE_NAMES: {
        '1B':'One Bam',   '2B':'Two Bam',   '3B':'Three Bam',
        '4B':'Four Bam',  '5B':'Five Bam',  '6B':'Six Bam',
        '7B':'Seven Bam', '8B':'Eight Bam', '9B':'Nine Bam',
        '1C':'One Crak',  '2C':'Two Crak',  '3C':'Three Crak',
        '4C':'Four Crak', '5C':'Five Crak', '6C':'Six Crak',
        '7C':'Seven Crak','8C':'Eight Crak','9C':'Nine Crak',
        '1D':'One Dot',   '2D':'Two Dot',   '3D':'Three Dot',
        '4D':'Four Dot',  '5D':'Five Dot',  '6D':'Six Dot',
        '7D':'Seven Dot', '8D':'Eight Dot', '9D':'Nine Dot',
        'N':'North',      'E':'East',       'W':'West',       'S':'South',
        'GD':'Green Dragon', 'RD':'Red Dragon', 'WD':'White Dragon',
        'F':'Flower',     'J':'Joker',
    },

    // Default phrases — used when personality has no override for a key
    DEFAULT_PHRASES: {
        call:          { word: 'Call' },
        mahjong:       { word: 'Mah Jong', rate: 0.8, pitch: 1.5 },
        jokerExchange: null,  // silent by default
    },

    // Heuristic gender detection from voice name
    _genderHint(name) {
        const n = name.toLowerCase();
        const f = ['female','woman','zira','hazel','susan','kate','karen','victoria','moira',
                   'fiona','samantha','allison','ava','evelyn','nicky','aria','jenny','ana',
                   'libby','mia','natasha','helena','laura','linda','alice','clara','emma',
                   'amelie','marie','anna','catherine','serena','tessa','veena','paulina'];
        const m = ['male','man','david','mark','fred','tom','daniel','james','lee','rishi',
                   'george','oliver','liam','ken','alex','aaron','gordon','bruce','arthur',
                   'eddy','ralph','reed','rocko'];
        if (f.some(w => n.includes(w))) return 'female';
        if (m.some(w => n.includes(w))) return 'male';
        return null;
    },

    // Find best available voice for a given lang + gender, with graceful fallback
    _resolveVoice(lang, gender) {
        const voices = speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;
        // 1. Matching lang + gender
        const match1 = voices.find(v => v.lang.startsWith(lang) && this._genderHint(v.name) === gender);
        if (match1) return match1;
        // 2. Matching lang only
        const match2 = voices.find(v => v.lang.startsWith(lang));
        if (match2) return match2;
        // 3. Any English
        const match3 = voices.find(v => v.lang.startsWith('en'));
        if (match3) return match3;
        // 4. Whatever is available
        return voices[0] || null;
    },

    // Core speak function — merges bot voice config with per-phrase overrides
    _speak(text, voiceConfig, overrides = {}) {
        if (this._muted) return;
        if (!text || typeof speechSynthesis === 'undefined') return;
        try {
            const cfg = voiceConfig || { lang: 'en-US', gender: 'female', rate: 1.0, pitch: 1.0 };
            const voice = this._resolveVoice(cfg.lang || 'en-US', cfg.gender || 'female');
            const u = new SpeechSynthesisUtterance(text);
            if (voice) u.voice = voice;
            u.rate  = overrides.rate  ?? cfg.rate  ?? 1.0;
            u.pitch = overrides.pitch ?? cfg.pitch ?? 1.0;
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
        } catch(e) {}
    },

    // Announce a tile discard — respects per-personality tile name overrides and weighted alternates
    announceTile(tileCode, personality) {
        if (this._muted) return;
        const tileNames = personality && personality.tileNames && personality.tileNames[tileCode];
        let word;
        if (Array.isArray(tileNames)) {
            // Weighted random pick: [{ word, weight }, ...]
            const total = tileNames.reduce((s, t) => s + (t.weight || 1), 0);
            let r = Math.random() * total;
            word = tileNames[tileNames.length - 1].word;
            for (const entry of tileNames) {
                r -= (entry.weight || 1);
                if (r <= 0) { word = entry.word; break; }
            }
        } else if (typeof tileNames === 'string') {
            word = tileNames;
        } else {
            word = this.TILE_NAMES[tileCode] || tileCode;
        }
        this._speak(word, personality && personality.voice);
    },

    // Announce a phrase (call / mahjong / jokerExchange)
    announcePhrase(phraseKey, personality) {
        if (this._muted) return;
        // Per-personality override, then global default
        const cfg = (personality && personality.phrases && personality.phrases[phraseKey] !== undefined)
            ? personality.phrases[phraseKey]
            : this.DEFAULT_PHRASES[phraseKey];
        if (!cfg) return;  // null = intentionally silent
        const text = typeof cfg === 'string' ? cfg : cfg.word;
        if (!text) return;
        this._speak(text, personality && personality.voice, cfg);
    },
};
