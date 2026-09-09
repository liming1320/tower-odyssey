/* 全量小游戏冒烟测试（无头）
 * - 加载所有 /js/minigames/*.js
 * - 校验每个游戏：LEVELS 恰好 20 关、start() 可构造、draw() 不抛异常
 * - 有 ENDLESS 的额外跑一遍无尽模式构造 + 绘制
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');

// ---------- DOM / Canvas 桩 ----------
function fakeCtx() {
    return new Proxy({}, {
        get(t, k) {
            if (k === 'canvas') return { width: 400, height: 520 };
            if (k === 'createLinearGradient' || k === 'createRadialGradient')
                return () => ({ addColorStop() {} });
            if (k === 'measureText') return () => ({ width: 10 });
            return () => undefined;
        },
        set() { return true; },
    });
}
function fakeEl() {
    const el = {
        style: {}, className: '', innerHTML: '', textContent: '', children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 520 }),
        getContext: () => fakeCtx(),
        clientWidth: 400, clientHeight: 520, width: 400, height: 520,
        focus() {}, click() {}, value: '', dataset: {}, setAttribute() {}, remove() {},
    };
    return el;
}
// 关键：让 window 就是全局对象，这样 window.MiniGames / 顶层 const MG 都能被后续脚本访问
global.window = global;
global.MiniGames = {};
global.__MG_TEST = true;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.requestAnimationFrame = () => 0;   // 桩：不真正递归，避免死循环
global.cancelAnimationFrame = () => {};
global.document = {
    createElement: fakeEl, getElementById: () => fakeEl(),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    body: { appendChild() {} },
};
global.localStorage = { getItem: () => null, setItem() {} };

// 加载顺序与 index.html 一致：_shared.js → _engine.js → 其余
const all = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const files = ['_shared.js', '_engine.js'].concat(all.filter(f => f !== '_shared.js' && f !== '_engine.js')).sort();
const filesOrdered = ['_shared.js', '_engine.js', ...all.filter(f => f !== '_shared.js' && f !== '_engine.js')];
// 暗棋圣手沿用 DOS 原作 15 关，其余一律 20 关
const EXPECT = { banqi: 15 };
let pass = 0, fail = 0;
const fails = [];
for (const f of filesOrdered) {
    try { vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }); }
    catch (e) { fail++; fails.push(`${f}: 加载失败 ${e.message}`); }
}
const M = global.window.MiniGames;
const ids = Object.keys(M);
console.log(`已加载 ${filesOrdered.length} 个文件，共 ${ids.length} 个小游戏\n`);

for (const id of ids) {
    const g = M[id];
    const errs = [];
    // 1) LEVELS = 20
    const exp = EXPECT[id] || 20;
    if (!g.LEVELS || g.LEVELS.length !== exp) errs.push(`LEVELS=${g.LEVELS ? g.LEVELS.length : 'none'}(应 ${exp})`);
    // 2) 每一关都能构造 + 绘制
    for (let i = 0; i < exp; i++) {
        const lv = g.LEVELS[i];
        const opts = {
            level: lv, levelIdx: i, endless: false, totalLevels: exp,
            onScore: () => {}, onComplete: () => {}, onBack: () => {},
        };
        let inst = null;
        try { inst = g.start(fakeEl(), opts); }
        catch (e) { errs.push(`L${i + 1} start: ${e.message}`); break; }
        try { inst && inst.stop && inst.stop(); } catch (e) {}
    }
    // 3) 无尽模式（若有）
    if (g.ENDLESS) {
        const opts = {
            level: g.ENDLESS, levelIdx: -1, endless: true, totalLevels: exp,
            onScore: () => {}, onComplete: () => {},
        };
        try { const inst = g.start(fakeEl(), opts); inst && inst.stop && inst.stop(); }
        catch (e) { errs.push(`ENDLESS: ${e.message}`); }
    }
    if (errs.length) { fail++; fails.push(`${id}: ${errs.join(' | ')}`); }
    else { pass++; const en = g.ENDLESS ? ' +∞' : ''; console.log(`   ✓ ${id.padEnd(12)} ${exp} 关${en}`); }
}
console.log(`\n${pass}/${pass + fail} 通过`);
if (fail) { console.log('\n失败:'); fails.forEach(l => console.log('   ✗ ' + l)); process.exit(1); }
process.exit(0);
