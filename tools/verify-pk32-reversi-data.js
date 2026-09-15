'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-reversi-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '黑白棋');
assert.equal(data.count, source.payloadSamples.length);
assert.equal(data.fullGameRulesVerified, false);
function coords(cells) {
  assert.equal(cells.length % 2, 0);
  const values = cells.match(/.{2}/g).map(Number);
  assert.ok(values.every(value => value >= 1 && value <= 64));
  assert.equal(new Set(values).size, values.length);
  return values;
}
for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  const level = data.levels.find(item => item.cells === raw);
  assert.ok(level, 'payload not recovered at ' + sample.offset);
  coords(level.cells);
}
console.log(JSON.stringify({ name: data.name, payloads: data.levels.length, coordinatePayloadsVerified: data.levels.length, fullGameRulesVerified: false }));
