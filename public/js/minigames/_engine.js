// 通用小游戏引擎（2026-09-09）：让每个小游戏以最小体积实现
// 提供两套模板：
//   E.def(id, cfg) —— canvas 游戏（draw/tap/tick/check）
//   E.defd(id,cfg) —— DOM 游戏（render/bind）
// 关卡：cfg.levels(20 个名字) + cfg.params(i, t) 生成 20 关参数
// 无尽：cfg.endless 存在即自动生成「∞ 无尽模式」入口（无需解锁）
window.MG = window.MG || {};
(function () {
    const E = (MG.eng = {});

    // ---------------- canvas 游戏引擎 ----------------
    // cfg: { w,h, hint, init(P), draw(ctx,S,P,W,H,api), tap(S,x,y,P,api),
    //        key(S,k,P,api), tick(S,dt,P,api), score(S,P), check(S,P) }
    E.game = function (container, opts, cfg) {
        const P = Object.assign({ endless: !!opts.endless }, opts.level || {});
        P.endless = !!opts.endless;
        const W = cfg.w || 400, H = cfg.h || 520;
        const cv = MG.canvas(container, W, H);
        const c = cv.c, ctx = cv.ctx;
        const S = (cfg.init ? cfg.init(P) : {}) || {};
        S.t = 0;
        let raf = null, last = Date.now(), stopped = false, done = false;

        const api = {
            finish(res) {
                if (done) return;
                done = true;
                const stars = res.stars != null ? res.stars : (res.win ? 3 : 0);
                opts.onComplete && opts.onComplete(Object.assign({ win: false, stars, score: 0, lines: [] }, res, { stars }));
            },
            get over() { return done; },
            P, S, W, H, ctx, draw: () => paint(),
        };
        const paint = () => {
            ctx.clearRect(0, 0, W, H);
            try { cfg.draw && cfg.draw(ctx, S, P, W, H, api); } catch (e) { if (window.__MG_TEST) throw e; }
        };
        const pos = e => {
            const r = c.getBoundingClientRect();
            const sx = W / (r.width || W), sy = H / (r.height || H);
            const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
            return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
        };
        const onDown = e => {
            if (done || stopped || !cfg.tap) return;
            const p = pos(e);
            cfg.tap(S, p.x, p.y, P, api); paint();
        };
        const onKey = e => {
            if (done || stopped || !cfg.key) return;
            cfg.key(S, e.key, P, api); paint();
        };
        c.addEventListener('mousedown', onDown);
        c.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });
        if (cfg.key) window.addEventListener('keydown', onKey);

        const loop = () => {
            if (stopped || done) return;
            const now = Date.now();
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now; S.t += dt;
            try {
                if (cfg.tick) cfg.tick(S, dt, P, api);
                if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
                if (cfg.check && !done) { const r = cfg.check(S, P); if (r) { api.finish(r); return; } }
            } catch (err) { if (window.__MG_TEST) throw err; }
            paint();
            raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(loop) : null;
        };
        if (cfg.hint) MG.hint(container, cfg.hint);
        paint();
        if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
        if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
        return {
            stop() {
                stopped = true;
                if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
                c.removeEventListener('mousedown', onDown);
                if (cfg.key) window.removeEventListener('keydown', onKey);
                cv.destroy();
            },
        };
    };

    // ---------------- DOM 游戏引擎 ----------------
    // cfg: { hint, init(P), render(S,P,api), bind(root,S,P,api), score(S,P) }
    E.dgame = function (container, opts, cfg) {
        const P = Object.assign({}, opts.level || {});
        P.endless = !!opts.endless;
        const S = (cfg.init ? cfg.init(P) : {}) || {};
        const root = document.createElement('div');
        root.className = 'mg-dom';
        container.appendChild(root);
        let done = false, stopped = false;
        const paint = () => {
            root.innerHTML = (cfg.render ? cfg.render(S, P, api) : '') || '';
            cfg.bind && cfg.bind(root, S, P, api);
            if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
        };
        const api = {
            update: () => { if (!stopped && !done) paint(); },
            finish(res) {
                if (done) return;
                done = true;
                const stars = res.stars != null ? res.stars : (res.win ? 3 : 0);
                opts.onComplete && opts.onComplete(Object.assign({ win: false, stars, score: 0, lines: [] }, res, { stars }));
            },
            get over() { return done; },
            P, S, root,
        };
        if (cfg.hint) MG.hint(container, cfg.hint);
        paint();
        return { stop() { stopped = true; } };
    };

    // ---------------- 游戏定义助手 ----------------
    // cfg.levels: 20 个关卡名；cfg.params(i, t) -> 关卡参数；cfg.endless: 无尽参数
    E.def = function (id, cfg) {
        const names = cfg.levels || [];
        const g = (window.MiniGames[id] = {
            LEVELS: names.map((name, i) => Object.assign({ name, desc: '' }, (cfg.params ? cfg.params(i, names.length > 1 ? i / (names.length - 1) : 0) : {}))),
            start(c, o) { return E.game(c, o, cfg); },
        });
        if (cfg.endless) g.ENDLESS = cfg.endless;
        return g;
    };
    E.defd = function (id, cfg) {
        const names = cfg.levels || [];
        const g = (window.MiniGames[id] = {
            LEVELS: names.map((name, i) => Object.assign({ name, desc: '' }, (cfg.params ? cfg.params(i, names.length > 1 ? i / (names.length - 1) : 0) : {}))),
            start(c, o) { return E.dgame(c, o, cfg); },
        });
        if (cfg.endless) g.ENDLESS = cfg.endless;
        return g;
    };

    // ---------------- 常用绘图小工具 ----------------
    const U = MG.ui;
    E.txt = (ctx, s, x, y, size, color, bold) => {
        ctx.font = (bold ? 'bold ' : '') + Math.round(size) + 'px "Microsoft YaHei",sans-serif';
        ctx.fillStyle = color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s, x, y);
    };
    E.bg = (ctx, W, H, c1, c2) => {
        let g = null;
        try { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) {}
        ctx.fillStyle = g || c1; ctx.fillRect(0, 0, W, H);
    };
    E.card = (ctx, x, y, w, h, c1, c2, r) => {
        U.rr(ctx, x, y, w, h, r == null ? 10 : r);
        let g = null;
        try { g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) {}
        ctx.fillStyle = g || c1; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    };
    E.btnBox = (ctx, x, y, w, h, label, c1, c2) => {
        E.card(ctx, x, y, w, h, c1, c2, 10);
        E.txt(ctx, label, x + w / 2, y + h / 2, Math.min(20, h * 0.45), '#fff', true);
    };
    E.hit = (x, y, bx, by, bw, bh) => x >= bx && x <= bx + bw && y >= by && y <= by + bh;

    // ---------------- 通用 20 关关卡名池（避免每游戏重复写 20 个名字）----------------
    const POOLS = [
        ['初见', '学步', '小试', '渐入', '熟手', '巧思', '妙手', '连击', '进阶', '高手',
         '精通', '险境', '绝境', '大师', '宗师', '传奇', '无双', '至尊', '神话', '王者'],
        ['启程', '微风', '林间', '溪畔', '山谷', '云端', '雷雨', '霜降', '雪原', '荒漠',
         '幽谷', '熔岩', '深渊', '星海', '幻境', '苍穹', '混沌', '鸿蒙', '太虚', '归墟'],
        ['青铜', '黑铁', '白板', '新秀', '好手', '劲敌', '强敌', '精英', '锐士', '骁将',
         '统领', '元帅', '霸主', '王者', '传说', '史诗', '不朽', '至尊', '神话', '永恒'],
    ];
    let poolI = 0;
    E.nm = function () { return POOLS[poolI++ % POOLS.length].slice(); };
})();
