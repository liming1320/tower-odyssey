// 逻辑级冒烟测试：驱动 emulator.js 真实的 playRom → watchEmulatorReady 路径
// 用 DOM-shim 模拟浏览器环境，验证：① 核心就绪 → 提示翻成「✅ 核心已就绪」；
// ② 超过 40s 未就绪 → 提示翻成「⚠ 核心加载超时」；③ 超时后核心才起来 → 升级回「✅ 已就绪」。
// 不依赖真实 EmulatorJS / ROM 下载，重点验证轮询决策树本身。
'use strict';

let CLOCK = 1000000;
const RealDateNow = Date.now;
Date.now = () => CLOCK;
const sleep = ms => new Promise(r => RealDateNow.call(Date) === undefined ? setTimeout(r, ms) : setTimeout(r, ms));

// ---------- 最小 DOM shim ----------
function makeEl(tag) {
    const e = {
        tagName: tag, className: '', _html: '', _text: '', title: '', style: {}, onclick: null,
        children: [], _parent: null, _id: '',
        setAttribute(k, v) { if (k === 'srcdoc') this._srcdoc = v; },
        get isConnected() { return !!this._parent; },
        appendChild(c) { c._parent = this; this.children.push(c); return c; },
        querySelector(sel) { return find(this, sel, true); },
        querySelectorAll(sel) { return find(this, sel, false); },
        contains(n) { let p = n; while (p) { if (p === this) return true; p = p._parent; } return false; },
    };
    Object.defineProperty(e, 'innerHTML', {
        get() { return e._html; },
        set(v) {
            e._html = v;
            e.children = [];
            if (typeof v === 'string') {
                // 浏览器会把 innerHTML 解析成真实子节点；这里只抽取 id="..." 生成桩节点，
                // 让 querySelector('#id') 在渲染期（只读 .oninput/.onchange/.textContent 赋值）能找到。
                const re = /<[^>]*\bid="([^"]+)"[^>]*>/g;
                let m;
                while ((m = re.exec(v))) {
                    const stub = makeEl('stub');
                    stub._id = m[1];
                    e.children.push(stub);
                }
            }
        },
    });
    Object.defineProperty(e, 'textContent', {
        get() { return e._text; },
        set(v) { e._text = v; },
    });
    return e;
}
function find(root, sel, one) {
    const out = [];
    (function walk(n) {
        for (const c of n.children) {
            if (sel[0] === '.' ? c.className.split(' ').includes(sel.slice(1))
                : sel[0] === '#' ? (c._id === sel.slice(1)) : false) {
                out.push(c); if (one) return;
            }
            walk(c);
        }
    })(root);
    return one ? out[0] || null : out;
}
function findButtonByText(root, txt) {
    let hit = null;
    (function walk(n) {
        for (const c of n.children) {
            if (c.tagName && c.tagName.toUpperCase() === 'BUTTON' && c.textContent === txt) hit = c;
            if (!hit) walk(c);
        }
    })(root);
    return hit;
}

const documentShim = {
    createElement: tag => makeEl(tag),
    createTextNode: t => { const n = makeEl('#text'); n._text = t; return n; },
    createDocumentFragment: () => makeEl('#fragment'),
    getElementById: () => null,
};
// 让 el() 创建的带 id 子节点可被 querySelector('#id') 找到：简单起见只测 className
global.MiniGames = {}; // 浏览器里 window.MiniGames 即全局 MiniGames；node 需显式建同一引用
global.window = {
    MiniGames: global.MiniGames,
    addEventListener() {},
};
global.document = documentShim;
global.location = { origin: 'http://localhost:5180' };
const store = {};
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
};
global.Blob = function () {};
global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL() {} };
let ROM_BLOB = 0;
global.fetch = (url) => {
    if (String(url).indexOf('/api/roms/download') >= 0 || String(url).indexOf('/api/roms/bios') >= 0)
        return Promise.resolve({ ok: true, blob: () => Promise.resolve({}) });
    if (String(url).indexOf('/api/roms') >= 0)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ roms: [
            { id: 'r1', name: '测试FC', core: 'nes', size: 12345 },
        ] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};

// 加载被测模块（挂到 window.MiniGames.emulator）
require('../public/js/minigames/emulator.js');
const Emu = global.window.MiniGames.emulator;

let pass = 0, fail = 0;
function assert(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
}

async function runScenario(label, opt) {
    console.log('场景：' + label);
    const container = makeEl('div');
    const api = Emu.start(container, {});
    await sleep(20); // 等 romList().then 渲染列表
    const netBtn = findButtonByText(container, '👥 联机');
    if (!netBtn) { assert('找到联机按钮', false); return; }
    assert('找到联机按钮', true);
    netBtn.onclick({ stopPropagation() {} });
    await sleep(40); // 等 playRom 的 fetch 链 + 建 iframe
    // 找到播放区里的 iframe 与提示条
    let frame = null, tip = null;
    (function walk(n) {
        for (const c of n.children) {
            if (c.tagName && c.tagName.toUpperCase() === 'IFRAME') frame = c;
            if (c.className === 'emu-playtip') tip = c;
            walk(c);
        }
    })(container);
    assert('创建 iframe', !!frame);
    assert('创建提示条', !!tip);
    if (!frame || !tip) {
        console.log('    [debug] container html: ' + (container._html || '').slice(0, 120).replace(/\n/g, ' '));
        return;
    }

    frame.contentWindow = {}; // 初始无 EJS_emulator

    if (opt.readyAt) {
        // 在指定真实时间后让核心就绪
        if (opt.readyAt === 'immediate') frame.contentWindow.EJS_emulator = {};
        else setTimeout(() => { frame.contentWindow.EJS_emulator = {}; CLOCK = 1000000; }, opt.readyAt);
    }
    // 推进时钟到超时（相对当前，确保 > started + TIMEOUT）
    if (opt.advanceClock) CLOCK += 41000;

    await sleep(opt.wait);
    const html = tip.innerHTML;
    assert('提示含「' + opt.expect + '」', html.indexOf(opt.expect) >= 0);
    console.log('    提示文案片段: ' + html.replace(/<[^>]+>/g, '').slice(0, 40));
    // 停掉残留轮询
    frame._parent = null;
    try { api.stop(); } catch (e) {}
}

(async () => {
    // A：核心就绪 → ✅
    CLOCK = 1000000;
    await runScenario('A 核心就绪检测', { readyAt: 'immediate', wait: 800, expect: '✅ 核心已就绪' });

    // B：40s 未就绪 → ⚠ 超时
    CLOCK = 2000000;
    await runScenario('B 加载超时兜底', { advanceClock: true, wait: 800, expect: '⚠ 核心加载超时' });

    // C：超时后才就绪 → 升级回 ✅
    CLOCK = 3000000;
    await runScenario('C 超时后晚就绪升级', { readyAt: 500, advanceClock: true, wait: 1100, expect: '✅ 核心已就绪' });

    console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
})();
