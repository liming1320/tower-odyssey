'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-pick-flowers-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '摘花朵');
assert.equal(data.count, 12);
assert.equal(data.levels.length, 12);
assert.equal(data.fullGameRulesVerified, false);
for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  assert.ok(data.levels.some(level => level.cells === raw), 'payload not recovered at ' + sample.offset);
}
assert.ok(data.levels.every(level => level.encoding === 'native-command-string' && /^\d+$/.test(level.cells)));
console.log(JSON.stringify({ count: data.levels.length, sampledPayloadsVerified: source.payloadSamples.length, fullGameRulesVerified: false }));
