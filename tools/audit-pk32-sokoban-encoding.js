'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-sokoban-levels.json')));
const rows = data.levels.map(level => {
  const values = [...new Set(level.cells.split(''))].sort().join('');
  const coordinatePairs = level.cells.length % 2 === 0 && level.cells.match(/../g).every(pair => Number(pair) >= 0 && Number(pair) <= 99);
  return { number: level.number, length: level.cells.length, values, coordinatePairs };
});
console.log(JSON.stringify({ count: rows.length, coordinatePairRecords: rows.filter(row => row.coordinatePairs).length, bitmapRecords: rows.filter(row => !row.coordinatePairs).length, lengths: [...new Set(rows.map(row => row.length))].sort((a, b) => a - b), rows }, null, 2));
