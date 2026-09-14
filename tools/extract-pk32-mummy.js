'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const record = catalog.records.find(item => item.name === '木乃伊');
if (!record) throw new Error('木乃伊 record not found');

const first = record.payloadSamples[0].offset;
const end = catalog.records[catalog.records.indexOf(record) + 1].titleOffset;
const raws = [];
for (let cursor = first; cursor < end && raws.length < record.payloadCount;) {
  while (cursor < end && !(binary[cursor] >= 48 && binary[cursor] <= 57 && binary[cursor + 1] === 0)) cursor += 2;
  if (cursor >= end) break;
  let finish = cursor;
  while (finish < end && binary[finish] >= 48 && binary[finish] <= 57 && binary[finish + 1] === 0) finish += 2;
  const raw = binary.subarray(cursor, finish).toString('utf16le');
  if (raw.length >= 40) raws.push(raw);
  cursor = finish;
}
if (raws.length !== record.payloadCount) throw new Error('expected ' + record.payloadCount + ' payloads, found ' + raws.length);

const levels = raws.map((raw, index) => {
  const width = Number(raw.slice(0, 2));
  const cells = raw.slice(7);
  return { number: index + 1, width, height: Math.ceil(cells.length / width), header: raw.slice(0, 7), cells };
});

fs.writeFileSync(path.join(root, 'public/data/pk32-mummy-levels.json'), JSON.stringify({
  version: 1,
  source: 'PK32 native module.bin',
  count: levels.length,
  fullGameRulesVerified: false,
  levels
}, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, dimensions: [...new Set(levels.map(item => item.width + 'x' + item.height))] }));
