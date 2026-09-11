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
    // 统一调度器：优先 requestAnimationFrame，缺失时退化为 setTimeout（嵌入 WebView / 旧浏览器 / 测试环境，见 issue #5）
    function scheduler() {
        const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : null;
        return {
            schedule(cb) { return raf ? raf(cb) : setTimeout(() => cb(now()), 16); },
            cancel(id) { try { (raf ? cancelAnimationFrame : clearTimeout)(id); } catch (e) { } },
        };
    }
    function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

    E.game = function (container, opts, cfg) {
        const P = Object.assign({ endless: !!opts.endless }, opts.level || {});
        P.endless = !!opts.endless;
        const W = cfg.w || 400, H = cfg.h || 520;
        const cv = MG.canvas(container, W, H);
        const c = cv.c, ctx = cv.ctx;
        const S = (cfg.init ? cfg.init(P) : {}) || {};
        S.t = 0;
        if (window.__MG_TEST) window.__mgS = S;   // 测试模式暴露状态，便于 headless 断言
        let rafId = null, last = now(), stopped = false, done = false, paused = false;
        const SCH = scheduler();
        // 每个游戏实例独立的粒子池 / 相机 / 补间池（stop() 自动清理，互不干扰，见 issue #4）
        const fx = MG.fxPool ? MG.fxPool() : null;
        const cam = MG.cam ? MG.cam() : null;
        const tw = (MG.makeTweenPool ? MG.makeTweenPool() : MG.tw);
        // issue #13：分层渲染（按需启用，默认 full 不变）
        const layered = (cfg.renderMode === 'layered' && MG.makeLayered)
            ? MG.makeLayered(W, H, (ctx.__mgScale || 1)) : null;
        // 结算结果规范化：stars 限 0~3、score 必须为有限数、lines 必须为数组（见 issue #9）
        const norm = (res) => {
            res = res || {};
            let stars = res.stars != null ? res.stars : (res.win ? 3 : 0);
            stars = Math.max(0, Math.min(3, Math.floor(Number(stars)) || 0));
            const score = Number.isFinite(res.score) ? Number(res.score) : 0;
            const lines = Array.isArray(res.lines) ? res.lines.map(String) : (typeof res.lines === 'string' ? [res.lines] : []);
            return { win: !!(res.win || stars > 0), stars, score, lines };
        };
        const onError = (e, phase) => {
            try { MG.onError && MG.onError(e, { phase, gameId: cfg.id, opts: opts && opts.level && opts.level._id }); } catch (_) {}
            if (window.__MG_TEST) throw e;
            stopped = true;
            try { MG.showGameError && MG.showGameError(c.parentElement || container); } catch (_) {}
        };

        const api = {
            finish(res) {
                if (done) return;
                done = true;
                const r = norm(res);
                opts.onComplete && opts.onComplete(Object.assign({ win: false, stars: 0, score: 0, lines: [] }, r, { stars: r.stars, win: r.win }));
            },
            get over() { return done; },
            pause() { paused = true; },
            resume() { if (paused) { paused = false; last = now(); } },   // 恢复时重置时间基准，避免 dt 跳变
            get isPaused() { return paused; },
            P, S, W, H, ctx, draw: () => paint(),
            fx, cam, tw,
            boom: (x, y, o) => fx && fx.burst(x, y, o),
            pop: (x, y, s, o) => fx && fx.text(x, y, s, o),
            ring: (x, y, o) => fx && fx.ring(x, y, o),
            shake: (a, d) => cam && cam.shake(a, d),
            char: MG.char,
            sfx: MG.audio,
            haptics: MG.haptics,
            flash: (c2, a, d, o) => fx && fx.flash(c2, a, d, o),
            hitstop: (ms) => fx && fx.hitstop(ms),
            trail: (x, y, o) => fx && fx.trail(x, y, o),
            glow: (x, y, r, c2, o) => MG.gfx.glow(ctx, x, y, r, c2, o),
            bar: (x, y, w, h, rt, o) => MG.gfx.bar(ctx, x, y, w, h, rt, o),
            // issue #13：游戏在状态变化时调用，驱动背景层 / HUD 层重绘（分层模式才生效）
            markBgDirty: () => layered && layered.markBgDirty(),
            markHudDirty: () => layered && layered.markHudDirty(),
        };
        const paint = () => {
            if (layered) {
                // 背景层：仅 markBgDirty() 后才重绘，之后每帧只 blit（棋盘/地图/场景等静态内容）
                if (layered.bgDirty) {
                    try { layered.bgCtx.clearRect(0, 0, W, H); cfg.bg && cfg.bg(layered.bgCtx, S, P, W, H, api); }
                    catch (e) { onError(e, 'bg'); }
                    layered.bgDirty = false;
                }
                ctx.clearRect(0, 0, W, H);
                layered.blitBg(ctx);
                ctx.save();
                if (cam) cam.apply(ctx, W, H);
                try { cfg.draw && cfg.draw(ctx, S, P, W, H, api); } catch (e) { onError(e, 'draw'); }
                if (fx) fx.draw(ctx, W, H);
                ctx.restore();
                // HUD 层：仅 markHudDirty() 后才重绘，之后每帧只 blit（屏幕固定 UI/血条/分数等）
                if (layered.hudDirty) {
                    try { layered.hudCtx.clearRect(0, 0, W, H); cfg.hud && cfg.hud(layered.hudCtx, S, P, W, H, api); }
                    catch (e) { onError(e, 'hud'); }
                    layered.hudDirty = false;
                }
                layered.blitHud(ctx);
            } else {
                ctx.clearRect(0, 0, W, H);
                ctx.save();
                if (cam) cam.apply(ctx, W, H);
                try { cfg.draw && cfg.draw(ctx, S, P, W, H, api); } catch (e) { onError(e, 'draw'); }
                if (fx) fx.draw(ctx, W, H);
                ctx.restore();
            }
        };
        const pos = e => {
            const r = c.getBoundingClientRect();
            const sx = W / (r.width || W), sy = H / (r.height || H);
            return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
        };
        // ---- Pointer Events 统一鼠标 + 触摸（替代分散的 mouse*/touch* 监听，清理更可靠，见 issue #2/#15）----
        const onDown = e => {
            if (done || stopped || paused) return;
            try { c.setPointerCapture && c.setPointerCapture(e.pointerId); } catch (_) {}
            const p = pos(e);
            if (cfg.tap) { cfg.tap(S, p.x, p.y, P, api); paint(); }
            if (cfg.drag) api._dragStart = { x: p.x, y: p.y, ox: (S.ox != null ? S.ox : 0), oy: (S.oy != null ? S.oy : 0) };
        };
        const onMove = e => {
            if (done || stopped || paused || !api._dragStart || !cfg.drag) return;
            e.preventDefault();
            const p = pos(e);
            const dx = p.x - api._dragStart.x, dy = p.y - api._dragStart.y;
            cfg.drag(S, p.x, p.y, P, api, dx, dy); paint();
        };
        const onUp = e => {
            if (api._dragStart && cfg.dragend) {
                let p = null;
                try { const q = pos(e); p = { x: q.x, y: q.y }; } catch (_) {}
                try { cfg.dragend(S, p ? p.x : null, p ? p.y : null, P, api); } catch (err) { if (window.__MG_TEST) throw err; }
                paint();
            }
            api._dragStart = null;
        };
        const onKey = e => {
            if (done || stopped || paused || !cfg.key) return;
            // 由游戏声明需要拦截的按键（如方向键/空格），只对这些键 preventDefault，避免误拦（见 issue #16）
            if (cfg.preventKeys && cfg.preventKeys.indexOf(e.key) >= 0) { try { e.preventDefault(); } catch (_) {} }
            cfg.key(S, e.key, P, api); paint();
        };
        c.addEventListener('pointerdown', onDown);
        c.addEventListener('pointermove', onMove);
        c.addEventListener('pointerup', onUp);
        c.addEventListener('pointercancel', onUp);
        if (cfg.key) window.addEventListener('keydown', onKey);
        // 切后台自动暂停：避免敌人继续移动 / 计时继续 / 音频持续（见 issue #17）
        const onVis = () => { if (document.hidden) api.pause(); else api.resume(); };
        document.addEventListener('visibilitychange', onVis);

        const loop = () => {
            if (stopped || done) return;
            if (!c.isConnected) { stopped = true; return; }   // 兜底：画布已从 DOM 移除时停机（见 issue #3）
            rafId = SCH.schedule(loop);
            if (paused) { paint(); return; }                    // 暂停时只重绘，不推进模拟
            const t = now();
            const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));   // dt 限幅 [0,50ms]：防负 dt、防后台恢复跳变（issue #6）
            last = t; S.t += dt;
            try {
                if (fx && fx._hs > 0) {
                    // 顿帧：冻结 tick 与物理，营造打击感
                    fx._hs -= dt; if (fx._hs < 0) fx._hs = 0;
                } else {
                    // 补间 / 粒子 / 相机统一在 tick 之前推进，保证当帧即可见
                    if (tw) tw.update(dt);
                    if (fx) fx.update(dt);
                    if (cam) cam.update(dt);
                    if (cfg.tick) cfg.tick(S, dt, P, api);
                    if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
                    if (cfg.check && !done) { const r = cfg.check(S, P); if (r) { api.finish(r); return; } }
                }
            } catch (err) { onError(err, 'tick'); return; }
            paint();
        };
        if (cfg.hint) MG.hint(container, cfg.hint);
        paint();
        if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
        rafId = SCH.schedule(loop);
        return {
            stop() {
                stopped = true;
                if (rafId) SCH.cancel(rafId);
                c.removeEventListener('pointerdown', onDown);
                c.removeEventListener('pointermove', onMove);
                c.removeEventListener('pointerup', onUp);
                c.removeEventListener('pointercancel', onUp);
                if (cfg.key) window.removeEventListener('keydown', onKey);
                document.removeEventListener('visibilitychange', onVis);
                if (tw) tw.clear();
                if (cam && cam.reset) cam.reset();
                cv.destroy();
            },
            pause: () => api.pause(),
            resume: () => api.resume(),
            get isPaused() { return paused; },
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
                res = res || {};
                let stars = res.stars != null ? res.stars : (res.win ? 3 : 0);
                stars = Math.max(0, Math.min(3, Math.floor(Number(stars)) || 0));
                const score = Number.isFinite(res.score) ? Number(res.score) : 0;
                const lines = Array.isArray(res.lines) ? res.lines.map(String) : (typeof res.lines === 'string' ? [res.lines] : []);
                const win = !!(res.win || stars > 0);
                opts.onComplete && opts.onComplete(Object.assign({ win: false, stars: 0, score: 0, lines: [] }, res, { stars, score, lines, win }));
            },
            get over() { return done; },
            P, S, root,
        };
        if (cfg.hint) MG.hint(container, cfg.hint);
        paint();
        return { stop() { stopped = true; } };
    };

    // ---------------- 游戏定义助手 ----------------
    // cfg.levels: 关卡名（可少于 50）；cfg.params(i, t) -> 关卡参数；cfg.endless: 无尽参数
    // 【重要】这里统一生成 50 关：先用名字池补足关卡名，再为「每一关」都调用 params 生成参数。
    // 旧实现只生成 20 关，剩下 30 关由选关页 fillLevels 补足 —— 补出来的关卡没有 params 参数，
    // 导致第 21~50 关游戏参数全是 undefined（NaN / 直接不能玩）。
    const LEVEL_COUNT = 50;
    // 把关卡参数对象转成可读的难度说明（用于选关页 desc，避免每款游戏手写 50 条描述）
    function fmtParams(p) {
        if (!p || typeof p !== 'object') return '';
        const L = {
            cols: '列', rows: '行', w: '宽', h: '高', size: '尺寸',
            target: '目标', goal: '目标', score: '目标分',
            speed: '速度', spd: '速度', rate: '频率',
            time: '限时', sec: '限时',
            need: '需', n: '阶', max: '上限', moves: '步数',
            holes: '挖空', ships: '船', shots: '炮',
            draws: '发牌', rounds: '轮', deals: '局',
            len: '长度', cnt: '数量', wind: '风力', arrows: '箭',
            gap: '间隙', tickets: '券', hp: '血量', gens: '代',
            clicks: '点击', tilt: '倾角', fuel: '燃料', grow: '生长',
            omega: 'Ω', knives: '刀', baseLen: '长度',
            types: '种类', count: '数量', mis: '失误率', mistakes: '容错',
        };
        const parts = [];
        for (const k in p) {
            if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
            const v = p[k];
            if (v == null || typeof v === 'object') continue;
            if (k === 'cols' && p.rows != null) { parts.push(v + '×' + p.rows); continue; }
            if (k === 'rows' || k === 'h') continue; // 与 cols/w 合并显示
            if (k === 'w' && p.h != null) { parts.push(v + '×' + p.h); continue; }
            const label = L[k];
            if (label) parts.push(label + ' ' + v);
        }
        return parts.join(' · ');
    }
    // 难度曲线（2026-09-10 重调）：t 由「线性」改为「缓启动幂曲线」。
    // 旧行为 t = i/(n-1) 线性 → 第 5~10 关就逼近中高难度，新手容易劝退。
    // 现在 t = u^1.35：前 1/4 关卡难度几乎不涨（第 13 关才到 t≈0.25），
    // 中段稳步爬升，最后 10 关拉开差距。
    // 所有 E.def / E.defd 游戏（12 个 mg-*.js 文件、80+ 款）自动受益，无需改各游戏 params。
    const DIFF_CURVE = 1.35;
    function difficultyT(i, n) {
        if (n <= 1) return 0;
        return Math.pow(i / (n - 1), DIFF_CURVE);
    }
    function buildLevels(cfg) {
        const raw = cfg.levels || [];
        const names = (MG.fillLevels ? MG.fillLevels(raw.map(n => ({ name: n })), LEVEL_COUNT) : raw.map(n => ({ name: n })));
        return names.map((lv, i) => {
            const t = difficultyT(i, names.length);
            const params = cfg.params ? cfg.params(i, t) : {};
            const desc = lv.desc || (cfg.desc ? cfg.desc(i, t, params) : '') || fmtParams(params);
            return Object.assign({ name: lv.name, desc }, params);
        });
    }
    // 自动生成无尽模式：用最高难度那一关的参数，难度封顶后可持续挑战（直到失败/通关为止）
    function autoEndless(cfg) {
        if (!cfg.params) return null;
        const p = cfg.params(LEVEL_COUNT - 1, 1) || {};
        return Object.assign({ name: '∞ 无尽', desc: '用最高难度持续挑战，直到失败/通关为止' }, p);
    }
    E.def = function (id, cfg) {
        const g = (window.MiniGames[id] = {
            LEVELS: buildLevels(cfg),
            start(c, o) { return E.game(c, o, cfg); },
        });
        g.ENDLESS = cfg.endless || autoEndless(cfg);
        return g;
    };
    E.defd = function (id, cfg) {
        const g = (window.MiniGames[id] = {
            LEVELS: buildLevels(cfg),
            start(c, o) { return E.dgame(c, o, cfg); },
        });
        g.ENDLESS = cfg.endless || autoEndless(cfg);
        return g;
    };

    // ---------------- 常用绘图小工具 ----------------
    const U = MG.ui;
    // 三个函数承载了 mg-*.js 系列 80+ 款小游戏的全部绘制，
    // 2026-09-10 统一接到 MG.gfx 画质引擎上（渐变+柔光+微网格+暗角的质感背景 /
    // 双层投影+顶部高光的立体卡片 / 带厚度与描边的立体字）。
    // 签名保持原样 —— 所有调用方零改动即获得升级。
    const G = MG.gfx;
    E.txt = (ctx, s, x, y, size, color, bold) => {
        G.text(ctx, s, x, y, size, color || '#fff', { bold: bold !== false });
    };
    E.bg = (ctx, W, H, c1, c2) => {
        G.scene(ctx, W, H, c1, c2);
    };
    E.card = (ctx, x, y, w, h, c1, c2, r) => {
        G.panel(ctx, x, y, w, h, c1, c2, r == null ? 10 : r);
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
