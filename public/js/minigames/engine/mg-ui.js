// 小游戏引擎 · UI 模块（mg-ui.js）
// 职责：选关界面、结算弹窗、排行榜、猜拳、统一游戏关卡化框架（runGame）、
//       轻量 overlay / hint / 按钮。所有外部/服务端文本均经 MG.escapeHtml 转义（见 issue #7）。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 轻量浮层 / 提示 / 按钮 =================
MG.overlay = function (parent, html) {
    const o = document.createElement('div');
    o.className = 'mg-overlay';
    o.innerHTML = html;
    parent.appendChild(o);
    return o;
};
MG.hint = function (parent, cfg, api) {
    const wrap = document.createElement('div');
    wrap.className = 'mg-hint';
    let text = cfg, solver = null, label = '提示';
    if (cfg && typeof cfg === 'object') { text = cfg.text; solver = cfg.solver; label = cfg.label || '提示'; }
    if (text) { const t = document.createElement('div'); t.className = 'mg-hint-text'; t.textContent = text; wrap.appendChild(t); }
    if (solver) {
        const b = document.createElement('button'); b.className = 'mg-hint-btn'; b.textContent = label;
        b.onclick = () => { try { const r = solver(api); if (r && typeof r === 'string') { const m = document.createElement('div'); m.className = 'mg-hint-text'; m.textContent = r; wrap.appendChild(m); } } catch (e) {} };
        wrap.appendChild(b);
    }
    parent.appendChild(wrap);
    return wrap;
};
// 圆形按钮
MG.btn = function (parent, text, onClick) {
    const b = document.createElement('button');
    b.className = 'mg-btn';
    b.textContent = text;
    b.onclick = onClick;
    parent.appendChild(b);
    return b;
};

// ================= 胜利/失败 演出特效（juice）=================
// 彩带、闪屏：所有游戏在 MG.result 自动调用，零改动即获得通关庆祝 / 失败反馈。
// 不依赖任何外部素材；canvas 覆盖层自动清理，不影响游戏实例回收。
MG.juice = {
    confetti(parent, opt) {
        opt = opt || {};
        try {
            const W = Math.max(160, parent.clientWidth || 320);
            const H = Math.max(200, parent.clientHeight || 420);
            const cv = document.createElement('canvas');
            cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;';
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
            parent.appendChild(cv);
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
            const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
            const colors = opt.colors || ['#ffd56b', '#7adf7a', '#5cc7ff', '#ff7a8b', '#c79bff', '#ff9d5c', '#ffe896'];
            const N = opt.count || 90;
            const ps = [];
            for (let i = 0; i < N; i++) ps.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 2.6, vy: 2 + Math.random() * 3, r: 4 + Math.random() * 5, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35, c: colors[i % colors.length] });
            const start = performance.now();
            const tick = () => {
                const el = (performance.now() - start) / 1000;
                x.clearRect(0, 0, W, H);
                let onscreen = false;
                for (const p of ps) {
                    p.vy += 0.16; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                    if (p.y < H + 24) onscreen = true;
                    const a = Math.max(0, Math.min(1, (H - p.y + 60) / H));
                    x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.globalAlpha = a;
                    x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r * 0.6, p.r, p.r * 1.2);
                    x.restore();
                }
                if (onscreen && el < 2.2) requestAnimationFrame(tick);
                else cv.remove();
            };
            requestAnimationFrame(tick);
        } catch (e) { }
    },
    flash(parent, color) {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;inset:0;background:' + (color || 'rgba(255,60,80,0.28)') + ';pointer-events:none;z-index:35;opacity:1;transition:opacity .5s ease';
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
            parent.appendChild(d);
            requestAnimationFrame(() => { d.style.opacity = '0'; });
            setTimeout(() => { try { d.remove(); } catch (_) { } }, 540);
        } catch (e) { }
    },
};

// ================= 关卡选择界面 =================
// cfg: { game, title, levels:[{name,desc}], onStart(idx, lv), extra:[{label,onClick}] }
MG.levelSelect = function (container, cfg) {
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
};

// ================= 结算弹窗 =================
// cfg: {win, title, stars, lines:[], onRetry, onNext, hasNext}
MG.result = function (container, cfg) {
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
    try {
        MG.audio && MG.audio.unlock && MG.audio.unlock();
        if (cfg.win) {
            MG.audio && MG.audio.sfx && MG.audio.sfx('levelup');
            MG.juice && MG.juice.confetti(o, {});
        } else {
            MG.audio && MG.audio.sfx && MG.audio.sfx('fail');
            MG.juice && MG.juice.flash(o, 'rgba(255,60,80,0.22)');
        }
    } catch (e) { }
    o.querySelector('[data-a=retry]').onclick = () => { o.remove(); cfg.onRetry && cfg.onRetry(); };
    const nb = o.querySelector('[data-a=next]');
    if (nb) nb.onclick = () => { o.remove(); cfg.onNext && cfg.onNext(); };
    const bb = o.querySelector('[data-a=back]');
    if (bb) bb.onclick = () => { o.remove(); cfg.onBack && cfg.onBack(); };
    return o;
};

// ================= 猜拳定先手（暗棋圣手）=================
MG.rps = function (container, cb) {
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
};

// ================= 排行榜（调用 /api/minigame/rank 渲染 TOP 20）=================
MG.showRank = async function (gameId, title) {
    let data = { list: [] };
    try {
        const tk = localStorage.getItem('game-token');
        const r = await fetch('/api/minigame/rank?game=' + encodeURIComponent(gameId), tk ? { headers: { 'Authorization': 'Bearer ' + tk } } : {});
        data = await r.json();
    } catch (e) { data = { list: [] }; }
    const html = `<h3>🏆 ${MG.escapeHtml(title) || gameId} · 榜单 TOP 20</h3>
        <div style="max-height:380px;overflow:auto;margin-top:8px">
        ${data.list.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr style="color:#ffd56b;border-bottom:1px solid #555"><th style="padding:4px;text-align:left">#</th><th style="text-align:left">玩家</th><th style="text-align:right">积分</th></tr>
            ${data.list.map((x, i) => `<tr style="border-bottom:1px solid #2a3450"><td style="padding:5px;color:${i < 3 ? '#ffd56b' : '#7a90d8'};font-weight:bold">${x.rank}</td><td>${x.isAdmin ? '👑 ' : ''}${MG.escapeHtml(x.nickname)}</td><td style="text-align:right;color:#5cc7ff;font-weight:bold">${x.score}</td></tr>`).join('')}
            </table>` : '<p style="color:#7a90d8;padding:30px;text-align:center">还没人上榜，快来当第一名！</p>'}
        </div>
        <div class="modal-actions" style="margin-top:10px"><button class="btn" onclick="U.closeModal()">关闭</button></div>`;
    U.openModal(html);
};
// 上报分数（通关或无尽结算后调用）
MG.reportScore = function (gameId, score) {
    const tk = localStorage.getItem('game-token');
    if (!tk || !Number.isFinite(score)) return Promise.resolve(null);
    return fetch('/api/minigame/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
        body: JSON.stringify({ game: gameId, score: Math.floor(score) }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);
};
// 拉取后台设置的排序；玩家端按此顺序渲染 GAMES
// 关键：用 d.full = savedOrder + 未排序的兜底全集，避免「只存了部分游戏」时未保存的游戏退回原始顺序
MG.fetchOrder = async function () {
    try {
        const r = await fetch('/api/minigame/order');
        if (!r.ok) return [];
        const d = await r.json();
        return d.full || d.all || d.order || [];
    } catch (e) { return []; }
};

// ================= 统一游戏关卡化框架 =================
// 流程：levelSelect → 选关 → start → 完成 → result(星级) → 重试/下一关/选关
//  cfg: {
//    id, title, levels:[{name, desc, ...任意游戏参数}],
//    start(container, opts, level) => instance{stop()},
//    scoreEl?,           // 顶栏 score 元素（实时分数显示）
//    onScore?,           // (text) => void 自定义实时分数处理
//  }
//  游戏内部结束调 opts.onComplete({win, stars, lines, score})
MG.runGame = function (container, cfg) {
    const self = this;
    let current = null;  // 当前 instance
    const clearCurrent = () => {
        try { current && current.stop && current.stop(); } catch (e) { }
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
        // 每关挂设置齿轮（Tier1-2）：音量/震动/自动画质/无障碍，opt-in 可关
        try { MG.settings && MG.settings.gear && MG.settings.gear(container); } catch (e) {}
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
                // 玩法埋点（Tier3-8）：通关/失败/无尽分上报，用于关卡平衡
                try { MG.telemetry && MG.telemetry.track(cfg.id, endless ? 'endless_end' : (result.win ? 'win' : 'lose'), { level: idx + 1, stars, score: result.score || 0 }); } catch (e) {}
                // 上报排行榜（仅登录用户；分数取关卡星 ×100 或无尽分）
                const score = endless ? (result.score || 0) : stars * 100 + (idx + 1) * 50;
                try { MG.reportScore(cfg.id, score); } catch (e) { }
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
};
