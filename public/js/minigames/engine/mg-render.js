// 小游戏引擎 · 渲染模块（mg-render.js）
// 职责：canvas 创建与 HiDPI 适配、通用绘图工具（圆角/棋盘/渐变）、画质引擎（背景缓存/立体面板/发光/血条）、分层渲染辅助（issue #13）。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 统一美术工具集（2026-09-09 视觉升级）=================
// 各游戏的 draw() 复用：棋盘背景 / 渐变格子 / emoji / 高光，风格与 2048 妖怪版一致
MG.ui = {
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
};

// ================= 画质引擎（2026-09-10 全局高清化）=================
// 目标：让全部 107 款小游戏具备与「三维弹球」一致的质感。三个关键手段：
//  ① 颜色算子 —— 由单一基色自动派生材质的「高光 / 暗部 / 描边」，
//     各游戏不必再传一堆颜色参数，接口零改动即可升级
//  ② 背景预渲染缓存 —— 每帧重建「渐变 + 微网格 + 暗角」很贵，
//     按 (色+尺寸+锐度) 缓存成离屏位图复用，每帧只 drawImage
//  ③ 分辨率感知 —— 离屏按 deviceScale 渲染，高分屏背景依然锐利
MG.gfx = {
    // 画质缓存按类型分桶：px/scene/wood/glow 各自独立 Map + 独立上限，
    // 避免弹幕/射击游戏的 px 精灵大量生成把 scene/wood 挤掉，引发每帧重建
    // 昂贵位图（含 1 万+ 次 fillRect 的 grain 循环）的缓存抖动（优化 P0-1）。
    _caches: {
        px: new Map(), scene: new Map(), wood: new Map(), glow: new Map(),
    },
    // broom/piece 离屏缓存（优化 P0-2）、text 字体串缓存（优化 P2-9）
    _broomCache: null, _pieceCache: null, _fontCache: null,
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
    // 色相（0~359），解析失败返回 220（中性蓝）
    hue(c) {
        const [r, g, b] = this.rgb(c).map(v => v / 255);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (d < 1e-4) return 220;
        let h = 0;
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return ((h * 60) + 360) % 360;
    },

    // ---------- 像素精灵（点阵位图 → canvas，2026-09-12）----------
    // art: 字符串数组，每字符对应 palette 中一色；'.'/' ' 为透明
    // palette: { 'a':'#1a3d1f', ... }
    // 返回离屏 canvas（原始 1:1 点阵），绘制时配合 pxDraw 关闭平滑放大
    px(art, palette, key) {
        key = key || ('px|' + art.join('|') + '|' + JSON.stringify(palette));
        const c = this._caches.px;
        let img = c.get(key);
        if (img) { c.delete(key); c.set(key, img); return img; }
        const w = art[0].length, h = art.length;
        img = document.createElement('canvas');
        img.width = w; img.height = h;
        const x = img.getContext('2d');
        for (let r = 0; r < h; r++) {
            const row = art[r];
            for (let c0 = 0; c0 < w; c0++) {
                const ch = row[c0];
                if (ch === '.' || ch === ' ') continue;
                const col = palette[ch];
                if (!col) continue;
                x.fillStyle = col;
                x.fillRect(c0, r, 1, 1);
            }
        }
        if (c.size >= this.MAX_CACHE * 4) c.delete(c.keys().next().value);
        c.set(key, img);
        return img;
    },
    // 以目标尺寸绘制像素精灵（关闭平滑，保持硬边像素风）
    pxDraw(ctx, cv, x, y, w, h) {
        const prev = ctx.imageSmoothingEnabled;
        try { ctx.imageSmoothingEnabled = false; } catch (e) {}
        ctx.drawImage(cv, x, y, w, h);
        try { ctx.imageSmoothingEnabled = prev !== false; } catch (e) {}
    },
    // 像素精灵按点阵缩放 s 倍绘制（w=h=点阵尺寸×s）
    pxSprite(ctx, art, palette, x, y, s, key) {
        const cv = this.px(art, palette, key);
        this.pxDraw(ctx, cv, x, y, cv.width * s, cv.height * s);
        return cv;
    },

    // ---------- 质感背景（带缓存）----------
    // 内容：底色渐变 → 中心柔光 → 微网格 → 四角暗角 → 顶亮/底暗边
    // 命中时刷新到队尾（维持严格 LRU 顺序，避免高频场景被新键挤掉）；达到上限淘汰队首
    scene(ctx, W, H, c1, c2) {
        const scale = ctx.__mgScale || 1;
        const key = `s|${c1}|${c2}|${W}x${H}|${scale.toFixed(2)}`;
        const c = this._caches.scene;
        let img = c.get(key);
        if (img) { c.delete(key); c.set(key, img); return ctx.drawImage(img, 0, 0, W, H); }
        img = this._buildScene(W, H, c1, c2, scale);
        if (c.size >= this.MAX_CACHE) c.delete(c.keys().next().value);
        c.set(key, img);
        ctx.drawImage(img, 0, 0, W, H);
    },
    // 手动清理缓存（切后台 / 大量换肤 / 内存紧张时调用）
    clearCache() {
        for (const k in this._caches) this._caches[k].clear();
        this._broomCache = null; this._pieceCache = null; this._fontCache = null;
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
        // 6) 主题装饰层（2026-09-12 v3）：按基色色相派生「场地感」，
        //    同一套场景公式不再千篇一律 —— 暖色=木质火光 / 绿=丛林草地 /
        //    蓝青=科技霓虹 / 紫粉=星云。装饰画在离屏缓存里，零每帧成本。
        this._themeDecor(x, W, H, c1);
        // 7) 细噪点颗粒（胶片感，压住大面积纯色的「塑料感」）
        const grainN = Math.round(W * H / 130);
        const gr = this._seedRng(Math.round(this.hue(c1) * 13 + 7));
        for (let i = 0; i < grainN; i++) {
            const gx = gr() * W, gy = gr() * H;
            x.fillStyle = gr() < 0.5 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.05)';
            x.fillRect(gx, gy, 1.2, 1.2);
        }
        return cv;
    },
    // 主题装饰：斜射光束 + 主题粒子/纹理。hue 决定主题，种子由色相派生（同色同纹）
    _themeDecor(x, W, H, c1) {
        const hue = this.hue(c1);
        const rng = this._seedRng(Math.round(hue * 97 + 13));
        // 斜射光束（所有主题通用：从左上斜切下来的两道体积光）
        try {
            x.save();
            x.globalCompositeOperation = 'lighter';
            for (let b = 0; b < 2; b++) {
                const bx = W * (0.12 + b * 0.34 + rng() * 0.08);
                const bw = W * (0.10 + rng() * 0.10);
                const bgd = x.createLinearGradient(bx, 0, bx + bw * 1.6, H);
                const wa = 0.045 - b * 0.015;
                bgd.addColorStop(0, `rgba(255,255,240,${wa})`);
                bgd.addColorStop(0.5, `rgba(255,255,240,${wa * 0.45})`);
                bgd.addColorStop(1, 'rgba(255,255,240,0)');
                x.fillStyle = bgd;
                x.beginPath();
                x.moveTo(bx, 0); x.lineTo(bx + bw, 0);
                x.lineTo(bx + bw * 2.4, H); x.lineTo(bx + bw * 0.9, H);
                x.closePath(); x.fill();
            }
            x.restore();
        } catch (e) { }
        // 主题粒子 / 纹理
        const warm = hue < 55 || hue >= 325;
        const nature = hue >= 55 && hue < 172;
        const tech = hue >= 172 && hue < 258;
        const dotCol = warm ? '255,190,110' : nature ? '190,235,160' : tech ? '120,210,255' : '225,160,255';
        try {
            x.save();
            if (nature) {
                // 草地：底部密草丛（细短竖线，两色渐层）
                const blades = Math.round(W / 3.2);
                for (let i = 0; i < blades; i++) {
                    const gx = rng() * W, gy = H * (0.62 + rng() * 0.38);
                    const gh = 3 + rng() * 7, lean = (rng() - 0.5) * 3;
                    x.strokeStyle = rng() < 0.5 ? 'rgba(160,220,120,0.07)' : 'rgba(40,80,40,0.16)';
                    x.lineWidth = 1;
                    x.beginPath(); x.moveTo(gx, gy); x.quadraticCurveTo(gx + lean * 0.5, gy - gh * 0.6, gx + lean, gy - gh); x.stroke();
                }
            } else if (tech) {
                // 霓虹：地平线上方的横向扫描光带 + 电路节点
                for (let s = 0; s < 4; s++) {
                    const sy = H * (0.30 + s * 0.16 + rng() * 0.04);
                    const sg = x.createLinearGradient(0, sy - 8, 0, sy + 8);
                    sg.addColorStop(0, 'rgba(120,210,255,0)');
                    sg.addColorStop(0.5, `rgba(140,220,255,${0.030 - s * 0.005})`);
                    sg.addColorStop(1, 'rgba(120,210,255,0)');
                    x.fillStyle = sg; x.fillRect(0, sy - 8, W, 16);
                }
                for (let n2 = 0; n2 < 10; n2++) {
                    const nx = rng() * W, ny = rng() * H;
                    x.strokeStyle = 'rgba(130,215,255,0.06)';
                    x.lineWidth = 1;
                    x.beginPath(); x.moveTo(nx, ny); x.lineTo(nx + (rng() - 0.5) * 60, ny); x.lineTo(nx + (rng() - 0.5) * 60, ny + (rng() - 0.5) * 40); x.stroke();
                    x.fillStyle = 'rgba(140,220,255,0.10)';
                    x.beginPath(); x.arc(nx, ny, 1.6, 0, 6.284); x.fill();
                }
            } else if (!warm) {
                // 星云：星点 + 一团彩色星云光
                for (let s = 0; s < 26; s++) {
                    const sx = rng() * W, sy = rng() * H, sr = 0.6 + rng() * 1.5;
                    x.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.13})`;
                    x.beginPath(); x.arc(sx, sy, sr, 0, 6.284); x.fill();
                }
                const nx = W * (0.25 + rng() * 0.5), ny = H * (0.2 + rng() * 0.35), nr = Math.max(W, H) * 0.28;
                const ng = x.createRadialGradient(nx, ny, 0, nx, ny, nr);
                ng.addColorStop(0, `rgba(${dotCol},0.05)`);
                ng.addColorStop(1, `rgba(${dotCol},0)`);
                x.fillStyle = ng; x.fillRect(0, 0, W, H);
            }
            // 漂浮光斑（所有主题）：近大远小的 bokeh
            const bokeh = 9 + Math.round(rng() * 5);
            for (let i = 0; i < bokeh; i++) {
                const bx = rng() * W, by = rng() * H, br = 2 + rng() * 8, ba = 0.035 + rng() * 0.07;
                const bgd = x.createRadialGradient(bx, by, 0, bx, by, br);
                bgd.addColorStop(0, `rgba(${dotCol},${ba.toFixed(3)})`);
                bgd.addColorStop(0.7, `rgba(${dotCol},${(ba * 0.4).toFixed(3)})`);
                bgd.addColorStop(1, `rgba(${dotCol},0)`);
                x.fillStyle = bgd;
                x.beginPath(); x.arc(bx, by, br, 0, 6.284); x.fill();
            }
            x.restore();
        } catch (e) { }
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
        const _fk = w + '|' + Math.round(size) + '|' + font;
        const _fc = this._fontCache || (this._fontCache = {});
        ctx.font = _fc[_fk] || (_fc[_fk] = (w + ' ' + Math.round(size) + 'px ' + font));   // 字体串缓存（优化 P2-9）
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
        const c = this._caches.wood;
        let img = c.get(key);
        if (!img) {
            // 只按 (0,0) 烘焙位图，再由 drawImage(img,x,y) 放置 —— 缓存 key 不含 x,y，
            // 若把 x,y 烤进像素，不同位置的木框会复用错位位图（右下露出透明底）。
            img = this._buildWood(0, 0, W, H, c1, c2, seed, scale);
            if (c.size >= this.MAX_CACHE) c.delete(c.keys().next().value);
            c.set(key, img);
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
        const c = this._caches.glow;
        let img = c.get(key);
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
            c.set(key, img);
            if (c.size >= this.MAX_CACHE) c.delete(c.keys().next().value);
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
};

// ================= 创建自适应 canvas（填满容器，HiDPI 锐化）=================
//   逻辑坐标系 (w,h) 不变；底层 backing store = w * deviceScale 像素
//   ctx.setTransform(deviceScale) 让游戏继续按 w,h 画，自动按 backing 倍数
//   输出。设备像素比 + 容器放大倍数共同决定 deviceScale（封顶 3）。
MG.canvas = function (parent, w, h) {
    const c = document.createElement('canvas');
    c.style.maxWidth = '100%';
    c.style.maxHeight = '100%';
    c.style.touchAction = 'none';
    parent.innerHTML = '';
    parent.appendChild(c);
    const ctx = c.getContext('2d');
    // 启动即解锁音频（游戏均在用户点击「开始」手势内启动，满足 Web Audio 策略）
    try { MG.audio && MG.audio.unlock && MG.audio.unlock(); } catch (e) { }
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
    // 窗口 resize 风暴在低端面会反复重建 backing store，用 rAF 节流（优化 P2-8）
    let _resizeRAF = 0;
    const onResize = () => {
        if (_resizeRAF) return;
        _resizeRAF = requestAnimationFrame(() => { _resizeRAF = 0; try { fit(); } catch (e) { } });
    };
    window.addEventListener('resize', onResize);
    // 监听父容器尺寸变化（侧栏展开 / 弹窗 / 旋转 / 容器变化但窗口不变），销毁时断开
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => { try { fit(); } catch (e) { } });
        try { ro.observe(parent); } catch (e) { ro = null; }
    }
    // 绑在 canvas 上：让 MG.bind / 自定义事件处理能从 c.__mgW 推出 deviceScale
    // （不依赖 ctx.__mgScale，因为部分外部代码取不到 ctx）
    c.__mgW = w; c.__mgH = h;
    return { c, ctx, w, h, fit, destroy() { window.removeEventListener('resize', onResize); if (ro) { try { ro.disconnect(); } catch (e) { } } } };
};

// ================= 分层渲染辅助（issue #13）=================
// 把「静态背景 / 游戏对象 / 特效 / HUD」拆成独立离屏层，避免每帧重绘整张画布：
//   - 背景层（bg）：只在 bgDirty 时重绘一次（如 MG.gfx.scene / 棋盘 / 地图），之后只 blit
//   - HUD 层（hud）：只在 markHudDirty() 时重绘，之后只 blit（屏幕固定、不随相机滚动）
// 用法见 _engine.js：cfg.renderMode='layered' + cfg.bg(可选) + cfg.hud(可选)，
// 游戏在状态变化时调用 api.markHudDirty() / api.markBgDirty()，引擎据此决定重绘。
MG.makeLayered = function (W, H, scale) {
    const s = scale && scale > 0 ? scale : 1;
    const mk = () => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * s));
        c.height = Math.max(1, Math.round(H * s));
        const x = c.getContext('2d');
        x.setTransform(s, 0, 0, s, 0, 0);   // 离屏按 deviceScale 渲染，保证高分屏不糊
        x.__mgScale = s;
        return { c, x };
    };
    const bg = mk(), hud = mk();
    return {
        W, H, scale: s,
        bgCv: bg.c, bgCtx: bg.x,
        hudCv: hud.c, hudCtx: hud.x,
        bgDirty: true, hudDirty: true,
        // 主 ctx 已带 deviceScale transform，blit 时按逻辑 W×H 绘制即可（位图本身已按 scale 放大）
        blitBg(ctx) { try { ctx.drawImage(this.bgCv, 0, 0, W, H); } catch (e) { } },
        blitHud(ctx) { try { ctx.drawImage(this.hudCv, 0, 0, W, H); } catch (e) { } },
        markBgDirty() { this.bgDirty = true; },
        markHudDirty() { this.hudDirty = true; },
        // 跟随 deviceScale 重建离屏层（见 issue #4）：旋转屏幕 / 窗口缩放 / 高 DPI 变化后，
        // MG.canvas.fit() 会改变 backing 倍率，离屏层若不同步就会变糊或尺寸策略不一致。
        resize(s) {
            if (!s || s <= 0 || Math.abs(s - this.scale) < 0.05) return;
            this.scale = s;
            const rebuild = (o) => {
                o.c.width = Math.max(1, Math.round(W * s));
                o.c.height = Math.max(1, Math.round(H * s));
                o.x.setTransform(s, 0, 0, s, 0, 0);
                o.x.__mgScale = s;
            };
            rebuild(bg); rebuild(hud);
            this.bgDirty = true; this.hudDirty = true;
        },
    };
};
