/* 单元测试：所有小游戏都应暴露 LEVELS 数组（20 项，新关卡化框架要求；banqi 保留 15 关致敬 DOS）
 * 同时校验 PARAMS 数组（如有）与 LEVELS 等长
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== '_shared.js' && f !== 'minigames.js');

// banqi 保留 15 关（DOS 暗棋圣手原作 15 关）
const EXPECT = { banqi: 15 };

let pass = 0, fail = 0;
const failList = [];
for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // 提取 id
    const idM = src.match(/MiniGames\.([a-z0-9]+)\s*=\s*\{/);
    if (!idM) { fail++; failList.push(`${f}: 无 MiniGames.<id>`); continue; }
    const id = idM[1];
    // LEVELS 计数
    const lvM = src.match(/LEVELS\s*:\s*\[([\s\S]*?)\](?:\s*,|\s*})/);
    if (!lvM) { fail++; failList.push(`${f} (${id}): 无 LEVELS 数组`); continue; }
    const lvCount = (lvM[1].match(/\{\s*name\s*:/g) || []).length;
    const exp = EXPECT[id] || 20;
    if (lvCount !== exp) { fail++; failList.push(`${f} (${id}): LEVELS ${lvCount} ≠ ${exp}`); continue; }
    // PARAMS 计数（如果有）。贪婪匹配整段数组
    const pm = src.match(/PARAMS\s*:\s*\[([\s\S]*?)\]\s*,\s*start/);
    if (pm) {
        const body = pm[1];
        // 既支持嵌套 [a,b,c], [d,e,f] 也支持一维 [a,b,c]
        const nested = (body.match(/\[[^\[\]]*\]/g) || []).length;
        const flat = body.split(',').map(s => s.trim()).filter(s => /^-?\d+(\.\d+)?$/.test(s)).length;
        const cnt = nested || flat;
        if (cnt !== exp) { fail++; failList.push(`${f} (${id}): PARAMS ${cnt} ≠ ${exp} (内层/扁平计数)`); continue; }
    }
    pass++;
    console.log(`   ✓ ${id.padEnd(10)} LEVELS ${lvCount} 项${pm ? ' + PARAMS ' + exp + ' 项' : ''}`);
}
console.log(`\n${pass}/${pass + fail} 通过`);
if (fail) {
    console.log('\n失败明细:');
    failList.forEach(l => console.log('   ✗ ' + l));
    process.exit(1);
}
process.exit(0);