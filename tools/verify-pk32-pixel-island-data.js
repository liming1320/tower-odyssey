'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-pixel-island-levels.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json'), 'utf8'));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '像素岛');
assert.ok(source);
assert.deepEqual(data.nativeLevelCounts, [213, 50, 4]);
assert.equal(data.payloadCount, 6);
assert.equal(data.levels.length, 6);
const boards = data.levels.filter(level => level && typeof level.cells === 'string' && level.cells.length === 100);
assert.equal(boards.length, 3);
assert.ok(boards.every(level => /^[01]{100}$/.test(level.cells)));
for (const level of boards) {
    const chunks = level.cells.match(/.{4}/g) || [];
    assert.equal(chunks.length, 25);
    assert.ok(chunks.every(value => /^[01]{4}$/.test(value)));
    assert.ok(chunks.some(value => value !== '0000'));
}
const nativeSamples = source.payloadSamples.filter(sample => sample.length === 100);
assert.equal(nativeSamples.length, boards.length);
for (const sample of nativeSamples) {
    const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
    assert.ok(boards.some(level => level.cells === raw), 'native board not recovered at ' + sample.offset);
}
console.log(JSON.stringify({ name: data.name, declaredCounts: data.nativeLevelCounts, extractedBoards: boards.length, logicalCellsPerBoard: 25, rawChunkWidth: 4, fullGameRulesVerified: false }));
