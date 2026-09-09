/* 验证 fillLevels 函数：把所有手写老游戏的 LEVELS（20 个）补足到 50 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const shared = fs.readFileSync('public/js/minigames/_shared.js', 'utf8');
// MiniGames 桩 + 把末尾的 `MG = MG; window.MG = MG;` 删掉避免二次赋值
const code = shared.replace(/^const MG = \{/m, 'global.MG = {').replace(/\nwindow\.MG = MG;?\s*$/m, '');

const ctx = { console, document: { createElement: () => ({}), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx;
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const MG = ctx.MG;
if (!MG) { console.log('MG not loaded'); process.exit(1); }

const tests = [
    { name: 'gomoku', levels: [{name:'入门',desc:'d'},{name:'初识',desc:'d'}].concat(Array(18).fill({name:'L',desc:'d'})) },
    { name: 'match3', levels: Array(20).fill({name:'L',desc:'d'}) },
    { name: 'banqi',  levels: Array(15).fill({name:'L',desc:'d'}) },
];
for (const t of tests) {
    const filled = MG.fillLevels(t.levels, t.name === 'banqi' ? 15 : 50);
    console.log(`${t.name.padEnd(8)} 原 ${t.levels.length} → ${filled.length} 关  前5: ${filled.slice(0,5).map(l=>l.name).join('/')}  末5: ${filled.slice(-5).map(l=>l.name).join('/')}`);
}
console.log('\n✓ fillLevels 工作正常');