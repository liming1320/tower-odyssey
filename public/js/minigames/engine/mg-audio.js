// 小游戏引擎 · 音频模块（mg-audio.js）
// 职责：Web Audio 实时合成音效与循环 BGM（零音频文件、零依赖）。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 音频引擎（Web Audio 实时合成，零音频文件、零依赖）=================
// 设计：所有音色由振荡器/噪声缓冲实时合成，避免加载任何外部素材。
// 浏览器要求「用户手势后才能出声」，故第一次发声前须调用 unlock()。
MG.audio = {
    ctx: null, master: null, muted: false, ready: false, volume: 0.42, bgmGain: null,
    MUTE_KEY: 'mg-audio-mute',
    init() {
        if (this.ctx) return this.ctx;
        try {
            if (this.MUTE_KEY && typeof localStorage !== 'undefined') {
                this.muted = localStorage.getItem(this.MUTE_KEY) === '1';
            }
        } catch (e) { }
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.42;
            this.master.connect(this.ctx.destination);
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = 1;
            this.bgmGain.connect(this.master);
            this.ready = true;
        } catch (e) { this.ctx = null; }
        return this.ctx;
    },
    // 用户手势后调用（解锁自动播放限制）
    unlock() {
        const c = this.init();
        if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) { } }
        return !!c;
    },
    setMuted(v) {
        this.muted = !!v;
        try { localStorage.setItem(this.MUTE_KEY, this.muted ? '1' : '0'); } catch (e) { }
        if (this.master) { try { this.master.gain.value = this.muted ? 0 : 0.42; } catch (e) { } }
        return this.muted;
    },
    toggleMuted() { return this.setMuted(!this.muted); },
    // 音量（0~1）：受设置面板控制；与 mute 正交（mute 仍优先静音）
    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, +v || 0));
        if (this.master) { try { this.master.gain.value = this.muted ? 0 : this.volume; } catch (e) {} }
        return this.volume;
    },
    // 单音：freq→to 可做滑音（弹球 bumper 的「叮嘭」就靠它）
    tone(o) {
        if (this.muted) return;
        const ctx = this.init(); if (!ctx) return;
        const t0 = ctx.currentTime + (o.delay || 0);
        const dur = o.dur || 0.15;
        try {
            const osc = ctx.createOscillator();
            osc.type = o.type || 'square';
            osc.frequency.setValueAtTime(o.freq, t0);
            if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
            const g = ctx.createGain();
            const vol = (o.gain == null ? 0.22 : o.gain);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.02, dur * 0.25));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            let node = osc;
            if (o.lp) {
                const f = ctx.createBiquadFilter();
                f.type = 'lowpass'; f.frequency.value = o.lp;
                osc.connect(f); node = f;
            }
            const out = o.dest || this.master;
            node.connect(g); g.connect(out);
            osc.start(t0); osc.stop(t0 + dur + 0.03);
        } catch (e) { }
    },
    // 噪声（打击乐 / 机械声 / 风声）
    noise(o) {
        if (this.muted) return;
        const ctx = this.init(); if (!ctx) return;
        const dur = o.dur || 0.1;
        const t0 = ctx.currentTime + (o.delay || 0);
        // 复用按时长+衰减缓存的噪声 buffer，避免高频触发（弹幕/射击/弹球）反复生成随机采样造成 GC 压力
        const key = dur.toFixed(3) + '_' + (o.decay == null ? 1 : o.decay);
        let buf = this._noiseBuf && this._noiseBuf[key];
        if (!buf) {
            const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
            buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            const decay = o.decay == null ? 1 : o.decay;
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            this._noiseBuf = this._noiseBuf || {};
            this._noiseBuf[key] = buf;
        }
        try {
            const src = ctx.createBufferSource(); src.buffer = buf;
            const f = ctx.createBiquadFilter();
            f.type = o.type || 'bandpass';
            f.frequency.setValueAtTime(o.freq || 1200, t0);
            if (o.to) f.frequency.linearRampToValueAtTime(Math.max(20, o.to), t0 + dur);
            f.Q.value = o.q || 1.1;
            const g = ctx.createGain();
            g.gain.setValueAtTime(o.gain == null ? 0.18 : o.gain, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            const out = o.dest || this.master;
            src.connect(f); f.connect(g); g.connect(out);
            src.start(t0); src.stop(t0 + dur + 0.03);
        } catch (e) { }
    },
    // 常用音效预设（弹球 / 通用）
    // 去抖 + 静音保护（优化 P1-5）：同音 20ms 内合并，避免高频游戏（弹幕/射击/弹球）
    // 一帧触发几十次导致振荡器节点堆积、爆音；muted 时直接跳过，省去无谓合成。
    SFX_DEDUP: 0.02,
    sfx(name) {
        if (this.muted) return;
        const ctx = this.init();
        if (!ctx) return;
        const now = ctx.currentTime;
        this._sfxLast = this._sfxLast || {};
        const last = this._sfxLast[name];
        if (last != null && (now - last) < (this.SFX_DEDUP || 0.02)) return;
        this._sfxLast[name] = now;
        const A = this;
        const P = {
            bumper: () => { A.tone({ freq: 440, to: 980, dur: 0.11, type: 'square', gain: 0.2 }); A.noise({ dur: 0.05, freq: 2600, gain: 0.1 }); },
            sling: () => { A.tone({ freq: 300, to: 760, dur: 0.08, type: 'square', gain: 0.17 }); },
            flip: () => { A.noise({ dur: 0.035, freq: 1800, to: 700, gain: 0.13, q: 0.8 }); A.tone({ freq: 180, dur: 0.04, type: 'triangle', gain: 0.1 }); },
            target: () => { A.tone({ freq: 880, to: 1400, dur: 0.12, type: 'triangle', gain: 0.2 }); },
            rollover: () => { A.tone({ freq: 1180, dur: 0.07, type: 'sine', gain: 0.16 }); },
            spinner: () => { A.tone({ freq: 620, to: 1180, dur: 0.05, type: 'square', gain: 0.11 }); },
            saucer: () => { A.tone({ freq: 700, to: 120, dur: 0.45, type: 'sawtooth', gain: 0.16, lp: 1400 }); },
            kick: () => { A.tone({ freq: 120, to: 620, dur: 0.18, type: 'square', gain: 0.2 }); A.noise({ dur: 0.1, freq: 900, to: 2600, gain: 0.12 }); },
            ramp: () => { A.noise({ dur: 0.55, freq: 500, to: 3000, gain: 0.1, q: 2 }); A.tone({ freq: 300, to: 1200, dur: 0.55, type: 'triangle', gain: 0.1 }); },
            drain: () => { A.tone({ freq: 420, to: 70, dur: 0.6, type: 'sawtooth', gain: 0.16, lp: 900 }); },
            launch: () => { A.tone({ freq: 140, to: 620, dur: 0.22, type: 'sawtooth', gain: 0.15, lp: 1600 }); A.noise({ dur: 0.12, freq: 1200, to: 300, gain: 0.14 }); },
            charge: () => { A.tone({ freq: 90, to: 300, dur: 0.5, type: 'sawtooth', gain: 0.07, lp: 700 }); },
            jet: () => { A.tone({ freq: 660, dur: 0.09, type: 'square', gain: 0.18 }); A.tone({ freq: 880, dur: 0.09, type: 'square', gain: 0.15, delay: 0.08 }); },
            jackpot: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => A.tone({ freq: f, dur: 0.16, type: 'square', gain: 0.16, delay: i * 0.075 })); },
            levelup: () => { [523, 659, 784, 1047].forEach((f, i) => A.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.17, delay: i * 0.1 })); },
            fail: () => { [392, 330, 262, 196].forEach((f, i) => A.tone({ freq: f, dur: 0.2, type: 'sawtooth', gain: 0.14, lp: 1200, delay: i * 0.12 })); },
            click: () => { A.tone({ freq: 760, dur: 0.045, type: 'square', gain: 0.11 }); },
            coin: () => { A.tone({ freq: 988, dur: 0.07, type: 'square', gain: 0.15 }); A.tone({ freq: 1319, dur: 0.16, type: 'square', gain: 0.14, delay: 0.07 }); },
            step: () => { A.noise({ dur: 0.045, freq: 420, to: 160, type: 'lowpass', q: 0.6, gain: 0.10 }); A.tone({ freq: 150, to: 90, dur: 0.05, type: 'sine', gain: 0.06 }); },
        };
        const f = P[name];
        if (f) { try { f(); } catch (e) { } }
        // BGM 闪避（ducking）：发声时短暂压低 BGM，避免抢戏（Tier1-2 增强）
        try { if (!this.muted && this.bgmGain && this.bgm && this.bgm.playing) { const g = this.bgmGain.gain, c = this.ctx.currentTime; g.cancelScheduledValues(c); g.setValueAtTime(g.value, c); g.linearRampToValueAtTime(0.35, c + 0.02); g.linearRampToValueAtTime(1, c + 0.28); } } catch (e) {}
    },
    // ---------- 循环 BGM（16 分音符步进序列器 + 预调度，抗抖动）----------
    bgm: {
        playing: false, timer: null, step: 0, nextT: 0, name: null,
        // 太空军校生致敬主题：D 小调 · 方波主旋律 + 三角贝斯 + 琶音 + 鼓
        SONGS: {
            space: {
                bpm: 142,
                // 每小节 16 个 16 分格，-1 = 休止；共 8 小节
                lead: [
                    [62, -1, 65, -1, 69, -1, 74, -1, 72, -1, 69, -1, 65, -1, -1, -1],
                    [62, -1, 65, -1, 69, -1, 65, -1, 62, -1, 57, -1, 60, -1, -1, -1],
                    [70, -1, 74, -1, 77, -1, 74, -1, 70, -1, 65, -1, 69, -1, -1, -1],
                    [65, -1, 69, -1, 72, -1, 69, -1, 65, -1, -1, -1, 64, -1, 60, -1],
                    [67, -1, 70, -1, 74, -1, 70, -1, 67, -1, 62, -1, 66, -1, -1, -1],
                    [62, -1, 65, -1, 69, -1, 74, -1, 72, -1, 69, -1, 65, -1, 62, -1],
                    [64, -1, 68, -1, 71, -1, 68, -1, 64, -1, -1, -1, 67, -1, 69, -1],
                    [62, -1, 65, -1, 69, -1, 74, -1, 77, -1, 74, -1, 69, -1, -1, -1],
                ],
                chords: [[62, 65, 69], [62, 65, 69], [58, 62, 65], [65, 69, 72], [62, 67, 70], [62, 65, 69], [61, 64, 69], [62, 65, 69]],
                bass: [38, 38, 34, 41, 43, 38, 33, 38],
            },
        },
        mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
        start(name) {
            name = name || 'space';
            const A = MG.audio;
            const ctx = A.init(); if (!ctx) return;
            A.unlock();
            if (this.playing && this.name === name) return;
            this.stop();
            this.playing = true; this.name = name; this.step = 0;
            this.nextT = ctx.currentTime + 0.08;
            const spb = 60 / (this.SONGS[name].bpm || 140) / 4;
            const tick = () => {
                if (!this.playing) return;
                const c = MG.audio.ctx;
                if (c) {
                    let guard = 0;
                    while (this.nextT < c.currentTime + 0.3 && guard++ < 64) {
                        this._note(this.step, this.nextT, name);
                        this.step++;
                        this.nextT += spb;
                    }
                }
                this.timer = setTimeout(tick, 45);
            };
            tick();
        },
        stop() {
            this.playing = false; this.name = null; this.step = 0;
            if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        },
        _note(step, at, name) {
            const A = MG.audio;
            if (A.muted || !A.ctx) return;
            const S = this.SONGS[name]; if (!S) return;
            const total = S.lead.length * 16;
            const s = step % total;
            const bar = Math.floor(s / 16), b = s % 16;
            const when = Math.max(0, at - A.ctx.currentTime);
            const tone = (o) => A.tone(Object.assign({ dest: A.bgmGain }, o));
            const noise = (o) => A.noise(Object.assign({ dest: A.bgmGain }, o));
            // 主旋律
            const n = S.lead[bar][b];
            if (n > 0) tone({ freq: this.mtof(n), dur: 0.14, type: 'square', gain: 0.075, delay: when });
            // 琶音（弱）
            if (b % 2 === 0) {
                const ch = S.chords[bar];
                const arp = ch[(b / 2) % ch.length];
                tone({ freq: this.mtof(arp - 12), dur: 0.1, type: 'triangle', gain: 0.05, delay: when });
            }
            // 贝斯（每拍）
            if (b % 4 === 0) tone({ freq: this.mtof(S.bass[bar]), dur: 0.22, type: 'triangle', gain: 0.12, delay: when });
            // 鼓
            if (b === 0 || b === 8) tone({ freq: 150, to: 48, dur: 0.12, type: 'sine', gain: 0.2, delay: when });
            if (b === 4 || b === 12) noise({ dur: 0.11, freq: 1700, q: 0.7, gain: 0.1, delay: when });
            if (b % 2 === 0) noise({ dur: 0.03, freq: 7200, type: 'highpass', gain: 0.03, delay: when });
        },
    },
};
