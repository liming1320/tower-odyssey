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
        // 命中时刷新到队尾（维持严格 LRU 顺序，避免高频场景被新键挤掉）；达到上限淘汰队首
        scene(ctx, W, H, c1, c2) {
            const scale = ctx.__mgScale || 1;
            const key = `s|${c1}|${c2}|${W}x${H}|${scale.toFixed(2)}`;
            let img = this._cache.get(key);
            if (img) { this._cache.delete(key); this._cache.set(key, img); return ctx.drawImage(img, 0, 0, W, H); }
            img = this._buildScene(W, H, c1, c2, scale);
            if (this._cache.size >= this.MAX_CACHE) this._cache.delete(this._cache.keys().next().value);
            this._cache.set(key, img);
            ctx.drawImage(img, 0, 0, W, H);
        },
        // 手动清理缓存（切后台 / 大量换肤 / 内存紧张时调用）
        clearCache() { this._cache.clear(); },
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

        // ---------- 木纹棋盘纹理（带缓存）----------
        // 内容：木色渐变 → 横向/纵向年轮纹路 → 节疤暗斑 → 顶亮底暗边 → 中心柔光
        // 用法：MG.gfx.wood(ctx, x, y, w, h, c1='#e8c088', c2='#c09458', seed=42)
        //   - seed 决定节疤位置（不同棋盘换 seed 看起来不会重复）
        //   - 象棋 / 五子棋 / 围棋 / 跳棋 等一切"木质棋盘"游戏都直接调用
        wood(ctx, x, y, W, H, c1, c2, seed) {
            c1 = c1 || '#e8c088'; c2 = c2 || '#c09458';
            seed = seed || 42;
            const scale = ctx.__mgScale || 1;
            const key = `w|${c1}|${c2}|${Math.round(W)}x${Math.round(H)}|${seed}|${scale.toFixed(2)}`;
            let img = this._cache.get(key);
            if (!img) {
                img = this._buildWood(x, y, W, H, c1, c2, seed, scale);
                if (this._cache.size >= this.MAX_CACHE) this._cache.delete(this._cache.keys().next().value);
                this._cache.set(key, img);
            }
            ctx.drawImage(img, x, y, W, H);
        },
        _buildWood(x, y, W, H, c1, c2, seed, scale) {
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(W * scale));
            cv.height = Math.max(1, Math.round(H * scale));
            const t = cv.getContext('2d');
            t.setTransform(scale, 0, 0, scale, 0, 0);
            // 1) 底色：对角渐变（让光从左上斜照下来）
            let g = null;
            try { g = t.createLinearGradient(x, y, x + W, y + H); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) {}
            t.fillStyle = g || c1; t.fillRect(x, y, W, H);
            // 2) 中心柔光（提亮中央，让细节看得清）
            try {
                const rg = t.createRadialGradient(x + W * 0.5, y + H * 0.4, 0, x + W * 0.5, y + H * 0.4, Math.max(W, H) * 0.65);
                rg.addColorStop(0, 'rgba(255,240,200,0.18)');
                rg.addColorStop(0.6, 'rgba(255,240,200,0.05)');
                rg.addColorStop(1, 'rgba(255,240,200,0)');
                t.fillStyle = rg; t.fillRect(x, y, W, H);
            } catch (e) {}
            // 3) 横向年轮纹路（细密深色横线 + 偶发粗纹）
            const rng = this._seedRng(seed);
            const lineCount = Math.max(8, Math.round(H / 9));
            for (let i = 0; i < lineCount; i++) {
                const yy = y + (i + 0.5) * (H / lineCount) + (rng() - 0.5) * 2;
                const dark = 0.04 + rng() * 0.10;
                const wavy = Math.sin((i * 0.7) + rng() * 6) * 1.5;
                t.strokeStyle = `rgba(90,55,20,${dark.toFixed(3)})`;
                t.lineWidth = 0.6 + rng() * 1.0;
                t.beginPath();
                for (let xx = x; xx <= x + W; xx += 6) {
                    const yo = yy + Math.sin(xx * 0.025 + i) * 1.4 + wavy;
                    if (xx === x) t.moveTo(xx, yo); else t.lineTo(xx, yo);
                }
                t.stroke();
            }
            // 4) 节疤暗斑（少量随机深色椭圆，模拟木结）
            const knotCount = 2 + Math.floor(rng() * 3);
            for (let k = 0; k < knotCount; k++) {
                const kx = x + W * (0.15 + rng() * 0.7);
                const ky = y + H * (0.15 + rng() * 0.7);
                const r = 4 + rng() * 9;
                const kg = t.createRadialGradient(kx, ky, 0, kx, ky, r);
                kg.addColorStop(0, 'rgba(70,40,15,0.32)');
                kg.addColorStop(0.7, 'rgba(70,40,15,0.08)');
                kg.addColorStop(1, 'rgba(70,40,15,0)');
                t.fillStyle = kg; t.beginPath(); t.ellipse(kx, ky, r * 1.2, r * 0.7, rng() * Math.PI, 0, Math.PI * 2); t.fill();
            }
            // 5) 顶部亮边（受光面）+ 底部暗边（背光面）= 立体边框
            let tg = null;
            try { tg = t.createLinearGradient(x, y, x, y + 14); tg.addColorStop(0, 'rgba(255,255,255,0.28)'); tg.addColorStop(1, 'rgba(255,255,255,0)'); } catch (e) {}
            if (tg) { t.fillStyle = tg; t.fillRect(x, y, W, 14); }
            let bg = null;
            try { bg = t.createLinearGradient(x, y + H - 18, x, y + H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.30)'); } catch (e) {}
            if (bg) { t.fillStyle = bg; t.fillRect(x, y + H - 18, W, 18); }
            return cv;
        },
        // 简易确定性 RNG（mulberry32），木纹节疤位置复现用
        _seedRng(seed) {
            let s = seed | 0;
            return function () {
                s = (s + 0x6D2B79F5) | 0;
                let t = Math.imul(s ^ (s >>> 15), 1 | s);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        },

        // ---------- 发光精灵（离屏缓存，弹幕/火花/特效通用）----------
        // 用法：MG.gfx.glow(ctx, x, y, r, '#ffd56b', { a:.8 })
        // 按 (色+r+锐度) 缓存成离屏位图，每帧只 drawImage，支持同屏数百发光体不卡。
        glow(ctx, x, y, r, color, opt) {
            opt = opt || {};
            const scale = (ctx && ctx.__mgScale) || 1;
            const rr = Math.max(2, Math.round(r));
            const key = 'g|' + color + '|' + rr + '|' + scale.toFixed(2);
            let img = this._cache.get(key);
            if (!img) {
                const cv = document.createElement('canvas');
                cv.width = cv.height = Math.max(1, Math.round(rr * 2 * scale));
                const xc = cv.getContext('2d');
                const cx = rr * scale;
                const g = xc.createRadialGradient(cx, cx, 0, cx, cx, cx);
                g.addColorStop(0, this.rgba(color, 0.95));
                g.addColorStop(0.35, this.rgba(color, 0.4));
                g.addColorStop(1, this.rgba(color, 0));
                xc.fillStyle = g; xc.fillRect(0, 0, cv.width, cv.height);
                img = cv;
                this._cache.set(key, img);
                if (this._cache.size >= this.MAX_CACHE) this._cache.delete(this._cache.keys().next().value);
            }
            ctx.drawImage(img, x - rr, y - rr, rr * 2, rr * 2);
        },

        // ---------- 血条 / 进度条（圆角 + 渐变填充 + 描边 + 可选数值）----------
        // 用法：MG.gfx.bar(ctx, x, y, w, h, ratio, { color:'#7ad86a', back:true, text:'12/20', lw:1.5 })
        // color 可传函数(ratio)->色，或自动按 ratio 三档（绿/黄/红）。
        bar(ctx, x, y, w, h, ratio, opt) {
            opt = opt || {};
            ratio = Math.max(0, Math.min(1, ratio == null ? 0 : ratio));
            const r = opt.r != null ? opt.r : Math.min(h / 2, 5);
            if (opt.back !== false) {
                MG.ui.rr(ctx, x, y, w, h, r);
                ctx.fillStyle = opt.backColor || 'rgba(0,0,0,0.45)'; ctx.fill();
            }
            const fw = Math.max(0, w * ratio);
            if (fw > 0.5) {
                ctx.save();
                MG.ui.rr(ctx, x, y, w, h, r); ctx.clip();
                let col = opt.color;
                if (typeof col === 'function') col = col(ratio);
                if (!col) col = ratio > 0.5 ? '#7ad86a' : (ratio > 0.25 ? '#ffd56b' : '#ff7a8b');
                let g = null;
                try { g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, this.lighten(col, 0.28)); g.addColorStop(1, this.darken(col, 0.18)); } catch (e) { }
                ctx.fillStyle = g || col; ctx.fillRect(x, y, fw, h);
                // 顶部高光
                ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, fw, Math.max(1, h * 0.32));
                ctx.restore();
            }
            MG.ui.rr(ctx, x, y, w, h, r);
            ctx.lineWidth = opt.lw || 1.2; ctx.strokeStyle = opt.border || 'rgba(255,255,255,0.4)'; ctx.stroke();
            if (opt.text) {
                ctx.fillStyle = opt.textColor || '#fff';
                ctx.font = 'bold ' + Math.round(h * 0.92) + 'px "Microsoft YaHei",sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(opt.text, x + w / 2, y + h / 2 + 0.5);
            }
        },
    },

    // ================= 粒子系统（零依赖，纯 Canvas 2D 对象池）=================
    // 每个游戏实例一个池（E.game 自动创建并挂到 api.fx），stop() 时自动清空，不串场。
    // 用法：
    //   fx.burst(x, y, { n:16, colors:[...], speed:120, life:.6, shape:'spark', angle:-1.57, spread:1.2 })
    //   fx.text(x, y, '+100', { color:'#ffd56b', size:20 })      飘分/连击/提示
    //   fx.ring(x, y, { r:48, color:'#ffd56b', lw:3 })           冲击波
    // shape: dot(圆) | spark(拖尾火星) | square / confetti(旋转矩形) | ring | text
    fxPool(max) {
        const ps = [];
        const CAP = max || 360;
        const TAU = Math.PI * 2;
        const api = {
            list: ps,
            _flash: null,    // 全屏闪屏叠加 { color, amt, t, dur }
            _hs: 0,          // 顿帧剩余秒数（命中/爆炸时冻结画面）
            get count() { return ps.length; },
            clear() { ps.length = 0; this._flash = null; this._hs = 0; return this; },
            // 全屏闪屏：color 闪光色，amt 0~1 强度，dur 秒
            flash(color, amt, dur, opt) {
                this._flash = { color: color || '#fff', amt: amt == null ? 0.55 : amt, t: 0, dur: dur || 0.26 };
                return this;
            },
            // 顿帧（打击感）：ms 毫秒内冻结 tick（粒子/相机仍推进，闪屏仍播）
            hitstop(ms) { this._hs = Math.max(this._hs, (ms || 0) / 1000); return this; },
            // 运动拖尾：在 (x,y) 留一颗会淡出的小光点，连成尾迹
            trail(x, y, o) {
                o = o || {};
                this.burst(x, y, {
                    n: 1, r: o.r || 3, colors: [o.color || '#fff'],
                    speed: o.speed != null ? o.speed : 0, life: o.life || 0.3, g: 0, drag: 1,
                    shape: 'dot', glow: o.glow !== false,
                });
                return this;
            },
            burst(x, y, o) {
                o = o || {};
                const n = Math.min(o.n != null ? o.n : 14, CAP - ps.length);
                const cs = o.colors || ['#ffd56b', '#ff9d5c', '#ff7a8b', '#fff3c4'];
                const ang = o.angle, spread = o.spread != null ? o.spread : TAU;
                for (let i = 0; i < n; i++) {
                    const a = (ang != null ? ang + (Math.random() - 0.5) * spread : Math.random() * TAU);
                    const sp = (o.speed != null ? o.speed : 110) * (0.35 + Math.random() * 0.95);
                    const life = (o.life != null ? o.life : 0.55) * (0.65 + Math.random() * 0.7);
                    ps.push({
                        k: o.shape || 'dot', x, y,
                        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                        g: o.g != null ? o.g : 240,
                        drag: o.drag != null ? o.drag : 0.965,
                        r: (o.r != null ? o.r : 4) * (0.55 + Math.random() * 0.9),
                        c: cs[(Math.random() * cs.length) | 0],
                        t: 0, life,
                        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
                        glow: !!o.glow,
                    });
                }
                return this;
            },
            text(x, y, s, o) {
                o = o || {};
                if (ps.length >= CAP) return this;
                ps.push({
                    k: 'text', x, y, s: String(s),
                    vx: o.vx || 0, vy: o.vy != null ? o.vy : -46,
                    g: o.g != null ? o.g : 34, drag: 1,
                    c: o.color || '#ffd56b', size: o.size || 20, bold: o.bold !== false,
                    t: 0, life: o.life != null ? o.life : 0.9,
                    r: 0, rot: 0, vr: 0, glow: o.glow !== false,
                });
                return this;
            },
            ring(x, y, o) {
                o = o || {};
                if (ps.length >= CAP) return this;
                ps.push({
                    k: 'ring', x, y,
                    vx: 0, vy: 0, g: 0, drag: 1,
                    r: o.r0 != null ? o.r0 : 4, r1: o.r1 != null ? o.r1 : (o.r != null ? o.r : 46),
                    lw: o.lw || 3, c: o.color || '#ffd56b',
                    t: 0, life: o.life != null ? o.life : 0.36,
                    rot: 0, vr: 0, glow: o.glow !== false,
                });
                return this;
            },
            update(dt) {
                if (this._flash) {
                    this._flash.t += dt;
                    if (this._flash.t >= this._flash.dur) this._flash = null;
                }
                for (let i = ps.length - 1; i >= 0; i--) {
                    const p = ps[i];
                    p.t += dt;
                    if (p.t >= p.life) { ps.splice(i, 1); continue; }
                    if (p.k === 'ring') continue;
                    p.vy += p.g * dt;
                    if (p.drag !== 1) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.rot += p.vr * dt;
                }
                return this;
            },
            draw(ctx, W, H) {
                if (!ps.length && !this._flash) return this;
                ctx.save();
                ctx.lineCap = 'round';
                // 全屏闪屏（叠加在粒子之上，命中/爆炸反馈）
                if (this._flash && W) {
                    const k = 1 - this._flash.t / this._flash.dur;
                    ctx.globalAlpha = Math.max(0, this._flash.amt * k * k);
                    ctx.fillStyle = this._flash.color;
                    ctx.fillRect(0, 0, W, H);
                    ctx.globalAlpha = 1;
                }
                for (let i = 0; i < ps.length; i++) {
                    const p = ps[i];
                    const k = p.t / p.life;
                    const a = Math.max(0, 1 - k * k);
                    if (p.k === 'text') {
                        ctx.globalAlpha = a;
                        ctx.font = (p.bold ? 'bold ' : '') + p.size + 'px ' + (MG.ui.EMOJI_FONT || 'sans-serif');
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; }
                        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
                        ctx.strokeText(p.s, p.x, p.y);
                        ctx.fillStyle = p.c; ctx.fillText(p.s, p.x, p.y);
                        ctx.shadowBlur = 0;
                        continue;
                    }
                    if (p.k === 'ring') {
                        const r = p.r + (p.r1 - p.r) * (1 - Math.pow(1 - k, 2));
                        ctx.globalAlpha = a;
                        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.5, p.lw * (1 - k * 0.6));
                        if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 10; }
                        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
                        ctx.shadowBlur = 0;
                        continue;
                    }
                    ctx.globalAlpha = a;
                    if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; }
                    if (p.k === 'spark') {
                        const sp = Math.hypot(p.vx, p.vy) || 1;
                        const L = Math.min(18, sp * 0.05) * (1 - k * 0.5);
                        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.6, p.r * 0.9);
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x - p.vx / sp * L, p.y - p.vy / sp * L);
                        ctx.stroke();
                    } else if (p.k === 'square' || p.k === 'confetti') {
                        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                        const s = p.r * (1 - k * 0.35);
                        ctx.fillStyle = p.c;
                        ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
                        ctx.restore();
                    } else {
                        ctx.fillStyle = p.c;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, Math.max(0.4, p.r * (1 - k * 0.55)), 0, TAU);
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
                return this;
            },
        };
        return api;
    },

    // ================= 缓动补间（Tween）=================
    // 用法：
    //   MG.tw.to(obj, { x: 100, y: 20 }, 0.3, { ease:'outBack', onDone(){} })
    //   MG.tw.add({ dur:.4, ease:'outCubic', delay:.1, onUpdate(v){}, onDone(){} })
    // E.game 每帧自动 update(dt)；stop 时 clear()，不留残留。
    // 缓动补间：做成「工厂」而非单例，让每个游戏实例持有独立 pool，
    // 避免全局 MG.tw.list 跨游戏残留、stop() 后还在改旧状态对象（见 issue #4）。
    makeTweenPool() {
        const list = [];
        const EASE = {
            linear: t => t,
            inQuad: t => t * t,
            outQuad: t => t * (2 - t),
            inOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            outCubic: t => 1 - Math.pow(1 - t, 3),
            inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
            outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
            outElastic: t => { const c4 = Math.PI * 2 / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
            outBounce: t => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375; return n1 * (t -= 2.625 / d1) * t + .984375; },
        };
        return {
            EASE, list,
            add(o) {
                o = o || {};
                const it = { t: 0, dur: o.dur != null ? o.dur : 0.3, ease: typeof o.ease === 'function' ? o.ease : (EASE[o.ease] || EASE.outCubic), onUpdate: o.onUpdate, onDone: o.onDone, delay: o.delay || 0 };
                list.push(it);
                return it;
            },
            to(target, props, dur, o) {
                o = o || {};
                const keys = Object.keys(props), from = {};
                keys.forEach(k => { from[k] = target[k] || 0; });
                return this.add({ dur, ease: o.ease || 'outCubic', delay: o.delay, onUpdate: (v) => { for (let i = 0; i < keys.length; i++) { const k = keys[i]; target[k] = from[k] + (props[k] - from[k]) * v; } o.onUpdate && o.onUpdate(v); }, onDone: o.onDone });
            },
            update(dt) {
                for (let i = list.length - 1; i >= 0; i--) {
                    const it = list[i];
                    if (it.delay > 0) { it.delay -= dt; continue; }
                    it.t += dt;
                    const raw = it.dur > 0 ? Math.min(1, it.t / it.dur) : 1;
                    it.onUpdate && it.onUpdate(it.ease(raw), raw);
                    if (raw >= 1) { list.splice(i, 1); it.onDone && it.onDone(); }
                }
            },
            clear() { list.length = 0; },
            get count() { return list.length; },
        };
    },
    _tw: null,
    // 向后兼容：保留全局默认 pool（如老代码直接调 MG.tw.to）；新游戏应改用 api.tw（实例隔离）
    get tw() { return this._tw || (this._tw = this.makeTweenPool()); },

    // ================= 相机（平移 / 缩放 / 震屏）=================
    // 用法：cam.shake(6, .28) 命中反馈；cam.set(x, y, zoom) 跟随。
    // E.game 自动在 draw 前 apply、每帧 update、stop 时 reset。
    cam() {
        let ox = 0, oy = 0, zoom = 1;
        let sx = 0, sy = 0, sAmt = 0, sT = 0, sDur = 0;
        return {
            shake(amt, dur) {
                amt = amt != null ? amt : 6;
                dur = dur != null ? dur : 0.28;
                if (amt >= sAmt || sT >= sDur) { sAmt = amt; sDur = dur; sT = 0; }
                return this;
            },
            set(x, y, z) { if (x != null) ox = x; if (y != null) oy = y; if (z != null) zoom = z; return this; },
            reset() { ox = 0; oy = 0; zoom = 1; sAmt = 0; sT = 0; sx = 0; sy = 0; return this; },
            update(dt) {
                if (sAmt > 0) {
                    sT += dt;
                    if (sT >= sDur) { sAmt = 0; sx = 0; sy = 0; }
                    else {
                        const k = 1 - sT / sDur;
                        const a = sAmt * k * k;
                        sx = Math.sin(sT * 61) * a;
                        sy = Math.cos(sT * 73) * a;
                    }
                }
                return this;
            },
            // W/H 用于「以画面中心为锚点」缩放；不传则只平移
            apply(ctx, W, H) {
                const tx = ox + sx, ty = oy + sy;
                if (zoom !== 1 && W) {
                    ctx.translate(W / 2, H / 2);
                    ctx.scale(zoom, zoom);
                    ctx.translate(-W / 2 + tx, -H / 2 + ty);
                } else if (tx || ty) {
                    ctx.translate(tx, ty);
                }
                return this;
            },
        };
    },

    // ================= 碰撞与数学小工具 =================
    hit: {
        rect(x, y, w, h, x2, y2, w2, h2) { return x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2; },
        circle(x1, y1, r1, x2, y2, r2) { const dx = x2 - x1, dy = y2 - y1, r = r1 + r2; return dx * dx + dy * dy <= r * r; },
        inRect(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; },
        inCircle(px, py, cx, cy, r) { const dx = px - cx, dy = py - cy; return dx * dx + dy * dy <= r * r; },
        dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
        clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
        lerp(a, b, t) { return a + (b - a) * t; },
    },

    // ================= 3D 能力预留（按需懒加载，绝不进全局包）=================
    // 关键：Three.js 约 600KB。若写进 index.html 的 <script>，107 款 2D 游戏的用户
    // 每次进游戏都要白下载这 600KB —— 首屏直接变慢。
    // 这里用动态 import()：只有真正调用 load3D() 的 3D 游戏才会去取，2D 游戏零开销。
    // 想离线 / 内网部署：把 three.module.js 放进 public/vendor/，改 MG.THREE_URL 即可。
    THREE_URL: 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
    _threeP: null,
    load3D(url) {
        if (window.THREE) return Promise.resolve(window.THREE);
        if (this._threeP) return this._threeP;
        const u = url || this.THREE_URL;
        this._threeP = import(/* webpackIgnore: true */ u)
            .then(m => { window.THREE = m; return m; })
            .catch(e => { this._threeP = null; throw e; });
        return this._threeP;
    },

    // ================= 轻量 Toast（DOM 层，不占 canvas、不挡画面）=================
    // 用法：MG.toast(container, '连击 x3!', { ms: 1200, color: '#ffd56b' })
    toast(parent, text, o) {
        o = o || {};
        try {
            let box = parent.querySelector('.mg-toast-box');
            if (!box) {
                box = document.createElement('div');
                box.className = 'mg-toast-box';
                parent.appendChild(box);
            }
            const d = document.createElement('div');
            d.className = 'mg-toast';
            d.textContent = text;
            if (o.color) d.style.borderColor = o.color;
            box.appendChild(d);
            setTimeout(() => {
                d.classList.add('out');
                setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 260);
            }, o.ms || 1400);
            return d;
        } catch (e) { return null; }
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
        // 监听父容器尺寸变化（侧栏展开 / 弹窗 / 旋转 / 容器变化但窗口不变），销毁时断开
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => { try { fit(); } catch (e) {} });
            try { ro.observe(parent); } catch (e) { ro = null; }
        }
        // 绑在 canvas 上：让 MG.bind / 自定义事件处理能从 c.__mgW 推出 deviceScale
        // （不依赖 ctx.__mgScale，因为部分外部代码取不到 ctx）
        c.__mgW = w; c.__mgH = h;
        return { c, ctx, w, h, fit, destroy() { window.removeEventListener('resize', fit); if (ro) { try { ro.disconnect(); } catch (e) {} } } };
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
            const px = (t.clientX - r.left) * sx, py = (t.clientY - r.top) * sy;
            // HiDPI 还原：MG.canvas 用 devicePixelRatio 放大 backing store，
            // 但 ctx.setTransform 把坐标系缩回逻辑像素；这里必须把 backing 像素再除一次 deviceScale，
            // 否则 dpr≥2 时落子会跳格 / 越界（gomoku/link/match3/mine/memory/piano/reaction 全部受益）
            const ds = (c.__mgScale != null) ? c.__mgScale : ((c.__mgW && c.__mgH) ? Math.max(c.width / c.__mgW, c.height / c.__mgH) : ((ctx => ctx && ctx.__mgScale || 1)(c.getContext && c.getContext('2d'))));
            return { x: px / ds, y: py / ds, _backing: { x: px, y: py, sx, sy } };
        };
        c.addEventListener('mousedown', e => onTap(get(e)));
        c.addEventListener('mousemove', e => onMove && onMove(get(e)));
        c.addEventListener('touchstart', e => { e.preventDefault(); onTap(get(e)); }, { passive: false });
        c.addEventListener('touchend', e => { e.preventDefault(); }, { passive: false });
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
    PROG_V: 1,
    // 读取进度：支持「版本包裹 {v, games}」与「旧版裸 games map」两种格式，损坏数据自动备份
    progress() {
        let raw = null;
        try {
            raw = localStorage.getItem(this.PKEY);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            if (obj && obj.v === this.PROG_V && obj.games) return obj.games;   // 新版
            if (obj && typeof obj === 'object' && !obj.v) return obj;            // 兼容旧版（无版本包裹）
            return {};
        } catch (e) {
            if (raw) { try { localStorage.setItem('mg-progress-corrupt-' + Date.now(), raw); } catch (_) {} }
            return {};
        }
    },
    // 写入进度：统一包裹版本号，便于将来迁移；多标签页用 storage 事件合并（见 sync）
    saveProgress(p) { try { localStorage.setItem(this.PKEY, JSON.stringify({ v: this.PROG_V, games: p || {} })); } catch (e) {} },
    getGameProgress(gameId) {
        return this.progress()[gameId] || { unlocked: 1, stars: {} };
    },
    // 记录星级（取历史最高）并解锁下一关；level=0 表示无尽模式（只存 best）
    // 同时上报服务器（登录用户）：首通/升星发钻石金币奖励
    recordStars(gameId, level, stars) {
        const p = this.progress();
        const g = p[gameId] || { unlocked: 1, stars: {} };
        const old = g.stars[level] || 0;
        const improved = stars > old;                       // 仅首次通关 / 升星才变化
        if (improved) g.stars[level] = stars;
        if (level > 0 && stars > 0 && level >= g.unlocked) g.unlocked = level + 1;
        p[gameId] = g;
        this.saveProgress(p);
        // 仅首次/升星上报：避免重复通关反复下发奖励（服务端仍需幂等兜底，见 issue #20/#21）
        if (improved) this.report(gameId, level, stars);
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
        wrap.innerHTML = `<div class="mg-ls-title">${MG.escapeHtml(cfg.title)}
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
                <div class="mg-ls-name">${MG.escapeHtml(lv.name)}</div>
                <div class="mg-ls-desc" title="${MG.escapeHtml(lv.desc)}">${MG.escapeHtml(lv.desc)}</div>
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
                <div class="mg-result-title">${MG.escapeHtml(cfg.title) || (cfg.win ? '🏆 胜利！' : '💥 失败')}</div>
                ${cfg.stars != null ? `<div class="mg-result-stars">${'<i>★</i>'.repeat(cfg.stars)}${'<i class="off">☆</i>'.repeat(3 - cfg.stars)}</div>` : ''}
                <div class="mg-result-lines">${(cfg.lines || []).map(l => `<div>${MG.escapeHtml(l)}</div>`).join('')}</div>
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
                ${data.list.map((x, i) => `<tr style="border-bottom:1px solid #2a3450"><td style="padding:5px;color:${i < 3 ? '#ffd56b' : '#7a90d8'};font-weight:bold">${x.rank}</td><td>${x.isAdmin ? '👑 ' : ''}${MG.escapeHtml(x.nickname)}</td><td style="text-align:right;color:#5cc7ff;font-weight:bold">${x.score}</td></tr>`).join('')}
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
    // 关键：用 d.full = savedOrder + 未排序的兜底全集，避免「只存了部分游戏」时未保存的游戏退回原始顺序
    async fetchOrder() {
        try {
            const r = await fetch('/api/minigame/order');
            if (!r.ok) return [];
            const d = await r.json();
            return d.full || d.all || d.order || [];
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
    // ================= 角色系统（程序化人物，告别"圆头圆身子"）=================
    // 8 种原型 + 发型/肤色/服装/表情/配饰/动画，全部由 seed 确定性生成。
    // 用法：
    //   const c = MG.char.gen(123);                 // 确定性角色
    //   MG.char.draw(ctx, x, y, scale, c, { t:0, pose:'walk', expr:'happy' });
    //   api.char.gallery(ctx, 20, 60, 44, 0.6);     // 一行陈列
    // 各游戏零成本升级：小兵/敌人/玩家/NPC 直接换上，画风统一且可批量变化。
    char: {
        ARCH: ['chibi', 'human', 'robot', 'slime', 'cat', 'mecha', 'ghost', 'knight'],
        SKIN: ['#ffe0bd', '#f5cda0', '#e8b98a', '#c98e63', '#8a5a3b', '#caa0c0'],
        HAIR: ['#2b2b3a', '#5a3a22', '#caa14a', '#b33b5e', '#3a7d6e', '#7a5cff', '#e8e8f0', '#d8643a'],
        CLOTH: [['#5cc7ff', '#2a7fd0'], ['#ff8aa0', '#d8486a'], ['#7ee0a0', '#2f9e6a'], ['#ffd56b', '#d99a2b'], ['#b89cff', '#7a5cff'], ['#ff9d5c', '#e0642a'], ['#9fb3d0', '#5a7099'], ['#9ad8e0', '#3a9eb0']],
        EXPR: ['normal', 'smile', 'angry', 'surprise', 'focus', 'happy'],
        ACC: ['none', 'glasses', 'headband', 'crown', 'horn', 'hat'],
        _rng(seed) { let s = (seed | 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
        gen(seed) {
            const r = this._rng(seed == null ? (Math.random() * 1e9 | 0) : seed);
            const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
            const cloth = this.CLOTH[ri(0, this.CLOTH.length - 1)];
            return {
                arch: this.ARCH[ri(0, this.ARCH.length - 1)],
                skin: this.SKIN[ri(0, this.SKIN.length - 1)],
                hair: { style: ri(0, 4), color: this.HAIR[ri(0, this.HAIR.length - 1)] },
                cloth: { c1: cloth[0], c2: cloth[1] },
                accent: this.HAIR[ri(0, this.HAIR.length - 1)],
                eye: '#26324a', expr: this.EXPR[ri(0, 2)],
                acc: r() < 0.4 ? this.ACC[ri(1, this.ACC.length - 1)] : 'none',
                face: r() < 0.5 ? 1 : -1,
            };
        },
        // ---------- 基础绘制部件 ----------
        _hair(ctx, cx, cy, R, style, color) {
            ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round';
            const top = cy - R * 1.25;
            if (style === 0) {
                ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
                ctx.beginPath(); ctx.ellipse(cx, top + R * 0.3, R * 1.05, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
            } else if (style === 1) {
                ctx.beginPath(); ctx.arc(cx, cy, R * 1.0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
                for (let i = -2; i <= 2; i++) { ctx.lineWidth = R * 0.32; ctx.beginPath(); ctx.moveTo(cx + i * R * 0.34, top + R * 0.25); ctx.lineTo(cx + i * R * 0.34, top - R * 0.5); ctx.stroke(); }
            } else if (style === 2) {
                ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(cx - R * 1.02, cy); ctx.quadraticCurveTo(cx - R * 1.4, cy + R * 1.9, cx - R * 0.7, cy + R * 2.3); ctx.quadraticCurveTo(cx, cy + R * 1.6, cx + R * 0.7, cy + R * 2.3); ctx.quadraticCurveTo(cx + R * 1.4, cy + R * 1.9, cx + R * 1.02, cy); ctx.fill();
            } else if (style === 3) {
                ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
                ctx.beginPath(); ctx.ellipse(cx + R * 1.15, cy + R * 0.4, R * 0.42, R * 1.15, 0.3, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
                ctx.lineWidth = R * 0.24; ctx.beginPath(); ctx.moveTo(cx, top); ctx.quadraticCurveTo(cx + R * 0.3, top - R * 0.9, cx - R * 0.1, top - R * 1.4); ctx.stroke();
            }
        },
        _eye(ctx, ex, ey, R, ec, expr, blink) {
            if (blink) { ctx.strokeStyle = '#222'; ctx.lineWidth = R * 0.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - R * 0.8, ey); ctx.quadraticCurveTo(ex, ey + R * 0.25, ex + R * 0.8, ey); ctx.stroke(); return; }
            const happy = (expr === 'happy' || expr === 'smile' || expr === 'focus');
            if (expr === 'surprise') {
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R * 1.1, R * 1.2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ex, ey, R * 0.7, 0, Math.PI * 2); ctx.fill();
            } else if (expr === 'angry') {
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.9, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ex + R * 0.15, ey + R * 0.1, R * 0.5, 0, Math.PI * 2); ctx.fill();
            } else if (happy) {
                ctx.strokeStyle = '#222'; ctx.lineWidth = R * 0.5; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.arc(ex, ey + R * 0.4, R * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
                return;
            } else {
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R, R * 1.15, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ex, ey + R * 0.15, R * 0.62, 0, Math.PI * 2); ctx.fill();
            }
            if (expr !== 'happy') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex - R * 0.25, ey - R * 0.25, R * 0.22, 0, Math.PI * 2); ctx.fill(); }
        },
        _mouth(ctx, my, w, expr) {
            ctx.strokeStyle = '#7a3a3a'; ctx.fillStyle = '#7a3a3a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            if (expr === 'surprise') { ctx.beginPath(); ctx.ellipse(0, my, w * 0.5, w * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
            else if (expr === 'happy') { ctx.fillStyle = '#7a3a3a'; ctx.beginPath(); ctx.arc(0, my - w * 0.2, w * 0.6, Math.PI * 0.1, Math.PI * 0.9); ctx.fill(); }
            else if (expr === 'smile') { ctx.beginPath(); ctx.arc(0, my - 1, w * 0.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
            else if (expr === 'angry') { ctx.beginPath(); ctx.arc(0, my + w * 0.5, w * 0.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
            else if (expr === 'focus') { ctx.beginPath(); ctx.moveTo(-w * 0.5, my); ctx.lineTo(w * 0.5, my); ctx.stroke(); }
            else { ctx.beginPath(); ctx.moveTo(-w * 0.35, my); ctx.quadraticCurveTo(0, my + w * 0.25, w * 0.35, my); ctx.stroke(); }
        },
        _acc(ctx, hx, hy, R, acc, color) {
            if (!acc || acc === 'none') return;
            if (acc === 'glasses') { ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx - R * 0.42, hy + R * 0.12, R * 0.34, 0, Math.PI * 2); ctx.arc(hx + R * 0.42, hy + R * 0.12, R * 0.34, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hx - R * 0.08, hy + R * 0.12); ctx.lineTo(hx + R * 0.08, hy + R * 0.12); ctx.stroke(); }
            else if (acc === 'headband') { ctx.fillStyle = color; ctx.fillRect(hx - R, hy + R * 0.45, R * 2, R * 0.28); }
            else if (acc === 'crown') { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx - R * 0.9, hy - R * 0.9); ctx.lineTo(hx - R * 0.5, hy - R * 1.35); ctx.lineTo(hx, hy - R * 0.95); ctx.lineTo(hx + R * 0.5, hy - R * 1.35); ctx.lineTo(hx + R * 0.9, hy - R * 0.9); ctx.closePath(); ctx.fill(); }
            else if (acc === 'horn') { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx - R * 0.5, hy - R * 0.8); ctx.lineTo(hx - R * 0.7, hy - R * 1.4); ctx.lineTo(hx - R * 0.2, hy - R * 0.95); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + R * 0.5, hy - R * 0.8); ctx.lineTo(hx + R * 0.7, hy - R * 1.4); ctx.lineTo(hx + R * 0.2, hy - R * 0.95); ctx.fill(); }
            else if (acc === 'hat') { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(hx, hy - R * 0.7, R * 1.2, R * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx - R * 0.7, hy - R * 0.7); ctx.lineTo(hx - R * 0.1, hy - R * 1.7); ctx.lineTo(hx + R * 0.7, hy - R * 0.7); ctx.fill(); }
        },
        _head(ctx, c, hx, hy, R, opt, t) {
            const blink = !!(opt.blink || Math.sin(t * 2.7) > 0.97);
            let g = null; try { g = ctx.createRadialGradient(hx - R * 0.3, hy - R * 0.3, R * 0.2, hx, hy, R); g.addColorStop(0, MG.gfx.lighten(c.skin, 0.18)); g.addColorStop(1, MG.gfx.darken(c.skin, 0.08)); } catch (e) { }
            ctx.fillStyle = g || c.skin; ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(hx - R * 0.95, hy + R * 0.1, R * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(hx + R * 0.95, hy + R * 0.1, R * 0.22, 0, Math.PI * 2); ctx.fill();
            this._hair(ctx, hx, hy, R, c.hair ? c.hair.style : 0, c.hair ? c.hair.color : '#2b2b3a');
            const ey = hy + R * 0.12, ex = R * 0.42, eR = R * 0.26, exx = opt.expr || c.expr || 'normal';
            this._eye(ctx, hx - ex, ey, eR, c.eye || '#26324a', exx, blink);
            this._eye(ctx, hx + ex, ey, eR, c.eye || '#26324a', exx, blink);
            ctx.fillStyle = 'rgba(255,120,140,0.35)'; ctx.beginPath(); ctx.ellipse(hx - ex * 1.15, hy + R * 0.45, R * 0.18, R * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(hx + ex * 1.15, hy + R * 0.45, R * 0.18, R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
            this._mouth(ctx, hy + R * 0.6, R * 0.5, exx);
            this._acc(ctx, hx, hy, R, c.acc, c.accent);
        },
        // ---------- 各原型 ----------
        _chibi(ctx, c, s, opt, t) {
            const R = 18 * s, bodyTop = -R * 1.8, bodyH = R * 1.4;
            let g = null; try { g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH); g.addColorStop(0, c.cloth.c1); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -11 * s, bodyTop, 22 * s, bodyH, 8 * s); ctx.fill();
            ctx.fillStyle = c.cloth.c2; ctx.beginPath(); ctx.ellipse(-12 * s, bodyTop + bodyH * 0.4, 4 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(12 * s, bodyTop + bodyH * 0.4, 4 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(-6 * s, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(6 * s, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            this._head(ctx, c, 0, bodyTop - R, R, opt, t);
        },
        _human(ctx, c, s, opt, t) {
            const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 3 * s : 0;
            ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.1); MG.ui.rr(ctx, -7 * s + sw, -20 * s, 6 * s, 20 * s, 3 * s); ctx.fill(); MG.ui.rr(ctx, 1 * s - sw, -20 * s, 6 * s, 20 * s, 3 * s); ctx.fill();
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-4 * s + sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(4 * s - sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            let g = null; try { g = ctx.createLinearGradient(0, -44 * s, 0, -20 * s); g.addColorStop(0, c.cloth.c1); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -12 * s, -44 * s, 24 * s, 26 * s, 8 * s); ctx.fill();
            ctx.fillStyle = c.cloth.c2; ctx.save(); ctx.translate(-12 * s, -40 * s); ctx.rotate(sw * 0.02); MG.ui.rr(ctx, -4 * s, -2 * s, 7 * s, 20 * s, 3 * s); ctx.fill(); ctx.restore();
            ctx.save(); ctx.translate(12 * s, -40 * s); ctx.rotate(-sw * 0.02); MG.ui.rr(ctx, -3 * s, -2 * s, 7 * s, 20 * s, 3 * s); ctx.fill(); ctx.restore();
            ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(-13 * s + sw, -22 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(13 * s - sw, -22 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
            this._head(ctx, c, 0, -56 * s, 13 * s, opt, t);
        },
        _robot(ctx, c, s, opt, t) {
            ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.2); ctx.fillRect(-8 * s, -16 * s, 6 * s, 16 * s); ctx.fillRect(2 * s, -16 * s, 6 * s, 16 * s);
            ctx.fillStyle = '#444'; ctx.fillRect(-10 * s, -2 * s, 10 * s, 3 * s); ctx.fillRect(0, -2 * s, 10 * s, 3 * s);
            let g = null; try { g = ctx.createLinearGradient(0, -46 * s, 0, -16 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.2)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -15 * s, -46 * s, 30 * s, 32 * s, 6 * s); ctx.fill();
            ctx.strokeStyle = MG.gfx.darken(c.cloth.c2, 0.3); ctx.lineWidth = 2 * s; ctx.stroke();
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -34 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = c.cloth.c2; ctx.fillRect(-21 * s, -44 * s, 6 * s, 22 * s); ctx.fillRect(15 * s, -44 * s, 6 * s, 22 * s);
            ctx.fillStyle = MG.gfx.lighten(c.skin, 0.1); MG.ui.rr(ctx, -13 * s, -66 * s, 26 * s, 20 * s, 5 * s); ctx.fill();
            ctx.fillStyle = c.accent; MG.ui.rr(ctx, -11 * s, -60 * s, 22 * s, 8 * s, 3 * s); ctx.fill();
            ctx.fillStyle = '#1a2238'; ctx.beginPath(); ctx.arc(-5 * s, -56 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(5 * s, -56 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = c.accent; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, -66 * s); ctx.lineTo(0, -74 * s); ctx.stroke(); ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -75 * s, 2.4 * s, 0, Math.PI * 2); ctx.fill();
        },
        _slime(ctx, c, s, opt, t) {
            const wob = Math.sin(t * 3) * 2 * s;
            ctx.save(); ctx.translate(0, -18 * s);
            let g = null; try { g = ctx.createRadialGradient(0, -10 * s, 2 * s, 0, 0, 22 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.3)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; ctx.globalAlpha = 0.92;
            ctx.beginPath(); ctx.moveTo(-20 * s, -2 * s + wob); ctx.quadraticCurveTo(-22 * s, -34 * s, 0, -36 * s); ctx.quadraticCurveTo(22 * s, -34 * s, 20 * s, -2 * s - wob); ctx.quadraticCurveTo(14 * s, 6 * s, 0, 6 * s); ctx.quadraticCurveTo(-14 * s, 6 * s, -20 * s, -2 * s + wob); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-7 * s, -20 * s, 5 * s, 8 * s, -0.3, 0, Math.PI * 2); ctx.fill();
            this._eye(ctx, -7 * s, -14 * s, 4 * s, c.eye, 'normal', false);
            this._eye(ctx, 7 * s, -14 * s, 4 * s, c.eye, 'normal', false);
            this._mouth(ctx, -6 * s, 4 * s, 'normal');
            ctx.restore();
        },
        _cat(ctx, c, s, opt, t) {
            const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 3 * s : 0;
            ctx.strokeStyle = c.cloth.c2; ctx.lineWidth = 5 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10 * s, -14 * s); ctx.quadraticCurveTo(22 * s, -18 * s, 18 * s, -30 * s); ctx.stroke();
            ctx.fillStyle = c.cloth.c2; ctx.beginPath(); ctx.ellipse(-5 * s + sw, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(5 * s - sw, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            let g = null; try { g = ctx.createLinearGradient(0, -30 * s, 0, -8 * s); g.addColorStop(0, c.cloth.c1); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -11 * s, -30 * s, 22 * s, 24 * s, 9 * s); ctx.fill();
            ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(-11 * s, -16 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(11 * s, -16 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
            const hy = -44 * s, hx = 0, R = 15 * s;
            ctx.fillStyle = c.cloth.c1; ctx.beginPath(); ctx.moveTo(hx - R * 0.8, hy - R * 0.4); ctx.lineTo(hx - R * 1.1, hy - R * 1.5); ctx.lineTo(hx - R * 0.2, hy - R * 0.9); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + R * 0.8, hy - R * 0.4); ctx.lineTo(hx + R * 1.1, hy - R * 1.5); ctx.lineTo(hx + R * 0.2, hy - R * 0.9); ctx.fill();
            ctx.fillStyle = '#ffb6c1'; ctx.beginPath(); ctx.moveTo(hx - R * 0.7, hy - R * 0.5); ctx.lineTo(hx - R * 0.95, hy - R * 1.2); ctx.lineTo(hx - R * 0.3, hy - R * 0.8); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + R * 0.7, hy - R * 0.5); ctx.lineTo(hx + R * 0.95, hy - R * 1.2); ctx.lineTo(hx + R * 0.3, hy - R * 0.8); ctx.fill();
            this._head(ctx, Object.assign({}, c, { hair: { style: 1, color: c.skin } }), hx, hy, R, opt, t);
            ctx.strokeStyle = 'rgba(60,40,40,0.7)'; ctx.lineWidth = 1 * s; ctx.beginPath();
            ctx.moveTo(hx - 6 * s, hy + 2 * s); ctx.lineTo(hx - 14 * s, hy); ctx.moveTo(hx - 6 * s, hy + 4 * s); ctx.lineTo(hx - 14 * s, hy + 5 * s);
            ctx.moveTo(hx + 6 * s, hy + 2 * s); ctx.lineTo(hx + 14 * s, hy); ctx.moveTo(hx + 6 * s, hy + 4 * s); ctx.lineTo(hx + 14 * s, hy + 5 * s); ctx.stroke();
        },
        _mecha(ctx, c, s, opt, t) {
            const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 2 * s : 0;
            ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.25); MG.ui.rr(ctx, -9 * s + sw, -18 * s, 8 * s, 18 * s, 3 * s); ctx.fill(); MG.ui.rr(ctx, 1 * s - sw, -18 * s, 8 * s, 18 * s, 3 * s); ctx.fill();
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.ellipse(-5 * s + sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(5 * s - sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            let g = null; try { g = ctx.createLinearGradient(0, -48 * s, 0, -18 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.25)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -16 * s, -48 * s, 32 * s, 32 * s, 7 * s); ctx.fill();
            ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.15); ctx.beginPath(); ctx.ellipse(-16 * s, -44 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(16 * s, -44 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -32 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = c.cloth.c1; ctx.fillRect(-23 * s, -46 * s, 7 * s, 24 * s); ctx.fillRect(16 * s, -46 * s, 7 * s, 24 * s);
            ctx.fillStyle = MG.gfx.lighten(c.cloth.c1, 0.1); MG.ui.rr(ctx, -13 * s, -68 * s, 26 * s, 22 * s, 6 * s); ctx.fill();
            ctx.fillStyle = c.accent; ctx.fillRect(-12 * s, -64 * s, 24 * s, 5 * s); ctx.fillStyle = '#0b1020'; ctx.fillRect(-2 * s, -64 * s, 4 * s, 12 * s);
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -50 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
        },
        _ghost(ctx, c, s, opt, t) {
            const fl = Math.sin(t * 3) * 2 * s;
            ctx.save(); ctx.globalAlpha = 0.85;
            let g = null; try { g = ctx.createRadialGradient(0, -18 * s, 2 * s, 0, 0, 24 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.25)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1;
            ctx.beginPath(); ctx.moveTo(-18 * s, -18 * s); ctx.quadraticCurveTo(-20 * s, -40 * s, 0, -42 * s); ctx.quadraticCurveTo(20 * s, -40 * s, 18 * s, -18 * s);
            for (let i = 0; i < 4; i++) { const x = 18 * s - (i * 2 + 1) * (36 * s / 4); ctx.quadraticCurveTo(x + 9 * s, -10 * s + fl, x, -2 * s); }
            ctx.quadraticCurveTo(0, 6 * s, -18 * s, -18 * s); ctx.fill();
            ctx.globalAlpha = 1;
            this._eye(ctx, -7 * s, -26 * s, 4.5 * s, c.eye, 'normal', false);
            this._eye(ctx, 7 * s, -26 * s, 4.5 * s, c.eye, 'normal', false);
            this._mouth(ctx, -8 * s, 4 * s, 'surprise');
            ctx.restore();
        },
        _knight(ctx, c, s, opt, t) {
            const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 2 * s : 0;
            ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.2); ctx.fillRect(-8 * s + sw, -16 * s, 7 * s, 16 * s); ctx.fillRect(1 * s - sw, -16 * s, 7 * s, 16 * s);
            ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.ellipse(-4 * s + sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(5 * s - sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = MG.gfx.darken(c.accent, 0.1); ctx.beginPath(); ctx.moveTo(-12 * s, -44 * s); ctx.quadraticCurveTo(-22 * s, -10 * s, -14 * s, 2 * s); ctx.lineTo(14 * s, 2 * s); ctx.quadraticCurveTo(22 * s, -10 * s, 12 * s, -44 * s); ctx.fill();
            let g = null; try { g = ctx.createLinearGradient(0, -46 * s, 0, -16 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.3)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
            ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -14 * s, -46 * s, 28 * s, 30 * s, 8 * s); ctx.fill();
            ctx.strokeStyle = MG.gfx.darken(c.cloth.c2, 0.3); ctx.lineWidth = 2 * s; ctx.stroke();
            ctx.fillStyle = MG.gfx.lighten(c.cloth.c1, 0.15); ctx.beginPath(); ctx.ellipse(-15 * s, -43 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(15 * s, -43 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = c.cloth.c2; ctx.fillRect(13 * s, -44 * s, 6 * s, 22 * s);
            ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(20 * s, -40 * s); ctx.lineTo(26 * s, -66 * s); ctx.stroke();
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.moveTo(26 * s, -70 * s); ctx.lineTo(22 * s, -64 * s); ctx.lineTo(30 * s, -64 * s); ctx.fill();
            ctx.fillStyle = MG.gfx.lighten(c.cloth.c1, 0.1); MG.ui.rr(ctx, -13 * s, -66 * s, 26 * s, 22 * s, 7 * s); ctx.fill();
            ctx.strokeStyle = MG.gfx.darken(c.cloth.c2, 0.35); ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, -66 * s); ctx.lineTo(0, -46 * s); ctx.stroke();
            ctx.fillStyle = '#10141f'; ctx.fillRect(-9 * s, -60 * s, 18 * s, 5 * s);
            ctx.fillStyle = c.accent; ctx.beginPath(); ctx.moveTo(0, -66 * s); ctx.quadraticCurveTo(6 * s, -78 * s, 0, -86 * s); ctx.quadraticCurveTo(-3 * s, -76 * s, 0, -66 * s); ctx.fill();
        },
        // ---------- 主绘制入口 ----------
        draw(ctx, x, y, scale, cfg, opt) {
            cfg = cfg || {}; opt = opt || {};
            const F = (opt.face != null ? opt.face : (cfg.face || 1));
            const t = opt.t || 0;
            scale = scale || 1;
            ctx.save();
            ctx.globalAlpha = opt.alpha != null ? opt.alpha : 1;
            if (opt.shadow !== false) {
                ctx.save(); ctx.globalAlpha = (opt.alpha != null ? opt.alpha : 1) * 0.26; ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(x, y + 2, 16 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            }
            ctx.translate(x, y); ctx.scale(F, 1);
            const bob = opt.pose === 'walk' ? Math.abs(Math.sin(t * 8)) * 2 * scale : Math.sin(t * 2.2) * 0.6 * scale;
            ctx.translate(0, -bob);
            const fn = this['_' + (cfg.arch || 'chibi')] || this._chibi;
            try { fn.call(this, ctx, cfg, scale, opt, t); } catch (e) { if (window.__MG_TEST) throw e; }
            ctx.restore();
        },
        // 一行陈列：从 x 起，每个间隔 spacing，统一 scale
        gallery(ctx, x, y, spacing, scale, list) {
            list = list || this.ARCH;
            list.forEach((a, i) => { const c = this.gen(700 + i * 131); c.arch = a; c.expr = 'smile'; c.face = 1; this.draw(ctx, x + i * spacing, y, scale, c, { t: 0.6, pose: 'idle' }); });
        },
    },

    // ================= 触感反馈（移动端震感，桌面端空操作）=================
    // 用法：MG.haptics('hit') / MG.haptics.tap() / MG.haptics.bomb()
    haptics(pattern) {
        try { if (navigator.vibrate) { const p = typeof pattern === 'string' ? (MG.haptics.P[pattern] || [10]) : pattern; navigator.vibrate(p); } } catch (e) { }
    },
    // ---------- 安全与错误上报 ----------
    // HTML 转义：所有外部/服务端数据（榜单昵称、关卡名、描述、结算行）渲染前必须经过它
    escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    // 统一错误入口：引擎在 draw/tick 异常时调用。测试模式（__MG_TEST）继续抛出交给断言；
    // 生产模式记录上下文（游戏 ID / 阶段）并交由引擎优雅停机 + 提示。
    onError(err, ctx) {
        const info = Object.assign({ ts: Date.now() }, ctx || {});
        try { console.error('[MG] 游戏异常', info, err); } catch (e) {}
        if (window.__MG_TEST) throw err;
        return err;
    },
    showGameError(parent) {
        try {
            const el = document.createElement('div');
            el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(20,24,40,.92);color:#ff9aa6;padding:14px 18px;border-radius:10px;font-size:14px;z-index:99;text-align:center;pointer-events:none';
            el.textContent = '游戏异常，请重试';
            (parent || document.body).appendChild(el);
            setTimeout(() => el.remove(), 2600);
        } catch (e) {}
    },
    // 无尽模式最高分存储键（此前 bestKey 未定义，导致 setBest 永远静默失败）
    bestKey(id) { return 'mg-best-' + String(id); },
    getBest(id) { try { return +(localStorage.getItem(this.bestKey(id)) || 0); } catch (e) { return 0; } },
    setBest(id, v) {
        v = Number(v) || 0;
        if (v > this.getBest(id)) { try { localStorage.setItem(this.bestKey(id), String(v)); } catch (e) {} }
        return this.getBest(id);
    },

    // ================= 瓦片地图渲染（网格地牢 / 塔 / 迷宫通用）=================
    // 地形码：'#' 墙  '.' 地板  '^' 上楼  'v' 下楼  '~' 水  '"' 草  'L' 熔岩  '*' 陷阱
    // bake(): 把静态地形烘培成离屏 canvas，每帧只 drawImage，避免逐格重绘
    grid: {
        isWall(c) { return c === '#'; },
        // 烘培整层地形 → 返回离屏 canvas（尺寸 = W*ts × H*ts）
        bake(cells, ts, opt) {
            opt = opt || {};
            const H = cells.length, W = cells[0] ? cells[0].length : 0;
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, W * ts); cv.height = Math.max(1, H * ts);
            const x = cv.getContext('2d');
            for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
                this._tile(x, xx * ts, y * ts, ts, cells[y][xx], opt.tint);
            }
            return cv;
        },
        _tile(x, px, py, s, c, tint) {
            const floorA = (tint && tint.floorA) || '#2a2740';
            const floorB = (tint && tint.floorB) || '#34314f';
            if (c === '#') {
                const g = x.createLinearGradient(px, py, px, py + s); g.addColorStop(0, '#5b5674'); g.addColorStop(1, '#393550');
                x.fillStyle = g; x.fillRect(px, py, s, s);
                x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1;
                x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
                x.beginPath(); x.moveTo(px, py + s / 2); x.lineTo(px + s, py + s / 2); x.stroke();
                x.beginPath(); x.moveTo(px + s / 2, py); x.lineTo(px + s / 2, py + s / 2); x.stroke();
                x.beginPath(); x.moveTo(px + s / 4, py + s / 2); x.lineTo(px + s / 4, py + s); x.stroke();
                x.beginPath(); x.moveTo(px + s * 3 / 4, py + s / 2); x.lineTo(px + s * 3 / 4, py + s); x.stroke();
                x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(px + 2, py + 2, s - 4, 2);
                return;
            }
            const fg = x.createLinearGradient(px, py, px, py + s); fg.addColorStop(0, floorA); fg.addColorStop(1, floorB);
            x.fillStyle = fg; x.fillRect(px, py, s, s);
            x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
            if (((px / s) + (py / s)) % 2 === 0) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(px + 1, py + 1, s - 2, s - 2); }
            if (c === '^' || c === 'v') {
                x.save(); x.translate(px + s / 2, py + s / 2);
                x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68);
                x.strokeStyle = '#ffe6a0'; x.lineWidth = 2; x.lineCap = 'round';
                for (let i = 0; i < 4; i++) { const yy = c === '^' ? (s * 0.26 - i * s * 0.16) : (-s * 0.26 + i * s * 0.16); x.beginPath(); x.moveTo(-s * 0.26, yy); x.lineTo(s * 0.26, yy); x.stroke(); }
                x.restore();
            } else if (c === '~') {
                x.fillStyle = 'rgba(70,150,230,0.5)'; x.fillRect(px + 2, py + 2, s - 4, s - 4);
                x.strokeStyle = 'rgba(180,220,255,0.7)'; x.lineWidth = 1.5;
                for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(px + 4, py + s * (0.4 + i * 0.3)); x.quadraticCurveTo(px + s / 2, py + s * (0.4 + i * 0.3) - 3, px + s - 4, py + s * (0.4 + i * 0.3)); x.stroke(); }
            } else if (c === '"') {
                x.fillStyle = 'rgba(80,180,90,0.35)'; x.fillRect(px + 2, py + 2, s - 4, s - 4);
                x.strokeStyle = '#5fd06a'; x.lineWidth = 1.4; x.lineCap = 'round';
                for (let i = 0; i < 3; i++) { const bx = px + s * (0.3 + i * 0.22); x.beginPath(); x.moveTo(bx, py + s * 0.7); x.lineTo(bx - 2, py + s * 0.35); x.moveTo(bx, py + s * 0.7); x.lineTo(bx + 2, py + s * 0.35); x.stroke(); }
            } else if (c === 'L') {
                const g = x.createRadialGradient(px + s / 2, py + s / 2, 2, px + s / 2, py + s / 2, s / 2); g.addColorStop(0, '#ffd070'); g.addColorStop(1, '#d84818');
                x.fillStyle = g; x.fillRect(px + 2, py + 2, s - 4, s - 4);
            } else if (c === '*') {
                x.fillStyle = 'rgba(200,60,90,0.35)'; x.fillRect(px + 2, py + 2, s - 4, s - 4);
                x.fillStyle = '#ff7a9a'; x.font = (s * 0.5) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✕', px + s / 2, py + s / 2);
            }
        },
        // 小地图：seen 为已探索布尔矩阵；hero 高亮
        mini(ctx, cells, hx, hy, ts, ox, oy, seen) {
            const H = cells.length, W = cells[0].length;
            for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
                const vis = !seen || seen[y][xx];
                const v = !vis ? 0 : (cells[y][xx] === '#' ? 1 : 2);
                ctx.fillStyle = v === 0 ? 'rgba(255,255,255,0.10)' : v === 1 ? 'rgba(120,120,150,0.7)' : 'rgba(200,200,230,0.55)';
                ctx.fillRect(ox + xx * ts, oy + y * ts, ts - 0.4, ts - 0.4);
            }
            ctx.fillStyle = '#ffd56b'; ctx.fillRect(ox + hx * ts + ts * 0.18, oy + hy * ts + ts * 0.18, ts * 0.64, ts * 0.64);
        },
    },

    // ================= NPC 对话框（通用）=================
    // dlg: { speaker, text, color, choices:[{label}], icon }
    // draw 返回可选区域数组 [{x,y,w,h,i}] 供点击命中
    dialogue: {
        draw(ctx, W, H, dlg) {
            if (!dlg) return [];
            const pad = 14, bw = W - pad * 2, bh = 104, by = H - bh - 12;
            MG.ui.rr(ctx, pad, by, bw, bh, 12); ctx.fillStyle = 'rgba(12,14,26,0.92)'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = dlg.color || '#8ad0ff'; ctx.stroke();
            if (dlg.speaker) { ctx.fillStyle = dlg.color || '#8ad0ff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(dlg.speaker, pad + 12, by + 10); }
            ctx.fillStyle = '#e8ecf4'; ctx.font = '14px sans-serif'; ctx.textBaseline = 'top';
            const lines = this._wrap(ctx, dlg.text || '', W - pad * 2 - 24, 20);
            lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, pad + 12, by + 32 + i * 20));
            const rects = [];
            if (dlg.choices && dlg.choices.length) {
                const cw = (bw - 24) / dlg.choices.length, ch = 30;
                dlg.choices.forEach((c, i) => {
                    const rx = pad + 12 + i * cw, ry = by + bh - ch - 8;
                    MG.ui.rr(ctx, rx, ry, cw - 6, ch, 8); ctx.fillStyle = 'rgba(90,130,200,0.35)'; ctx.fill();
                    ctx.strokeStyle = dlg.color || '#8ad0ff'; ctx.lineWidth = 1.2; ctx.stroke();
                    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(c.label, rx + (cw - 6) / 2, ry + ch / 2);
                    rects.push({ x: rx, y: ry, w: cw - 6, h: ch, i });
                });
            }
            return rects;
        },
        _wrap(ctx, text, maxw) {
            const out = []; let line = '';
            for (const ch of (text || '')) {
                if (ctx.measureText(line + ch).width > maxw) { out.push(line); line = ch; }
                else line += ch;
            }
            if (line) out.push(line);
            return out;
        },
    },

    // ================= 通用 HUD（RPG 状态栏）=================
    hud: {
        // 圆角数值条（HP / 经验等），ratio 0~1
        meter(ctx, x, y, w, h, ratio, color, label, valTxt) {
            MG.ui.rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
            const r = Math.max(0, Math.min(1, ratio));
            if (r > 0) { MG.ui.rr(ctx, x, y, Math.max(h, w * r), h, h / 2); ctx.fillStyle = color; ctx.fill(); }
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(h * 0.62) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label + (valTxt != null ? ' ' + valTxt : ''), x + w / 2, y + h / 2 + 1);
        },
        // 图标数值胶囊，返回自身宽度
        chip(ctx, x, y, icon, text, color) {
            ctx.font = 'bold 13px sans-serif'; const tw = ctx.measureText(text).width;
            const ww = 24 + tw + 8;
            MG.ui.rr(ctx, x, y, ww, 22, 11); ctx.fillStyle = color || 'rgba(0,0,0,0.4)'; ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.font = '14px sans-serif'; ctx.fillText(icon, x + 7, y + 12);
            ctx.font = 'bold 13px sans-serif'; ctx.fillText(text, x + 25, y + 12);
            return ww;
        },
        label(ctx, x, y, text, color, size, align) {
            ctx.fillStyle = color || '#fff'; ctx.font = (size || 13) + 'px sans-serif';
            ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
        },
    },
};
window.MG = MG;
// 触感反馈预设（对象字面量外挂载，避免循环引用）
MG.haptics.P = { tap: [8], hit: [18], bomb: [40, 20, 40], win: [20, 30, 20, 30, 40], lose: [60, 40, 60] };
MG.haptics.tap = () => MG.haptics('tap');
MG.haptics.hit = () => MG.haptics('hit');
MG.haptics.bomb = () => MG.haptics('bomb');
MG.haptics.win = () => MG.haptics('win');
MG.haptics.lose = () => MG.haptics('lose');
