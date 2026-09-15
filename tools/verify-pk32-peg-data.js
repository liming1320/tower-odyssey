'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-peg-levels.json'), 'utf8'));
assert.equal(data.name, '独粒钻石');
assert.equal(data.count, 207);
assert.equal(data.levels.length, 207);
let levelsWithMove = 0;
for (const level of data.levels) {
  assert.equal(level.width, 20);
  assert.equal(level.height, 14);
  assert.equal(level.cells.length, 280);
  assert.match(level.cells, /^[0-6]+$/);
  let hasMove = false;
  for (let index = 0; index < level.cells.length && !hasMove; index += 1) {
    if (level.cells[index] === '0' || level.cells[index] === '6') continue;
    const row = Math.floor(index / 20), col = index % 20;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const middleRow = row + dr, middleCol = col + dc;
      const targetRow = row + dr * 2, targetCol = col + dc * 2;
      if (middleRow >= 0 && middleRow < 14 && middleCol >= 0 && middleCol < 20 && targetRow >= 0 && targetRow < 14 && targetCol >= 0 && targetCol < 20 && level.cells[middleRow * 20 + middleCol] !== '0' && level.cells[middleRow * 20 + middleCol] !== '6' && level.cells[targetRow * 20 + targetCol] === '6') {
        hasMove = true;
        break;
      }
    }
  }
  if (hasMove) levelsWithMove += 1;
}
assert.equal(levelsWithMove, 207);
console.log(JSON.stringify({ name: data.name, count: data.count, width: 20, height: 14, levelsWithMove }));
