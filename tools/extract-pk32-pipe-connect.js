'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const record = catalog.records.find(item => item.name === '接水管');
if (!record || record.payloadSamples.length !== record.payloadCount) throw new Error('pipe payload samples are incomplete');
const levels = record.payloadSamples.map((item, index) => ({ number: index + 1, encoding: 'native-pipe-coordinate-string', cells: binary.subarray(item.offset, item.offset + item.length * 2).toString('utf16le').replace(/\0+$/, '') }));
fs.writeFileSync(path.join(root, 'public/data/pk32-pipe-connect-levels.json'), JSON.stringify({ version: 1, name: '接水管', source: 'PK32 native module.bin', count: levels.length, nativeLevelCount: record.levelCount, fullGameRulesVerified: false, levels }, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, nativeLevelCount: record.levelCount, lengths: levels.map(level => level.cells.length) }));
