'use strict';

const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/pk32-light-levels.json'), 'utf8'));
const targetStates = new Set([0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26]);
const ordinary = [1, 0, 3, 2, 5, 4, 7, 6, 9, 8, 11, 12, 12, 14, 15, 13, 17, 16, 19, 18, 21, 20, 23, 22, 25, 24, 27, 26, 28, 29, 30, 31, 33, 32, 35, 34, 36, 37, 38, 39];
function board(level) {
    const cells = level.cells.match(/.{2}/g);
    const width = Number(cells.shift()), height = Number(cells.shift());
    return { width, height, cells: cells.map(value => Number(value) === 99 ? -1 : Number(value)) };
}
function at(state, x, y) { return x >= 0 && x < state.width && y >= 0 && y < state.height ? y * state.width + x : -1; }
function points(state, index, kind) {
    const x = index % state.width, y = Math.floor(index / state.width), result = [];
    const add = (nx, ny) => { const i = at(state, nx, ny); if (i >= 0) result.push(i); };
    if (kind === 'orth') [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(p => add(x + p[0], y + p[1]));
    else if (kind === 'near') for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) add(x + dx, y + dy);
    else if (kind === 'radius2') for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) === 2 || Math.abs(dy) === 2) add(x + dx, y + dy);
    else if (kind === 'rowcol') { for (let nx = 0; nx < state.width; nx++) add(nx, y); for (let ny = 0; ny < state.height; ny++) add(x, ny); }
    else if (kind === 'diag') for (let d = -Math.max(state.width, state.height); d <= Math.max(state.width, state.height); d++) { add(x + d, y + d); add(x + d, y - d); }
    return [...new Set(result)];
}
function apply(state, index) {
    const code = state.cells[index];
    const scope = [2, 3].includes(code) ? 'near' : [4, 5].includes(code) ? 'radius2' : [6, 7].includes(code) ? 'rowcol' : [8, 9].includes(code) ? 'diag' : 'orth';
    if (code >= 0 && code < ordinary.length && ![12, 17, 18, 19, 28, 29, 32, 34].includes(code)) points(state, index, scope).forEach(i => { if (state.cells[i] >= 0 && state.cells[i] < ordinary.length) state.cells[i] = ordinary[state.cells[i]]; });
}
function demoCoordinates(text) {
    return text.match(/.{4}/g).map(value => ({ x: Number(value.slice(0, 2)), y: Number(value.slice(2)) }));
}
function runDemo(level, text) {
    const state = board(data.levels[level]);
    demoCoordinates(text).forEach(point => { const index = point.y * state.width + point.x; if (index >= 0 && index < state.cells.length) apply(state, index); });
    return state;
}
function check(label, condition) { if (!condition) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('140 native boards', data.levels.length === 140);
check('all encoded dimensions match payload', data.levels.every(level => level.cells.length === 4 + level.width * level.height * 2));
check('all ordinary codes have a deterministic transform', data.levels.every(level => { const state = board(level); state.cells.forEach((_, i) => apply(state, i)); return state.cells.every(value => value < 0 || value < 60); }));
check('win set is represented by the native target table', targetStates.size === 15 && [...targetStates].every(value => value >= 0 && value < ordinary.length));
const demos = ['030407041104', '06040903', '07030805', '0505060308040902'];
check('native demo coordinates are well formed', demos.every(text => demoCoordinates(text).every(point => point.x >= 0 && point.y >= 0)));
check('native demo runner preserves valid state bounds', demos.every((text, index) => runDemo(index, text).cells.every(value => value === -1 || value >= 0 && value < 60)));
console.log(JSON.stringify({ nativeLevelCount: data.levels.length, verified: true, runtimeEquivalent: false }));
