'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-mummy-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '木乃伊');

assert.equal(data.count, 222);
assert.equal(data.levels.length, 222);
assert.equal(data.fullGameRulesVerified, false);
assert.ok(data.levels.every(level => Number.isInteger(level.width) && level.width > 0));
assert.ok(data.levels.every(level => Number.isInteger(level.height) && level.height > 0));
assert.ok(data.levels.every(level => level.cells.length === level.width * level.height || level.cells.length < level.width * level.height));
assert.ok(data.levels.every(level => /^\d+$/.test(level.cells)));

for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  const match = data.levels.find(level => level.header === raw.slice(0, 7) && level.cells === raw.slice(7));
  assert.ok(match, 'catalog sample was not recovered: ' + sample.offset);
}

console.log(JSON.stringify({ count: data.levels.length, sampledPayloadsVerified: source.payloadSamples.length, dimensions: [...new Set(data.levels.map(level => level.width + 'x' + level.height))], fullGameRulesVerified: false }));
