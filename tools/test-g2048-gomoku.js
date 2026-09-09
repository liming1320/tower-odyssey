/* 验证：
 * 1) 2048 每一关的 target 是否随难度递增（修 bug 前 50 关全是 Lv12）
 * 2) 五子棋 AI 是否有难度曲线：让脚本玩家「沿一条直线硬连」分别与第 1 / 10 / 25 / 40 / 50 关 AI 对打，
 *    AI 越强，玩家硬连成功率应该越低
 */
const fs = require('fs'); const vm = require('vm');

// ---------- DOM / MG 桩 ----------
function makeCtx() {
    const ctx = {};
    ctx.window = ctx; ctx.global = ctx; ctx.self = ctx;
    ctx.console = console;
    ctx.Math = Math; ctx.JSON = JSON; ctx.Date = Date; ctx.Set = Set; ctx.Map = Map;
    ctx.Array = Array; ctx.Object = Object; ctx.String = String; ctx.Number = Number;
    ctx.parseInt = parseInt; ctx.isFinite = isFinite; ctx.RegExp = RegExp;
    ctx.requestAnimationFrame = null;
    ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    ctx.document = {
        createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {}, classList: { add() {} } },
    };
    return ctx;
}

// ---------- 1) 2048 target 检查 ----------
{
    const ctx = makeCtx();
    ctx.MG = { canvas: () => ({ c: {}, ctx: {}, w: 0, h: 0, destroy() {} }), shuffle: a => a, pick: a => a[0], hint() {}, ri: (a, b) => a, recordStars() {}, canvasCss: () => ({}) };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('public/js/minigames/g2048.js', 'utf8'), ctx);
    const L = ctx.MiniGames.g2048.LEVELS;
    console.log('=== 2048 关卡目标 ===');
    console.log('关卡数：', L.length);
    const groups = {};
    L.forEach((l, i) => { (groups[l.target] = groups[l.target] || []).push(i + 1); });
    for (const t of Object.keys(groups)) {
        const idx = groups[t];
        console.log(`  target Lv${String(t).padStart(2)} : ${idx.length} 关  第 ${idx[0]}~${idx[idx.length - 1]} 关`);
    }
    const targets = L.map(l => l.target);
    const mono = targets.every((v, i) => i === 0 || v >= targets[i - 1]);
    const allTwelve = targets.every(v => v === 12);
    console.log(mono && !allTwelve ? '  ✓ 目标等级随关卡单调递增' : '  ✗ 目标序列异常（可能又退化成全部 Lv12）');
    // 步数是否够（合成 Lv n 至少需 2^(n-1) 只 1 级怪）
    const bad = L.filter(l => l.moves < Math.pow(2, l.target - 1));
    console.log(bad.length ? `  ✗ ${bad.length} 关步数低于理论下限` : '  ✓ 所有关卡步数均高于理论下限');
}

// ---------- 2) 五子棋 AI 强度曲线 ----------
{
    const ctx = makeCtx();
    // setTimeout 改成手动队列，避免测试里真的等 180ms
    const pending = [];
    ctx.setTimeout = fn => { pending.push(fn); return 0; };
    ctx.clearTimeout = () => {};

    let clickCb = null, stones = [];
    const fakeCtx = new Proxy({}, {
        get(_, k) {
            if (k === 'arc') return (cx, cy, r) => { if (r > 8) stones.push([cx, cy]); };
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (k === 'canvas') return {};
            return () => {};
        },
        set() { return true; },
    });
    ctx.MG = {
        canvas: () => { stones = []; return { c: {}, ctx: fakeCtx, w: 420, h: 420, destroy() {} }; },
        bind: (c, cb) => { clickCb = cb; },
        hint() {},
        ri: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
        pick: a => a[Math.floor(Math.random() * a.length)],
        shuffle: a => a,
        recordStars() {}, result() {},
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('public/js/minigames/gomoku.js', 'utf8'), ctx);
    const G = ctx.MiniGames.gomoku;
    console.log('\n=== 五子棋 AI 难度曲线 ===');
    console.log('关卡数：', G.LEVELS.length, '| 第1关：', G.LEVELS[0].desc, '| 第50关：', G.LEVELS[49].desc);

    const S = 28, OFF = 8;
    const boardFromDraw = () => {
        const b = Array.from({ length: 15 }, () => Array(15).fill(0));
        for (const [cx, cy] of stones) {
            const j = Math.round((cx - OFF) / S), i = Math.round((cy - OFF) / S);
            if (i >= 0 && i < 15 && j >= 0 && j < 15) b[i][j] = 1;
        }
        return b;
    };

    // 脚本玩家：死脑筋地在同一行往右连，被占了就跳过
    const playOnce = (idx) => {
        let result = null;
        G.start({}, { levelIdx: idx, totalLevels: 50, onComplete: r => { result = r; } });
        const flush = () => { let n = 0; while (pending.length && n++ < 50) pending.shift()(); };
        let row = 7, col = 3;
        for (let step = 0; step < 100 && !result; step++) {
            const b = boardFromDraw();
            while (col < 15 && b[row][col]) col++;
            if (col >= 15) return false;                       // 一行被堵死，视为没赢
            clickCb({ x: OFF + col * S, y: OFF + row * S });
            col++;
            flush();
            if (result) return !!result.win;
        }
        return !!result;
    };

    const RUNS = 60;
    for (const idx of [0, 4, 9, 14, 19, 24, 34, 44, 49]) {
        let win = 0;
        const t0 = Date.now();
        for (let k = 0; k < RUNS; k++) if (playOnce(idx)) win++;
        const rate = Math.round(win / RUNS * 100);
        console.log(`  第 ${String(idx + 1).padStart(2)} 关（${G.LEVELS[idx].name.padEnd(4)}）脚本玩家胜率 ${String(rate).padStart(3)}%  ${'█'.repeat(Math.round(rate / 5))}  ${Date.now() - t0}ms/${RUNS}局`);
    }
    console.log('  （玩家越强 AI 越弱，所以胜率应从高到低单调下降）');
}
