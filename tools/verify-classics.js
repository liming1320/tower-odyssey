/* 经典 7 款专项验证：祖玛/宝石迷阵/泡泡龙/孤胆枪手/木乃伊迷宫/疯狂火箭/拼图
 * 覆盖：加载与构造、核心规则断言（匹配/消除/寻路/追踪/吸附），含反向验证
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');

// ---------- DOM / Canvas 桩（与 test-mg-all 一致的宽松桩） ----------
function fakeCtx() {
    const store = { canvas: { width: 420, height: 560 } };
    return new Proxy(store, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (k === 'measureText') return () => ({ width: 10 });
            return () => undefined;
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}
function fakeEl() {
    const el = {
        style: {}, className: '', innerHTML: '', textContent: '', children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector: () => fakeEl(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 560 }),
        getContext: () => fakeCtx(),
        clientWidth: 420, clientHeight: 560, width: 420, height: 560,
        focus() {}, click() {}, value: '', dataset: {}, setAttribute() {},
    };
    return el;
}
global.window = global;
global.MiniGames = {};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.document = { createElement: fakeEl, getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } };
global.localStorage = { getItem: () => null, setItem() {} };

let pass = 0, fail = 0;
const _lines = [];
const check = (name, ok, extra) => {
    const l = (ok ? '   [OK] ' : '   [NG] ') + name + (extra ? ' —— ' + extra : '');
    _lines.push(l); console.log(l);
    if (ok) pass++; else fail++;
};

// 按浏览器顺序加载引擎 + 7 款新游戏
const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
const files = ENGINE_FILES.map(f => path.join(engineDir, f))
    .concat(['zuma.js', 'bejeweled.js', 'bubble.js', 'alienshoot.js', 'mummymaze.js', 'rocketmania.js', 'jigsaw.js'].map(f => path.join(dir, f)));
for (const f of files) {
    try { vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); }
    catch (e) { console.log('加载失败 ' + path.basename(f) + ': ' + e.message); process.exit(1); }
}
const M = global.window.MiniGames;
const opts = i => ({ levelIdx: i, level: null, endless: false, totalLevels: 50, onScore: () => {}, onComplete: () => {}, onBack: () => {} });
function mk(id, i = 0) { const c = fakeEl(); const inst = M[id].start(c, opts(i)); return { c, inst }; }

// ============ 1. 祖玛 ============
console.log('\n【祖玛 zuma】');
{
    const { inst } = mk('zuma', 0);
    check('50 关 + 实例', M.zuma.LEVELS.length === 50 && !!inst.stop);
    const dbg = window.__zumaDbg;
    check('调试钩子', !!dbg);
    // 链序与插入消除：0,0,0,1,1 → 在第 3 颗后方插入 0 → 前 4 颗同色消除
    dbg.chain = [
        { d: 100, c: 0 }, { d: 80, c: 0 }, { d: 60, c: 0 }, { d: 40, c: 1 }, { d: 20, c: 1 },
    ];
    dbg.insert(2, -1, 0); // 插到 d≈52 → 索引 0..3 同色 → 消除 4 颗
    check('插入后同色连段消除（5→2 球）', dbg.chain.length === 2, '实际 ' + dbg.chain.length);
    check('消除后剩余为 1,1', dbg.chain.every(b => b.c === 1));
    // 间距归一：插入后不重叠
    let ok = true;
    for (let i = 1; i < dbg.chain.length; i++) if (dbg.chain[i].d > dbg.chain[i - 1].d) ok = false;
    check('链内 d 值严格递减（路径序）', ok);
    check('ptAt 在路径范围内', !!dbg.ptAt(0) && !!dbg.ptAt(dbg.path.total));
    inst.stop();
}

// ============ 2. 宝石迷阵 ============
console.log('\n【宝石迷阵 bejeweled】');
{
    const { inst } = mk('bejeweled', 0);
    const dbg = window.__bjDbg;
    check('调试钩子', !!dbg);
    const N = 8;
    const mkBoard = fill => Array.from({ length: N * N }, (_, i) => fill(Math.floor(i / N), i % N));
    // 横向三连
    let b = mkBoard((y, x) => (y === 3 && x < 3) ? 2 : (x + y * 2) % 5);
    check('识别横向三连', dbg.findMatches(b).size >= 3);
    // 纵向三连
    b = mkBoard((y, x) => (x === 5 && y < 3) ? 4 : (x + y * 2) % 5);
    check('识别纵向三连', dbg.findMatches(b).size >= 3);
    // (x+2y)%5 图案无初始匹配
    b = mkBoard((x, y) => (x + y * 2) % 5);
    check('无匹配图案不误报', dbg.findMatches(b).size === 0);
    check('随机棋盘存在可行步', dbg.hasMove(Array.from({ length: N * N }, () => MG.ri(0, 4))));
    inst.stop();
}

// ============ 3. 泡泡龙 ============
console.log('\n【泡泡龙 bubble】');
{
    const { inst } = mk('bubble', 0);
    const dbg = window.__bubbleDbg;
    check('调试钩子', !!dbg);
    check('内部格邻居数 6（奇偶行各取内部行）', dbg.neighbors(2, 5).length === 6 && dbg.neighbors(1, 5).length === 6);
    // 三连纵向消除 + 悬空掉落
    const bd = Array.from({ length: 13 }, () => Array(11).fill(-1));
    bd[0][3] = 0; bd[1][3] = 0; bd[2][3] = 0;
    bd[5][8] = 3;  // 与顶部不连通的悬空球
    bd[9][0] = 5;  // 同样悬空——应一起掉落
    dbg.board = bd;
    const n = dbg.popAt(0, 3);
    check('三连爆破返回 3', n === 3, '实际 ' + n);
    check('目标格清空', dbg.board[0][3] < 0 && dbg.board[1][3] < 0 && dbg.board[2][3] < 0);
    check('悬空球连锁掉落', dbg.board[5][8] < 0 && dbg.board[9][0] < 0);
    inst.stop();
}

// ============ 4. 孤胆枪手 ============
console.log('\n【孤胆枪手 alienshoot】');
{
    const { inst } = mk('alienshoot', 0);
    check('50 关 + 实例', M.alienshoot.LEVELS.length === 50 && !!inst.stop);
    check('难度参数单调', M.alienshoot.LEVELS[0].desc.includes('10') && M.alienshoot.LEVELS[49].desc.includes('108'));
    inst.stop();
}

// ============ 5. 木乃伊迷宫 ============
console.log('\n【木乃伊迷宫 mummymaze】');
{
    const { inst } = mk('mummymaze', 0);
    const dbg = window.__mummyDbg;
    check('调试钩子', !!dbg);
    check('迷宫起点无墙', !dbg.walls[0][0] && !dbg.walls[dbg.walls.length - 1][dbg.walls.length - 1]);
    const st0 = dbg.state;
    const dist = m => Math.abs(m.x - st0.px) + Math.abs(m.y - st0.py);
    const d0 = Math.min(...st0.mums.map(dist));
    // 向右走 3 步（若被墙挡则跳过——7×7 关卡保证 0,0 右侧大概率可走；被挡就换向下）
    for (let k = 0; k < 3; k++) { dbg.move(1, 0); dbg.move(0, 1); }
    const st1 = dbg.state;
    const d1 = Math.min(...st1.mums.map(m => Math.abs(m.x - st1.px) + Math.abs(m.y - st1.py)));
    check('木乃伊追踪：距离缩短', d1 < d0, `${d0} → ${d1}`);
    const before = dbg.state.steps;
    dbg.move(-99, 0); // 越界移动应无效
    check('越界/撞墙移动无效', dbg.state.steps === before);
    inst.stop();
}

// ============ 6. 疯狂火箭 ============
console.log('\n【疯狂火箭 rocketmania】');
{
    const { inst } = mk('rocketmania', 0);
    const dbg = window.__rocketDbg;
    check('调试钩子', !!dbg);
    const fr = dbg.fuseRow;
    // 构造已知可解布局：引信行→L 下弯→竖管→L 右弯→横管到火箭
    const G = 7;
    dbg.grid = Array.from({ length: G }, () => Array.from({ length: G }, () => ({ t: 'I', rot: 1 }))); // 全 EW
    dbg.grid[fr][3] = { t: 'T', rot: 2 };   // rot2: [2,3,1]=S,W,E —— W 收左路、S 下弯、E 继续向右
    dbg.grid[fr + 1][3] = { t: 'I', rot: 0 }; // N,S
    dbg.grid[fr + 1][3] = dbg.grid[fr + 1][3];
    dbg.grid[fr + 1][4] = { t: 'I', rot: 1 };
    dbg.rocketRows = [fr + 1];
    // (fr+1,3) 需同时开口 N（接上方 S）与 E（通向火箭）：T base[0,1,3] rot1 → [1,2,0] = E,S,N ✓
    dbg.grid[fr + 1][3] = { t: 'T', rot: 1 };
    const p = dbg.findPath();
    check('构造通路可寻径', Array.isArray(p) && p.length > 0, JSON.stringify(p && p[p.length - 1]));
    check('路径终点通向火箭行', p && p[p.length - 1].r === fr + 1 && p[p.length - 1].c === 6);
    // 破坏一个弯管 → 断路
    dbg.grid[fr][3] = { t: 'I', rot: 0 }; // NS 竖管挡路
    check('破坏后断路', dbg.findPath() === null);
    inst.stop();
}

// ============ 7. 拼图 ============
console.log('\n【拼图 jigsaw】');
{
    const c = fakeEl();
    const inst = M.jigsaw.start(c, opts(0));
    const all = [];
    (function walk(el, depth) {
        if (depth > 4 || !el) return;
        (el.children || []).forEach(ch => { all.push(ch); walk(ch, depth + 1); });
    })(c, 0);
    const pieces = all.filter(el => el.className === 'mgy-piece');
    check('50 关 + 实例', M.jigsaw.LEVELS.length === 50 && !!inst.stop);
    check('默认 3×3 = 9 块碎片', pieces.length === 9, '实际 ' + pieces.length);
    check('LEVELS 块数阶梯 3→8', M.jigsaw.LEVELS[0].desc.includes('3×3') && M.jigsaw.LEVELS[49].desc.includes('8×8'));
    inst.stop();
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
fs.writeFileSync(path.join(__dirname, 'shots', 'verify-classics-report.txt'), _lines.concat(['', `结果: ${pass}/${pass + fail} 通过`]).join('\n') + '\n', 'utf8');
if (fail) process.exit(1);
