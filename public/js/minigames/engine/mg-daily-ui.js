// 小游戏引擎 · 每日挑战落地 + 分享码（mg-daily-ui.js）—— 体验 E4
window.MG = window.MG || {}; var MG = window.MG;
// 把 MG.daily.seed() 接入游戏的确定性 rng，并生成「分享码」让好友拿到同一道题。
// 游戏侧用法：
//   const seed = MG.daily.seed('gomoku');            // 当天固定种子
//   api.rng = MG.makeRng(seed);                       // 用确定性 rng 出题
//   MG.dailyUI.mount(container, { seed, game: 'gomoku' });  // 渲染「今日挑战 + 分享」面板
// 分享码形如 DC-gomoku-1a2b3c（种子 base36 + 游戏 id），可粘贴给好友复现同一局。
MG.dailyUI = {
    code(seed, game) {
        try { return 'DC-' + (game || 'mg') + '-' + ((seed >>> 0).toString(36)); } catch (e) { return ''; }
    },
    parse(str) {
        try {
            const m = /^DC-([a-z0-9]+)-([0-9a-z]+)$/i.exec((str || '').trim());
            if (!m) return null;
            return { game: m[1], seed: (parseInt(m[2], 36) >>> 0) };
        } catch (e) { return null; }
    },
    mount(container, opt) {
        if (!container) return null;
        opt = opt || {};
        const wrap = document.createElement('div'); wrap.className = 'mg-daily';
        const code = this.code(opt.seed, opt.game);
        wrap.innerHTML = '<div class="mg-daily-badge">今日挑战 · ' + (MG.escapeHtml ? MG.escapeHtml(opt.game || '') : (opt.game || '')) + '</div>'
            + '<div class="mg-daily-code">分享码：<code>' + code + '</code> <button class="mg-daily-copy" type="button">复制</button></div>';
        const btn = wrap.querySelector('.mg-daily-copy');
        btn.onclick = () => { try { if (navigator.clipboard) navigator.clipboard.writeText(code); btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '复制'; }, 1200); } catch (e) {} };
        container.appendChild(wrap);
        return wrap;
    },
};
