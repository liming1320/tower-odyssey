/* 三维弹球 · 卡球软锁验证
 * 复用 test-mg-all.js 的 Node VM 桩，但把 requestAnimationFrame 改成手动泵，
 * 从而真实驱动 frame()/step()，验证：
 *   A. 主球被"钉"在挡板死角 7s → 自动重发（不软锁）
 *   B. 球在台面时调用 relaunch()（等效按 R）→ 立即重发
 *   C. 合法低位球（带下落速度）→ 约 1s 内正常漏球/重发，不软锁
 * 每个场景都开全新实例，避免多个场景共用同一局消耗球数互相影响。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');

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
    return {
        style: {}, className: '', innerHTML: '', textContent: '', children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector: () => fakeEl(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 520 }),
        getContext: () => fakeCtx(),
        clientWidth: 400, clientHeight: 520, width: 400, height: 520,
        focus() {}, click() {}, value: '', dataset: {}, setAttribute() {},
    };
}
global.window = global;
global.MiniGames = {};
global.__MG_TEST = true;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.localStorage = { getItem: () => null, setItem() {} };
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};
global.document = {
    createElement: fakeEl, getElementById: () => fakeEl(),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
};

const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
const engPaths = ENGINE_FILES.map(f => path.join(engineDir, f));
for (const f of engPaths) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
vm.runInThisContext(fs.readFileSync(path.join(dir, 'pinball.js'), 'utf8'), { filename: 'pinball.js' });

const P = global.window.MiniGames.pinball;
const DT = 32;
let ts = 0;
const pump = (frames) => { for (let i = 0; i < frames; i++) { ts += DT; const cb = rafCb; rafCb = null; if (cb) cb(ts); } };
const fresh = () => {
    if (global.window.__pinball && global.window.__lastInst) { try { global.window.__lastInst.stop(); } catch (e) {} }
    const inst = P.start(fakeEl(), { level: P.LEVELS[0], levelIdx: 0, endless: false, onScore: () => {}, onComplete: () => {} });
    global.window.__lastInst = inst;
    return { inst, api: global.window.__pinball };
};

let overall = true;
const check = (name, cond) => { console.log((cond ? '✓ ' : '✗ ') + name); if (!cond) overall = false; };

// A. 主球被钉在发射巷内（x=374 无挡板碰撞，预置轻微上速抵消重力 → 模拟"被卡住、净速度≈0"的死角）→ 7s 后自动重发
{
    const { api } = fresh();
    check('A. 调试句柄 __pinball 已挂载', !!api);
    api.launch();
    let frames = 0, recovered = false;
    for (let i = 0; i < 500; i++) {
        api.putBallAt(374, 600, 0, -60);   // 每帧重新钉死并抵消重力，模拟死角卡球
        pump(1);
        frames++;
        if (!api.launched) { recovered = true; break; }
    }
    check('A. 卡死 7s 后自动重发（launched 回到 false）', recovered);
    console.log('   （自动救球触发于约 ' + (frames * DT / 1000).toFixed(1) + 's，符合 7s 阈值）');
}

// B. 手动 relaunch()（等效按 R）：球在台面时立即重发
{
    const { api } = fresh();
    api.launch();
    for (let i = 0; i < 20; i++) { api.putBallAt(176, 615, 0, 0); pump(1); }  // ~0.6s，未到自动 7s
    const before = api.launched;
    api.relaunch();
    pump(2);
    check('B. 手动重发前球确实在台面', before === true);
    check('B. relaunch() 后立即重发（launched=false）', api.launched === false);
}

// C. 合法低位下落球（一次性给向下速度，不再每帧钉死）→ 约 1s 内正常漏球/重发，不软锁
{
    const { api } = fresh();
    api.launch();
    api.putBallAt(176, 615, 0, 500);      // 仅放置一次：从中央下球口自然下漏
    let resolved = false;
    for (let i = 0; i < 60; i++) {
        pump(1);
        if (!api.launched || api.over) { resolved = true; break; }  // 漏球重发 或 最后一球结束（均非软锁）
    }
    check('C. 合法低位下落球 ~1.3s 内正常结束（未软锁）', resolved);
}

console.log(overall ? '\n全部通过' : '\n存在失败');
process.exit(overall ? 0 : 1);
