'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-huarong-levels.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const binary = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const source = catalog.records.find(item => item.name === '华容道');
assert.equal(data.name, '华容道');
assert.equal(data.count, 11);
assert.equal(data.levels.length, 11);
assert.equal(data.fullGameRulesVerified, false);
for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  assert.ok(data.levels.some(level => level.cells === raw), 'payload not recovered at ' + sample.offset);
}
assert.ok(data.levels.every(level => level.encoding === 'native-piece-command-string' && /^\d+$/.test(level.cells)));
function parseLayout(layout) {
  assert.match(layout, /^\d{40}$/);
  const tokens = layout.match(/.{2}/g);
  assert.equal(tokens.length, 20);
  const groups = new Map();
  tokens.forEach((id, index) => {
    if (id === '15') return;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ row: Math.floor(index / 4), col: index % 4 });
  });
  return { tokens, groups };
}

function hasLegalMove(tokens, group) {
  const occupied = new Set();
  tokens.forEach((id, index) => { if (id !== '15') occupied.add(index); });
  const rows = group.map(cell => cell.row);
  const cols = group.map(cell => cell.col);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows), minCol = Math.min(...cols), maxCol = Math.max(...cols);
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
    const nextRow = minRow + dr, nextCol = minCol + dc;
    if (nextRow < 0 || nextCol < 0 || maxRow + dr >= 5 || maxCol + dc >= 4) return false;
    return group.every(cell => !occupied.has((cell.row + dr) * 4 + cell.col + dc) || group.some(other => other.row === cell.row + dr && other.col === cell.col + dc));
  });
}

data.levels.forEach(level => {
  const { tokens, groups } = parseLayout(level.layout);
  assert.equal(tokens.filter(id => id === '15').length, 2, 'expected two empty cells in level ' + level.number);
  assert.ok(groups.has('00'), 'missing Cao Cao in level ' + level.number);
  assert.equal(groups.get('00').length, 4, 'Cao Cao must occupy four cells in level ' + level.number);
  const cao = groups.get('00');
  const caoRows = cao.map(cell => cell.row), caoCols = cao.map(cell => cell.col);
  assert.equal(Math.max(...caoRows) - Math.min(...caoRows) + 1, 2, 'Cao Cao must be two rows in level ' + level.number);
  assert.equal(Math.max(...caoCols) - Math.min(...caoCols) + 1, 2, 'Cao Cao must be two columns in level ' + level.number);
  groups.forEach((cells, id) => {
    const rows = cells.map(cell => cell.row), cols = cells.map(cell => cell.col);
    const height = Math.max(...rows) - Math.min(...rows) + 1, width = Math.max(...cols) - Math.min(...cols) + 1;
    assert.equal(height * width, cells.length, 'piece has a hole in level ' + level.number + ': ' + id);
    assert.ok(id === '00' ? height === 2 && width === 2 : cells.length <= 2, 'unexpected piece shape in level ' + level.number + ': ' + id);
  });
  assert.ok([...groups.values()].some(group => hasLegalMove(tokens, group)), 'level has no legal opening move: ' + level.number);
});
console.log(JSON.stringify({ count: data.levels.length, sampledPayloadsVerified: source.payloadSamples.length, layoutsVerified: data.levels.length, fullGameRulesVerified: false }));
