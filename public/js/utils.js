// 资源名称 / 图标（全局共用：营地、冒险结算、后台邮件等）
const RES_NAME = { gold: '金币', wood: '木材', iron: '铁矿', stone: '石币', exp: '经验', gems: '钻石', wishCards: '许愿卡' };
const RES_ICON = { gold: '💰', wood: '🪵', iron: '⛓', stone: '🪨', exp: '📘', gems: '💎', wishCards: '🎴' };

// 工具函数
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
    imgSrc(file) { return '/img/' + file; },

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

window.U = U;