// 无浏览器冒烟测试：加载 triple-shoot.js，桩掉 DOM/canvas/MG，驱动 start + 若干 tick，
// 验证「三消消除 → 英雄生成 → 自动开火 → 小怪受伤」主链路无异常。
// 运行：node tools/smoke-triple-shoot.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = 420, H = 680;

function fakeCtx() {
    const grad = { addColorStop() {} };
    return new Proxy({}, {
        get(t, p) {
            if (p === 'canvas') return { width: W, height: H };
            if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
            if (p === 'measureText') return () => ({ width: 10 });
            if (p === 'setTransform' || p === 'save' || p === 'restore' || p === 'setLineDash') return () => {};
            if (p === '__mgScale') return 1;
            return () => {};
        },
        set() { return true; },
    });
}

const captured = [];
let clock = 0; // 可控时钟（毫秒），每帧 +50，使 spawn/开火 定时器能被驱动
const sandbox = {
    console,
    performance: { now: () => clock },
    Math, Date, JSON, Object, Array, Set, Map, Number, String,
    requestAnimationFrame: f => setTimeout(() => f(Date.now()), 16),
    cancelAnimationFrame: id => clearTimeout(id),
    setInterval: (fn) => { captured.push(fn); return captured.length; },
    clearInterval: () => {},
    setTimeout, clearTimeout,
    document: {
        createElement: () => ({
            style: {}, width: 0, height: 0,
            getContext: () => fakeCtx(),
            addEventListener() {}, removeEventListener() {},
            getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
            appendChild() {},
        }),
    },
    window: { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, navigator: { } },
};
sandbox.window.MiniGames = {};
sandbox.MiniGames = sandbox.window.MiniGames;
sandbox.MG = {
    settings: {},
    audio: { sfx() {}, unlock() {} },
    hint() {},
    canvas(parent, w, h) {
        const c = {
            style: {}, width: w, height: h,
            getContext: () => fakeCtx(),
            addEventListener() {}, removeEventListener() {},
            getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
        };
        return { c, ctx: fakeCtx(), w, h, fit() {}, destroy() {} };
    },
    ui: { emoji() {}, rr() {}, tile() {}, board() {} },
    gfx: { panel() {}, bar() {}, text() {}, glow() {}, scene() {} },
};
sandbox.performance = sandbox.performance || require('perf_hooks').performance;
vm.createContext(sandbox);

// 每帧推进可控时钟 50ms，让 spawn/英雄开火 定时器真正触发
function frame() { clock += 50; captured.forEach(fn => fn()); }

const file = path.join(__dirname, '..', 'public', 'js', 'minigames', 'triple-shoot.js');
vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'triple-shoot.js' });

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const container = {
    clientWidth: 420, clientHeight: 680, innerHTML: '', appendChild() {},
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
};

const game = sandbox.MiniGames['triple-shoot'];
ok(!!game && typeof game.start === 'function', '模块加载且暴露 start()');

let ctrl = null, onComplete = null, onScore = '';
try {
    ctrl = game.start(container, {
        levelIdx: 2, endless: false, level: { name: '第 3 关', desc: '测试' },
        onScore: s => { onScore = s; },
        onComplete: r => { onComplete = r; },
    });
    ok(true, 'start() 无异常返回 controller');
} catch (e) { ok(false, 'start() 抛异常: ' + e.message); }

const hk = sandbox.window.__tripleShoot;
ok(!!hk, '测试钩子 window.__tripleShoot 已挂载');

// 驱动战斗循环若干帧（真实 setInterval 被替换为捕获，手动调用可控时钟帧）
try {
    for (let i = 0; i < 30; i++) frame();
    ok(true, '驱动 30 帧 tick() 无异常');
} catch (e) { ok(false, 'tick() 抛异常: ' + e.message); }

ok(hk.monsters.length > 0, '已自动生成小怪（monsters=' + hk.monsters.length + '）');

// 触发一次三消 → 英雄 0 应被生成
const heroesBefore = hk.heroes.filter(Boolean).length;
hk.debugMatch();
ok(hk.heroes[0] && hk.heroes[0].level === 1, '三消后红色英雄(0) 生成且 Lv1');
ok(hk.heroes.filter(Boolean).length >= heroesBefore, '英雄数量未减少');

// 再驱动若干帧：英雄应开火产生子弹，且小怪应被击中（hp < maxhp 或 kills 增加）
const killsBefore = hk.kills;
let sawBullet = false;
for (let i = 0; i < 200; i++) { frame(); if (hk.bullets.length > 0) sawBullet = true; }
ok(sawBullet, '英雄开火产生过子弹（子弹系统生效）');
ok(hk.kills > killsBefore, '击杀计数推进（kills=' + hk.kills + ' > ' + killsBefore + '）');
ok(typeof onScore === 'string' && onScore.length > 0, 'onScore 已回传文本: ' + JSON.stringify(onScore.slice(0, 24)) + '…');

try { ctrl && ctrl.stop && ctrl.stop(); ok(true, 'stop() 无异常'); } catch (e) { ok(false, 'stop() 抛异常: ' + e.message); }

console.log('\n结果：PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
