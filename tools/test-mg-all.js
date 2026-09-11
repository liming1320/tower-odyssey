/* 全量小游戏冒烟测试（无头）
 * - 加载所有 /js/minigames/*.js（引擎模块 engine/ 在前，与 index.html 顺序一致）
 * - 校验每个游戏：有 start()、LEVELS 非空、每关 start() 可构造 + draw() 不抛异常
 * - 有 ENDLESS 的额外跑一遍无尽模式构造 + 绘制
 * 关卡数由引擎统一生成（E.def 默认 50 关），此处不硬校验具体数量
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');

// ---------- DOM / Canvas 桩 ----------
function fakeCtx() {
    // 真实对象 + Proxy：set 持久化（如 ctx.__mgScale），未定义的绘图方法退化为 no-op
    const store = { canvas: { width: 400, height: 520 }, __mgScale: 1, __mgW: 400, __mgH: 520 };
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
    const el = {
        style: {}, className: '', innerHTML: '', textContent: '', children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector: () => fakeEl(), querySelectorAll: () => [],
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
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {} },
};
global.localStorage = { getItem: () => null, setItem() {} };

// 加载顺序与 index.html 一致：引擎模块（engine/）→ 其余游戏
const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
const engPaths = ENGINE_FILES.map(f => path.join(engineDir, f));
const all = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !ENGINE_FILES.includes(f));
const filesOrdered = engPaths.concat(all.sort().map(f => path.join(dir, f)));
let pass = 0, fail = 0;
const fails = [];
for (const f of filesOrdered) {
    try { vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); }
    catch (e) { fail++; fails.push(`${path.basename(f)}: 加载失败 ${e.message}`); }
}
const M = global.window.MiniGames;
const ids = Object.keys(M);
console.log(`已加载 ${filesOrdered.length} 个文件，共 ${ids.length} 个小游戏\n`);

for (const id of ids) {
    const g = M[id];
    const errs = [];
    // 1) 必须有 start() 与非空 LEVELS（关卡数由引擎统一生成，不在此硬校验具体值）
    if (!g || typeof g.start !== 'function') { fail++; fails.push(`${id}: 缺少 start()`); continue; }
    if (!Array.isArray(g.LEVELS) || g.LEVELS.length < 1) errs.push('LEVELS 缺失/为空');
    const exp = Array.isArray(g.LEVELS) ? g.LEVELS.length : 0;
    // 2) 每一关都能构造 + 绘制 + 销毁
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
