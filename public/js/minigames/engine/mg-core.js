// 小游戏引擎 · 核心模块（mg-core.js）
// 职责：命名空间引导、数学/RNG 工具、3D 懒加载、触感反馈、安全与错误上报。
// 本文件必须最先加载，负责建立 window.MG。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 碰撞与数学小工具 =================
MG.hit = {
    rect(x, y, w, h, x2, y2, w2, h2) { return x < x2 + w2 && x + w > x2 && y < y2 + h2 && y + h > y2; },
    circle(x1, y1, r1, x2, y2, r2) { const dx = x2 - x1, dy = y2 - y1, r = r1 + r2; return dx * dx + dy * dy <= r * r; },
    inRect(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; },
    inCircle(px, py, cx, cy, r) { const dx = px - cx, dy = py - cy; return dx * dx + dy * dy <= r * r; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
};

// ================= 3D 能力预留（按需懒加载，绝不进全局包）=================
// 关键：Three.js 约 600KB。若写进 index.html 的 <script>，107 款 2D 游戏的用户
// 每次进游戏都要白下载这 600KB —— 首屏直接变慢。
// 这里用动态 import()：只有真正调用 load3D() 的 3D 游戏才会去取，2D 游戏零开销。
// 想离线 / 内网部署：把 three.module.js 放进 public/vendor/，改 MG.THREE_URL 即可。
MG.THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
MG._threeP = null;
MG.load3D = function (url) {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (this._threeP) return this._threeP;
    const u = url || this.THREE_URL;
    this._threeP = import(/* webpackIgnore: true */ u)
        .then(m => { window.THREE = m; return m; })
        .catch(e => { this._threeP = null; throw e; });
    return this._threeP;
};

// ================= 轻量 Toast（DOM 层，不占 canvas、不挡画面）=================
// 用法：MG.toast(container, '连击 x3!', { ms: 1200, color: '#ffd56b' })
MG.toast = function (parent, text, o) {
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
};

// ================= 随机工具 =================
MG.ri = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
MG.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
MG.shuffle = function (a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ================= 触感反馈（移动端震感，桌面端空操作）=================
// 用法：MG.haptics('hit') / MG.haptics.tap() / MG.haptics.bomb()
MG.haptics = function (pattern) {
    try { if (navigator.vibrate) { const p = typeof pattern === 'string' ? (MG.haptics.P[pattern] || [10]) : pattern; navigator.vibrate(p); } } catch (e) { }
};
MG.haptics.P = { tap: [8], hit: [18], bomb: [40, 20, 40], win: [20, 30, 20, 30, 40], lose: [60, 40, 60] };
MG.haptics.tap = () => MG.haptics('tap');
MG.haptics.hit = () => MG.haptics('hit');
MG.haptics.bomb = () => MG.haptics('bomb');
MG.haptics.win = () => MG.haptics('win');
MG.haptics.lose = () => MG.haptics('lose');

// ================= 安全与错误上报 =================
// HTML 转义：所有外部/服务端数据（榜单昵称、关卡名、描述、结算行）渲染前必须经过它
MG.escapeHtml = function (s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
// 统一错误入口：引擎在 draw/tick 异常时调用。测试模式（__MG_TEST）继续抛出交给断言；
// 生产模式记录上下文（游戏 ID / 阶段）并交由引擎优雅停机 + 提示。
MG.onError = function (err, ctx) {
    const info = Object.assign({ ts: Date.now() }, ctx || {});
    try { console.error('[MG] 游戏异常', info, err); } catch (e) {}
    if (window.__MG_TEST) throw err;
    return err;
};
MG.showGameError = function (parent) {
    try {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(20,24,40,.92);color:#ff9aa6;padding:14px 18px;border-radius:10px;font-size:14px;z-index:99;text-align:center;pointer-events:none';
        el.textContent = '游戏异常，请重试';
        (parent || document.body).appendChild(el);
        setTimeout(() => el.remove(), 2600);
    } catch (e) {}
};
