/* 全屏视图模块（不是小游戏）加载与构造验证
 *
 * 为什么要单独验：emulator.js / arcade.js 是「设置页 tile 直接 open 的独立入口」，
 * 不进小游戏列表，所以 tools/test-mg-all.js 把它们排除了；
 * 但它们一旦静默失效（比如 IIFE 里抛 ReferenceError），玩家端只会看到
 * 「未加载到街机模拟器模块」，很难联想到是脚本没跑起来。
 * 这里验证：脚本能加载、能注册全局、start() 能构造、stop() 能回收。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

global.window = global;
global.MiniGames = {};
global.addEventListener = () => { };
global.removeEventListener = () => { };
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => { };

function fakeCtx() {
    const store = { canvas: { width: 400, height: 520 }, __mgScale: 1 };
    return new Proxy(store, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createLinearGradient' || k === 'createRadialGradient')
                return () => ({ addColorStop() { } });
            if (k === 'measureText') return () => ({ width: 10 });
            return () => undefined;
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}
function fakeEl() {
    const o = {
        style: {}, classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
        appendChild(c) { return c; }, removeChild() { }, remove() { },
        addEventListener() { }, removeEventListener() { },
        querySelector: () => fakeEl(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 520 }),
        getContext: () => fakeCtx(),
        clientWidth: 400, clientHeight: 520, width: 400, height: 520,
        focus() { }, click() { }, value: '', dataset: {}, setAttribute() { },
        isConnected: true, textContent: '',
    };
    // innerHTML 记录下来：列表是往子元素里塞的，容器自身的 innerHTML 永远是空，
    // 想断言「渲染出了什么」只能靠全局日志（置 global.__htmlLog 即开启）。
    let __html = '';
    Object.defineProperty(o, 'innerHTML', {
        get() { return __html; },
        set(v) { __html = String(v); if (global.__htmlLog) global.__htmlLog.push(__html); },
        configurable: true, enumerable: true,
    });
    return o;
}
global.document = {
    createElement: fakeEl, getElementById: () => fakeEl(),
    createDocumentFragment: fakeEl,   // 列表用它批量挂载，缺了会在渲染时炸
    querySelector: () => fakeEl(), querySelectorAll: () => [],
    addEventListener() { }, removeEventListener() { },
    body: { appendChild() { } },
};
global.localStorage = { getItem: () => null, setItem() { } };
// Node 里没有 fetch，给个最小 stub：让模块的异步链路能跑完，
// 否则 start() 会在第一行就崩，测的就不是「模块能不能用」而是「Node 有没有 fetch」。
global.fetch = () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({ roms: [], bios: [], missing: [] }),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve({}),
});

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (detail ? '  -> ' + detail : '')); }
}

const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
for (const f of ENGINE_FILES.map(x => path.join(engineDir, x))) {
    vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
}
// 重要：故意**不**预置任何其他小游戏脚本，模拟 index.html 里它们被最先加载的极端情况，
// 以此验证 window.MiniGames 的自保初始化确实生效。
for (const f of ['public/js/minigames/emulator.js', 'public/js/minigames/arcade.js']) {
    let threw = null;
    try { vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); }
    catch (e) { threw = e; }
    check(path.basename(f) + ' 加载无异常（不依赖其他脚本先初始化 MiniGames）', !threw, threw && threw.message);
}

const M = global.MiniGames;
for (const id of ['emulator', 'arcade']) {
    check('window.MiniGames.' + id + ' 已注册', !!(M && M[id]), Object.keys(M || {}).join(','));
    if (!(M && M[id])) continue;
    let inst = null, err = null;
    try {
        inst = M[id].start(fakeEl(), { level: M[id].LEVELS[0], levelIdx: 0, endless: false, onScore: () => { }, onComplete: () => { } });
    } catch (e) { err = e; }
    check(id + '.start() 可构造', !err, err && err.message);
    if (inst) {
        let serr = null;
        try { inst.stop && inst.stop(); } catch (e) { serr = e; }
        check(id + '.stop() 可回收', !serr, serr && serr.message);
    }
}

// 街机入口依赖模拟器模块的播放链路，必须真实存在
check('arcade 依赖的 window.MiniGames.emulator 存在', !!(M && M.emulator));

// ---------- 列表渲染路径：带图鉴字段的 ROM 真的能渲染出来 ----------
// 为什么要单独验：列表是在 fetch 之后的 .then 里渲染的，里面的 ReferenceError
// 不会让 start() 抛错、也不会进上面的 try，只会变成一个「列表空白」的静默故障。
// 这里喂一条带 titleZh/titleEn/shortName/aliases 的 ROM，抓 unhandledRejection。
const asyncErrors = [];
let inst2 = null;
// 注意：列表渲染在 Promise 链里，异常会被 .catch 吞掉并渲染成「加载失败：xxx」，
// 不会变成 unhandledRejection。所以断言必须落在**渲染结果**上，而不是全局异常。
global.fetch = () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({
        roms: [{
            id: 'r1', name: '真饿狼传说特别版', core: 'fbneo', size: 1234567, addedAt: Date.now(),
            titleZh: '真饿狼传说特别版', titleEn: 'Real Bout Fatal Fury Special',
            shortName: 'rbffspec', aliases: ['RB 饿狼传说特别版'],
            platform: 'neogeo', year: '1997', maker: 'SNK', genre: '格斗', crcStatus: 'ok',
        }],
        bios: [], missing: [],
    }),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve({}),
});
const box2 = fakeEl();
global.__htmlLog = [];
try { inst2 = M.arcade.start(box2, { level: M.arcade.LEVELS[0], levelIdx: 0, endless: false, onScore: () => { }, onComplete: () => { } }); }
catch (e) { asyncErrors.push(e.message); }
setTimeout(() => {
    const html = String(box2.innerHTML || '') + '\n' + (global.__htmlLog || []).join('\n');
    check('带图鉴字段的 ROM 渲染列表无异常（不出现「加载失败」）',
        asyncErrors.length === 0 && html.indexOf('加载失败') < 0,
        (asyncErrors.join(' | ') || '').trim() || html.slice(0, 120));
    check('列表显示中文名 + 英文原名/短名副标题',
        html.indexOf('真饿狼传说特别版') >= 0 && html.indexOf('rbffspec') >= 0,
        html.slice(0, 200));
    try { inst2 && inst2.stop && inst2.stop(); } catch (e) { }
    console.log('\n' + (fail ? '\u2717 ' : '\u2713 ') + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
}, 80);
