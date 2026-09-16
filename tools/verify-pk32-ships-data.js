'use strict';

// Verify coordinate payloads against the native dispatch table rather than memory order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-ships-puzzle-levels.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json'), 'utf8'));
const strings = JSON.parse(fs.readFileSync(path.join(root, 'output/pk32-reference/strings.json'), 'utf8'));
const native = require('./extract-pk32-ships');
const source = catalog.records.find(record => record.name === '航海迷题');
assert.ok(source, 'native catalog record is missing');
assert.equal(data.name, '航海迷题');
assert.equal(data.nativeLevelCount, 52);
assert.equal(data.extractedLevelCount, 52);
assert.equal(data.levels.length, 52);
assert.equal(data.fullGameRulesVerified, false);
assert.equal(data.jumpTableRva, native.jumpTable);
assert.deepEqual(data.levels, native.levels, 'published levels must follow the native dispatch table');
assert.equal(native.layouts.length, 52);
assert.deepEqual(native.layouts.slice(0, 12).map(layout => [layout.width, layout.height]), Array(12).fill([5, 5]));
assert.deepEqual(native.layouts.slice(12, 32).map(layout => [layout.width, layout.height]), Array(20).fill([8, 8]));
assert.deepEqual(native.layouts.slice(32).map(layout => [layout.width, layout.height]), Array(20).fill([10, 10]));
assert.equal(native.layouts[51].offset, 3554820);
assert.equal(native.layouts[51].cells, '6200030004600000000060000000036000006000600006362060004000006000000000630000000060000000006000000000');

const byOffset = new Map(strings.map(record => [record.offset, record.text]));
const coordinateCount = [];
for (const [index, level] of data.levels.entries()) {
    assert.equal(level.number, index + 1, 'level numbering is not contiguous');
    assert.equal(typeof level.offset, 'number');
    assert.equal(byOffset.get(level.offset), level.cells, 'payload differs from extracted UTF-16 string at ' + level.offset);
    assert.equal(level.cells.length % 2, 0, 'coordinate payload must contain two-digit coordinates');
    const endpoints = level.cells.match(/\d{2}/g) || [];
    assert.equal(endpoints.length * 2, level.cells.length);
    for (const endpoint of endpoints) {
        const value = Number(endpoint);
        assert.ok(value >= 0 && value < 100, 'coordinate is outside 10x10 board: ' + endpoint);
    }
    coordinateCount.push(endpoints.length);
}

const prompt = strings.find(record => record.text === '请输入您想玩的关数(1-52)：');
assert.ok(prompt, 'native 1-52 prompt is missing');
assert.equal(data.levels[51].offset, 3560492);
assert.equal(data.levels[51].cells, '4542727090929919176466363050101424278784');
assert.equal(data.levels.some(level => level.offset === 3560620), false, 'magic castle payload must not be classified as a ships level');

console.log(JSON.stringify({
    name: data.name,
    nativeLevelCount: data.nativeLevelCount,
    extractedLevelCount: data.levels.length,
    coordinatePayloadsVerified: data.levels.length,
    encodedCoordinates: coordinateCount.reduce((sum, count) => sum + count, 0),
    unresolvedNativeLevelCount: data.nativeLevelCount - data.levels.length,
    nativeDispatchTable: native.jumpTable,
    fullGameRulesVerified: false
}));
