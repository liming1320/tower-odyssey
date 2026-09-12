// 木乃伊迷宫（PopCap 规则版）逻辑验证
// 运行：node tools/verify-mummymaze.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public/js/minigames/mummymaze.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
}

// ---------- DOM stub ----------
function fakeCtx() {
    const store = new Map();
    const ctx = new Proxy({}, {
        get(t, k) {
            if (k === '__store') return store;
            if (!store.has(k)) store.set(k, typeof k === 'string' && k.startsWith('set') ? () => {} : function () {});
            return store.get(k);
        },
        set(t, k, v) { store.set(k, v); return true; },
    });
    return ctx;
}
let canvasCount = 0;
function fakeEl(tag) {
    const el = {
        tagName: tag,
        style: { cssText: '' },
        children: [],
        _handlers: {},
        textContent: '',
        className: '',
        title: '',
        clientWidth: 0, clientHeight: 0,
        isConnected: true,
        addEventListener(ev, fn) { (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
        removeEventListener() {},
        appendChild(c) { el.children.push(c); return c; },
        getContext() { return el.__ctx || (el.__ctx = fakeCtx()); },
    };
    if (tag === 'canvas') { el.width = 300; el.height = 150; canvasCount++; }
    return el;
}
const documentStub = {
    createElement: tag => fakeEl(tag),
    createDocumentFragment: () => fakeEl('#frag'),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
};

const MG = {
    ri: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    gfx: {
        px: () => fakeEl('canvas'),
        pxDraw: () => {},
    },
};

// ---------- 构造一局 ----------
function makeGame(source, idx) {
    const results = { complete: [], score: [] };
    const container = fakeEl('div');
    container.clientWidth = 420;
    const sandbox = {
        window: {}, Math, console, Map, Set, Array, Object, JSON,
    };
    sandbox.window = sandbox; // window.MiniGames = global.MiniGames
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};
    sandbox.document = documentStub;
    sandbox.MG = MG;
    sandbox.innerWidth = 900; sandbox.innerHeight = 700;
    sandbox.requestAnimationFrame = fn => setTimeout(fn, 16);
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'mummymaze.js' });
    const game = sandbox.MiniGames.mummymaze;
    const inst = game.start(container, {
        levelIdx: idx,
        onComplete: r => results.complete.push(r),
        onScore: t => results.score.push(t),
    });
    return { dbg: sandbox.window.__mummyDbg, results, stop: inst.stop, MiniGames: sandbox.MiniGames };
}
// 说明：游戏脚本里用的是裸 `window` 与 `MiniGames`（var 隐式全局），沙箱里 window===sandbox，
// `MiniGames.mummymaze = {...}` 写在 sandbox 上，因此从 sandbox.MiniGames 取。
function corridor(dbg, len) {
    // 找一条横向 len 连格开阔走廊（无墙无门）
    for (let y = 0; y < dbg.N; y++) {
        for (let x = 0; x + len <= dbg.N; x++) {
            let okAll = true;
            for (let k = 0; k < len; k++) if (!dbg.isOpen(x + k, y) || dbg.isGate((x + k) + ',' + y)) { okAll = false; break; }
            if (okAll) return { x, y };
        }
    }
    return null;
}
function openNear(dbg, x, y) { // 附近开阔格（放无关木乃伊）
    for (let yy = 0; yy < dbg.N; yy++) for (let xx = 0; xx < dbg.N; xx++) {
        if (dbg.isOpen(xx, yy) && !dbg.isGate(xx + ',' + yy) && !(xx === x && yy === y) && xx + yy < 3) return [xx, yy];
    }
    return [0, 0];
}
function parkMummies(dbg, except) {
    const s = dbg.state;
    s.mums.forEach((m, i) => {
        if (i === except) return;
        const [cx, cy] = openNear(dbg, -1, -1);
        dbg._mum(i, cx, cy);
    });
}

// ================= 测试 =================
console.log('— 结构 —');
{
    const g = makeGame(SRC, 0);
    ok(g.MiniGames.mummymaze.LEVELS.length === 50, 'LEVELS 共 50 关');
    ok(typeof g.stop === 'function' && typeof g.dbg.move === 'function', 'start 返回 stop、暴露 dbg');
    g.stop();
}
console.log('— 栅栏门规则 —');
{
    const g = makeGame(SRC, 4); // gates = min(3, 1+0) = 1
    ok(g.dbg.state.gates.length === 1, '第 5 关有 1 扇栅栏门');
    const [gx, gy] = g.dbg.state.gates[0].split(',').map(Number);
    ok(g.dbg.canStep(0, gx, gy) === false, '木乃伊不能穿过栅栏门');
    // 主角能过门：走到门旁，再走向门
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = gx + dx, ay = gy + dy;
        if (g.dbg.isOpen(ax, ay) && !g.dbg.isGate(ax + ',' + ay) && !(ax === g.dbg.EX && ay === g.dbg.EY)) {
            parkMummies(g.dbg, -1);
            g.dbg._hero(ax, ay);
            g.dbg.move(-dx, -dy); // 朝门走
            moved = g.dbg.state.px === gx && g.dbg.state.py === gy;
            break;
        }
    }
    ok(moved, '主角可以走过栅栏门');
    g.stop();
}
console.log('— 白木乃伊：1 步 / 八向追踪 —');
{
    const g = makeGame(SRC, 4);
    const c = corridor(g.dbg, 4);
    ok(!!c, '能找到 4 连格走廊');
    if (c) {
        parkMummies(g.dbg, 0);
        g.dbg._hero(c.x, c.y);
        g.dbg._mum(0, c.x + 3, c.y);
        const before = g.dbg.state.mums[0];
        g.dbg.wait();
        const after = g.dbg.state.mums[0];
        ok(after.x === before.x - 1, `白木乃伊横直追一步（${before.x},${before.y}→${after.x},${after.y}）`);
        // 斜向追踪：2x2 开阔块
        let diag = null;
        outer:
        for (let y = 0; y + 2 < g.dbg.N; y++) for (let x = 0; x + 2 < g.dbg.N; x++) {
            const cells = [[x, y], [x + 1, y + 1], [x + 1, y], [x, y + 1]];
            if (cells.every(([cx, cy]) => g.dbg.isOpen(cx, cy) && !g.dbg.isGate(cx + ',' + cy))) { diag = { x, y }; break outer; }
        }
        if (diag) {
            g.dbg._hero(diag.x, diag.y);
            g.dbg._mum(0, diag.x + 2, diag.y + 2);
            const b2 = g.dbg.state.mums[0];
            g.dbg.wait();
            const a2 = g.dbg.state.mums[0];
            ok(a2.x === b2.x - 1 && a2.y === b2.y - 1, `木乃伊斜向追踪（${b2.x},${b2.y}→${a2.x},${a2.y}）`);
        } else ok(true, '（本局无 2×2 开阔块，跳过斜向用例）');
    }
    g.stop();
}
console.log('— 红木乃伊：1 回合 2 步 —');
{
    const g = makeGame(SRC, 30); // red = max(1, floor(6/3)) = 2
    const c = corridor(g.dbg, 6);
    ok(!!c, '第 31 关能找到 6 连格走廊');
    if (c) {
        parkMummies(g.dbg, -1);
        const s0 = g.dbg.state;
        const redIdx = s0.mums.findIndex(m => m.red);
        ok(redIdx >= 0, '存在红木乃伊');
        g.dbg._hero(c.x, c.y);
        g.dbg._mum(redIdx, c.x + 5, c.y);
        const before = g.dbg.state.mums[redIdx];
        g.dbg.wait();
        const after = g.dbg.state.mums[redIdx];
        ok(before.x - after.x === 2, `红木乃伊一回合走 2 步（${before.x}→${after.x}）`);
        ok(!(g.results.complete.length && g.results.complete[0].win === false), '间隔 4 格等待不会被立即抓住');
    }
    g.stop();
}
console.log('— 抓捕与胜负 —');
{
    const g = makeGame(SRC, 4);
    const c = corridor(g.dbg, 3);
    parkMummies(g.dbg, 0);
    g.dbg._hero(c.x, c.y);
    g.dbg._mum(0, c.x + 1, c.y);
    g.dbg.wait();
    ok(g.results.complete.length === 1 && g.results.complete[0].win === false, '贴脸等待 → 被木乃伊抓住（失败结算）');
    g.stop();
}
{
    const g = makeGame(SRC, 4);
    parkMummies(g.dbg, -1);
    // 找出口旁的开放格
    let from = null;
    for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1]]) {
        if (g.dbg.isOpen(g.dbg.EX + dx, g.dbg.EY + dy) && !g.dbg.isGate((g.dbg.EX + dx) + ',' + (g.dbg.EY + dy))) { from = [g.dbg.EX + dx, g.dbg.EY + dy]; break; }
    }
    ok(!!from, '楼梯口旁存在可达格');
    if (from) {
        g.dbg._hero(from[0], from[1]);
        g.dbg.move(Math.sign(g.dbg.EX - from[0]), Math.sign(g.dbg.EY - from[1]));
        const r = g.results.complete[0];
        ok(r && r.win === true && r.stars >= 1 && r.stars <= 3, `抵达楼梯过关（stars=${r && r.stars}）`);
    }
    g.stop();
}
console.log('— 等待与撞墙 —');
{
    const g = makeGame(SRC, 0);
    const s0 = g.dbg.state;
    g.dbg.wait();
    ok(g.dbg.state.steps === s0.steps + 1, '原地等待消耗 1 回合');
    // 找一个被墙围的方向撞
    let bumped = false;
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
        const nx = g.dbg.state.px + dx, ny = g.dbg.state.py + dy;
        if (!g.dbg.isOpen(nx, ny) || g.dbg.EX === nx && g.dbg.EY === ny) continue;
        if (!g.dbg.isOpen(nx, ny)) { continue; }
    }
    // 直接验证：移动到非开放格无效
    const before = g.dbg.state;
    let wallDir = null;
    outer2:
    for (let y = 0; y < g.dbg.N; y++) for (let x = 0; x < g.dbg.N; x++) {
        if (!g.dbg.isOpen(x, y)) { wallDir = [x, y]; break outer2; }
    }
    if (wallDir) {
        // 找墙旁的开放格作为主角位置
        let spot = null;
        outer3:
        for (let y = 0; y < g.dbg.N; y++) for (let x = 0; x < g.dbg.N; x++) {
            if (g.dbg.isOpen(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !g.dbg.isOpen(x + dx, y + dy))) { spot = [x, y]; break outer3; }
        }
        if (spot) {
            const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !g.dbg.isOpen(spot[0] + dx, spot[1] + dy));
            g.dbg._hero(spot[0], spot[1]);
            const stepsBefore = g.dbg.state.steps;
            g.dbg.move(dir[0], dir[1]);
            ok(g.dbg.state.steps === stepsBefore, '撞墙移动无效（不消耗回合）');
        } else ok(true, '（无靠墙格，跳过）');
    }
    g.stop();
}

// ================= 反向验证 =================
console.log('— 反向验证（注入 bug，断言必须变红）—');
{
    // 注入：木乃伊可以穿门 → canStep(gate) 变 true → 门规则断言应当失败
    const patched = SRC.replace("!open(nx, ny) || gates.has(nx + ',' + ny)", '!open(nx, ny)');
    if (patched === SRC) { fail++; console.log('  ✗ 反向验证补丁未生效（源码串不匹配）'); }
    else {
        const g = makeGame(patched, 4);
        const [gx, gy] = g.dbg.state.gates[0].split(',').map(Number);
        const leaks = g.dbg.canStep(0, gx, gy);
        ok(leaks === true, '注入「木乃伊可穿门」后门规则断言确实翻红');
        g.stop();
    }
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
