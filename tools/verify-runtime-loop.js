// 引擎「完整运行时」验证（issue #5）
//  1) 可变步（默认）：行为与改造前一致，dt 限幅、S.t 正常推进
//  2) 固定时间步：tick 收到恒定 dt，不同帧率下步数一致（物理与帧率解耦）
//  3) 插值系数 alpha 落在 0~1
//  4) 追帧上限：卡顿一秒不会一次补几百步（防死亡螺旋）
//  5) 时间缩放：setTimeScale 影响推进速度
//  6) 手动推进 inst.step()：stop() 后失效
//  7) DOM 引擎 tick：声明 cfg.tick 才启动循环，stop() 后停止
//  8) 确定性：MG.setDeterministic 后随机数可复现，关闭后恢复原生
// 用法：node tools/verify-runtime-loop.js
const fs = require('fs');
const path = require('path');
const Stub = require('./mg-dom-stub');

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const S = Stub.install();
const MG = S.loadEngine();
const E = MG.eng;
const errors = [];
MG.onError = (e, info) => errors.push((info && info.phase ? info.phase + ': ' : '') + e.message);

function box() { return S.makeEl('div'); }
function mkGame(id, cfg) {
    E.def(id, Object.assign({ w: 400, h: 520, params: () => ({}) }, cfg));
    return global.MiniGames[id];
}
function start(g, opts) {
    const inst = g.start(box(), Object.assign({
        level: g.LEVELS[0], levelIdx: 0, endless: false, onScore: () => { }, onComplete: () => { },
    }, opts || {}));
    if (inst.pause) inst.pause();     // 暂停自动循环，改由 inst.step() 手动驱动，结果才可复现
    return inst;
}

(async () => {
    // ---------- 1) 默认可变步：行为不变 ----------
    console.log('【1】默认可变步（115 款现有游戏走的路径，必须零回归）');
    const dts = [];
    mkGame('__loop_var', {
        init: () => ({ n: 0 }),
        draw() { },
        tick(st, dt) { st.n++; dts.push(dt); },
    });
    let inst = start(global.MiniGames.__loop_var);
    for (let i = 0; i < 10; i++) inst.step(16.7);
    check('手动推进 10 帧 → tick 调用 10 次', global.__mgS.n === 10, 'n=' + (global.__mgS && global.__mgS.n));
    check('dt 全部为正且 ≤ 50ms（限幅仍生效）', dts.every(d => d > 0 && d <= 0.0501), 'dt[0]=' + dts[0]);
    check('S.t 正常累加', Math.abs(global.__mgS.t - 10 * 0.0167) < 0.02, 't=' + (global.__mgS.t || 0).toFixed(3));
    check('可变步模式 alpha 恒为 0', inst.perf.alpha === 0);
    inst.stop();
    check('stop() 后手动推进失效', inst.step(16.7) === 0);

    // ---------- 1b) 暂停 / 恢复（rAF 真实驱动） ----------
    console.log('\n【1b】暂停 / 恢复（自动循环路径）');
    let sP = null;
    mkGame('__loop_pause', { init: () => ({ t: 0 }), draw() { }, tick(st) { sP = st; } });
    const pi = global.MiniGames.__loop_pause.start(box(), { level: { name: 'x' }, levelIdx: 0, onScore: () => { }, onComplete: () => { } });
    await sleep(120);
    const tRun = sP.t;
    check('自动循环正常推进', tRun > 0, 't=' + tRun.toFixed(3));
    pi.pause();
    await sleep(150);
    check('暂停期间完全不推进（但仍在重绘）', Math.abs(sP.t - tRun) < 1e-9, `t=${sP.t.toFixed(4)}`);
    pi.resume();
    await sleep(150);
    check('恢复后继续推进，且没有把暂停的时间一次性补回来', sP.t > tRun && sP.t - tRun < 0.3, 'Δ=' + (sP.t - tRun).toFixed(3));
    pi.stop();
    const tStopped = sP.t;
    await sleep(120);
    check('stop() 后彻底停机', Math.abs(sP.t - tStopped) < 1e-9);

    // ---------- 2) 固定时间步：与帧率解耦 ----------
    console.log('\n【2】固定时间步（cfg.fixedStep = 1/60）');
    const stepsAt = [];
    mkGame('__loop_fix', {
        fixedStep: 1 / 60,
        init: () => ({ n: 0, sum: 0 }),
        draw() { },
        tick(st, dt) { st.n++; st.sum += dt; stepsAt.push(dt); },
    });
    const g2 = global.MiniGames.__loop_fix;
    // 模拟 60fps：30 帧 × 16.7ms
    let a = start(g2); for (let i = 0; i < 30; i++) a.step(16.7);
    const fast = { n: global.__mgS.n, sum: global.__mgS.sum };
    a.stop();
    // 模拟 30fps：15 帧 × 33.4ms（总时长几乎相同）
    let b = start(g2); for (let i = 0; i < 15; i++) b.step(33.4);
    const slow = { n: global.__mgS.n, sum: global.__mgS.sum };
    b.stop();
    check('60fps 与 30fps 下逻辑步数一致（物理不再随帧率漂移）',
        Math.abs(fast.n - slow.n) <= 1, `60fps:${fast.n} 步 / 30fps:${slow.n} 步`);
    check('tick 收到的 dt 恒为固定步长', stepsAt.every(d => Math.abs(d - 1 / 60) < 1e-9), 'dt[0]=' + stepsAt[0]);
    check('固定步下 alpha ∈ [0,1]', a.perf.alpha >= 0 && a.perf.alpha <= 1, 'alpha=' + a.perf.alpha);

    // ---------- 3) 追帧上限 ----------
    console.log('\n【3】追帧上限（防死亡螺旋）');
    mkGame('__loop_fix2', {
        fixedStep: 1 / 60, maxSubSteps: 5,
        init: () => ({ n: 0 }),
        draw() { },
        tick(st) { st.n++; },
    });
    let c = start(global.MiniGames.__loop_fix2);
    const before3 = global.__mgS.n;
    c.step(2000);           // 假装卡了 2 秒：1/60 步长本应补 120 步
    const burst = global.__mgS.n - before3;
    check('卡顿 2s 最多补 5 步（maxSubSteps 生效）', burst <= 5, '实际补了 ' + burst + ' 步');
    c.stop();

    // ---------- 4) 时间缩放 ----------
    console.log('\n【4】时间缩放（慢动作 / 快进）');
    let t1 = null, t2 = null, tsApi = null;
    mkGame('__loop_ts', {
        init: () => ({ n: 0 }),
        draw() { },
        tick(st, dt, P, api) { tsApi = api; st.n++; },
    });
    let d = start(global.MiniGames.__loop_ts);
    for (let i = 0; i < 20; i++) d.step(16.7);
    t1 = global.__mgS.t;
    tsApi.setTimeScale(0.25);
    for (let i = 0; i < 20; i++) d.step(16.7);
    t2 = global.__mgS.t - t1;
    check('0.25 倍速下推进量约为原来的 1/4', Math.abs(t2 - t1 * 0.25) < 0.02, `正常 ${t1.toFixed(3)}s → 慢放 ${t2.toFixed(3)}s`);
    tsApi.setTimeScale(1);
    d.stop();

    // ---------- 5) 帧统计 ----------
    console.log('\n【5】帧统计（fps / 帧数 / 步数）');
    mkGame('__loop_perf', { init: () => ({}), draw() { }, tick() { } });
    let e5 = start(global.MiniGames.__loop_perf);
    for (let i = 0; i < 50; i++) e5.step(16.7);
    const p5 = e5.perf;
    check('perf.frames 正确累加', p5.frames === 50, 'frames=' + p5.frames);
    check('perf.steps 正确累加（可变步 = 帧数）', p5.steps === 50, 'steps=' + p5.steps);
    check('perf.fps 有合理估值', p5.fps > 0 && p5.fps < 200, 'fps=' + p5.fps);
    e5.stop();

    // ---------- 6) DOM 引擎 tick ----------
    console.log('\n【6】DOM 引擎帧循环（只有声明 cfg.tick 才启动）');
    let domN = 0, domApi = null;
    E.defd('__loop_dom', {
        params: () => ({}),
        init: () => ({ n: 0 }),
        render: () => '<div class="x">dom</div>',
        tick(st, dt, P, api) { st.n++; domN++; domApi = api; },
    });
    E.defd('__loop_dom2', { params: () => ({}), init: () => ({ n: 0 }), render: () => '<div>no-tick</div>' });
    const dg = global.MiniGames.__loop_dom, dg2 = global.MiniGames.__loop_dom2;
    const di = dg.start(box(), { level: dg.LEVELS[0], levelIdx: 0, onScore: () => { }, onComplete: () => { } });
    await sleep(200);
    check('声明 tick 的 DOM 游戏循环已启动', domN > 0, 'n=' + domN);
    const atStop6 = domN;
    di.stop();
    await sleep(160);
    check('DOM 游戏 stop() 后循环停止', domN === atStop6, `stop 时 ${atStop6} → 现在 ${domN}`);
    const di2 = dg2.start(box(), { level: dg2.LEVELS[0], levelIdx: 0, onScore: () => { }, onComplete: () => { } });
    await sleep(120);
    check('未声明 tick 的 DOM 游戏不跑循环（零回归）', di2.perf === null);
    di2.stop();

    // ---------- 7) 确定性随机 ----------
    console.log('\n【7】确定性随机（复现线上 bug / 固定出题）');
    const native = Math.random;
    MG.setDeterministic(20260911);
    const seqA = [Math.random(), Math.random(), Math.random()];
    MG.setDeterministic(20260911);
    const seqB = [Math.random(), Math.random(), Math.random()];
    check('同 seed 两次调用序列完全一致', seqA.join() === seqB.join(), seqA.join() + ' vs ' + seqB.join());
    MG.setDeterministic(20260912);
    const seqC = [Math.random(), Math.random(), Math.random()];
    check('不同 seed 序列不同', seqA.join() !== seqC.join());
    MG.setDeterministic(false);
    check('关闭后恢复原生 Math.random', Math.random === native);
    const r1 = MG.makeRng(7), r2 = MG.makeRng(7);
    check('api.rng 同 seed 可复现', r1.int(1, 100) === r2.int(1, 100));
    check('rng 提供 int/range/pick/chance/shuffle', (() => {
        const r = MG.makeRng(1);
        return typeof r.int === 'function' && typeof r.range === 'function' &&
            typeof r.pick === 'function' && typeof r.chance === 'function' && typeof r.shuffle === 'function';
    })());

    // ---------- 8) 全局固定步策略：对所有 E.def 游戏生效 ----------
    console.log('\n【8】MG.setFixedStep 全局策略（打开后全部游戏统一物理步）');
    const SKIP = new Set(['emulator.js', 'arcade.js']);
    const FIRST = ['mg-tower-core.js'];
    const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !SKIP.has(f) && !FIRST.includes(f));
    for (const f of FIRST.concat(files.sort())) S.loadGameFile(f);
    const M = global.MiniGames;
    const ids = Object.keys(M).filter(k => k.indexOf('__loop') !== 0);
    MG.setFixedStep(1 / 60);
    check('全局策略已开启', MG.loopPolicy.step > 0, 'step=' + MG.loopPolicy.step);
    let crashed8 = [], fixedSeen = 0, sampled = 0;
    const step = Math.max(1, Math.floor(ids.length / 20));
    for (let i = 0; i < ids.length; i += step) {
        const id = ids[i], g = M[id];
        sampled++;
        let inst = null;
        try {
            inst = g.start(box(), { level: g.LEVELS[0], levelIdx: 0, endless: false, onScore: () => { }, onComplete: () => { } });
            if (inst.step) { inst.step(16.7); inst.step(16.7); }
            if (inst.perf && inst.perf.fixed > 0) fixedSeen++;
            await sleep(10);
            inst.stop();
        } catch (e) { crashed8.push(id + ': ' + e.message); if (inst && inst.stop) { try { inst.stop(); } catch (_) { } } }
    }
    check(`抽样 ${sampled} 款在固定步下启动/推进/销毁均无异常`, crashed8.length === 0, crashed8.slice(0, 3).join(' | '));
    check('固定步确实下发到各游戏实例', fixedSeen > sampled * 0.5, `${fixedSeen}/${sampled} 款实例 perf.fixed>0`);
    MG.setFixedStep(0);
    check('关闭后回到可变步（零回归）', MG.loopPolicy.step === 0);

    console.log('\n引擎错误：' + (errors.length ? errors.slice(0, 5).join(' | ') : '无'));
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
