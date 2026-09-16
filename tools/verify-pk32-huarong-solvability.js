'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-huarong-levels.json')));
const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function parseLayout(layout) {
    const tokens = layout.match(/.{2}/g) || [];
    assert.equal(tokens.length, 20);
    const groups = new Map();
    tokens.forEach((id, index) => {
        if (id === '15') return;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push({ row: Math.floor(index / 4), col: index % 4 });
    });
    return [...groups.keys()].sort().map(id => {
        const cells = groups.get(id);
        const rows = cells.map(cell => cell.row), cols = cells.map(cell => cell.col);
        const row = Math.min(...rows), col = Math.min(...cols);
        return {
            id,
            row,
            col,
            height: Math.max(...rows) - row + 1,
            width: Math.max(...cols) - col + 1
        };
    });
}

function occupancy(state, ignore) {
    const occupied = Array(20).fill(null);
    state.forEach((piece, index) => {
        if (index === ignore) return;
        for (let row = piece.row; row < piece.row + piece.height; row += 1) {
            for (let col = piece.col; col < piece.col + piece.width; col += 1) occupied[row * 4 + col] = index;
        }
    });
    return occupied;
}

function canMove(state, index, delta) {
    const piece = state[index];
    const row = piece.row + delta[0], col = piece.col + delta[1];
    if (row < 0 || col < 0 || row + piece.height > 5 || col + piece.width > 4) return false;
    const occupied = occupancy(state, index);
    for (let y = row; y < row + piece.height; y += 1) {
        for (let x = col; x < col + piece.width; x += 1) if (occupied[y * 4 + x] !== null) return false;
    }
    return true;
}

function signature(state) {
    return state.slice().sort((a, b) => {
        const shape = (a.height * 10 + a.width) - (b.height * 10 + b.width);
        return shape || a.row - b.row || a.col - b.col;
    }).map(piece => piece.height + 'x' + piece.width + '@' + piece.row + ',' + piece.col).join(';');
}

function solve(layout, maxStates = 1000000) {
    const initial = parseLayout(layout);
    const queue = [initial];
    const depths = [0];
    const seen = new Set([signature(initial)]);
    let cursor = 0;
    while (cursor < queue.length) {
        const state = queue[cursor];
        const depth = depths[cursor];
        cursor += 1;
        const cao = state.find(piece => piece.id === '00');
        if (cao && cao.row === 3 && cao.col === 1) return { solved: true, moves: depth, states: seen.size };
        if (seen.size >= maxStates) return { solved: false, limited: true, states: seen.size };
        for (let index = 0; index < state.length; index += 1) {
            for (const delta of DIRECTIONS) {
                if (!canMove(state, index, delta)) continue;
                const next = state.map(piece => ({ ...piece }));
                next[index].row += delta[0];
                next[index].col += delta[1];
                const key = signature(next);
                if (seen.has(key)) continue;
                seen.add(key);
                queue.push(next);
                depths.push(depth + 1);
            }
        }
    }
    return { solved: false, limited: false, states: seen.size };
}

assert.equal(data.name, '华容道');
assert.equal(data.count, 11);
const requestedLevel = Number((process.argv.find(arg => arg.startsWith('--level=')) || '').slice(8));
const sourceLevels = requestedLevel ? data.levels.filter(level => level.number === requestedLevel) : data.levels;
const results = sourceLevels.map(level => ({ number: level.number, ...solve(level.layout) }));
if (process.argv.includes('--report-only')) console.log(JSON.stringify({ count: results.length, results }));
if (!process.argv.includes('--report-only')) results.forEach(result => {
    assert.equal(result.solved, true, 'native Huarong level ' + result.number + ' did not reach the exit');
    assert.equal(result.limited, undefined, 'native Huarong level ' + result.number + ' exceeded the search limit');
});
console.log(JSON.stringify({ count: results.length, results, victory: 'Cao Cao at row 3, column 1', fullGameRulesVerified: false }));
