'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-pipe-connect-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '\u63a5\u6c34\u7ba1');
assert(source);
assert.equal(data.name, '\u63a5\u6c34\u7ba1');
assert.equal(data.count, 6);
assert.equal(data.nativeLevelCount, 5);
assert.equal(data.levels.length, 6);
assert.equal(data.fullGameRulesVerified, false);

function points(cells) {
    assert.equal(cells.length % 3, 0);
    const values = cells.match(/.{3}/g).map(Number);
    assert.ok(values.length >= 2);
    assert.ok(values.every(value => value >= 0 && value < 256));
    assert.notEqual(values[0], values[values.length - 1]);
    return values;
}

data.levels.forEach((level, index) => {
    const sample = source.payloadSamples[index];
    const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
    assert.equal(level.cells, raw, 'payload mismatch at level ' + level.number);
    assert.equal(level.number, index + 1);
    points(level.cells);
});
console.log(JSON.stringify({ name: data.name, extractedPayloads: data.levels.length, nativePlayableLevels: data.nativeLevelCount, payloadsVerified: true, level6HeldBack: true, fullGameRulesVerified: false }));
