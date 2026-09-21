// 回归测试：街机模拟器点「播放」时，playViaEmulator 必须把 settings 透传的 opts 转给 emulator.start，
// 否则会 ReferenceError: opts is not defined（玩家端「启动失败」）。
// 用极简 DOM-shim 跑真实 start → load → startRom 链路（autoPlayId 命中即自动播放）。
'use strict';
const fs = require('fs');
const path = require('path');

// ---- 极简 DOM shim ----
function mkEl(tag) {
    const e = {
        tagName: tag, className: '', _html: '', textContent: '', style: {}, dataset: {},
        children: [], onclick: null,
        appendChild(c) { this.children.push(c); return c; },
        addEventListener() {}, removeEventListener() {},
        querySelector() { return mkEl('stub'); },
        querySelectorAll() { return []; },
        setAttribute() {}, getAttribute() { return null; },
    };
    Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children = []; } });
    return e;
}
global.window = global;
global.document = {
    createElement: mkEl,
    createDocumentFragment() { const f = mkEl('frag'); return f; },
    getElementById() { return mkEl('byid'); },
    addEventListener() {}, body: mkEl('body'),
};
const _store = {};
global.localStorage = { getItem: k => (k in _store ? _store[k] : null), setItem: (k, v) => { _store[k] = String(v); } };
global.location = { protocol: 'http:', host: 'x', href: 'http://x/' };

const calls = [];
global.MiniGames = { emulator: { start: (c, o) => { calls.push(o); return { stop() {}, back() { return false; } }; } } };
global.window.MiniGames = global.MiniGames;

// fetch stub
global.fetch = (url) => {
    if (String(url).indexOf('/api/roms/bios') >= 0)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    return Promise.resolve({ status: 200, json: () => Promise.resolve({ roms: [
        { id: 'r1', name: '拳皇99', core: 'fbneo', platform: 'neogeo', titleEn: 'KOF99', shortName: 'kof99' },
    ] }) });
};

// 加载 arcade.js（IIFE，会给 window.MiniGames.arcade 赋值）
const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'minigames', 'arcade.js'), 'utf8');
(0, eval)(code);

// 启动街机，autoPlayId 命中 r1 → load 完成后自动调 startRom → playViaEmulator
const container = mkEl('div');
let api;
try {
    api = global.MiniGames.arcade.start(container, { autoPlayId: 'r1', onScore() {}, onLayerChange() {} });
} catch (e) {
    console.error('FAIL: start threw', e.message);
    process.exit(1);
}

setTimeout(() => {
    let pass = 0, fail = 0;
    const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

    ok('emulator.start 被调用 1 次', calls.length === 1);
    ok('调用参数含 arcadeOnly:true', calls[0] && calls[0].arcadeOnly === true);
    ok('调用参数含 autoPlayId:r1', calls[0] && calls[0].autoPlayId === 'r1');
    ok('透传了 onScore 回调', calls[0] && typeof calls[0].onScore === 'function');
    ok('透传了 onLayerChange 回调', calls[0] && typeof calls[0].onLayerChange === 'function');
    ok('未触发「启动失败」(opts 未定义已被修复)', container.innerHTML.indexOf('启动失败') < 0);
    ok('返回了 api 对象', api && typeof api.stop === 'function' && typeof api.back === 'function');

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
}, 80);
