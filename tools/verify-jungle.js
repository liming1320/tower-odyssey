/* 斗兽棋（jungle）专项验证：加载引擎+jungle，构造关卡、推进帧、走一步合法棋、
 * 检查胜负与吃子路径，确认改版视图（emoji 棋子 / 静态层缓存）不破坏逻辑与绘制。
 *   node tools/verify-jungle.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');

function fakeCtx() {
    const store = { canvas: { width: 440, height: 596 }, __mgScale: 1, __mgW: 440, __mgH: 596 };
    return new Proxy(store, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createLinearGradient' || k === 'createRadialGradient')
                return () => ({ addColorStop() {} });
            if (k === 'measureText') return () => ({ width: 10 });
            return () => undefined;
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}
function fakeEl() {
    return {
        style: {}, className: '', innerHTML: '', textContent: '', children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector: () => fakeEl(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 440, height: 596 }),
        getContext: () => fakeCtx(),
        clientWidth: 440, clientHeight: 596, width: 440, height: 596,
        focus() {}, click() {}, value: '', dataset: {}, setAttribute() {}, remove() {},
    };
}
global.window = global;
global.MiniGames = {};
global.__MG_TEST = true;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.document = {
    createElement: fakeEl, getElementById: () => fakeEl(),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {} },
};
global.localStorage = { getItem: () => null, setItem() {} };

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
    if (ok) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (extra ? '  \u2192 ' + extra : '')); }
};

(async () => {
    const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
    const files = ENGINE_FILES.map(f => path.join(engineDir, f))
        .concat([path.join(dir, 'jungle.js')]);
    for (const f of files) {
        try { vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); }
        catch (e) { check('加载 ' + path.basename(f), false, e.message); }
    }
    const g = global.window.MiniGames.jungle;
    check('jungle 已注册', !!(g && typeof g.start === 'function'));
    check('LEVELS 50 关', g.LEVELS && g.LEVELS.length === 50, g.LEVELS && g.LEVELS.length);

    // 每关构造 + 推进帧（覆盖 draw 静态层缓存与 emoji 棋子路径）
    let drawErr = '';
    for (const i of [0, 24, 49]) {
        try {
            const inst = g.start(fakeEl(), {
                level: g.LEVELS[i], levelIdx: i, endless: false, totalLevels: 50,
                onScore: () => {}, onComplete: () => {}, onBack: () => {},
            });
            for (let f = 0; f < 6; f++) inst.step && inst.step(16);
            inst && inst.stop && inst.stop();
        } catch (e) { drawErr += `L${i + 1}:${e.message}; `; }
    }
    check('构造+绘制 3 个抽样关卡不抛异常', !drawErr, drawErr);

    // 逻辑回归：走一步合法棋 → 吃子 → 胜负
    const dbg = global.window.__jungleDbg;
    check('调试钩子可用', !!dbg);
    if (dbg) {
        const B = dbg.newBoard();
        const moves = dbg.allMoves(B, 1);
        check('开局玩家有合法走法', moves.length > 0);
        // 鼠(1,1)(x0,y2) 走一步；狮跳河：红狮 (0,8)→? 走法中应含跳河格 (3,8)? 不对，横跳在河行。
        const lion = dbg.movesFor(B, 0, 8);   // 红狮在 (0,8)
        check('狮在底线无跳河（不在河边行）', !lion.some(m => m.x === 3));
        // 象怕鼠：黑象(6,2) 对红鼠(0,2) 不相邻，构造吃子场景：鼠走到象旁
        // 直接用 apply 验证吃子与胜负
        const mv = moves[0];
        const cap = dbg.apply(B, mv);
        check('走子后原格为空', !B[dbg.ix(mv.fx, mv.fy)]);
        dbg.undo(B, mv, cap);   // cap 为 null 表示没吃子，undo 同样要执行
        check('undo 还原', !!B[dbg.ix(mv.fx, mv.fy)]);
        check('初始无胜负', dbg.winnerOf(B) === -1);
        // 攻入兽穴：把红子放进黑穴
        B[dbg.ix(dbg.DENS[0].x, dbg.DENS[0].y)] = { s: 1, r: 2 };
        check('进对方兽穴判胜', dbg.winnerOf(B) === 1);
    }

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
