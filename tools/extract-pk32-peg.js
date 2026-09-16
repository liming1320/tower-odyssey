'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json'), 'utf8'));
const record = source.records.find(item => item.name === '独粒钻石');
const boardFile = path.join(root, 'public/data/pk32-peg-native-boards.json');
if ((!record || !Array.isArray(record.nativePayloads)) && fs.existsSync(boardFile)) {
  const boards = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
  if (!Array.isArray(boards.levels) || boards.levels.length !== 17) throw new Error('独粒钻石原生棋盘数量异常：' + (boards.levels && boards.levels.length));
  console.log(JSON.stringify({ count: boards.levels.length, width: boards.width, height: boards.height, source: 'pk32-peg-native-boards.json' }));
  process.exit(0);
}
if (!record || !Array.isArray(record.nativePayloads)) throw new Error('独粒钻石原生载荷不存在');
const levels = record.nativePayloads
  .filter(item => item.length === 280 && typeof item.value === 'string' && item.value.length === 280)
  .map((item, index) => ({ number: index + 1, width: 20, height: 14, encoding: 'native-peg-board', cells: item.value }));
if (levels.length !== 207) throw new Error('独粒钻石原生关卡数量异常：' + levels.length);
fs.writeFileSync(path.join(root, 'output/pk32-reference/unassigned-280-payloads.json'), JSON.stringify({ version: 1, assignmentVerified: false, source: 'PK32 native module.bin', count: levels.length, levels }, null, 2) + '\n');
console.log(JSON.stringify({ count: levels.length, width: 20, height: 14 }));
