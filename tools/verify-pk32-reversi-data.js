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
function boardFromCells(cells) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(0));
  coords(cells).forEach((value, index) => {
    const square = value - 1;
    board[Math.floor(square / 8)][square % 8] = index % 2 ? 2 : 1;
  });
  return board;
}
function flips(board, row, col, player) {
  if (row < 0 || row >= 8 || col < 0 || col >= 8 || board[row][col]) return [];
  const result = [];
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    const path = [];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === 3 - player) { path.push([r, c]); r += dr; c += dc; }
    if (path.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === player) result.push(...path);
  }
  return result;
}
function legalMoves(board, player) {
  const moves = [];
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) if (flips(board, row, col, player).length) moves.push({ row, col });
  return moves;
}
for (const sample of source.payloadSamples) {
  const raw = binary.subarray(sample.offset, sample.offset + sample.length * 2).toString('utf16le').replace(/\0+$/, '');
  const level = data.levels.find(item => item.cells === raw);
  assert.ok(level, 'payload not recovered at ' + sample.offset);
  coords(level.cells);
}
const openingChecks = data.levels.map(level => {
  const board = boardFromCells(level.cells);
  const blackMoves = legalMoves(board, 1), whiteMoves = legalMoves(board, 2);
  const player = blackMoves.length ? 1 : 2, moves = player === 1 ? blackMoves : whiteMoves;
  assert.ok(moves.length > 0, 'native position has no legal move for either side: ' + level.number);
  const move = moves[0], changed = flips(board, move.row, move.col, player);
  assert.ok(changed.length > 0, 'native opening did not flip any disc: ' + level.number);
  return { number: level.number, discs: coords(level.cells).length, nextPlayer: player, legalMoves: moves.length, firstFlipCount: changed.length };
});
console.log(JSON.stringify({ name: data.name, payloads: data.levels.length, coordinatePayloadsVerified: data.levels.length, openingRulesVerified: true, openingChecks, fullGameRulesVerified: false }));
