'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-pipe-connect-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '接水管');
assert.equal(data.name, '接水管');
assert.equal(data.count, 6);
assert.equal(data.nativeLevelCount, 5);
assert.equal(data.levels.length, 6);
assert.equal(data.fullGameRulesVerified, false);
for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  assert.ok(data.levels.some(level => level.cells === raw), 'payload not recovered at ' + sample.offset);
}
assert.ok(data.levels.every(level => level.encoding === 'native-pipe-coordinate-string' && /^\d+$/.test(level.cells)));
console.log(JSON.stringify({ count: data.levels.length, nativeLevelCount: data.nativeLevelCount, sampledPayloadsVerified: source.payloadSamples.length, fullGameRulesVerified: false }));
