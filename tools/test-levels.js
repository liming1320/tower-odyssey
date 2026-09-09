/* 小游戏关卡化改造 · 无头逻辑测试
 * 用最小 DOM/canvas 桩在 Node 中加载 banqi / g2048 模块，验证：
 *   1) 暗棋规则：卒吃帅 / 帅不能吃卒 / 炮隔子跳吃
 *   2) 暗棋 AI 对局收敛（脚本玩家 vs 4 档难度，各 25 局）
 *   3) 2048 关卡：随机玩家通关率 + 岩石关死局检测
 * 运行：node tools/test-levels.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const assert = (cond, msg) => {
    if (cond) { pass++; console.log('  ✔ ' + msg); }
    else { fail++; console.log('  ✗ ' + msg); }
};

// ---------- DOM / canvas / MG 桩 ----------
function fakeCtx() {
    return new Proxy({}, {
        get(t, k) { if (k === 'canvas') return {}; return () => undefined; },
        set() { return true; },
    });
}
function fakeEl() {
    return {
        children: [], _html: '',
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html; },
        appendChild(x) { this.children.push(x); return x; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        addEventListener() {}, removeEventListener() {},
        set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: {}, dataset: {}, onclick: null,
        getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300 }; },
        clientWidth: 400, clientHeight: 300,
    };
}
global.window = global;
global.document = { createElement: () => fakeEl(), addEventListener() {}, removeEventListener() {} };
global.addEventListener = () => {}; global.removeEventListener = () => {};
global.localStorage = (() => {
    const s = {};
    return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } };
})();
window.__MG_TEST = true;

// 固定种子随机数：让含随机的用例可复现（AI 对局 / 2048 发牌），消除测试抖动
let _seed = 1;
const setSeed = n => { _seed = n >>> 0 || 1; };
Math.random = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };

// MG 桩：替换 levelSelect/rps/hint/canvas/result，bind 捕获 onTap
let lastOnTap = null, lastResult = null;
const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../public/js/minigames', f), 'utf8'), { filename: f });
load('_shared.js');
MG.canvas = () => ({ c: fakeEl(), ctx: fakeCtx(), w: 404, h: 228, destroy() {} });
MG.bind = (c, onTap) => { lastOnTap = onTap; };
MG.hint = () => {};
MG.levelSelect = (ct, cfg) => cfg.onStart(0, cfg.levels[0]);
MG.rps = (ct, cb) => cb('player');
MG.result = (ct, cfg) => { lastResult = cfg; };
// 让 AI 回手立即执行（不等 650ms）
const origSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => { try { fn(); } catch (e) { lastErr = e; } return 0; };
let lastErr = null;

load('banqi.js');
load('g2048.js');

const cellXY = (i, j) => ({ x: 2 + j * 50 + 25, y: 2 + i * 56 + 28 });
const tapMove = m => {
    const B = window.__banqi;
    if (m.t === 'flip') { B.tap(m.i, m.j); return; }
    B.tap(m.fi, m.fj);   // 选中
    B.tap(m.ti, m.tj);   // 走/吃
};
const isKing = n => n === '帥' || n === '將';   // 红帅 / 黑将同为主将

// ---------- 1) 暗棋规则单元测试 ----------
setSeed(20260909); console.log('\n① 暗棋规则');
{
    const api = MiniGames.banqi.start(fakeEl(), { onScore: () => {} });
    const B = window.__banqi;
    // 清空棋盘，摆测试局面
    const put = (i, j, n, r, color) => { B.board[i][j] = { n, r, color, faceUp: true }; };
    const clear = () => { for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) B.board[i][j] = null; };
    // 卒 吃 帅（允许）
    clear(); put(0, 0, '卒', 1, 1); put(0, 1, '帥', 7, 2);
    let ms = B.legalMoves(1).filter(m => m.t === 'm' && m.ti === 0 && m.tj === 1);
    assert(ms.length === 1, '卒可以吃敌方帅');
    clear(); // 帅 不能吃 卒
    put(0, 0, '帥', 7, 1); put(0, 1, '卒', 1, 2);
    ms = B.legalMoves(1).filter(m => m.t === 'm' && m.ti === 0 && m.tj === 1);
    assert(ms.length === 0, '帅不能吃敌方卒');
    // 炮隔一子跳吃
    clear(); put(0, 0, '砲', 2, 1); put(0, 2, '卒', 1, 1); put(0, 4, '車', 4, 2);
    ms = B.legalMoves(1).filter(m => m.t === 'm' && m.ti === 0 && m.tj === 4);
    assert(ms.length === 1, '炮隔一子可跳吃车');
    // 炮不能隔两子（两枚炮架都在目标之前）
    clear(); put(0, 0, '砲', 2, 1); put(0, 2, '卒', 1, 1); put(0, 3, '卒', 1, 1); put(0, 5, '車', 4, 2);
    ms = B.legalMoves(1).filter(m => m.t === 'm' && m.ti === 0 && m.tj === 5);
    assert(ms.length === 0, '炮隔两子不能吃');
    // 炮不能邻吃
    put(1, 0, '卒', 1, 2);
    ms = B.legalMoves(1).filter(m => m.t === 'm' && m.ti === 1 && m.tj === 0);
    assert(ms.length === 0, '炮不能邻吃');
    // 等级 大吃小
    clear(); put(2, 0, '車', 4, 1); put(2, 1, '馬', 3, 2);
    ms = B.legalMoves(1).filter(m => m.t === 'm' && m.ti === 2 && m.tj === 1);
    assert(ms.length === 1, '车可以吃马');
    api.stop();
}

// ---------- 2) 暗棋 AI 对局（脚本玩家 vs 各难度） ----------
setSeed(9527); console.log('\n② 暗棋 AI 对局收敛 + 难度梯度');
const smartPlayer = B => {
    const ms = B.legalMoves(1);
    if (!ms.length) return null;
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const canCapAdj = (a, b) => {
        if (a.color === b.color) return false;
        if (a.n === '砲') return false;
        if (a.n === '卒' && b.n === '帥') return true;
        if (a.n === '帥' && b.n === '卒') return false;
        return a.r >= b.r;
    };
    const danger = (i, j, p) => {  // 落点被敌方邻吃的风险
        let r = 0;
        for (const [di, dj] of DIRS) {
            const x = i + di, y = j + dj;
            if (x < 0 || x > 3 || y < 0 || y > 7) continue;
            const q = B.board[x][y];
            if (q && q.faceUp && q.color === 2 && canCapAdj(q, p)) r += p.r * 10;
        }
        return r;
    };
    let best = null, bestV = -Infinity;
    for (const m of ms) {
        let v = Math.random() * 3;
        if (m.t === 'm') {
            const a = B.board[m.fi][m.fj], victim = B.board[m.ti][m.tj];
            if (victim) v += isKing(victim.n) ? 1000 : victim.r * 12;
            v -= danger(m.ti, m.tj, a) * 1.1;
            if (isKing(a.n)) v -= 10;
        } else if (Math.random() < 0.35) v += 4;  // 前期适度翻子
        if (v > bestV) { bestV = v; best = m; }
    }
    return best;
};
const playBanqiGame = level => {
    const api = MiniGames.banqi.start(fakeEl(), { onScore: () => {} });
    // 直接以指定难度开局
    api.stop();
    // 重新开局指定关卡（绕过 levelSelect 固定第 1 关）：手工调用内部 round
    gameRound(fakeEl(), { onScore: () => {} }, level, 'player', { stop() {} }, () => {}, () => {});
    const B = window.__banqi;
    let guard = 0;
    while (!B.over && guard++ < 600) {
        if (B.turn !== 1) return { err: 'turn stuck at ' + B.turn, guard };
        const m = smartPlayer(B);
        if (!m) { B.finish(false, '玩家无子可动'); break; }
        tapMove(m);
        if (lastErr) return { err: lastErr.message, guard };
    }
    if (!B.over) return { err: '对局未收敛', guard };
    return { win: !!(lastResult && lastResult.win), guard };
};
{
    const N = 25;
    const winRate = {}, errMap = {};
    for (const lv of [1, 5, 10, 15]) {
        let w = 0, errs = 0;
        for (let g = 0; g < N; g++) {
            const r = playBanqiGame(lv);
            if (r.err) { errs++; if (errs === 1) console.log('    ⚠ lv' + lv + ' ' + r.err + ' @' + r.guard); }
            else if (r.win) w++;
        }
        winRate[lv] = w / N; errMap[lv] = errs;
        console.log(`    第 ${lv} 关（AI 难度 ${lv}）：玩家胜率 ${(w / N * 100).toFixed(0)}% · 异常 ${errs}`);
    }
    assert(winRate[15] > 0.05, `第 15 关仍可被攻克（不是无敌 AI）：L15 胜率 ${(winRate[15] * 100).toFixed(0)}%`);
    const allErrs = [1, 5, 10, 15].reduce((a, lv) => a + errMap[lv], 0);
    assert(allErrs === 0, '全部对局正常收敛（无死循环/异常）');
}

// ---------- 3) 2048 关卡 ----------
setSeed(2048); console.log('\n③ 2048 关卡');
{
    // 第 1 关（64 / 40 步）贪心玩家（每步选合并收益最大方向）通关率
    const compressSeg = seg => {
        const a = seg.filter(v => v);
        for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; a.splice(i + 1, 1); }
        while (a.length < seg.length) a.push(0);
        return a;
    };
    const simMove = (bd, dir) => {  // 模拟一步，返回合并收益；无变化返回 null
        const b = bd.map(r => r.slice());
        if (dir === 'L') for (let i = 0; i < 4; i++) b[i] = compressSeg(bd[i].slice());
        if (dir === 'R') for (let i = 0; i < 4; i++) b[i] = compressSeg(bd[i].slice().reverse()).reverse();
        if (dir === 'U') for (let j = 0; j < 4; j++) { const c = compressSeg([bd[0][j], bd[1][j], bd[2][j], bd[3][j]]); for (let i = 0; i < 4; i++) b[i][j] = c[i]; }
        if (dir === 'D') for (let j = 0; j < 4; j++) { const c = compressSeg([bd[3][j], bd[2][j], bd[1][j], bd[0][j]]).reverse(); for (let i = 0; i < 4; i++) b[i][j] = c[i]; }
        const merged = b.flat().reduce((s, v) => s + v, 0) - bd.flat().reduce((s, v) => s + v, 0);
        return JSON.stringify(b) === JSON.stringify(bd) ? null : merged;
    };
    let wins = 0, lossReasons = {};
    for (let t = 0; t < 20; t++) {
        const api = MiniGames.g2048.start(fakeEl(), { onScore: () => {}, levelIdx: 0 });
        const G = window.__g2048;
        let guard = 0;
        while (!G.over && guard++ < 60) {
            // 经典角落策略：按下→左→上→右优先，先挑有合并的方向
            let pick = null;
            for (const d of ['D', 'L', 'U', 'R']) if (simMove(G.board, d) > 0) { pick = d; break; }
            if (!pick) for (const d of ['D', 'L', 'U', 'R']) if (simMove(G.board, d) != null) { pick = d; break; }
            G.move(pick || 'L');
            if (lastErr) { console.log('    ⚠ ' + lastErr.message); lastErr = null; break; }
        }
        if (G.over && G.board.flat().includes(G.target)) wins++;
        else {
            const r = guard >= 60 ? 'guard=60' : 'no-target';
            lossReasons[r] = (lossReasons[r] || 0) + 1;
        }
        api.stop();
    }
    assert(wins >= 14, `第 1 关角落策略玩家通关率 ≥70%（实际 ${wins}/20）`);
    // 第 5 关（岩石关）：死局检测不抛异常
    const api2 = MiniGames.g2048.start(fakeEl(), { onScore: () => {} });
    gameLevel5();
    function gameLevel5() {
        // 手工以第 5 关开局（凑出 L4 蛤蟆·绿）
        api2.stop();
        g2048Round(fakeEl(), { onScore: () => {} }, 5, { stop() {} }, () => {}, () => {});
        const G = window.__g2048;
        assert(G.rocks.size === 2, `第 5 关岩石数 = ${G.rocks.size}`);
        let guard = 0;
        while (!G.over && guard++ < 90) {
            G.move(['L', 'R', 'U', 'D'][Math.floor(Math.random() * 4)]);
            if (lastErr) break;
        }
        assert(!lastErr, '岩石关随机游玩无异常');
        assert(G.over, '岩石关在步数限制/死局内正常结束');
    }
}

global.setTimeout = origSetTimeout;
console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
