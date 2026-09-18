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

    // ---------------- 实例运行域（issue #10 / #11 / #13）----------------
    // 背景：过去很多小游戏直接 setTimeout / setInterval / window.addEventListener，
    // 切关或返回后旧回调仍会执行 → 改旧状态、重复 finish()、点了没反应。
    // 这里给每个游戏实例一个独立的「运行域」，所有异步与监听都登记进来，stop() 一次性回收。
    // 约定：新写的小游戏一律用 api.later / api.every / api.listen，不要碰全局定时器与全局监听。
    function makeRuntime(hooks) {
        const cleanups = [];
        let state = 'running';   // running → paused → finished / stopped / error
        const rt = {
            get state() { return state; },
            get stopped() { return state === 'stopped' || state === 'error'; },
            isRunning: () => state === 'running',
            acceptInput: () => state === 'running',
            setState(s) { state = s; },
            // 只置状态、不跑清理（错误中止 / 自然结束时用，真正的资源回收交给 stop()）
            mark(s) { state = s || 'stopped'; },
            // 登记一个清理函数（返回它本身，方便调用方再手动解绑）
            cleanup(fn) { if (typeof fn === 'function') cleanups.push(fn); return fn; },
            later(fn, ms) {
                const id = setTimeout(() => {
                    if (rt.stopped) return;
                    try { fn(); } catch (e) { hooks.onError(e, 'later'); }
                }, ms);
                cleanups.push(() => clearTimeout(id));
                return id;
            },
            every(fn, ms) {
                const id = setInterval(() => {
                    if (rt.stopped) return;
                    try { fn(); } catch (e) { hooks.onError(e, 'every'); }
                }, ms);
                cleanups.push(() => clearInterval(id));
                return id;
            },
            listen(target, type, fn, options) {
                if (!target || !target.addEventListener) return null;
                target.addEventListener(type, fn, options);
                cleanups.push(() => { try { target.removeEventListener(type, fn, options); } catch (e) { } });
                return fn;
            },
            // 幂等：重复调用不会重复清理、不会抛
            stop() {
                if (state === 'stopped') return;
                state = 'stopped';
                for (let i = cleanups.length - 1; i >= 0; i--) {
                    try { cleanups[i](); } catch (e) { }
                }
                cleanups.length = 0;
                if (hooks.onStop) { try { hooks.onStop(); } catch (e) { } }
            },
        };
        return rt;
    }

    // 确定性随机（mulberry32）：同一 seed 必然同一结果，便于复现线上 bug 与自动测试
    function makeRng(seed) {
        let s = (Number(seed) || 0) >>> 0;
        if (!s) s = 0x9e3779b9;
        const r = () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
        r.range = (a, b) => a + r() * (b - a);
        r.pick = arr => arr[Math.floor(r() * arr.length)];
        r.chance = p => r() < p;
        r.shuffle = arr => {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(r() * (i + 1));
                const t = a[i]; a[i] = a[j]; a[j] = t;
            }
            return a;
        };
        return r;
    }

    // ---------------- 统一帧循环（issue #5：完整运行时）----------------
    // 过去 E.game 只有一种「可变 dt」循环：tick 收到的 dt 取决于设备帧率，
    //   30fps 机器 dt≈33ms、144fps 机器 dt≈7ms —— 同一份物理参数表现完全不同
    //   （跳跃高度、球速、高速穿透），线上 bug 也永远复现不出来。
    // 这里补上标准游戏循环，两块能力都保留：
    //   - 可变步（默认，step=0）：行为与以前完全一致，全部 115 款游戏零回归
    //   - 固定步（cfg.fixedStep）：tick 恒定 dt，物理与帧率解耦；渲染时给出
    //     插值系数 alpha（本帧处在两步之间的位置），画面依然丝滑
    // 另外统一提供：追帧上限（防死亡螺旋）、帧统计（fps / 平均帧时 / 掉帧数）、
    // 时间缩放（慢动作 / 快进）、手动推进（测试与单步调试，不依赖 rAF）。
    function makeLoop(o) {
        const SCH = scheduler();
        const step = Math.max(0, Number(o.step) || 0);
        const maxSub = Math.max(1, o.maxSubSteps || 5);
        const perf = { fps: 0, avgMs: 16.7, worstMs: 0, drops: 0, frames: 0, steps: 0, alpha: 0, fixed: step };
        let rafId = null, last = 0, acc = 0, running = false, emaMs = 16.7;
        function advance(rawSec) {
            let raw = rawSec;
            if (!(raw >= 0)) raw = 0;
            if (raw > 0.25) raw = 0.25;                 // 长时间挂起（切后台 / 断点）后不追帧
            const ms = raw * 1000;
            emaMs = emaMs * 0.9 + ms * 0.1;
            perf.frames++;
            perf.avgMs = +emaMs.toFixed(2);
            perf.fps = emaMs > 0 ? Math.round(1000 / emaMs) : 0;
            if (ms > perf.worstMs) perf.worstMs = +ms.toFixed(2);
            if (ms > 34) perf.drops++;                  // 慢于约 30fps 记一次掉帧
            const scale = (typeof o.timeScale === 'function' ? o.timeScale() : 1);
            const scaled = raw * (scale > 0 ? scale : 0);
            let n = 0;
            if (step > 0) {
                if (!o.fixed) return 0;
                acc += scaled;
                while (acc >= step && n < maxSub) {
                    acc -= step; n++; perf.steps++;
                    o.fixed(step);
                    if (o.over && o.over()) { acc = 0; break; }
                }
                if (acc > step * maxSub) acc = 0;       // 追不上就丢弃余量，避免「越卡越补、越补越卡」
            } else {
                if (!o.variable) return 0;
                perf.steps++; n = 1;
                o.variable(Math.max(0, Math.min(0.05, scaled)));   // dt 限幅 [0,50ms]（见 issue #6）
            }
            perf.alpha = step > 0 ? Math.min(1, Math.max(0, acc / step)) : 0;
            if (o.render) o.render(perf.alpha);
            return n;
        }
        function tick() {
            if (!running) return;
            if (o.alive && !o.alive()) { running = false; rafId = null; return; }
            rafId = SCH.schedule(tick);
            const t = now();
            const raw = last ? (t - last) / 1000 : 0;
            last = t;
            if (o.paused && o.paused()) { if (o.render) o.render(perf.alpha); return; }   // 暂停只重绘不推进
            try { advance(raw); tick._errs = 0; }
            catch (err) {
                tick._errs = (tick._errs || 0) + 1;
                if (tick._errs > 5) { running = false; rafId = null; try { (MG.onFatal || MG.showGameError)(err); } catch (_) {} return; }
            }
        }
        return {
            perf,
            get alpha() { return perf.alpha; },
            get step() { return step; },
            get running() { return running; },
            // 手动推进一帧：测试 / 确定性回放 / 单步调试用，完全不依赖 rAF
            advance(ms) { if (o.alive && !o.alive()) return 0; return advance((ms == null ? 16.7 : ms) / 1000); },
            start() { if (running) return; running = true; last = now(); rafId = SCH.schedule(tick); },
            stop() { running = false; if (rafId) { SCH.cancel(rafId); rafId = null; } },
        };
    }

    // 确定性模式：把全局 Math.random 换成可复现的 mulberry32。
    // 用途：复现线上 bug、自动测试固定出题、关卡回放。关掉后恢复原生随机，正常游玩不受影响。
    let _realRandom = null;
    MG.setDeterministic = function (seed) {
        if (seed === false || seed == null) {
            if (_realRandom) { Math.random = _realRandom; _realRandom = null; }
            return false;
        }
        if (!_realRandom) _realRandom = Math.random;
        Math.random = makeRng(seed);
        return true;
    };
    MG.isDeterministic = () => !!_realRandom;
    // 全局循环策略：MG.setFixedStep(1/60) 让所有 E.def 游戏统一走固定步（物理与帧率解耦）。
    // 默认 0 = 可变步（与历史行为一致，零回归）；低端机卡顿、录屏、自动测试时可临时打开。
    MG.loopPolicy = { step: 0, maxSubSteps: 5 };
    MG.setFixedStep = function (step, maxSubSteps) {
        MG.loopPolicy.step = step ? (step === true ? 1 / 60 : (Number(step) || 0)) : 0;
        if (maxSubSteps) MG.loopPolicy.maxSubSteps = Math.max(1, maxSubSteps | 0);
        return MG.loopPolicy.step;
    };
    // 运行时三件套对外开放：其它页面 / 自定义玩法也能直接复用同一套生命周期与循环语义
    MG.makeRuntime = makeRuntime;
    MG.makeLoop = makeLoop;
    MG.makeRng = makeRng;

    E.game = function (container, opts, cfg) {
        const P = Object.assign({ endless: !!opts.endless }, opts.level || {});
        P.endless = !!opts.endless;
        const W = cfg.w || 400, H = cfg.h || 520;
        const cv = MG.canvas(container, W, H);
        const c = cv.c, ctx = cv.ctx;
        let done = false, paused = false, timeScale = 1, quality = 1;
        // 实例运行域：定时器 / 事件 / 补间全部登记在这里，stop() 一次性回收（见 makeRuntime 说明）
        const rt = makeRuntime({ onError: (e, ph) => onError(e, ph) });
        let S = {};
        try { S = (cfg.init ? cfg.init(P) : {}) || {}; }
        catch (e) { onError(e, 'init'); }        // init 也纳入错误边界（见 issue #P1）
        S.t = 0;
        if (window.__MG_TEST) window.__mgS = S;   // 测试模式暴露状态，便于 headless 断言
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
            rt.mark('error');
            if (window.__MG_TEST) throw e;
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
            pause() { paused = true; rt.setState('paused'); },
            // 恢复时不需要手工重置时间基准：makeLoop 在暂停帧同样刷新 last，恢复后 dt 不会跳变
            resume() { if (paused) { paused = false; rt.setState('running'); } },
            get isPaused() { return paused; },
            // ---- 实例运行域（新写游戏请一律用这些，不要用全局 setTimeout / addEventListener）----
            // 定时器：stop() 自动清理，且停止后回调不会再执行（杜绝「切关后旧回调改新状态」）
            later: (fn, ms) => rt.later(fn, ms),
            every: (fn, ms) => rt.every(fn, ms),
            listen: (target, type, fn, options) => rt.listen(target, type, fn, options),
            cleanup: (fn) => rt.cleanup(fn),
            // 确定性随机：传同一个 seed 必得同一结果，用于复现 bug / 关卡回放 / 自动测试
            rng: (seed) => makeRng(seed != null ? seed : ((P.seed || 0) + ((opts.levelIdx || 0) + 1) * 7919)),
            get state() { return rt.state; },
            // ---- 完整运行时：帧统计 / 时间缩放 / 插值系数 / 手动推进（见 makeLoop 说明）----
            get fps() { return L.perf.fps; },
            get frame() { return L.perf.frames; },
            get steps() { return L.perf.steps; },
            get alpha() { return L.perf.alpha; },        // 固定步模式下的渲染插值系数（0~1）
            get quality() { return quality; },            // 自适应画质系数（cfg.autoQuality 开启才可能 <1）
            get perf() { return L.perf; },
            setTimeScale(v) { timeScale = Math.max(0, Math.min(8, Number(v) || 0)); },
            get timeScale() { return timeScale; },
            step: (ms) => L.advance(ms),                 // 手动推进一帧，测试 / 单步调试用（不依赖 rAF）
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
            // ---- 通用撤销栈（Tier1-1）：游戏在改变状态前调 api.history.push()；撤销键/按钮调 api.history.undo()。
            //      支持 cfg.snapshot(S)/cfg.restore(S,s)，否则自动结构化克隆 S。零回归、opt-in。----
            history: (function () {
                const MAX = 80; const st = [];
                const snap = () => cfg.snapshot ? cfg.snapshot(S) : (typeof structuredClone === 'function' ? structuredClone(S) : JSON.parse(JSON.stringify(S)));
                const rest = (s) => { if (cfg.restore) cfg.restore(S, s); else { for (const k in S) delete S[k]; Object.assign(S, s); } };
                return { push() { try { st.push(snap()); if (st.length > MAX) st.shift(); } catch (e) {} }, undo() { if (!st.length) return false; try { rest(st.pop()); } catch (e) { return false; } return true; }, canUndo() { return st.length > 0; }, clear() { st.length = 0; }, size() { return st.length; } };
            })(),
            // ---- 回放钩子（Tier1-3）：api._rec 录制输入事件，api._replay 回放投递 ----
            _rec: null, _recT0: 0, _replay: null,
        };
        if (opts && opts.__replay) { api._replay = opts.__replay; api._replay.i = 0; }
        const paint = () => {
            // 离屏层跟随 deviceScale：旋转 / 缩放后 MG.canvas.fit() 会改倍率，这里同步重建（issue #4）
            if (layered && ctx.__mgScale && Math.abs(ctx.__mgScale - layered.scale) > 0.05) {
                try { layered.resize(ctx.__mgScale); } catch (e) { }
            }
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
                if (MG.bg && MG.bg.on) { try { MG.bg.draw(ctx, W, H, S.t, ctx.__mgScale); } catch (e) {} }
                ctx.save();
                if (cam) cam.apply(ctx, W, H);
                try { cfg.draw && cfg.draw(ctx, S, P, W, H, api); } catch (e) { onError(e, 'draw'); }
                if (fx) fx.draw(ctx, W, H);
                ctx.restore();
            }
            // 后处理合成层（A2）：暗角 + 扫描线 + bloom 近似，opt-in
            if (MG.postfx && MG.postfx.enabled && MG.postfx.enabled()) { try { MG.postfx.frame(ctx, c, W, H); } catch (e) {} }
        };
        let _rect = null;   // 拖拽期间缓存的画布矩形，避免 onMove 每次 getBoundingClientRect 触发 reflow（优化 P1-4）
        const pos = e => {
            const r = _rect || c.getBoundingClientRect();
            const sx = W / (r.width || W), sy = H / (r.height || H);
            return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
        };
        // 统一错误边界：cfg 的任何回调抛异常都上报 MG.onError。
        // 之前 dragend 的异常是被静默吞掉的，线上出了问题完全没痕迹（见 issue #P1）。
        const safe = (phase, fn) => { try { fn(); } catch (e) { onError(e, phase); } };
        // ---- Pointer Events 统一鼠标 + 触摸（替代分散的 mouse*/touch* 监听，清理更可靠，见 issue #2/#15）----
        // ---- 手势增强（Tier2-6）：双击 / 长按 / 双指捏合 / 多指，gated by cfg，不影响现有 tap/drag ----
        const _ptrs = new Map();
        let _lastTap = 0, _lastTapPos = null, _longActive = false;
        const _dispatchTap = (x, y, fromInput) => {
            if (api._replay) return;
            if (cfg.tap) safe('tap', () => { cfg.tap(S, x, y, P, api); });
            if (api._rec && fromInput) api._rec.events.push({ t: performance.now() - api._recT0, k: 'tap', x, y });
            if (fromInput && cfg.doubletap) {
                const now = performance.now();
                if (_lastTapPos && now - _lastTap < 300 && Math.hypot(x - _lastTapPos.x, y - _lastTapPos.y) < 24) { try { cfg.doubletap(S, x, y, P, api); } catch (e) { onError(e, 'doubletap'); } _lastTap = 0; }
                else { _lastTap = now; _lastTapPos = { x, y }; }
            }
            paint();
        };
        const _dispatchKey = (k, fromInput) => {
            if (api._replay) return;
            if (cfg.key) safe('key', () => { cfg.key(S, k, P, api); });
            if (api._rec && fromInput) api._rec.events.push({ t: performance.now() - api._recT0, k: 'key', key: k });
            paint();
        };
        const onDown = e => {
            if (api._replay) return;
            if (done || rt.stopped || paused) return;
            try { c.setPointerCapture && c.setPointerCapture(e.pointerId); } catch (_) {}
            _rect = c.getBoundingClientRect();
            _ptrs.set(e.pointerId, e);
            const p = pos(e);
            try { MG.audio && MG.audio.unlock && MG.audio.unlock(); } catch (_) {}
            if (fx) { try { fx.ring(p.x, p.y, { r0: 2, r1: 30, lw: 2.5, color: 'rgba(255,255,255,0.55)', life: 0.32 }); } catch (_) {} }
            // 双指捏合：进入 pinch 模式（不再触发 tap/drag）
            if (_ptrs.size >= 2 && cfg.pinch) { api._pinch = true; api._pinchD = null; return; }
            if (cfg.drag) api._dragStart = { x: p.x, y: p.y, ox: (S.ox != null ? S.ox : 0), oy: (S.oy != null ? S.oy : 0) };
            else _dispatchTap(p.x, p.y, true);
            if (cfg.longpress) { _longActive = true; rt.later(() => { if (_longActive) { _longActive = false; try { cfg.longpress(S, p.x, p.y, P, api); } catch (er) { onError(er, 'longpress'); } paint(); } }, 500); }
        };
        const onMove = e => {
            if (api._replay) return;
            if (done || rt.stopped || paused) return;
            if (_ptrs.has(e.pointerId)) _ptrs.set(e.pointerId, e);
            // 捏合：双指距离变化 → scale 反馈
            if (api._pinch && cfg.pinch && _ptrs.size >= 2) {
                const ps = [..._ptrs.values()]; const d = Math.hypot(ps[0].clientX - ps[1].clientX, ps[0].clientY - ps[1].clientY);
                const scale = api._pinchD ? d / api._pinchD : 1; api._pinchD = d;
                try { cfg.pinch(S, scale, P, api); } catch (er) { onError(er, 'pinch'); }
                paint(); return;
            }
            if (!api._dragStart || !cfg.drag) return;
            e.preventDefault();
            const p = pos(e);
            const dx = p.x - api._dragStart.x, dy = p.y - api._dragStart.y;
            if (Math.hypot(dx, dy) > 8) _longActive = false;  // 移动则取消长按
            if (cfg.multitouch && _ptrs.size) { try { cfg.multitouch(S, [..._ptrs.values()].map(ev => pos(ev)), P, api); } catch (er) { onError(er, 'multitouch'); } }
            safe('drag', () => { cfg.drag(S, p.x, p.y, P, api, dx, dy); paint(); });
        };
        const onUp = e => {
            if (api._replay) return;
            _ptrs.delete(e.pointerId);
            if (api._pinch) { if (_ptrs.size < 2) { api._pinch = false; api._pinchD = null; } return; }
            _longActive = false;
            if (api._dragStart && cfg.dragend) {
                let p = null;
                try { const q = pos(e); p = { x: q.x, y: q.y }; } catch (_) {}
                const pp = p;
                safe('dragend', () => { cfg.dragend(S, pp ? pp.x : null, pp ? pp.y : null, P, api); paint(); });
            }
            api._dragStart = null; _rect = null;
        };
        const onKey = e => {
            if (done || rt.stopped || paused || !cfg.key) return;
            if (cfg.preventKeys && cfg.preventKeys.indexOf(e.key) >= 0) { try { e.preventDefault(); } catch (_) {} }
            _dispatchKey(e.key, true);
        };
        // 全部经 rt.listen 登记 → stop() 自动解绑，不留悬挂监听
        rt.listen(c, 'pointerdown', onDown);
        rt.listen(c, 'pointermove', onMove);
        rt.listen(c, 'pointerup', onUp);
        rt.listen(c, 'pointercancel', onUp);
        if (cfg.key) rt.listen(window, 'keydown', onKey);
        // 切后台自动暂停：避免敌人继续移动 / 计时继续 / 音频持续（见 issue #17）
        rt.listen(document, 'visibilitychange', () => { if (document.hidden) api.pause(); else api.resume(); });

        // 一帧逻辑推进：固定步与可变步共用同一段（dt 由循环决定，见 makeLoop 说明）
        let _repClock = 0;
        const doTick = (dt) => {
            S.t += dt;
            // 回放投递（Tier1-3）：按录制时间戳把输入事件重新喂给游戏（仅 E.def 画布游戏）
            if (api._replay) {
                _repClock += dt; const ms = _repClock * 1000; const q = (api._replay.events || []);
                while (api._replay.i < q.length && q[api._replay.i].t <= ms) {
                    const ev = q[api._replay.i++];
                    try { if (ev.k === 'tap' && cfg.tap) cfg.tap(S, ev.x, ev.y, P, api); else if (ev.k === 'key' && cfg.key) cfg.key(S, ev.key, P, api); } catch (e) { onError(e, 'replay'); }
                    paint();
                }
            }
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
            } catch (err) { onError(err, 'tick'); }
        };
        const L = makeLoop({
            // 步长来源优先级：游戏自己声明 cfg.fixedStep > 全局策略 MG.setFixedStep() > 0（可变步）
            step: cfg.fixedStep ? (cfg.fixedStep === true ? 1 / 60 : (Number(cfg.fixedStep) || 0))
                : ((MG.loopPolicy && MG.loopPolicy.step) || 0),
            maxSubSteps: cfg.maxSubSteps || (MG.loopPolicy && MG.loopPolicy.maxSubSteps) || 5,
            alive() {
                if (rt.stopped || done) return false;
                if (!c.isConnected) { rt.mark('stopped'); return false; }   // 兜底：画布已从 DOM 移除时停机（issue #3）
                return true;
            },
            paused: () => paused,
            timeScale: () => timeScale,
            over: () => done || rt.stopped,
            fixed: doTick,
            variable: doTick,
            render() {
                // 自适应画质：持续掉帧时逐步下调 quality（0.35~1），游戏可据此少放粒子/降级特效
                if ((cfg.autoQuality || (MG.settings && MG.settings.autoQuality)) && L.perf.frames > 30) {
                    if (L.perf.fps && L.perf.fps < 40) quality = Math.max(0.35, quality - 0.01);
                    else if (L.perf.fps >= 55) quality = Math.min(1, quality + 0.005);
                }
                if (fx) fx._quality = quality;   // 让粒子池据画质减粒子（优化 P2-6）
                MG._quality = quality;           // 供后处理 bloom 等读取全局画质
                paint();
            },
        });
        if (cfg.hint) MG.hint(container, cfg.hint, api);
        paint();
        if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
        L.start();
        return {
            // 幂等：重复调用只清理一次（防止「结算后又点返回」重复解绑/报错，见 issue #11）
            stop() {
                L.stop();
                if (tw) { try { tw.clear(); } catch (e) { } }
                if (cam && cam.reset) { try { cam.reset(); } catch (e) { } }
                rt.stop();          // 里面统一解绑全部监听 + 清理定时器 + 跑游戏登记的 cleanup
                try { MG.audio && MG.audio.bgm && MG.audio.bgm.stop(); } catch (e) {}   // 优化 P2-7：游戏停止自动停 BGM，防定时器泄漏
                try { cv.destroy(); } catch (e) { }   // 幂等，重复调用无害
            },
            pause: () => api.pause(),
            resume: () => api.resume(),
            step: (ms) => L.advance(ms),        // 手动推进一帧（headless 测试 / 确定性回放）
            get perf() { return L.perf; },
            get isPaused() { return paused; },
            get state() { return rt.state; },
        };
    };

    // ---------------- DOM 游戏引擎 ----------------
    // cfg: { hint, init(P), render(S,P,api), bind(root,S,P,api), score(S,P) }
    E.dgame = function (container, opts, cfg) {
        const P = Object.assign({}, opts.level || {});
        P.endless = !!opts.endless;
        let done = false;
        const rt = makeRuntime({ onError: (e, ph) => onError(e, ph) });
        const onError = (e, phase) => {
            try { MG.onError && MG.onError(e, { phase, gameId: cfg.id }); } catch (_) {}
            rt.mark('error');
            if (window.__MG_TEST) throw e;
            try { MG.showGameError && MG.showGameError(container); } catch (_) {}
        };
        const safe = (phase, fn) => { try { fn(); } catch (e) { onError(e, phase); } };
        const root = document.createElement('div');
        root.className = 'mg-dom';
        container.appendChild(root);
        let S = {};
        try { S = (cfg.init ? cfg.init(P) : {}) || {}; } catch (e) { onError(e, 'init'); }

        // bind() 可以返回一个清理函数（或函数数组）：重绘前先跑上一轮的，stop() 时再跑一次。
        // 这样 DOM 游戏绑的全局事件 / 定时器也能随实例回收（见 issue #3）。
        let disposers = [];
        const runDisposers = () => {
            for (const d of disposers) { try { if (typeof d === 'function') d(); } catch (e) { } }
            disposers = [];
        };
        const paint = () => {
            if (rt.stopped) return;
            runDisposers();
            safe('render', () => { root.innerHTML = (cfg.render ? cfg.render(S, P, api) : '') || ''; });
            safe('bind', () => {
                const d = cfg.bind && cfg.bind(root, S, P, api);
                if (typeof d === 'function') disposers.push(d);
                else if (Array.isArray(d)) disposers.push.apply(disposers, d.filter(x => typeof x === 'function'));
            });
            if (opts.onScore && cfg.score) opts.onScore(cfg.score(S, P));
        };
        // 帧循环：DOM 游戏默认不跑（重绘靠 api.update()，成本可控且行为不变）。
        // 只有声明了 cfg.tick 的游戏（倒计时 / 动画类）才会启动统一循环，
        // 与 canvas 引擎共用 makeLoop：同样的固定步 / 时间缩放 / 手动推进能力。
        const L = cfg.tick ? makeLoop({
            step: cfg.fixedStep ? (cfg.fixedStep === true ? 1 / 60 : (Number(cfg.fixedStep) || 0)) : 0,
            maxSubSteps: cfg.maxSubSteps || 5,
            alive: () => !rt.stopped && !done,
            timeScale: () => api.timeScale,
            over: () => done || rt.stopped,
            fixed: dt => { S.t = (S.t || 0) + dt; safe('tick', () => cfg.tick(S, dt, P, api)); },
            variable: dt => { S.t = (S.t || 0) + dt; safe('tick', () => cfg.tick(S, dt, P, api)); },
            // 不自动重绘：DOM 全量 innerHTML 重建很贵，交给游戏在 tick 里按需 api.update()
        }) : null;
        const api = {
            update: () => { if (!rt.stopped && !done) paint(); },
            finish(res) {
                if (done) return;
                done = true;
                if (L) L.stop();
                rt.mark('finished');
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
            later: (fn, ms) => rt.later(fn, ms),
            every: (fn, ms) => rt.every(fn, ms),
            listen: (t, ty, fn, o) => rt.listen(t, ty, fn, o),
            cleanup: (fn) => rt.cleanup(fn),
            rng: (seed) => makeRng(seed != null ? seed : ((P.seed || 0) + ((opts.levelIdx || 0) + 1) * 7919)),
            get state() { return rt.state; },
            // 与 canvas 引擎同款运行时能力（DOM 游戏极少用，但语义保持一致）
            get fps() { return L ? L.perf.fps : 0; },
            get frame() { return L ? L.perf.frames : 0; },
            get perf() { return L ? L.perf : null; },
            timeScale: 1,
            step: (ms) => (L ? L.advance(ms) : 0),
            // 通用撤销栈（Tier1-1）：DOM 游戏用 cfg.snapshot/restore 或自动克隆 S
            history: (function () {
                const MAX = 80; const st = [];
                const snap = () => cfg.snapshot ? cfg.snapshot(S) : (typeof structuredClone === 'function' ? structuredClone(S) : JSON.parse(JSON.stringify(S)));
                const rest = (s) => { if (cfg.restore) cfg.restore(S, s); else { for (const k in S) delete S[k]; Object.assign(S, s); } };
                return { push() { try { st.push(snap()); if (st.length > MAX) st.shift(); } catch (e) {} }, undo() { if (!st.length) return false; try { rest(st.pop()); } catch (e) { return false; } return true; }, canUndo() { return st.length > 0; }, clear() { st.length = 0; }, size() { return st.length; } };
            })(),
        };
        if (cfg.hint) MG.hint(container, cfg.hint, api);
        paint();
        if (L) L.start();
        return {
            stop() {
                if (L) L.stop();
                runDisposers();
                rt.stop();
                try { MG.audio && MG.audio.bgm && MG.audio.bgm.stop(); } catch (e) {}   // 优化 P2-7
                // 真正移除 root：以前只置 stopped，DOM 节点留着，全局事件/定时器就泄漏了
                try { if (root.remove) root.remove(); else if (root.parentNode) root.parentNode.removeChild(root); } catch (e) { }
            },
            step: (ms) => (L ? L.advance(ms) : 0),
            get perf() { return L ? L.perf : null; },
            get state() { return rt.state; },
        };
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
    // 关卡懒生成（优化 P1-3）：注册时只挂 getter，不立刻 buildLevels（旧实现在脚本解析时
    // 就把全部 100+ 款游戏各 50 关的 params 算出来堆在启动路径上）。首次读取 LEVELS
    // （用户点开某游戏的选关页）才真正构建并缓存，首屏加载零关卡成本、且行为完全一致。
    E.def = function (id, cfg) {
        let _lv = null;
        const g = (window.MiniGames[id] = {
            get LEVELS() { if (!_lv) _lv = buildLevels(cfg); return _lv; },
            start(c, o) { return E.game(c, o, cfg); },
        });
        g.ENDLESS = cfg.endless || autoEndless(cfg);
        return g;
    };
    E.defd = function (id, cfg) {
        let _lv = null;
        const g = (window.MiniGames[id] = {
            get LEVELS() { if (!_lv) _lv = buildLevels(cfg); return _lv; },
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
    // 镶木框游戏房间（2026-09-12 视觉升级）：木纹外框 + 呢面/皮革内衬 + 内阴影 + 四角铜钉。
    // 棋类 / 牌类 / 益智类通用：把裸露的 flat 格子盘升级成「实体桌台」。
    // opt: { felt:'#2f5d43', frame:'#c9a06a', frame2:'#8a6234', seed:1, r:14, frameW:14, nail:true }
    // 镶木框游戏房间（2026-09-12 视觉升级）：木纹外框 + 呢面/皮革内衬 + 内阴影 + 四角铜钉。
    // 结果按 (尺寸+材质+seed+画质) 烘焙到离屏 canvas 缓存，之后每帧只 drawImage
    // （原实现每帧重建木纹 + 多个径向渐变 + 四角铜钉，棋牌类每帧几十次渐变创建）。优化 P0-2。
    // opt: { felt:'#2f5d43', frame:'#c9a06a', frame2:'#8a6234', seed:1, r:14, frameW:14, nail:true }
    E.broom = (ctx, x, y, w, h, opt) => {
        opt = opt || {};
        const fw = opt.frameW == null ? 14 : opt.frameW;
        const r = opt.r == null ? 14 : opt.r;
        const felt = opt.felt || '#2f5d43';
        const frame = opt.frame || '#c9a06a';
        const frame2 = opt.frame2 || '#8a6234';
        const seed = opt.seed || 1;
        const nail = opt.nail !== false;
        const ow = w + fw * 2, oh = h + fw * 2;
        const scale = (ctx && ctx.__mgScale) || 1;
        const key = 'broom|' + ow + 'x' + oh + '|' + r + '|' + felt + '|' + frame + '|' + frame2 + '|' + seed + '|' + (nail ? 1 : 0) + '|' + scale.toFixed(2);
        let cv = G._broomCache && G._broomCache.get(key);
        if (!cv) {
            cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(ow * scale));
            cv.height = Math.max(1, Math.round(oh * scale));
            const xc = cv.getContext('2d');
            try { xc.setTransform(scale, 0, 0, scale, 0, 0); } catch (e) {}
            try { xc.__mgScale = scale; } catch (e) {}
            // ---- 与旧实现等价的绘制，但在局部坐标 (0,0) 起算，内区位于 (fw,fw) ----
            G.wood(xc, 0, 0, ow, oh, frame, frame2, seed);
            U.rr(xc, 0, 0, ow, oh, r);
            xc.lineWidth = 2.5; xc.strokeStyle = 'rgba(40,22,8,0.55)'; xc.stroke();
            U.rr(xc, 1.5, 1.5, ow - 3, oh - 3, Math.max(1, r - 1.5));
            xc.lineWidth = 1; xc.strokeStyle = 'rgba(255,235,200,0.30)'; xc.stroke();
            U.rr(xc, fw, fw, w, h, Math.max(4, r * 0.55));
            let fg = null;
            try {
                fg = xc.createRadialGradient(fw + w / 2, fw + h * 0.42, 0, fw + w / 2, fw + h / 2, Math.max(w, h) * 0.75);
                fg.addColorStop(0, G.lighten(felt, 0.16));
                fg.addColorStop(0.65, felt);
                fg.addColorStop(1, G.darken(felt, 0.32));
            } catch (e) {}
            xc.fillStyle = fg || felt; xc.fill();
            xc.save();
            U.rr(xc, fw, fw, w, h, Math.max(4, r * 0.55)); xc.clip();
            let isg = null;
            try { isg = xc.createLinearGradient(0, fw, 0, fw + 18); isg.addColorStop(0, 'rgba(0,0,0,0.30)'); isg.addColorStop(1, 'rgba(0,0,0,0)'); } catch (e) {}
            xc.fillStyle = isg || 'rgba(0,0,0,0.2)'; xc.fillRect(fw, fw, w, 18);
            try { isg = xc.createLinearGradient(0, fw + h - 12, 0, fw + h); isg.addColorStop(0, 'rgba(0,0,0,0)'); isg.addColorStop(1, 'rgba(0,0,0,0.20)'); } catch (e) {}
            xc.fillStyle = isg || 'rgba(0,0,0,0.12)'; xc.fillRect(fw, fw + h - 12, w, 12);
            xc.restore();
            xc.save();
            U.rr(xc, fw, fw, w, h, Math.max(4, r * 0.55)); xc.clip();
            xc.strokeStyle = 'rgba(255,255,255,0.022)';
            xc.lineWidth = 1;
            xc.beginPath();
            for (let s = -h; s < w; s += 7) { xc.moveTo(fw + s, fw); xc.lineTo(fw + s + h, fw + h); }
            xc.stroke();
            xc.restore();
            if (nail) {
                const nr = Math.max(2.5, fw * 0.26);
                for (const [nx, ny] of [[fw / 2, fw / 2], [ow - fw / 2, fw / 2], [fw / 2, oh - fw / 2], [ow - fw / 2, oh - fw / 2]]) {
                    const ng = xc.createRadialGradient(nx - nr * 0.3, ny - nr * 0.3, 0, nx, ny, nr);
                    ng.addColorStop(0, '#f0d9a0'); ng.addColorStop(0.6, '#b98d4a'); ng.addColorStop(1, '#5f3f18');
                    xc.beginPath(); xc.arc(nx, ny, nr, 0, 6.284); xc.fillStyle = ng; xc.fill();
                }
            }
            G._broomCache = G._broomCache || new Map();
            if (G._broomCache.size >= (G.MAX_CACHE || 48)) G._broomCache.delete(G._broomCache.keys().next().value);
            G._broomCache.set(key, cv);
        }
        ctx.drawImage(cv, x - fw, y - fw, ow, oh);
    };
    // 光泽棋子（圆盘：径向渐变 + 环口 + 顶高光 + 投影）。黑白棋/四子棋/跳棋等通用
    // c1/c2 为主体渐变（上亮下暗），rim 为环口色
    // 光泽棋子（圆盘：径向渐变 + 环口 + 顶高光 + 投影）。黑白棋/四子棋/跳棋等通用。
    // 按 (c1/c2/rim/r/画质) 烘焙到离屏 canvas 缓存，之后每帧只 drawImage
    // （原实现每个棋子每帧都建 createRadialGradient）。优化 P0-2。
    E.piece = (ctx, cx, cy, r, c1, c2, rim) => {
        const scale = (ctx && ctx.__mgScale) || 1;
        const pad = Math.ceil(r * 1.2);                 // 给投影/高光留出余量
        const S = Math.max(2, Math.ceil(r * 2.2));       // 离屏逻辑尺寸
        const key = 'piece|' + (c1 || '') + '|' + (c2 || '') + '|' + (rim || '') + '|' + Math.round(r * 1000) + '|' + scale.toFixed(2);
        let cv = G._pieceCache && G._pieceCache.get(key);
        if (!cv) {
            cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(S * scale));
            cv.height = Math.max(1, Math.round(S * scale));
            const xc = cv.getContext('2d');
            try { xc.setTransform(scale, 0, 0, scale, 0, 0); } catch (e) {}
            const px0 = pad, py0 = pad;                   // 棋子中心在离屏中的位置
            xc.beginPath(); xc.ellipse(px0 + r * 0.08, py0 + r * 0.18, r * 0.98, r * 0.9, 0, 0, 6.284);
            xc.fillStyle = 'rgba(0,0,0,0.30)'; xc.fill();
            let g = null;
            try {
                g = xc.createRadialGradient(px0 - r * 0.35, py0 - r * 0.4, r * 0.15, px0, py0, r * 1.05);
                g.addColorStop(0, G.lighten(c1, 0.35));
                g.addColorStop(0.55, c1);
                g.addColorStop(1, c2 || G.darken(c1, 0.35));
            } catch (e) { }
            xc.beginPath(); xc.arc(px0, py0, r, 0, 6.284);
            xc.fillStyle = g || c1; xc.fill();
            xc.lineWidth = Math.max(1.2, r * 0.10);
            xc.strokeStyle = rim || 'rgba(0,0,0,0.4)';
            xc.stroke();
            xc.beginPath(); xc.ellipse(px0 - r * 0.28, py0 - r * 0.42, r * 0.42, r * 0.26, -0.5, 0, 6.284);
            xc.fillStyle = 'rgba(255,255,255,0.34)'; xc.fill();
            G._pieceCache = G._pieceCache || new Map();
            if (G._pieceCache.size >= (G.MAX_CACHE || 48)) G._pieceCache.delete(G._pieceCache.keys().next().value);
            G._pieceCache.set(key, cv);
        }
        ctx.drawImage(cv, cx - pad, cy - pad, S, S);
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
