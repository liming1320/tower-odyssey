'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const expectedHashes = 'f305edf80831bd5f504d9d6142964229f58b4da11997fbf21cf255c7a3e0f829|f44ca5be6f5c452f3107cd5cc01b71e7b782a935db49a5778b6a6a981d2967d9|867305fccfc8cc02b078dfcd0e6a22cd40ad7e957feea650f25c16e7eb4e73e8|90b2b861e2f76ac05176fd8fca95f0444fab0feb515a5844d1e53129cf01b90c|2710a14959aa4c5c3b397f25ffcd79f8895cf3a7c2de51eb37fd75361dbea88f|a20fa6f9df5325acee5a1645558eace547301f4f86e918cd12008b6e79f21f16|24701b9d2b58e9bbc09b95b7d987d3de9cbbaa3fb64eddce324e3d427ef91644|40f4cbde7d1cc1659bded1f041946acdf286cff9bd72d849cc0399e8008dceb8|80177a266cad44e7b7e0108b643ecd2a4024d9b1425266edfb9a02b497c05744|80b3c6cbbba2639d505494e4414c87a0771dbb8ff2adedbf0b9fd2d91ee69755|19d1e37b184365db0bc88ca275cd4b093ff6cce725eeb022b226dce276059cd9|b1b2fff4dc6b04fbab3484e5fe669921c3e5527159263386b8d7b6edc9adca86|04b3f2f93c2435f63ee56bc09bdcc597316cd51f94e13843bdd85a09f5b10bf2|7e50c7d453612d635e0886fdd5411005d0f386e75155a6a90e4c9b7e1bbb48f5|17f2617b3a89acc96f0828a403641e2afcf1a3d492787a92cbb31a4590b0847d|04f86375b29eae8647b82e44abbb567fe022f496bcb89c9edee2106c1a46a7c5|34550fb0833b9ca3a8d9defc1c0ac08feae048c14674185e1e6bf38a2fa87c4b'.split('|');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-peg-native-boards.json'), 'utf8'));
assert.equal(data.name, '独粒钻石');
assert.equal(data.count, 17);
assert.equal(data.width, 7);
assert.equal(data.height, 7);
assert.equal(data.center, 24);
assert.equal(data.fullGameRulesVerified, false);
assert.equal(data.levels.length, 17);
let levelsWithMove = 0;
for (const level of data.levels) {
  assert.match(level.caseRva, /^0x[0-9a-f]+$/);
  assert.equal(level.cells.length, 49);
  assert.match(level.cells, /^[x01]+$/);
  let hasMove = false;
  for (let index = 0; index < level.cells.length && !hasMove; index += 1) {
    if (level.cells[index] !== '1') continue;
    const row = Math.floor(index / 7), col = index % 7;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const middleRow = row + dr, middleCol = col + dc;
      const targetRow = row + dr * 2, targetCol = col + dc * 2;
      if (middleRow >= 0 && middleRow < 7 && middleCol >= 0 && middleCol < 7 && targetRow >= 0 && targetRow < 7 && targetCol >= 0 && targetCol < 7 && level.cells[middleRow * 7 + middleCol] === '1' && level.cells[targetRow * 7 + targetCol] === '0') {
        hasMove = true;
        break;
      }
    }
}
  if (hasMove) levelsWithMove += 1;
}
assert.equal(new Set(data.levels.map(level => level.cells)).size, 17);
assert.deepEqual(data.levels.map(level => crypto.createHash('sha256').update(level.name + '|' + level.caseRva + '|' + level.cells).digest('hex')), expectedHashes);
assert.equal(levelsWithMove, 16);
assert.equal(data.levels.find(level => level.name.replace(/\s/g, '') === '五个十字').cells, 'xx010xxxx111xx010101011111110101010xx111xxxx010xx');
assert.equal(data.levels[0].caseRva, '0x14b970c');
assert.equal(data.levels[16].caseRva, '0x14bc247');
console.log(JSON.stringify({ name: data.name, count: data.count, width: 7, height: 7, levelsWithMove }));
