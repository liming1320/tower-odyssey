// 小游戏共享工具：创建 canvas、基础渲染、按钮、事件、关卡进度系统
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

    // ================= 关卡选择界面 =================
    // cfg: { game, title, levels:[{name,desc}], onStart(idx, lv), extra:[{label,onClick}] }
    levelSelect(container, cfg) {
        const p = this.getGameProgress(cfg.game);
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'mg-levelsel';
        const total = Object.values(p.stars).reduce((a, b) => a + b, 0);
        const maxTotal = cfg.levels.length * 3;
        wrap.innerHTML = `<div class="mg-ls-title">${cfg.title}
            <span class="mg-ls-total">⭐ ${total}/${maxTotal}</span></div>`;
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
            this.levelSelect(container, {
                game: cfg.id,
                title: cfg.title,
                levels: cfg.levels,
                onStart: (idx, lv) => runLevel(idx, lv),
            });
        };
        const runLevel = (idx, lv) => {
            clearCurrent();
            const scoreEl = cfg.scoreEl || null;
            const onScore = cfg.onScore || (scoreEl ? (s => scoreEl.textContent = s != null ? s : '') : null);
            current = cfg.start(container, {
                level: lv,
                levelIdx: idx,
                totalLevels: cfg.levels.length,
                onScore,
                onComplete: result => {
                    clearCurrent();
                    const stars = result.stars || 0;
                    if (result.win) this.recordStars(cfg.id, idx + 1, stars);
                    else this.recordStars(cfg.id, idx + 1, stars);  // 也记录分数（用于显示）
                    this.result(container, {
                        win: !!result.win,
                        title: result.title || (result.win ? '🏆 胜利！' : '💥 失败'),
                        stars,
                        lines: result.lines || [],
                        hasNext: idx < cfg.levels.length - 1,
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
};
window.MG = MG;
