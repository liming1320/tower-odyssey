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