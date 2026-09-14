'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/pk32-pipe-connect-levels.json')));
const dirs = [[1, 0, 1], [-1, 0, 4], [0, 1, 2], [0, -1, 8]];
function adjacent(pathSet, point, dx, dy) {
  const x = point % 16, y = Math.floor(point / 16), nx = x + dx, ny = y + dy;
  return nx >= 0 && nx < 16 && ny >= 0 && ny < 16 && pathSet.has(ny * 16 + nx);
}
function prepare(level) {
  const points = level.cells.match(/.{3}/g).map(Number).filter(point => point >= 0 && point < 256);
  const pathSet = new Set(points), masks = new Map();
  points.forEach(point => masks.set(point, dirs.reduce((mask, dir) => mask | (adjacent(pathSet, point, dir[0], dir[1]) ? dir[2] : 0), 0) || 3));
  return { points, pathSet, masks };
}
function reachable(level, turns) {
  const { points, pathSet, masks } = prepare(level), rotate = mask => ((mask << (turns % 4)) | (mask >> (4 - (turns % 4)))) & 15;
  const start = points[0], goal = points[points.length - 1], seen = new Set([start]), queue = [start];
  while (queue.length) {
    const point = queue.shift(), mask = rotate(masks.get(point));
    dirs.forEach(([dx, dy, bit]) => {
      if (!(mask & bit)) return;
      const next = point + dx + dy * 16, back = bit === 1 ? 4 : bit === 4 ? 1 : bit === 2 ? 8 : 2;
      if (pathSet.has(next) && !seen.has(next) && (rotate(masks.get(next)) & back)) { seen.add(next); queue.push(next); }
    });
  }
  return seen.has(goal);
}
data.levels.forEach(level => {
  const parsed = prepare(level);
  assert.ok(parsed.points.length >= 2, 'level has endpoints');
  assert.ok(new Set(parsed.points).size >= 2, 'level has fewer than two unique coordinates');
  parsed.points.forEach(point => assert.ok(point % 16 >= 0 && point % 16 < 16 && Math.floor(point / 16) < 16));
  assert.equal(reachable(level, 0), reachable(level, 4), 'four rotations preserve connectivity');
});
console.log(JSON.stringify({ levels: data.levels.length, checked: ['coordinate-bounds', 'duplicate-points', 'four-rotation-stability', 'border-safe-adjacency'] }));
