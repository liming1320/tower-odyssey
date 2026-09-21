// 逻辑级冒烟测试：验证 emulator.js 的「顶栏返回 = 返回上一层」导航语义
// 用 DOM-shim 驱动真实 start → 点播放 → api.back() 路径，断言：
//   ① 播放层 api.back() 返回 true 且退回 ROM 列表层（不再跨过列表直接关掉）；
//   ② 列表层 api.back() 返回 false（交由外层关闭回设置页）；
//   ③ 加载中点返回：在途 playRom 回调被 navGen 守卫作废，列表不会被播放页覆盖。
// 不依赖真实 EmulatorJS / ROM 下载，重点验证导航决策树。
'use strict';

const RealDateNow = Date.now;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    Object.defineProperty(e, 'textContent', { get() { return e._text; }, set(v) { e._text = v; } });
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
function hasIframe(root) {
    let hit = false;
    (function walk(n) {
        for (const c of n.children) {
            if (c.tagName && c.tagName.toUpperCase() === 'IFRAME') hit = true;
            if (!hit) walk(c);
        }
    })(root);
    return hit;
}

global.MiniGames = {};
global.window = { MiniGames: global.MiniGames, addEventListener() {} };
global.document = {
    createElement: tag => makeEl(tag),
    createTextNode: t => { const n = makeEl('#text'); n._text = t; return n; },
    createDocumentFragment: () => makeEl('#fragment'),
    getElementById: () => null,
};
global.location = { origin: 'http://localhost:5180' };
const store = {};
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
};
global.Blob = function () {};
global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL() {} };
global.fetch = (url) => {
    if (String(url).indexOf('/api/roms') >= 0)
        // 列表请求读 .json()，下载请求读 .ok + .blob()，两者都给齐
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ roms: [
            { id: 'r1', name: '测试FC', core: 'nes', size: 12345 },
        ] }), blob: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};

require('../public/js/minigames/emulator.js');
const Emu = global.window.MiniGames.emulator;

let pass = 0, fail = 0;
function assert(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name); }
}

async function run(label, opt) {
    console.log('场景：' + label);
    const container = makeEl('div');
    const layers = [];
    const api = Emu.start(container, { onLayerChange: l => layers.push(l) });
    await sleep(20); // 等初始列表渲染

    const playBtn = findButtonByText(container, '▶ 播放');
    assert('ROM 列表渲染出「▶ 播放」按钮', !!playBtn);
    if (!playBtn) return;

    // 进入播放层
    playBtn.onclick({ stopPropagation() {} });
    assert('进入播放层：onLayerChange 收到 "play"', layers[layers.length - 1] === 'play');
    assert('api.back 是函数', typeof api.back === 'function');

    if (opt.backImmediately) {
        // 加载中（下载回调在途）直接点返回 —— 验证 navGen 守卫
        const r1 = api.back();
        assert('加载中点返回：api.back 返回 true（在模拟器内回退一层）', r1 === true);
        await sleep(40); // 等下载回调解析（应被守卫作废）+ 列表重渲染
        assert('列表层重新出现（有 emu-item 行）', find(container, '.emu-item', false).length > 0);
        assert('守卫生效：列表未被播放页 iframe 覆盖', !hasIframe(container));
        const r2 = api.back();
        assert('已在列表层：api.back 返回 false（交由外层关闭）', r2 === false);
    } else {
        await sleep(40); // 等下载完成、播放页（iframe）建好
        assert('播放页已建好（有 iframe）', hasIframe(container));
        const r1 = api.back();
        assert('播放页点返回：api.back 返回 true（回退到列表层）', r1 === true);
        await sleep(40); // 等列表重渲染
        assert('已退回列表层：onLayerChange 收到 "list"', layers[layers.length - 1] === 'list');
        assert('列表层重新出现（有 emu-item 行）', find(container, '.emu-item', false).length > 0);
        assert('播放页已销毁（无 iframe）', !hasIframe(container));
        const r2 = api.back();
        assert('已在列表层：api.back 返回 false（交由外层关闭）', r2 === false);
    }
    try { api.stop(); } catch (e) {}
}

(async () => {
    await run('正常流程：播放 → 返回上一层 → 列表 → 再返回交外层', {});
    await run('加载中点返回：navGen 守卫防覆盖', { backImmediately: true });
    console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
})();
