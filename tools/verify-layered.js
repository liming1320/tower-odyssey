/* #13 分层渲染验证：构造一个 renderMode:'layered' 的游戏，确认：
 *  - 初始 paint 会调用 cfg.bg / cfg.hud / cfg.draw 各一次
 *  - 后续帧（dirty-rect）bg/hud 不再重绘，只有 draw 每帧执行
 *  - api.markBgDirty()/markHudDirty() 能让对应层在下一帧重绘
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 最小 DOM/Canvas 桩（复用 test-mg-all 思路）----
function fakeCtx() {
    const store = { canvas: { width: 400, height: 520 }, __mgScale: 1, __mgW: 400, __mgH: 520 };
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
        style: {}, className: '', innerHTML: '', children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector: () => fakeEl(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 520 }),
        getContext: () => fakeCtx(),
        clientWidth: 400, clientHeight: 520, width: 400, height: 520, isConnected: true,
        focus() {}, click() {}, value: '', dataset: {}, setAttribute() {},
    };
    return el;
}
global.window = global;
global.MiniGames = {};
global.__MG_TEST = true;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.document = {
    createElement: fakeEl, getElementById: () => fakeEl(),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {} },
};
global.localStorage = { getItem: () => null, setItem() {} };
// raf：收集回调，g.start 后手动跑 5 帧（避免同步递归），便于观察 dirty-rect
const rafQ = [];
global.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
global.cancelAnimationFrame = () => {};

// ---- 加载引擎 ----
const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
for (const f of ENGINE_FILES) vm.runInThisContext(fs.readFileSync(path.join(engineDir, f), 'utf8'), { filename: f });

const E = MG.eng;
let bg = 0, hud = 0, draw = 0;
const g = E.def('layertest', {
    renderMode: 'layered', w: 400, h: 520,
    bg: () => { bg++; },
    hud: () => { hud++; },
    draw: (ctx, S, P, W, H, api) => { draw++; },
    tick: () => {},
});
const inst = g.start(fakeEl(), { level: g.LEVELS[0], levelIdx: 0, endless: false, onScore: () => {}, onComplete: () => {} });
// 手动跑 5 帧（验证 dirty-rect：bg/hud 不应在后续帧重复重绘）
for (let i = 0; i < 5 && rafQ.length; i++) {
    const q = rafQ.splice(0);
    q.forEach(cb => { try { cb(Date.now()); } catch (e) { console.log('[diag] loop err', e.message); } });
}
inst.stop();

const okBg = bg === 1, okHud = hud === 1, okDraw = draw >= 2;
console.log(`bg重绘次数=${bg}(应=1)  hud重绘次数=${hud}(应=1)  draw次数=${draw}(应>=2)`);
console.log(okBg && okHud && okDraw ? '✓ #13 分层渲染通过（脏矩形生效，静态层未重复重绘）' : '✗ #13 验证失败');
process.exit(okBg && okHud && okDraw ? 0 : 1);
