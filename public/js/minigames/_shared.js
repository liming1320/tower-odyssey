// 小游戏共享工具：创建 canvas、基础渲染、按钮、事件、关卡进度系统
window.MiniGames = window.MiniGames || {};
const MG = {
    // ================= 统一美术工具集（2026-09-09 视觉升级）=================
    // 各游戏的 draw() 复用：棋盘背景 / 渐变格子 / emoji / 高光，风格与 2048 妖怪版一致
    ui: {
        EMOJI_FONT: '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif',
        // 圆角矩形路径（只描路径，不填充）
        rr(ctx, x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        },
        // 深蓝渐变棋盘背景 + 圆角 + 描边
        board(ctx, w, h) {
            MG.ui.rr(ctx, 0, 0, w, h, 14);
            let g = null;
            try { g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3d5a80'); g.addColorStop(1, '#243a55'); } catch (e) {}
            ctx.fillStyle = g || '#2e4666'; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#1a2c44'; ctx.stroke();
        },
        // 渐变游戏格子：底板渐变(c1→c2) + 描边(bd) + 顶部高光 + 投影
        tile(ctx, x, y, s, c1, c2, bd, r) {
            r = r == null ? 8 : r;
            MG.ui.rr(ctx, x + 2, y + 3, s - 4, s - 4, r);
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();          // 投影
            MG.ui.rr(ctx, x + 1, y + 1, s - 2, s - 2, r);
            let g = null;
            try { g = ctx.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) {}
            ctx.fillStyle = g || c1; ctx.fill();
            ctx.lineWidth = 1.6; ctx.strokeStyle = bd; ctx.stroke();
            MG.ui.rr(ctx, x + 4, y + 3, s - 8, s * 0.24, Math.min(r, 6));   // 顶部高光
            ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
        },
        // emoji 绘制（居中）
        emoji(ctx, ch, cx, cy, size) {
            ctx.font = Math.round(size) + 'px ' + MG.ui.EMOJI_FONT;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(ch, cx, cy);
        },
    },
    // ================= 画质引擎（2026-09-10 全局高清化）=================
    // 目标：让全部 107 款小游戏具备与「三维弹球」一致的质感。三个关键手段：
    //  ① 颜色算子 —— 由单一基色自动派生材质的「高光 / 暗部 / 描边」，
    //     各游戏不必再传一堆颜色参数，接口零改动即可升级
    //  ② 背景预渲染缓存 —— 每帧重建「渐变 + 微网格 + 暗角」很贵，
    //     按 (色+尺寸+锐度) 缓存成离屏位图复用，每帧只 drawImage
    //  ③ 分辨率感知 —— 离屏按 deviceScale 渲染，高分屏背景依然锐利
    gfx: {
        _cache: new Map(),
        MAX_CACHE: 48,

        // ---------- 颜色算子 ----------
        // 支持 #rgb / #rrggbb / rgb(a) 三种写法，其余原样返回由 canvas 兜底
        rgb(c) {
            if (typeof c !== 'string') return [0, 0, 0];
            c = c.trim();
            try {
                if (c[0] === '#') {
                    let h = c.slice(1);
                    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
                    const n = parseInt(h.slice(0, 6), 16);
                    if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
                }
                const m = c.match(/rgba?\(([^)]+)\)/);
                if (m) {
                    const p = m[1].split(',').map(parseFloat);
                    if (p.length >= 3 && p.every(v => !isNaN(v))) return [p[0], p[1], p[2]];
                }
            } catch (e) { }
            return [90, 100, 130];
        },
        // amt>0 提亮，amt<0 压暗（0~1）
        lighten(c, amt) {
            const [r, g, b] = this.rgb(c);
            const f = v => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
            return `rgb(${f(r)},${f(g)},${f(b)})`;
        },
        darken(c, amt) { return this.lighten(c, -Math.abs(amt)); },
        rgba(c, a) { const [r, g, b] = this.rgb(c); return `rgba(${r},${g},${b},${a})`; },

        // ---------- 质感背景（带缓存）----------
        // 内容：底色渐变 → 中心柔光 → 微网格 → 四角暗角 → 顶亮/底暗边
        scene(ctx, W, H, c1, c2) {
            const scale = ctx.__mgScale || 1;
            const key = `s|${c1}|${c2}|${W}x${H}|${scale.toFixed(2)}`;
            let img = this._cache.get(key);
            if (!img) {
                img = this._buildScene(W, H, c1, c2, scale);
                if (this._cache.size >= this.MAX_CACHE) {
                    // 简易 LRU：淘汰最早的一个
                    this._cache.delete(this._cache.keys().next().value);
                }
                this._cache.set(key, img);
            }
            ctx.drawImage(img, 0, 0, W, H);
        },
        _buildScene(W, H, c1, c2, scale) {
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(W * scale));
            cv.height = Math.max(1, Math.round(H * scale));
            const x = cv.getContext('2d');
            x.setTransform(scale, 0, 0, scale, 0, 0);
            // 1) 底色：垂直渐变
            let g = null;
            try { g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) { }
            x.fillStyle = g || c1; x.fillRect(0, 0, W, H);
            // 2) 中心柔光（让画面有主光源，不再是一片死板的渐变）
            try {
                const rg = x.createRadialGradient(W * 0.5, H * 0.34, 0, W * 0.5, H * 0.34, Math.max(W, H) * 0.72);
                rg.addColorStop(0, 'rgba(255,255,255,0.085)');
                rg.addColorStop(0.55, 'rgba(255,255,255,0.025)');
                rg.addColorStop(1, 'rgba(255,255,255,0)');
                x.fillStyle = rg; x.fillRect(0, 0, W, H);
            } catch (e) { }
            // 3) 微网格（提供「分辨率/精度感」，是非常廉价的高级感来源）
            const step = 26;
            x.strokeStyle = 'rgba(255,255,255,0.030)';
            x.lineWidth = 1;
            x.beginPath();
            for (let gx = step; gx < W; gx += step) { x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, H); }
            for (let gy = step; gy < H; gy += step) { x.moveTo(0, gy + 0.5); x.lineTo(W, gy + 0.5); }
            x.stroke();
            // 4) 暗角 vignette（把注意力收到中心）
            try {
                const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
                vg.addColorStop(0, 'rgba(0,0,0,0)');
                vg.addColorStop(1, 'rgba(0,0,0,0.34)');
                x.fillStyle = vg; x.fillRect(0, 0, W, H);
            } catch (e) { }
            // 5) 顶亮底暗：模拟面板的立体边框
            let tg = null;
            try { tg = x.createLinearGradient(0, 0, 0, 26); tg.addColorStop(0, 'rgba(255,255,255,0.20)'); tg.addColorStop(1, 'rgba(255,255,255,0)'); } catch (e) { }
            if (tg) { x.fillStyle = tg; x.fillRect(0, 0, W, 26); }
            let bg = null;
            try { bg = x.createLinearGradient(0, H - 30, 0, H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.26)'); } catch (e) { }
            if (bg) { x.fillStyle = bg; x.fillRect(0, H - 30, W, 30); }
            return cv;
        },

        // ---------- 立体面板 / 卡片 ----------
        // opt: { gloss:0.24 顶部高光强度, shadow:3 投影距离, edge:外描边色 }
        panel(ctx, x, y, w, h, c1, c2, r, opt) {
            opt = opt || {};
            r = r == null ? 10 : r;
            const rr = MG.ui.rr;
            const sd = opt.shadow == null ? 3 : opt.shadow;
            if (sd > 0) {
                // 双层投影：贴近的深影 + 扩散的淡影（比 shadowBlur 便宜且更可控）
                rr(ctx, x + 1, y + sd * 0.6, w - 2, h, r);
                ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
                rr(ctx, x + 2, y + sd, w - 4, h, r);
                ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fill();
            }
            // 主体
            rr(ctx, x, y, w, h, r);
            let g = null;
            try { g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) { }
            ctx.fillStyle = g || c1; ctx.fill();
            // 顶部高光条（塑料/玻璃的反光）
            ctx.save();
            rr(ctx, x + 2, y + 2, w - 4, Math.max(4, h * 0.42), Math.max(2, r * 0.7));
            ctx.clip();
            let hg = null;
            try {
                hg = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
                hg.addColorStop(0, `rgba(255,255,255,${opt.gloss == null ? 0.26 : opt.gloss})`);
                hg.addColorStop(1, 'rgba(255,255,255,0)');
            } catch (e) { }
            ctx.fillStyle = hg || 'transparent';
            ctx.fillRect(x, y, w, h * 0.5);
            ctx.restore();
            // 底部内反光（环境光反射）
            ctx.save();
            rr(ctx, x + 2, y + h * 0.62, w - 4, h * 0.36, Math.max(2, r * 0.6));
            ctx.clip();
            let bgb = null;
            try {
                bgb = ctx.createLinearGradient(0, y + h * 0.62, 0, y + h);
                bgb.addColorStop(0, 'rgba(255,255,255,0)');
                bgb.addColorStop(1, 'rgba(255,255,255,0.09)');
            } catch (e) { }
            ctx.fillStyle = bgb || 'transparent';
            ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
            ctx.restore();
            // 外描边：下深上浅，做出厚度
            rr(ctx, x, y, w, h, r);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = opt.edge || this.rgba(this.darken(c1, 0.42), 0.85);
            ctx.stroke();
            rr(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(1, r - 1));
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.stroke();
        },

        // ---------- 立体文字 ----------
        // opt: { glow:0 发光半径, stroke:true 是否描边, align:'center', weight:'bold', emoji:true }
        // emoji 会自动跳过描边/厚度（emoji 自带颜色，描边只会糊成一团）
        EMOJI_RE: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u,
        text(ctx, s, x, y, size, color, opt) {
            opt = opt || {};
            s = String(s == null ? '' : s);
            if (!s) return;
            const isEmoji = opt.emoji !== false && /\p{Extended_Pictographic}/u.test(s);
            const w = opt.weight || (opt.bold === false ? '' : 'bold');
            const font = opt.font || `"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif`;
            const align = opt.align || 'center';
            ctx.save();
            ctx.font = `${w} ${Math.round(size)}px ${font}`;
            ctx.textAlign = align;
            ctx.textBaseline = opt.baseline || 'middle';
            if (isEmoji) {
                ctx.fillStyle = color || '#fff';
                ctx.fillText(s, x, y);
                ctx.restore();
                return;
            }
            // 发光（先铺一层，再画主体）
            if (opt.glow) {
                ctx.shadowColor = opt.glowColor || color;
                ctx.shadowBlur = opt.glow;
            }
            const th = Math.max(1, size * 0.055);   // 厚度偏移
            // 1) 厚度：向下偏两层深色
            ctx.fillStyle = this.rgba(this.darken(color, 0.62), 0.55);
            ctx.fillText(s, x, y + th * 1.7);
            // 2) 描边隔开主体与背景，任何底色上都清晰
            if (opt.stroke !== false) {
                ctx.lineWidth = Math.max(1.2, size * 0.13);
                ctx.strokeStyle = this.rgba(this.darken(color, 0.68), 0.92);
                ctx.lineJoin = 'round';
                ctx.strokeText(s, x, y);
            }
            // 3) 主体
            ctx.fillStyle = color || '#fff';
            ctx.fillText(s, x, y);
            ctx.shadowBlur = 0;
            // 4) 顶部高光：主体色提亮后上移极小的量，形成弧面感
            ctx.fillStyle = this.rgba(this.lighten(color, 0.55), 0.5);
            ctx.fillText(s, x, y - Math.max(0.6, size * 0.045));
            ctx.restore();
        },
    },

    // ================= 音频引擎（Web Audio 实时合成，零音频文件、零依赖）=================
    // 设计：所有音色由振荡器/噪声缓冲实时合成，避免加载任何外部素材。
    // 浏览器要求「用户手势后才能出声」，故第一次发声前须调用 unlock()。
    audio: {
        ctx: null, master: null, muted: false, ready: false,
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
                node.connect(g); g.connect(this.master);
                osc.start(t0); osc.stop(t0 + dur + 0.03);
            } catch (e) { }
        },
        // 噪声（打击乐 / 机械声 / 风声）
        noise(o) {
            if (this.muted) return;
            const ctx = this.init(); if (!ctx) return;
            const dur = o.dur || 0.1;
            const t0 = ctx.currentTime + (o.delay || 0);
            try {
                const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                const decay = o.decay == null ? 1 : o.decay;
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter();
                f.type = o.type || 'bandpass';
                f.frequency.setValueAtTime(o.freq || 1200, t0);
                if (o.to) f.frequency.linearRampToValueAtTime(Math.max(20, o.to), t0 + dur);
                f.Q.value = o.q || 1.1;
                const g = ctx.createGain();
                g.gain.setValueAtTime(o.gain == null ? 0.18 : o.gain, t0);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                src.connect(f); f.connect(g); g.connect(this.master);
                src.start(t0); src.stop(t0 + dur + 0.03);
            } catch (e) { }
        },
        // 常用音效预设（弹球 / 通用）
        sfx(name) {
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
            };
            const f = P[name];
            if (f) { try { f(); } catch (e) { } }
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
                // 主旋律
                const n = S.lead[bar][b];
                if (n > 0) A.tone({ freq: this.mtof(n), dur: 0.14, type: 'square', gain: 0.075, delay: when });
                // 琶音（弱）
                if (b % 2 === 0) {
                    const ch = S.chords[bar];
                    const arp = ch[(b / 2) % ch.length];
                    A.tone({ freq: this.mtof(arp - 12), dur: 0.1, type: 'triangle', gain: 0.05, delay: when });
                }
                // 贝斯（每拍）
                if (b % 4 === 0) A.tone({ freq: this.mtof(S.bass[bar]), dur: 0.22, type: 'triangle', gain: 0.12, delay: when });
                // 鼓
                if (b === 0 || b === 8) A.tone({ freq: 150, to: 48, dur: 0.12, type: 'sine', gain: 0.2, delay: when });
                if (b === 4 || b === 12) A.noise({ dur: 0.11, freq: 1700, q: 0.7, gain: 0.1, delay: when });
                if (b % 2 === 0) A.noise({ dur: 0.03, freq: 7200, type: 'highpass', gain: 0.03, delay: when });
            },
        },
    },
    // 创建自适应 canvas（填满容器，HiDPI 锐化）
    //   逻辑坐标系 (w,h) 不变；底层 backing store = w * deviceScale 像素
    //   ctx.setTransform(deviceScale) 让游戏继续按 w,h 画，自动按 backing 倍数
    //   输出。设备像素比 + 容器放大倍数共同决定 deviceScale（封顶 3）。
    canvas(parent, w, h) {
        const c = document.createElement('canvas');
        c.style.maxWidth = '100%';
        c.style.maxHeight = '100%';
        c.style.touchAction = 'none';
        parent.innerHTML = '';
        parent.appendChild(c);
        const ctx = c.getContext('2d');
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        let deviceScale = dpr;          // 第一次 fit 之前先给个初值
        const applyTransform = () => ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
        const fit = () => {
            const pw = parent.clientWidth, ph = parent.clientHeight;
            const s = Math.min(pw / w, ph / h);
            c.style.width = (w * s) + 'px';
            c.style.height = (h * s) + 'px';
            // backing 像素 = 逻辑 * dpr * 显示放大，封顶 3（避免低端机过载）
            const target = Math.min(3, dpr * Math.max(1, s));
            if (Math.abs(target - deviceScale) > 0.05 || c.width !== Math.round(w * target)) {
                deviceScale = target;
                c.width = Math.round(w * deviceScale);
                c.height = Math.round(h * deviceScale);
                applyTransform();
            }
            // 暴露当前锐度倍率：MG.gfx 用它决定离屏缓存的分辨率，保证高分屏不糊
            ctx.__mgScale = deviceScale;
        };
        // 初次也走一次真正的 backing 设置（让位图级 font/lineWidth 不糊）
        fit();
        // 暴露给游戏在 viewport 变化后强制重排
        parent.__mgRefit = fit;
        window.addEventListener('resize', fit);
        return { c, ctx, w, h, fit, destroy() { window.removeEventListener('resize', fit); } };
    },
    // 简单按钮覆盖层
    overlay(parent, html) {
        const o = document.createElement('div');
        o.className = 'mg-overlay';
        o.innerHTML = html;
        parent.appendChild(o);
        return o;
    },
    hint(parent, text) {
        const h = document.createElement('div');
        h.className = 'mg-hint';
        h.textContent = text;
        parent.appendChild(h);
        return h;
    },
    // 触摸/鼠标统一事件
    bind(c, onTap, onMove) {
        const get = (e) => {
            const r = c.getBoundingClientRect();
            const sx = c.width / r.width, sy = c.height / r.height;
            const t = e.touches ? e.touches[0] : e;
            return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
        };
        c.addEventListener('mousedown', e => onTap(get(e)));
        c.addEventListener('mousemove', e => onMove && onMove(get(e)));
        c.addEventListener('touchstart', e => { e.preventDefault(); onTap(get(e)); }, { passive: false });
        c.addEventListener('touchmove', e => { e.preventDefault(); onMove && onMove(get(e)); }, { passive: false });
    },
    // 随机整数
    ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    // 圆形按钮
    btn(parent, text, onClick) {
        const b = document.createElement('button');
        b.className = 'mg-btn';
        b.textContent = text;
        b.onclick = onClick;
        parent.appendChild(b);
        return b;
    },

    // ================= 关卡进度系统（localStorage 持久化 + 服务器同步）=================
    PKEY: 'mg-progress-v1',
    progress() {
        try { return JSON.parse(localStorage.getItem(this.PKEY)) || {}; } catch (e) { return {}; }
    },
    saveProgress(p) { try { localStorage.setItem(this.PKEY, JSON.stringify(p)); } catch (e) {} },
    getGameProgress(gameId) {
        return this.progress()[gameId] || { unlocked: 1, stars: {} };
    },
    // 记录星级（取历史最高）并解锁下一关；level=0 表示无尽模式（只存 best）
    // 同时上报服务器（登录用户）：首通/升星发钻石金币奖励
    recordStars(gameId, level, stars) {
        const p = this.progress();
        const g = p[gameId] || { unlocked: 1, stars: {} };
        const old = g.stars[level] || 0;
        if (stars > old) g.stars[level] = stars;
        if (level > 0 && stars > 0 && level >= g.unlocked) g.unlocked = level + 1;
        p[gameId] = g;
        this.saveProgress(p);
        this.report(gameId, level, stars);
        return g;
    },
    totalStars(gameId) {
        const g = this.getGameProgress(gameId);
        return Object.values(g.stars).reduce((a, b) => a + b, 0);
    },

    // ---- 服务器进度/奖励（游客自动跳过，不影响单机体验）----
    report(gameId, level, stars) {
        const tk = localStorage.getItem('game-token');
        if (!tk || !(level > 0)) return;
        fetch('/api/minigame/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
            body: JSON.stringify({ game: gameId, level, stars }),
        }).then(r => r.ok ? r.json() : null).then(r => {
            if (r && r.reward && (r.reward.gems || r.reward.gold)) this.rewardToast(r.reward);
        }).catch(() => {});
    },
    // 登录后拉服务器进度，与本地合并（换设备不丢进度）
    sync() {
        const tk = localStorage.getItem('game-token');
        if (!tk) return Promise.resolve();
        return fetch('/api/minigame/progress', { headers: { 'Authorization': 'Bearer ' + tk } })
            .then(r => r.ok ? r.json() : null).then(r => {
                if (!r || !r.progress) return;
                const p = this.progress();
                Object.keys(r.progress).forEach(gid => {
                    const g = p[gid] || { unlocked: 1, stars: {} };
                    Object.keys(r.progress[gid]).forEach(lv => {
                        const st = (r.progress[gid][lv] || {}).stars || 0;
                        if (st > (g.stars[lv] || 0)) g.stars[lv] = st;
                        const n = parseInt(lv);
                        if (n > 0 && st > 0 && n >= g.unlocked) g.unlocked = n + 1;
                    });
                    p[gid] = g;
                });
                this.saveProgress(p);
            }).catch(() => {});
    },
    // 闯关奖励浮层 + 顶栏资源即时刷新
    rewardToast(reward) {
        try {
            if (window.App && App.user && App.user.state) {
                const r = App.user.state.resources || (App.user.state.resources = {});
                r.gems = (r.gems || 0) + (reward.gems || 0);
                r.gold = (r.gold || 0) + (reward.gold || 0);
                App.refresh();
            }
        } catch (e) {}
        try {
            const d = document.createElement('div');
            d.className = 'mg-reward-toast';
            d.innerHTML = `<div class="mg-rt-title">🎉 小游戏闯关奖励</div>
                <div class="mg-rt-body">💎 +${reward.gems || 0}　💰 +${reward.gold || 0}</div>`;
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 2700);
        } catch (e) {}
    },

    // ================= 关卡数扩展 =================
    // 把任意游戏的关卡列表扩到 N（默认 50）。少于 N 的用引擎名池（场景/品级/能力三套池）
    // 顺延补足，确保所有游戏统一 50 关（暗棋除外，沿用 DOS 原版 15 关）
    // 从关卡自身携带的参数推导难度说明（cols/rows/target/moves/time/score/holes/need 等）——用于选关页 desc
    fmtLevelDesc(l) {
        if (!l || typeof l !== 'object') return '';
        const L = {
            cols: '列', rows: '行', w: '宽', h: '高', size: '尺寸',
            target: '目标', goal: '目标', score: '目标分',
            speed: '速度', spd: '速度', rate: '频率',
            time: '限时', sec: '限时',
            need: '需', n: '阶', max: '上限', moves: '步数',
            holes: '挖空', ships: '船', shots: '炮',
            draws: '发牌', rounds: '轮', deals: '局',
            len: '长度', cnt: '数量', wind: '风力', arrows: '箭',
            gap: '间隙', tickets: '券', hp: '血量', gens: '代',
            clicks: '点击', tilt: '倾角', fuel: '燃料', grow: '生长',
            omega: 'Ω', knives: '刀', baseLen: '长度',
            types: '种类', count: '数量', mis: '失误率', mistakes: '容错',
        };
        const parts = [];
        for (const key in l) {
            if (key === 'name' || key === 'desc') continue;
            const v = l[key];
            if (v == null || typeof v === 'object') continue;
            if (key === 'cols' && l.rows != null) { parts.push(v + '×' + l.rows); continue; }
            if (key === 'rows' || key === 'h') continue; // 与 cols/w 合并显示
            if (key === 'w' && l.h != null) { parts.push(v + '×' + l.h); continue; }
            const label = L[key];
            if (label) parts.push(label + ' ' + v);
        }
        return parts.join(' · ');
    },
    fillLevels(levels, want) {
        want = want || 50;
        // 先把原始关卡的 desc 补齐：若关卡本身带参数（cols/rows/target/...），自动推导难度说明
        const src = (levels || []).map(l => {
            const o = Object.assign({}, l);
            if (!o.desc) o.desc = this.fmtLevelDesc(o);
            return o;
        });
        if (src.length >= want) return src.slice(0, want);
        // 三套名池：场景 / 品级 / 阶段。合并后整体去重，得到一份唯一的名字序列，
        // 再顺序取用补足到 50 关。这样每关名字都唯一、不会相邻撞名，也不会与原始关卡名重复。
        const POOLS = [
            // 池 0 · 场景
            ['启程','微风','林间','溪畔','山谷','云端','雷雨','霜降','雪原','荒漠',
             '幽谷','熔岩','深渊','星海','幻境','苍穹','混沌','鸿蒙','太虚','归墟',
             '迷踪','雾隐','断崖','石门','古道','驿亭','海角','天涯','昆仑','蓬莱',
             '桃源','峨眉','五岳','沧澜','瀚海','冰原','火山','雷泽','风谷','龙窟',
             '凤巢','麒麟崖','盘丝洞','万妖殿','九霄','天宫','瑶池','凌霄宝殿','紫霄','碧落',
             '化境','绝顶','通天','御虚','破界','入圣','不灭','永劫','归元','神化'],
            // 池 1 · 品级
            ['青铜','黑铁','白板','新秀','好手','劲敌','强敌','精英','骁将','统领',
             '元帅','霸主','王者','传说','史诗','不朽','至尊','神话','永恒','归真',
             '精钢','寒铁','陨铁','玄铁','星辰','皓月','耀阳','璀璨','辉金','赤霄',
             '青冥','紫电','白金','墨玉','翡翠','玛瑙','琥珀','琉璃','玄晶','紫金',
             '赤金','耀金','天金','圣金','太一','无瑕','无垢','霸者','绝响','傲视',
             '破晓','风暴','雷霆','烈火','寒冰','圣光','明辉','暗曜','玄黄','鸿钧'],
            // 池 2 · 阶段
            ['初见','学步','小试','渐入','熟手','巧思','妙手','连击','进阶','高手',
             '精通','险境','绝境','大师','宗师','传奇','无双','至尊','神话','王者',
             '暗影','轮回','涅槃','归一','太初','无极','登堂','入室','观海','凌云',
             '穿云','裂石','开山','辟地','观星','摘星','踏浪','逐日','奔月','御风',
             '乘雷','破军','定海','镇岳','洞玄','知微','若谷','麒麟','玄武','朱雀',
             '白虎','青龙','破晓','惊蛰','清明','夏至','秋分','冬至','长夜','黎明'],
        ];
        // 合并三池、去重，得到唯一的名字序列（180 → 约 176 个不重复）
        const ALL = [];
        const seen = new Set();
        for (const pool of POOLS) for (const n of pool) {
            if (!seen.has(n)) { seen.add(n); ALL.push(n); }
        }
        // 原始关卡名也视为已占用，避免补足的名字和游戏自带关卡名撞车
        const used = new Set(src.map(l => (l && l.name) || '').filter(Boolean));
        const out = src.slice();
        let k = 0;
        while (out.length < want) {
            let name = null;
            while (k < ALL.length) {
                if (!used.has(ALL[k])) { name = ALL[k]; k++; break; }
                k++;
            }
            if (name === null) name = '第 ' + (out.length + 1) + ' 关';
            used.add(name);
            const last = src[src.length - 1] || {};
            out.push({ name, desc: last.desc || '' });
        }
        return out;
    },

    // ================= 关卡选择界面 =================
    // cfg: { game, title, levels:[{name,desc}], onStart(idx, lv), extra:[{label,onClick}] }
    levelSelect(container, cfg) {
        const p = this.getGameProgress(cfg.game);
        container.innerHTML = '';
        // 关卡数统一扩展到 50：少于 50 的用引擎名池补足（保持原 1..N 难度曲线，N+1..50 顺延）
        // 暗棋（banqi）例外：沿用 DOS 原版 15 关，不做扩展
        const wantLv = cfg.game === 'banqi' ? 15 : 50;
        const fullLevels = MG.fillLevels(cfg.levels, wantLv);
        cfg = Object.assign({}, cfg, { levels: fullLevels });
        const wrap = document.createElement('div');
        wrap.className = 'mg-levelsel';
        const total = Object.values(p.stars).reduce((a, b) => a + b, 0);
        const maxTotal = fullLevels.length * 3;
        wrap.innerHTML = `<div class="mg-ls-title">${cfg.title}
            <span class="mg-ls-total">⭐ ${total}/${maxTotal}</span></div>`;
        // 排行榜条
        const rankBar = document.createElement('div');
        rankBar.className = 'mg-rank-bar';
        rankBar.innerHTML = `<span>🏆 本游戏榜单</span><button data-act="rank">查看 TOP 20</button>`;
        rankBar.querySelector('button').onclick = () => MG.showRank(cfg.game, cfg.title);
        wrap.appendChild(rankBar);
        const grid = document.createElement('div');
        grid.className = 'mg-ls-grid';
        cfg.levels.forEach((lv, idx) => {
            const n = idx + 1;
            const locked = n > p.unlocked;
            const st = p.stars[n] || 0;
            const el = document.createElement('div');
            el.className = 'mg-ls-cell' + (locked ? ' locked' : (st > 0 ? ' done' : ''));
            el.innerHTML = `<div class="mg-ls-num">${locked ? '🔒' : n}</div>
                <div class="mg-ls-name">${lv.name || ''}</div>
                <div class="mg-ls-desc" title="${lv.desc || ''}">${lv.desc || ''}</div>
                <div class="mg-ls-stars">${'★'.repeat(st)}<span>${'☆'.repeat(3 - st)}</span></div>`;
            if (!locked) el.onclick = () => { wrap.remove(); cfg.onStart(idx, lv); };
            grid.appendChild(el);
        });
        wrap.appendChild(grid);
        (cfg.extra || []).forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'mg-btn mg-ls-extra';
            btn.textContent = b.label;
            btn.onclick = () => { wrap.remove(); b.onClick(); };
            wrap.appendChild(btn);
        });
        container.appendChild(wrap);
    },

    // ================= 结算弹窗 =================
    // cfg: {win, title, stars, lines:[], onRetry, onNext, hasNext}
    result(container, cfg) {
        const o = document.createElement('div');
        o.className = 'mg-result';
        o.innerHTML = `
            <div class="mg-result-card">
                <div class="mg-result-title">${cfg.title || (cfg.win ? '🏆 胜利！' : '💥 失败')}</div>
                ${cfg.stars != null ? `<div class="mg-result-stars">${'<i>★</i>'.repeat(cfg.stars)}${'<i class="off">☆</i>'.repeat(3 - cfg.stars)}</div>` : ''}
                <div class="mg-result-lines">${(cfg.lines || []).map(l => `<div>${l}</div>`).join('')}</div>
                <div class="mg-result-btns">
                    <button class="mg-btn" data-a="retry">↻ 重试</button>
                    ${cfg.hasNext ? '<button class="mg-btn primary" data-a="next">下一关 ›</button>' : ''}
                    ${cfg.hasBack ? '<button class="mg-btn" data-a="back">选关</button>' : ''}
                </div>
            </div>`;
        container.appendChild(o);
        o.querySelector('[data-a=retry]').onclick = () => { o.remove(); cfg.onRetry && cfg.onRetry(); };
        const nb = o.querySelector('[data-a=next]');
        if (nb) nb.onclick = () => { o.remove(); cfg.onNext && cfg.onNext(); };
        const bb = o.querySelector('[data-a=back]');
        if (bb) bb.onclick = () => { o.remove(); cfg.onBack && cfg.onBack(); };
        return o;
    },

    // ================= 猜拳定先手（暗棋圣手）=================
    rps(container, cb) {
        const opts = [['✊', '石头'], ['✌️', '剪刀'], ['✋', '布']];
        const o = document.createElement('div');
        o.className = 'mg-result';
        o.innerHTML = `<div class="mg-result-card">
            <div class="mg-result-title">猜拳定先手</div>
            <div class="mg-result-lines"><div id="mg-rps-ai">电脑：❓</div><div id="mg-rps-msg">请选择你的手势</div></div>
            <div class="mg-rps-btns">${opts.map((o2, i) => `<button class="mg-btn" data-i="${i}">${o2[0]}<br>${o2[1]}</button>`).join('')}</div>
        </div>`;
        container.appendChild(o);
        o.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
            const mine = +b.dataset.i, ai = MG.ri(0, 2);
            o.querySelector('#mg-rps-ai').textContent = '电脑：' + opts[ai][0] + ' ' + opts[ai][1];
            const msgEl = o.querySelector('#mg-rps-msg');
            const d = (mine - ai + 3) % 3;
            if (d === 0) { msgEl.textContent = '平局！再猜一次'; return; }
            msgEl.textContent = d === 1 ? '你赢了 → 你先行' : '电脑赢了 → 电脑先行';
            setTimeout(() => { o.remove(); cb(d === 1 ? 'player' : 'ai'); }, 800);
        });
    },

    // ================= 排行榜（调用 /api/minigame/rank 渲染 TOP 20）=================
    async showRank(gameId, title) {
        let data = { list: [] };
        try {
            const tk = localStorage.getItem('game-token');
            const r = await fetch('/api/minigame/rank?game=' + encodeURIComponent(gameId), tk ? { headers: { 'Authorization': 'Bearer ' + tk } } : {});
            data = await r.json();
        } catch (e) { data = { list: [] }; }
        const html = `<h3>🏆 ${title || gameId} · 榜单 TOP 20</h3>
            <div style="max-height:380px;overflow:auto;margin-top:8px">
            ${data.list.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse">
                <tr style="color:#ffd56b;border-bottom:1px solid #555"><th style="padding:4px;text-align:left">#</th><th style="text-align:left">玩家</th><th style="text-align:right">积分</th></tr>
                ${data.list.map((x, i) => `<tr style="border-bottom:1px solid #2a3450"><td style="padding:5px;color:${i < 3 ? '#ffd56b' : '#7a90d8'};font-weight:bold">${x.rank}</td><td>${x.isAdmin ? '👑 ' : ''}${x.nickname || ''}</td><td style="text-align:right;color:#5cc7ff;font-weight:bold">${x.score}</td></tr>`).join('')}
                </table>` : '<p style="color:#7a90d8;padding:30px;text-align:center">还没人上榜，快来当第一名！</p>'}
            </div>
            <div class="modal-actions" style="margin-top:10px"><button class="btn" onclick="U.closeModal()">关闭</button></div>`;
        U.openModal(html);
    },
    // 上报分数（通关或无尽结算后调用）
    reportScore(gameId, score) {
        const tk = localStorage.getItem('game-token');
        if (!tk || !Number.isFinite(score)) return Promise.resolve(null);
        return fetch('/api/minigame/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
            body: JSON.stringify({ game: gameId, score: Math.floor(score) }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);
    },
    // 拉取后台设置的排序；玩家端按此顺序渲染 GAMES
    async fetchOrder() {
        try {
            const r = await fetch('/api/minigame/order');
            if (!r.ok) return [];
            const d = await r.json();
            return d.order || [];
        } catch (e) { return []; }
    },

    // ================= 统一游戏关卡化框架 =================
    // 流程：levelSelect → 选关 → start → 完成 → result(星级) → 重试/下一关/选关
    //  cfg: {
    //    id, title, levels:[{name, desc, ...任意游戏参数}],
    //    start(container, opts, level) => instance{stop()},
    //    scoreEl?,           // 顶栏 score 元素（实时分数显示）
    //    onScore?,           // (text) => void 自定义实时分数处理
    //  }
    //  游戏内部结束调 opts.onComplete({win, stars, lines, score})
    runGame(container, cfg) {
        const self = this;
        let current = null;  // 当前 instance
        const clearCurrent = () => {
            try { current && current.stop && current.stop(); } catch (e) {}
            current = null;
            container.innerHTML = '';
        };
        const showLevels = () => {
            clearCurrent();
            // 无尽模式：不需要解锁任何关卡，直接可玩
            const extra = [];
            if (cfg.endless) {
                extra.push({
                    label: '∞ 无尽模式（无需解锁，直接玩）',
                    onClick: () => runLevel(-1, Object.assign({ name: '无尽', desc: '无限玩 · 失败为止' }, cfg.endless)),
                });
            }
            this.levelSelect(container, {
                game: cfg.id,
                title: cfg.title,
                levels: cfg.levels,
                extra,
                onStart: (idx, lv) => runLevel(idx, lv),
            });
        };
        const runLevel = (idx, lv) => {
            clearCurrent();
            const scoreEl = cfg.scoreEl || null;
            const onScore = cfg.onScore || (scoreEl ? (s => scoreEl.textContent = s != null ? s : '') : null);
            const endless = idx < 0;
            current = cfg.start(container, {
                level: lv,
                levelIdx: idx,
                endless,
                totalLevels: cfg.levels.length,
                onScore,
                onComplete: result => {
                    clearCurrent();
                    const stars = result.stars || 0;
                    if (!endless) this.recordStars(cfg.id, idx + 1, stars);
                    else this.setBest(cfg.id, result.score || 0);
                    // 上报排行榜（仅登录用户；分数取关卡星 ×100 或无尽分）
                    const score = endless ? (result.score || 0) : stars * 100 + (idx + 1) * 50;
                    try { MG.reportScore(cfg.id, score); } catch (e) {}
                    this.result(container, {
                        win: !!result.win,
                        title: result.title || (result.win ? '🏆 胜利！' : '💥 失败'),
                        stars: endless ? null : stars,
                        lines: (result.lines || []).concat(endless && this.getBest(cfg.id) ? [`🏅 历史最高 ${this.getBest(cfg.id)}`] : []),
                        hasNext: !endless && idx < cfg.levels.length - 1,
                        hasBack: true,
                        onRetry: () => runLevel(idx, lv),
                        onNext: () => idx + 1 < cfg.levels.length && runLevel(idx + 1, cfg.levels[idx + 1]),
                        onBack: showLevels,
                    });
                },
            }, lv);
        };
        showLevels();
        return { stop() { clearCurrent(); } };
    },
    // 无尽模式最高分（localStorage）
    bestKey(id) { return 'mg-best-' + id; },
    getBest(id) { try { return +(localStorage.getItem(this.bestKey(id)) || 0); } catch (e) { return 0; } },
    setBest(id, v) {
        if (v > this.getBest(id)) { try { localStorage.setItem(this.bestKey(id), String(v)); } catch (e) {} }
        return this.getBest(id);
    },
};
window.MG = MG;
