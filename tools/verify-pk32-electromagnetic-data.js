'use strict';

const assert = require('node:assert/strict');
const data = require('../public/data/pk32-electromagnetic-levels.json');
const catalog = require('../public/data/pk32-native-catalog.json').records.find(record => record.name === '电磁彩球');

assert.ok(catalog, 'native catalog entry is missing');
assert.equal(data.name, '电磁彩球');
assert.equal(data.nativeLevelCount, 160);
assert.equal(data.extractedLevelCount, 160);
assert.equal(data.width, 16);
assert.equal(data.height, 16);
assert.equal(data.levels.length, 160);
assert.equal(catalog.levelCount, 160);
assert.equal(catalog.payloadCount, 160);
assert.equal(catalog.levelCountBasis, 'native level-selection prompt');
assert.ok(catalog.help.includes('请输入您想玩的关数(1-160)：'));
assert.ok(catalog.help.includes('靠近在一起相同颜色的彩球就不会再分开，但是有一种颜色的彩球是不会移动的，您也不需要把它们连在一起。'));

let previousOffset = -1;
const seenValues = new Set();
data.levels.forEach((level, index) => {
    assert.equal(level.number, index + 1);
    assert.ok(level.offset > previousOffset);
    assert.equal(level.cells.length, 256);
    assert.match(level.cells, /^[0-5]{256}$/);
    level.cells.split('').forEach(value => seenValues.add(value));
    previousOffset = level.offset;
});
assert.deepEqual([...seenValues].sort(), ['0', '1', '2', '3', '4', '5']);
console.log(JSON.stringify({ name: data.name, levels: data.levels.length, dimensions: [data.width, data.height], values: [...seenValues].sort() }));
