'use strict';
// 回归测试：后台 ROM 管理拆分（经典 / 街机）的核心判别逻辑 romIsArcade
// 用最小 shim 加载 admin-app.js（仅定义对象、不触 DOM），断言街机核心集合过滤正确。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'public', 'js', 'admin-app.js');
const src = fs.readFileSync(file, 'utf8') + '\n;globalThis.__AdminApp = (typeof AdminApp !== "undefined") ? AdminApp : null;';

const sandbox = {
    console,
    window: {},
    document: { body: { classList: { add() {} } }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => Promise.reject(new Error('no fetch in test')),
    U: { toast() {}, confirm: () => true, alert() {} },
    setTimeout, clearTimeout, Promise,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'admin-app.js' });

const A = sandbox.__AdminApp;
let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = got === want;
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + ' → got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

console.log('[smoke-admin-romsplit] romIsArcade 判别');
check('nes 是经典', A.romIsArcade.call(A, { core: 'nes' }), false);
check('snes 是经典', A.romIsArcade.call(A, { core: 'snes' }), false);
check('gb 是经典', A.romIsArcade.call(A, { core: 'gb' }), false);
check('gba 是经典', A.romIsArcade.call(A, { core: 'gba' }), false);
check('segaMD 是经典', A.romIsArcade.call(A, { core: 'segaMD' }), false);
check('dosbox 是经典', A.romIsArcade.call(A, { core: 'dosbox' }), false);
check('arcade 是街机', A.romIsArcade.call(A, { core: 'arcade' }), true);
check('fbneo 是街机', A.romIsArcade.call(A, { core: 'fbneo' }), true);
check('fbalpha2012_neogeo 是街机', A.romIsArcade.call(A, { core: 'fbalpha2012_neogeo' }), true);
check('fbalpha2012_cps1 是街机', A.romIsArcade.call(A, { core: 'fbalpha2012_cps1' }), true);
check('mame2003_plus 是街机', A.romIsArcade.call(A, { core: 'mame2003_plus' }), true);

// 复刻 romRefreshList 的过滤器，验证经典页/街机页分流正确
const roms = [
    { id: 'r1', core: 'nes' }, { id: 'r2', core: 'snes' },
    { id: 'r3', core: 'fbneo', platform: 'neogeo' }, { id: 'r4', core: 'arcade' },
    { id: 'r5', core: 'mame2003_plus' },
];
const classic = roms.filter(r => A.romIsArcade.call(A, r) === false);
const arcade = roms.filter(r => A.romIsArcade.call(A, r) === true);
check('经典页数量=2', classic.length, 2);
check('街机页数量=3', arcade.length, 3);
check('经典页不含 fbneo', classic.every(r => r.core !== 'fbneo'), true);
check('街机页不含 nes', arcade.every(r => r.core !== 'nes'), true);

console.log('[smoke-admin-romsplit] renderRomLib fn 已注册');
check('renderRomLib 是函数', typeof A.renderRomLib === 'function', true);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
