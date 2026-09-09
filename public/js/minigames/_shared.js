// 小游戏共享工具：创建 canvas、基础渲染、按钮、事件
window.MiniGames = window.MiniGames || {};
const MG = {
    // 创建自适应 canvas（填满容器）
    canvas(parent, w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.style.maxWidth = '100%'; c.style.maxHeight = '100%';
        c.style.touchAction = 'none';
        parent.innerHTML = '';
        parent.appendChild(c);
        const ctx = c.getContext('2d');
        // 自适应缩放：保持宽高比，居中
        const fit = () => {
            const pw = parent.clientWidth, ph = parent.clientHeight;
            const s = Math.min(pw / w, ph / h);
            c.style.width = (w * s) + 'px';
            c.style.height = (h * s) + 'px';
        };
        fit();
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
    }
};
window.MG = MG;
