// 资源名称 / 图标（全局共用：营地、冒险结算、后台邮件等）
const RES_NAME = { gold: '金币', wood: '木材', iron: '铁矿', stone: '石币', exp: '经验', gems: '钻石', wishCards: '许愿卡' };
// SVG 图标：跨设备显示一致、颜色可控（emoji 在不同平台差异大且难看）
const _svg = (inner) => `<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-2.5px" aria-hidden="true">${inner}</svg>`;
const RES_ICON = {
    gold: '💰',
    gems: '💎',
    wishCards: '🎴',
    wood: _svg(`
        <rect x="2" y="8.6" width="14.2" height="6.8" rx="2.2" fill="#a06a3c"/>
        <path d="M4.6 9.5 h10.6 v5 h-10.6 a1.6 1.6 0 0 1 -1.6 -1.6 v-1.8 a1.6 1.6 0 0 1 1.6 -1.6 z" fill="#b57a46"/>
        <ellipse cx="16.8" cy="12" rx="3.4" ry="3.7" fill="#e0b482"/>
        <ellipse cx="16.8" cy="12" rx="2.1" ry="2.3" fill="none" stroke="#bb8a55" stroke-width="0.9"/>
        <ellipse cx="16.8" cy="12" rx="0.9" ry="1" fill="#bb8a55"/>
        <rect x="5" y="10.6" width="8" height="1" rx="0.5" fill="#8a5732" opacity="0.55"/>`),
    iron: _svg(`
        <path d="M12 3.2 L20.2 8.6 L17.6 19.4 L6.4 19.4 L3.8 8.6 Z" fill="#93a0b6"/>
        <path d="M12 3.2 L20.2 8.6 L12 12.4 L3.8 8.6 Z" fill="#b9c5d8"/>
        <path d="M12 12.4 L20.2 8.6 L17.6 19.4 Z" fill="#8894ab"/>
        <path d="M12 12.4 L6.4 19.4 L3.8 8.6 Z" fill="#76839c"/>
        <path d="M12 12.4 L17.6 19.4 L6.4 19.4 Z" fill="#6b7890"/>
        <circle cx="9.4" cy="10" r="0.85" fill="#eef3fa"/>`),
    stone: _svg(`
        <circle cx="12" cy="12" r="9.4" fill="#98a3b5"/>
        <circle cx="12" cy="12" r="7.8" fill="none" stroke="#7b8899" stroke-width="1"/>
        <rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1" fill="#5c6779"/>
        <path d="M6.2 7.4 Q9.4 4.8 13.8 5.3" stroke="#c6cfdb" stroke-width="1.5" fill="none" stroke-linecap="round"/>`),
    exp: _svg(`
        <path d="M2.5 6.8 Q6.5 5 11 6.6 L11 17.8 Q6.5 16.2 2.5 18 Z" fill="#eef7ee"/>
        <path d="M21.5 6.8 Q17.5 5 13 6.6 L13 17.8 Q17.5 16.2 21.5 18 Z" fill="#dff0e0"/>
        <path d="M11 6.6 Q12 5.9 13 6.6 L13 17.8 Q12 17.1 11 17.8 Z" fill="#4caf62"/>
        <path d="M4.4 9 Q7 8 9.3 8.8 M4.4 11.6 Q7 10.6 9.3 11.4" stroke="#9cc7a4" stroke-width="0.9" fill="none" stroke-linecap="round"/>
        <path d="M14.7 8.8 Q17 8 19.6 9 M14.7 11.4 Q17 10.6 19.6 11.6" stroke="#9cc7a4" stroke-width="0.9" fill="none" stroke-linecap="round"/>`),
};

// 顶栏占位图标填充（index.html 用 <i data-res-icon="wood"></i> 占位，这里统一注入）
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-res-icon]').forEach(el => {
        el.innerHTML = RES_ICON[el.dataset.resIcon] || '';
    });
});

// 工具函数
const IMG_V = '20260918b'; // 立绘/头像资源版本号：重生成后 +1 让浏览器强制刷新缓存
const U = {
    el(html) {
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstChild;
    },
    fmt(num) {
        if (num == null) return '0';
        if (num >= 1e8) return (num / 1e8).toFixed(2) + '亿';
        if (num >= 1e4) return (num / 1e4).toFixed(2) + '万';
        return Math.floor(num).toString();
    },
    // 精确数字（千分位），用于钻石这类需要看清楚具体数值的资源
    num(n) {
        return Math.floor(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    // 把秒数显示成 x小时y分 / x分y秒
    dur(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        if (h) return `${h} 小时 ${m} 分`;
        if (m) return `${m} 分 ${s} 秒`;
        return `${s} 秒`;
    },
    toast(text) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = text;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1600);
    },
    confirm(text) { return window.confirm(text); },
    openModal(html) {
        const root = document.getElementById('modal-root');
        root.innerHTML = '';
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = html + '<button class="modal-close" data-close>×</button>';
        mask.appendChild(modal);
        root.appendChild(mask);
        mask.addEventListener('click', e => {
            if (e.target === mask || e.target.dataset.close !== undefined) U.closeModal();
        });
        return modal;
    },
    closeModal() {
        document.getElementById('modal-root').innerHTML = '';
    },
    rarityClass(r) { return 'rarity-' + r.replace('+', '\\+'); },
    imgSrc(file) { return '/img/' + file + '?v=' + IMG_V; },

    /* ---------- 星级标识（1-16 星，头像下方显示，最多 5 颗） ----------
       1-5   黄色 n 颗      6-10  红色 (n-5) 颗
       11-14 彩虹 (n-10) 颗 15    至尊（紫金 5 星 + 角标 15）
       16    MAX（金冠 + 流光）
    ------------------------------------------------------------------ */
    starMarks(star) {
        const s = Math.max(0, Math.min(16, parseInt(star || 0, 10)));
        if (s <= 0) return null;
        if (s >= 16) return { cls: 'max', glyph: '★', count: 5, num: 'MAX', crown: true, title: '16 星 · 满星' };
        if (s === 15) return { cls: 'royal', glyph: '★', count: 5, num: '15', crown: true, title: '15 星 · 至尊' };
        if (s >= 11) return { cls: 'rainbow', glyph: '★', count: s - 10, num: '', title: s + ' 星 · 彩虹' };
        if (s >= 6) return { cls: 'red', glyph: '★', count: s - 5, num: '', title: s + ' 星 · 赤焰' };
        return { cls: 'yellow', glyph: '★', count: s, num: '', title: s + ' 星' };
    },
    // 内嵌皇冠 SVG（兼容所有平台，不依赖 emoji 字体）
    _crown() {
        return '<svg viewBox="0 0 12 12" width="11" height="11" style="vertical-align:-1px;margin-right:2px">' +
            '<path d="M1 9 L2 4 L4 6 L6 1 L8 6 L10 4 L11 9 Z" fill="#ffd56b" stroke="#c99a2e" stroke-width="0.6" stroke-linejoin="round"/>' +
            '<rect x="1" y="9" width="10" height="1.6" fill="#c99a2e"/></svg>';
    },
    starHtml(star, size) {
        const m = this.starMarks(star);
        if (!m) return '';
        const st = size ? `font-size:${size}px;` : '';
        const body = `<span class="s">${(m.crown ? this._crown() : '') + m.glyph.repeat(m.count)}</span>`;
        const num = m.num ? `<span class="num">${m.num}</span>` : '';
        return `<span class="stars ${m.cls}" style="${st}" title="${m.title}">${body}${num}</span>`;
    },
    // 战斗 canvas 用的星级颜色
    starColor(star) {
        const m = this.starMarks(star);
        if (!m) return '#cfc9e8';
        return { yellow: '#ffd56b', red: '#ff4d5e', rainbow: '#ff7adf', royal: '#ff7adf', max: '#ffe9a8' }[m.cls];
    },
    // 品质色与名（前端静态副本，与后端 DB._meta 一致）
    quality: {
        order: ['green', 'blue', 'purple', 'orange', 'red', 'gold', 'rainbow'],
        name: { green: '优秀', blue: '精良', purple: '史诗', orange: '传说', red: '远古', gold: '太古', rainbow: '神话' },
        color: { green: '#5cd65c', blue: '#5cc7ff', purple: '#b78bff', orange: '#ff9d5c', red: '#ff5252', gold: '#ffd56b', rainbow: '#ff7adf' },
        cls: (q) => 'q-' + q,
    },
    fmtNum(n) {
        if (n == null) return '0';
        if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
        if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + '万';
        return Math.floor(n).toString();
    },
};

/* ---------- 共享「打击感」服务（主玩法战斗与 MG 小游戏共用同一套特效底座）----------
 * 底座直接复用 MG 引擎的相机/粒子池（mg-effects.js 已在 index.html 启动期加载，纯 canvas 工具，
 * 不依赖 MG.runGame 循环）：
 *   - 震屏/缩放冲击：MG.cam（阻尼双频抖动 + 可选 zoom 冲击，优于 battle.js 原随机抖动）
 *   - 粒子/飘字/冲击波/全屏闪：MG.fxPool（对象池化、带 glow、尊重减弱动效与画质分级）
 *   - 全局顿帧：沿用 battle.js 模型（冻结整个战斗 dt，比 MG.fxPool.hitstop 仅冻结特效池更强）
 * 若 MG 缺失（极旧构建 / 测试桩），所有方法降级为空操作 + 标量随机抖动兜底，保证不抛错、
 * 不影响数值与时序。battle.js 与任意未来主玩法场景都走这里，即与 MG 小游戏共用同一套打击感。
 */
U.fx = {
    _hs: 0, _cam: null, _pool: null, _fallbackShake: 0,
    _mg() { try { return (typeof window !== 'undefined' && window.MG) ? window.MG : null; } catch (e) { return null; } },
    cam() { if (this._cam === null) { const MG = this._mg(); this._cam = (MG && MG.cam) ? MG.cam() : false; } return this._cam || null; },
    pool() { if (this._pool === null) { const MG = this._mg(); this._pool = (MG && MG.fxPool) ? MG.fxPool(480) : false; } return this._pool || null; },

    // 全局顿帧（命中定格，纯表现）：传入定格秒数，返回是否处于定格中；调用方据此压低本帧 dt
    hitStop(sec) { this._hs = Math.max(this._hs, sec || 0); return this._hs > 0; },
    consumeHitStop(dt) { if (this._hs > 0) this._hs = Math.max(0, this._hs - dt); return this._hs > 0; },

    // 震屏（amt 像素幅度，dur 秒）；MG 缺失时退化为标量随机抖动
    shake(amt, dur) {
        const c = this.cam();
        if (c) { c.shake(amt, dur || 0.35); return; }
        this._fallbackShake = Math.max(this._fallbackShake, amt || 0);
    },
    updateCam(dt) { const c = this.cam(); if (c) c.update(dt); else this._fallbackShake = Math.max(0, this._fallbackShake - dt * 30); },
    applyCam(ctx, W, H) {
        const c = this.cam();
        if (c) { c.apply(ctx, W, H); return; }
        if (this._fallbackShake > 0.2) ctx.translate((Math.random() - 0.5) * this._fallbackShake, (Math.random() - 0.5) * this._fallbackShake);
    },

    // 粒子 / 飘字 / 冲击波 / 全屏闪：直接转发 MG.fxPool，缺失则降级空操作
    burst(x, y, o) { const p = this.pool(); if (p) p.burst(x, y, o); },
    text(x, y, s, o) { const p = this.pool(); if (p) p.text(x, y, s, o); },
    ring(x, y, o) { const p = this.pool(); if (p) p.ring(x, y, o); },
    flash(col, amt, dur) { const p = this.pool(); if (p) p.flash(col, amt, dur); },
    update(dt) { const p = this.pool(); if (p) p.update(dt); },
    draw(ctx, W, H) { const p = this.pool(); if (p) p.draw(ctx, W, H); },
};

/* ---------- 共享数学 / 碰撞 / RNG（抽 MG.hit / MG.ri / MG.pick / MG.shuffle，比 battle.js 内联更全）----------
 * 主玩法战斗与未来主玩法场景共用，避免各写一套 Math.random / clamp / 碰撞。
 */
U.math = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    inRect(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; },
    inCircle(px, py, cx, cy, r) { const dx = px - cx, dy = py - cy; return dx * dx + dy * dy <= r * r; },
    ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    rgba(hex, a) {
        const h = ('' + hex).replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    },
};

/* ---------- 共享画布初始化（抽 MG.canvas 的健壮实现）----------
 * 比 battle.js 原 resize() 强：aspect-contain 不变形、renderScale、backing 封顶3、
 *   rAF 节流 resize、ResizeObserver 监听容器变化。MG 缺失 / 测试桩下仍可降级运行。
 *   mode: 'contain'（默认，设计分辨率居中不变形）| 'fill'（铺满，旧 battle 行为）。
 */
U.canvas = {
    setup(canvas, w, h, parent, opts) {
        opts = opts || {};
        const mode = opts.mode || 'contain';
        const cap = opts.renderScaleCap || 3;
        const ctx = canvas.getContext('2d');
        const getParent = () => parent || canvas.parentElement || (typeof document !== 'undefined' ? document.body : null);
        const _rs = () => { try { const s = (window.MG && window.MG.settings && window.MG.settings.renderScale); return (s > 0 ? s : 1); } catch (e) { return 1; } };
        let scale = 1, ox = 0, oy = 0, dev = 0;
        const applyTransform = () => { ctx.setTransform(scale, 0, 0, scale, ox, oy); };
        const fit = () => {
            const p = getParent();
            const cw = (p && p.clientWidth) || canvas.clientWidth || w;
            const ch = (p && p.clientHeight) || canvas.clientHeight || h;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const rs = _rs();
            const dprs = Math.min(cap, dpr * rs);
            const cw2 = Math.max(1, Math.round(cw * dprs)), ch2 = Math.max(1, Math.round(ch * dprs));
            if (canvas.width !== cw2 || canvas.height !== ch2) { canvas.width = cw2; canvas.height = ch2; }
            if (mode === 'contain') {
                const dispScale = Math.min(cw / w, ch / h) || 1;     // css 显示倍率
                scale = dispScale * dprs;                            // backing px / 逻辑单位
                ox = (canvas.width - w * scale) / 2;                 // 居中偏移
                oy = (canvas.height - h * scale) / 2;
            } else {
                scale = dprs; ox = 0; oy = 0;
            }
            applyTransform();
            try { ctx.__mgScale = scale; canvas.__mgW = w; canvas.__mgH = h; } catch (e) {}
        };
        fit();
        let raf = 0;
        const onResize = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; try { fit(); } catch (e) { } }); };
        window.addEventListener('resize', onResize);
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') { try { ro = new ResizeObserver(() => { try { fit(); } catch (e) { } }); const p = getParent(); if (p) ro.observe(p); } catch (e) { ro = null; } }
        return {
            fit,
            base(c) { if (c && c.setTransform) c.setTransform(scale, 0, 0, scale, ox, oy); },
            get scale() { return scale; }, get ox() { return ox; }, get oy() { return oy; },
            destroy() { window.removeEventListener('resize', onResize); if (ro) { try { ro.disconnect(); } catch (e) { } } },
        };
    },
};

/* ---------- 共享主循环 / 帧调度（抽 MG _engine.makeLoop 的健壮实现）----------
 * 比 battle.js 原 loop() 强：dt 限幅[0,50ms]、长时间挂起不追帧（死亡螺旋保护）、
 *   try/catch 错误隔离（连错 5 次才停机并提示）、paused 时仍重绘不推进、alive 钩子。
 * 无 requestAnimationFrame（测试 / WebView）时退化为 setTimeout。
 */
U.loop = function (o) {
    o = o || {};
    const SCH = (typeof requestAnimationFrame === 'function')
        ? { schedule: cb => requestAnimationFrame(cb), cancel: id => cancelAnimationFrame(id) }
        : { schedule: cb => setTimeout(() => cb((typeof performance !== 'undefined' ? performance.now() : Date.now())), 16), cancel: id => clearTimeout(id) };
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let rafId = null, running = false, last = 0, errs = 0;
    const advance = (rawSec) => {
        let raw = rawSec; if (!(raw >= 0)) raw = 0; if (raw > 0.25) raw = 0.25; // 挂起>0.25s 不追帧
        const sc = (typeof o.timeScale === 'function' ? o.timeScale() : 1);
        const dt = Math.max(0, Math.min(0.05, raw * (sc > 0 ? sc : 0)));        // dt 限幅[0,50ms]
        try { if (o.variable) o.variable(dt); errs = 0; }
        catch (e) {
            errs++;
            if (errs > 5) { running = false; rafId = null; try { (U.onFatal || (window.MG && window.MG.showGameError) || function () { })(e); } catch (_) {} return; }
        }
        if (o.render) { try { o.render(); } catch (e) {} }
    };
    const tick = () => {
        if (!running) return;
        if (o.alive && !o.alive()) { running = false; rafId = null; return; }
        rafId = SCH.schedule(tick);
        const t = now();
        const raw = last ? (t - last) / 1000 : 0; last = t;
        if (o.paused && o.paused()) { if (o.render) { try { o.render(); } catch (e) {} } return; }
        advance(raw);
    };
    return {
        start() { if (running) return; running = true; last = now(); rafId = SCH.schedule(tick); },
        stop() { running = false; if (rafId) { SCH.cancel(rafId); rafId = null; } },
        advance(ms) { if (o.alive && !o.alive()) return; return advance((ms == null ? 16.7 : ms) / 1000); },
        get running() { return running; },
    };
};

window.U = U;