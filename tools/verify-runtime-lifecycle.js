// 引擎级生命周期冒烟测试（issue #2 / #3 / #11）
//  1) api.later / api.every / api.listen 在 stop() 后必须全部失效并回收
//  2) 连续启动销毁 20 款随机小游戏，定时器/监听不应持续增长
//  3) stop() 必须幂等
// 用法：node tools/verify-runtime-lifecycle.js
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
const errors = [];
MG.onError = (e, info) => errors.push((info && info.phase ? info.phase + ': ' : '') + e.message);

// 非小游戏：只是为清单口径一致注册了占位 LEVELS，且 start() 会打真实网络请求
const SKIP = new Set(['emulator.js', 'arcade.js']);
// mg-tower-core.js 末尾才定义 MG.tower，必须排在 mg-newtower56.js 之前，
// 否则 newtower56 的 `if (!MG.tower) return;` 会让它被静默跳过（同 index.html 的顺序）
const FIRST = ['mg-tower-core.js'];
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');
const others = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !SKIP.has(f) && !FIRST.includes(f));
for (const f of FIRST.concat(others.sort())) S.loadGameFile(f);
const M = global.MiniGames;

(async () => {
    console.log(`已加载 ${Object.keys(M).length} 款小游戏\n`);

    // ---------- 1) 实例运行域清理 ----------
    console.log('【1】api.later / every / listen 的自动回收');
    const E = MG.eng;
    let hits = 0;
    E.def('__lifecycle_probe', {
        w: 400, h: 520,
        params: () => ({}),
        init: () => ({ on: false }),
        draw() { },
        tick(st, dt, P, api) {
            if (st.on) return;
            st.on = true;
            api.later(() => { hits++; }, 40);
            api.every(() => { hits++; }, 40);
            api.listen(global.window, 'keydown', () => { hits++; });
            st.api = api;
        },
    });
    const probeBox = S.makeEl('div');
    const pInst = M.__lifecycle_probe.start(probeBox, { level: M.__lifecycle_probe.LEVELS[0], levelIdx: 0, endless: false, onScore: () => { }, onComplete: () => { } });
    await sleep(300);
    const afterStart = hits;
    check('运行期间定时器/监听确实在触发', afterStart > 0, 'hits=' + afterStart);
    pInst.stop();
    const atStop = hits;
    await sleep(320);
    check('stop() 后不再触发任何回调', hits === atStop, `stop 时 ${atStop} → 现在 ${hits}`);
    check('stop() 幂等（重复调用不抛）', (() => { try { pInst.stop(); return true; } catch (e) { return false; } })());

    // ---------- 2) 连续启动销毁 20 款 ----------
    console.log('\n【2】连续启动/销毁 20 款小游戏（资源不增长）');
    const ids = Object.keys(M).filter(k => k !== '__lifecycle_probe');
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    const picks = ids.slice(0, 20);
    const before = S.pending.size;
    let crashed = [];
    for (const id of picks) {
        const g = M[id];
        const box = S.makeEl('div');
        let inst = null;
        try {
            inst = g.start(box, { level: g.LEVELS[0], levelIdx: 0, endless: false, totalLevels: 50, onScore: () => { }, onComplete: () => { }, onBack: () => { } });
        } catch (e) { crashed.push(id + ' start: ' + e.message); continue; }
        await sleep(40);
        try { inst.stop(); } catch (e) { crashed.push(id + ' stop: ' + e.message); }
    }
    await sleep(600);
    check('20 款启动/销毁均无异常', crashed.length === 0, crashed.slice(0, 3).join(' | '));
    const grow = S.pending.size - before;
    check('销毁后无定时器泄漏', grow <= 2, `启动前 ${before} → 现在 ${S.pending.size}（+${grow}）`);

    // ---------- 3) 再跑一轮，确认二次启动也不累积 ----------
    console.log('\n【3】第二轮（确认不累积）');
    const before2 = S.pending.size;
    let crashed2 = [];
    for (const id of picks) {
        const g = M[id];
        const box = S.makeEl('div');
        try {
            const inst = g.start(box, { level: g.LEVELS[0], levelIdx: 0, endless: false, totalLevels: 50, onScore: () => { }, onComplete: () => { } });
            await sleep(30);
            inst.stop();
        } catch (e) { crashed2.push(id + ': ' + e.message); }
    }
    await sleep(600);
    check('第二轮启动/销毁无异常', crashed2.length === 0, crashed2.slice(0, 3).join(' | '));
    const grow2 = S.pending.size - before2;
    check('第二轮仍无泄漏（资源不累积）', grow2 <= 2, `+${grow2}`);

    console.log('\n引擎错误：' + (errors.length ? errors.slice(0, 5).join(' | ') : '无'));
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
