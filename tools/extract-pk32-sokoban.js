'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const record = catalog.records.find(item => item.name === '推箱子');
const first = record.payloadSamples[0].offset;
const end = catalog.records[catalog.records.indexOf(record) + 1].titleOffset;
const raws = [];
for (let cursor = first; cursor < end && raws.length < record.payloadCount;) {
  while (cursor < end && !(binary[cursor] >= 48 && binary[cursor] <= 57 && binary[cursor + 1] === 0)) cursor += 2;
  if (cursor >= end) break;
  let finish = cursor;
  while (finish < end && binary[finish] >= 48 && binary[finish] <= 57 && binary[finish + 1] === 0) finish += 2;
  const raw = binary.subarray(cursor, finish).toString('utf16le');
  if (raw.length >= 8) raws.push(raw);
  cursor = finish;
}
if (raws.length !== record.payloadCount) throw new Error('expected ' + record.payloadCount + ' payloads, found ' + raws.length);
const levels = raws.map((cells, index) => ({ number: index + 1, encoding: 'native-command-string', cells }));
fs.writeFileSync(path.join(root, 'public/data/pk32-sokoban-levels.json'), JSON.stringify({ version: 1, name: '推箱子', source: 'PK32 native module.bin', count: levels.length, fullGameRulesVerified: false, levels }, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, lengths: levels.map(level => level.cells.length) }));
