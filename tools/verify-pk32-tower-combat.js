const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/js/minigames/pk32-tower.js'), 'utf8'), context);
const tower = context.window.PK32Tower;
const native = require('../output/pk32-reference/tower1-monsters-combat-analysis.json');
const expected = native.records.map(r => ['baseHp', 'baseAttack', 'baseDefense', 'goldReward', 'experienceReward'].map(k => r.initialFields[k]));
assert.deepEqual(JSON.parse(JSON.stringify(tower.originalMonsters)), expected);
const image = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const evidence = require('../output/pk32-reference/tower1-combat-native-evidence.json');
let instructionCount = 0;
for (const block of Object.values(evidence)) for (const ins of block) {
    const bytes = Buffer.from(ins.bytes, 'hex'), rva = Number(ins.rva);
    assert(image.subarray(rva, rva + bytes.length).equals(bytes), ins.rva);
    instructionCount++;
}
// Independent tick-by-tick execution of the recovered native arithmetic.
function simulate(hero, m, code, percent) {
    const a = Math.max(0, hero.attack - Math.max(1, Math.floor(m[2] * percent / 100)));
    const b = Math.max(0, Math.max(1, Math.floor(m[1] * percent / 100)) - hero.defense);
    let hp = hero.hp, monsterHp = m[0], ticks = 0;
    while (hp > 0 && monsterHp > 0) {
        monsterHp = Math.max(0, monsterHp - a);
        hp = Math.max(0, hp - b);
        if (a === 0 && b === 0) {
            const amount = 10 ** Math.min(4, Math.floor(Math.log10(Math.max(1, Math.min(hp, monsterHp)))));
            hp = Math.max(0, hp - amount); monsterHp = Math.max(0, monsterHp - amount);
        }
        ticks++;
        assert(ticks < 1000000);
    }
    const won = hp > 0;
    if (won) {
        if (code === 54) hp = Math.floor(hp * .75);
        if (code === 55) hp = Math.floor(hp * 2 / 3);
        if (code === 60) hp -= 100;
        if (code === 61) hp -= 300;
        hp = Math.max(1, hp);
    }
    return { allowed: true, hp, enemyHp: monsterHp, rounds: ticks, damage: hero.hp - hp, gold: won ? m[3] : 0, experience: won ? m[4] : 0, won };
}
let cases = 0;
expected.forEach((m, index) => {
    for (const percent of [100, 105, 110]) {
        for (const attack of [m[2] + 1, m[2] + 100, m[2] + m[0]]) {
            const defense = Math.floor(m[1] / 2);
            const hero = { hp: Math.ceil(m[0] / (attack - m[2])) * (m[1] - defense) + m[0] + 1, attack, defense, layer: 0 };
            const result = tower.originalBattle(hero, index + 38, percent);
            assert.deepEqual(JSON.parse(JSON.stringify(result)), simulate(hero, m, index + 38, percent)); cases++;
        }
    }
    assert.equal(tower.originalBattle({ hp: 100000, attack: m[2], defense: 0, layer: 0 }, index + 38).allowed, false);
});
const start = { hp: 1000, attack: 10, defense: 10, layer: 1 };
assert.equal(tower.originalBattle(start, 38).hp, 955);
assert.equal(tower.originalBattle({ ...start, hp: 44 }, 38).allowed, false);
assert.equal(tower.originalBattle({ ...start, hp: 45 }, 38).hp, 0);
assert.equal(tower.originalBattle({ ...start, hp: 45 }, 38).enemyHp, 0);
assert.equal(tower.originalBattle({ ...start, hp: 45 }, 38).gold, 0);
for (const hero of [{ hp: 99999, attack: 1, defense: 9999, layer: 21 }, { hp: 999, attack: 1, defense: 0, layer: 21 }]) {
    assert.deepEqual(JSON.parse(JSON.stringify(tower.originalBattle(hero, 70))), simulate(hero, expected[32], 70, 100)); cases++;
}
console.log(JSON.stringify({ nativeMonsterRecords: expected.length, nativeInstructionBytesVerified: instructionCount, combatCases: cases, guardsAndSimultaneousDeath: true, fullGameRulesVerified: false }));
