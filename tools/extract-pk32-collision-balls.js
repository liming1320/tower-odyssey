'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const record = catalog.records.find(item => item.name === '碰撞彩球');
if (!record || record.payloadSamples.length !== record.payloadCount) throw new Error('collision balls payload samples are incomplete');
const levels = record.payloadSamples.map((item, index) => {
  const cells = binary.subarray(item.offset, item.offset + item.length * 2).toString('utf16le').replace(/\0+$/, '');
  return { number: index + 1, width: 5, height: Math.ceil(cells.length / 5), cells };
});
fs.writeFileSync(path.join(root, 'public/data/pk32-collision-balls-levels.json'), JSON.stringify({
  version: 1, source: 'PK32 native module.bin', count: levels.length, fullGameRulesVerified: false, levels
}, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, lengths: levels.map(level => level.cells.length) }));
