'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-connect-wires2-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '连结电线二');
assert.equal(data.name, source.name);
assert.equal(data.declaredLevels, source.levelCount);
assert.equal(data.fullGameRulesVerified, false);
assert.equal(data.levels.length, source.payloadSamples.length);
assert.deepEqual(data.levels.map(item => item.number), [1, 2, 3]);
for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  assert.ok(data.levels.some(level => level.cells === raw), 'payload not recovered at ' + sample.offset);
}
for (const level of data.levels) {
  assert.ok(/^\d+$/.test(level.cells));
  assert.ok(level.cells.length === 20 || level.cells.length === 36);
  assert.ok([...level.cells].every(value => value >= '0' && value <= '5'));
}
console.log(JSON.stringify({ name: data.name, declaredLevels: data.declaredLevels, extractedSamples: data.levels.length, fullGameRulesVerified: false }));
