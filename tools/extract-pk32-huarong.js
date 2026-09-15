'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const record = catalog.records.find(item => item.name === '华容道');
if (!record || record.payloadSamples.length !== record.payloadCount) throw new Error('huarong payload samples are incomplete');
const outputPath = path.join(root, 'public/data/pk32-huarong-levels.json');
let previous = null;
try { previous = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch (error) {}
const levels = record.payloadSamples.map((item, index) => ({ number: index + 1, encoding: 'native-piece-command-string', cells: binary.subarray(item.offset, item.offset + item.length * 2).toString('utf16le').replace(/\0+$/, ''), ...(previous && previous.levels && previous.levels[index] && previous.levels[index].layout ? { layout: previous.levels[index].layout } : {}) }));
fs.writeFileSync(outputPath, JSON.stringify({ version: 1, name: '华容道', source: 'PK32 native module.bin', count: levels.length, fullGameRulesVerified: false, levels }, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, lengths: levels.map(level => level.cells.length) }));
