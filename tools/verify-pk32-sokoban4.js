'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = require('../public/js/minigames/pk32-sokoban4');
const data = require('../public/data/pk32-sokoban4-levels.json');
const image = fs.readFileSync(path.join(__dirname, '../output/pk32-reference/module.bin'));
const evidence = [
    [0x1bf455e, 'c745b40b000000'], [0x1bf457d, 'ff15e0632502'],
    [0x1bf45a0, 'c745b409000000'], [0x1bf45bf, 'ff15e0632502'],
    [0x1bf3bcf, '6a10'], [0x1bf3dea, '688600ee00'],
    [0x1bf6890, 'ba28dc6500'], [0x1bf6f58, 'c745ac25000000'],
    [0x25dc24, '060000003100320033000000'],
    [0x1bf6b8d, '66c740080000'], [0x1bf63ed, '6a00'],
    [0x1bf63f2, 'ff515c'], [0x1bf69af, '6858020000']
];
for (const [rva, hex] of evidence) assert.equal(image.subarray(rva, rva + hex.length / 2).toString('hex'), hex);
let cases = 0;
for (const level of data.levels) {
    const state = game.createState(level);
    assert.equal(state.cells.length, 99);
    assert.equal(state.cells[state.player], 0);
    for (const color of [1, 2, 3, 4, 5]) assert.equal(state.cells.filter(c => c === color).length, level.cells.split(String(color)).length - 1);
    for (const direction of ['up', 'down', 'left', 'right']) {
        const next = game.createState(level); game.move(next, direction);
        assert.equal(next.cells[next.player], 0);
        assert.deepEqual(next.cells.slice().sort(), state.cells.slice().sort());
        assert.ok(next.player >= 0 && next.player < 99); cases++;
    }
}
function fixture(boxes, walls = [], player = 0) {
    const cells = Array(99).fill(0);
    walls.forEach(i => { cells[i] = 5; });
    boxes.forEach(([i, color]) => { cells[i] = color; });
    return { cells, player, direction: 0, moves: 0, won: false };
}
assert.equal(game.isWon(fixture([[0, 1], [1, 1], [77, 1], [78, 1]]).cells), true, 'Disconnected pairs satisfy native rule');
assert.equal(game.isWon(fixture([[0, 1], [12, 1]]).cells), false, 'Diagonal neighbors are not a pair');
assert.equal(game.isWon(fixture([[10, 1], [11, 1]]).cells), false, 'Rows must not wrap');
assert.equal(game.isWon(fixture([[0, 1], [40, 2]]).cells), true, 'Singleton colors are exempt');
assert.equal(game.isWon(fixture([]).cells), false, 'No boxes is not victory');
for (const color of [1, 2, 3, 4]) {
    const state = fixture([[1, color], [2, color]], [], 0);
    assert.equal(game.move(state, 'right'), false, 'Cannot push a line of boxes');
    assert.equal(state.player, 0);
}
const boundary = fixture([[10, 1], [50, 1]], [], 9);
assert.equal(game.move(boundary, 'right'), false, 'Cannot push a box beyond the row edge');
const nativeDemo = image.toString('utf16le', 0x25dc28, 0x25dc28 + image.readUInt32LE(0x25dc24));
const first = game.createState(data.levels[0]);
assert.equal(first.player, 48);
assert.deepEqual(first.cells.flatMap((c, i) => c === 4 ? [i] : []), [27, 37]);
const expectedPlayers = [37, 38, 49];
for (let i = 0; i < nativeDemo.length; i++) {
    assert.equal(game.move(first, ['left', 'up', 'right', 'down'][Number(nativeDemo[i])]), true);
    assert.equal(first.player, expectedPlayers[i]);
    assert.equal(first.won, i === 2);
}
assert.deepEqual(first.cells.flatMap((c, i) => c === 3 ? [i] : []), [59, 60]);
assert.deepEqual(first.cells.flatMap((c, i) => c === 4 ? [i] : []), [26, 27]);
let demoMoves = 0;
for (const level of data.levels.filter(level => level.demo)) {
    const state = game.createState(level);
    const { offset, keys } = level.demo;
    assert.equal(keys, image.toString('utf16le', offset, offset + image.readUInt32LE(offset - 4)));
    for (const key of keys) { game.move(state, ['left', 'up', 'right', 'down'][Number(key)]); demoMoves++; }
    assert.equal(state.won, true, 'Native demo must solve level ' + level.number);
}
console.log(JSON.stringify({ maps: data.levels.length, mapDirectionCases: cases, nativeDemoMoves: demoMoves, nativeDemos: 3, nativeByteChecks: evidence.length, fullGameRulesVerified: false }));
