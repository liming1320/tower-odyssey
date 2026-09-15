'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json'), 'utf8'));
const record = source.records.find(item => item.name === '独粒钻石');
if (!record || !Array.isArray(record.payloads)) throw new Error('独粒钻石原生载荷不存在');
const levels = record.payloads
  .filter(item => item.length === 280 && typeof item.value === 'string' && item.value.length === 280)
  .map((item, index) => ({ number: index + 1, width: 20, height: 14, encoding: 'native-peg-board', cells: item.value }));
if (levels.length !== 207) throw new Error('独粒钻石原生关卡数量异常：' + levels.length);
fs.writeFileSync(path.join(root, 'public/data/pk32-peg-levels.json'), JSON.stringify({ version: 1, name: '独粒钻石', source: 'PK32 native module.bin', count: levels.length, fullGameRulesVerified: false, levels }, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, width: 20, height: 14 }));
