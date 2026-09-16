'use strict';

const assert = require('node:assert/strict');
const game = require('../public/js/minigames/pk32-sokoban4');
const data = require('../public/data/pk32-sokoban4-levels.json');

const WIDTH = game.WIDTH;
const HEIGHT = game.HEIGHT;
const SIZE = WIDTH * HEIGHT;
const DIRECTIONS = [
    ['left', -1, 0, 'L'],
    ['up', 0, -1, 'U'],
    ['right', 1, 0, 'R'],
    ['down', 0, 1, 'D'],
];
const MAX_NODES = Number((process.argv.find(arg => arg.startsWith('--max-nodes=')) || '').slice(12)) || 250000;
const requestedLevel = Number((process.argv.find(arg => arg.startsWith('--level=')) || '').slice(8));

function inside(index, dx, dy) {
    const x = index % WIDTH + dx;
    const y = Math.floor(index / WIDTH) + dy;
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT ? y * WIDTH + x : -1;
}

function reachable(cells, start) {
    const seen = new Uint8Array(SIZE);
    const queue = [start];
    seen[start] = 1;
    let mask = 0n;
    for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head];
        mask |= 1n << BigInt(index);
        for (const [, dx, dy] of DIRECTIONS) {
            const next = inside(index, dx, dy);
            if (next >= 0 && !seen[next] && cells[next] === 0) {
                seen[next] = 1;
                queue.push(next);
            }
        }
    }
    return { seen, mask };
}

function encodeBoxes(cells) {
    let key = '';
    cells.forEach((value, index) => {
        if (value >= 1 && value <= 4) key += String.fromCharCode(index + 1, value);
    });
    return key;
}

function decodeBoxes(baseCells, key) {
    const cells = baseCells.slice();
    for (let index = 0; index < key.length; index += 2) cells[key.charCodeAt(index) - 1] = key.charCodeAt(index + 1);
    return cells;
}

function unmatched(cells) {
    const counts = [0, 0, 0, 0, 0];
    cells.forEach(value => { if (value >= 1 && value <= 4) counts[value] += 1; });
    let result = 0;
    cells.forEach((value, index) => {
        if (value < 1 || value > 4 || counts[value] <= 1) return;
        if (!DIRECTIONS.some(([, dx, dy]) => {
            const next = inside(index, dx, dy);
            return next >= 0 && cells[next] === value;
        })) result += 1;
    });
    return result;
}

function heuristic(cells) {
    const positions = [[], [], [], [], []];
    cells.forEach((value, index) => { if (value >= 1 && value <= 4) positions[value].push(index); });
    let score = 0;
    positions.forEach(group => {
        if (group.length <= 1) return;
        for (const index of group) {
            let nearest = Infinity;
            for (const other of group) {
                if (other === index) continue;
                nearest = Math.min(nearest, Math.abs(index % WIDTH - other % WIDTH) + Math.abs(Math.floor(index / WIDTH) - Math.floor(other / WIDTH)));
            }
            score += Math.max(0, nearest - 1);
        }
    });
    return unmatched(cells) * 3 + Math.ceil(score / 2);
}

function staticCornerDeadlock(cells) {
    for (let index = 0; index < SIZE; index += 1) {
        const value = cells[index];
        if (value < 1 || value > 4) continue;
        const blocked = (dx, dy) => {
            const next = inside(index, dx, dy);
            return next < 0 || cells[next] === 5;
        };
        const corner = (blocked(-1, 0) || blocked(1, 0)) && (blocked(0, -1) || blocked(0, 1));
        if (!corner) continue;
        const same = DIRECTIONS.some(([, dx, dy]) => {
            const next = inside(index, dx, dy);
            return next >= 0 && cells[next] === value;
        });
        const count = cells.filter(code => code === value).length;
        if (count > 1 && !same) return true;
    }
    return false;
}

function priorityQueue() {
    const heap = [];
    function push(item) {
        heap.push(item);
        let index = heap.length - 1;
        while (index) {
            const parent = (index - 1) >> 1;
            if (heap[parent][0] <= item[0]) break;
            heap[index] = heap[parent];
            index = parent;
        }
        heap[index] = item;
    }
    function pop() {
        if (!heap.length) return null;
        const first = heap[0];
        const last = heap.pop();
        if (heap.length && last) {
            let index = 0;
            while (index * 2 + 1 < heap.length) {
                let child = index * 2 + 1;
                if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child += 1;
                if (heap[child][0] >= last[0]) break;
                heap[index] = heap[child];
                index = child;
            }
            heap[index] = last;
        }
        return first;
    }
    return { push, pop, get size() { return heap.length; } };
}

function solve(level) {
    const initial = game.createState(level);
    const baseCells = initial.cells.map(value => value === 5 ? 5 : 0);
    const boxKey = encodeBoxes(initial.cells);
    const firstRegion = reachable(initial.cells, initial.player);
    const nodes = [{ boxKey, player: initial.player, parent: -1, move: '', depth: 0 }];
    const seen = new Map([[boxKey + '|' + firstRegion.mask.toString(16), 0]]);
    const queue = priorityQueue();
    let sequence = 0;
    queue.push([heuristic(initial.cells), sequence++, 0]);
    while (queue.size) {
        const currentIndex = queue.pop()[2];
        const current = nodes[currentIndex];
        const cells = decodeBoxes(baseCells, current.boxKey);
        const currentRegion = reachable(cells, current.player);
        for (let from = 0; from < SIZE; from += 1) {
            if (!currentRegion.seen[from]) continue;
            for (const [direction, dx, dy, moveCode] of DIRECTIONS) {
                const next = inside(from, dx, dy);
                if (next < 0 || cells[next] < 1 || cells[next] > 4) continue;
                const beyond = inside(next, dx, dy);
                if (beyond < 0 || cells[beyond] !== 0) continue;
                const candidate = { cells: cells.slice(), player: from, direction: 0, moves: 0, won: false };
                assert.equal(game.move(candidate, direction), true);
                if (candidate.won) return { solved: true, pushes: current.depth + 1, nodes: seen.size };
                const nextRegion = reachable(candidate.cells, candidate.player);
                const nextBoxKey = encodeBoxes(candidate.cells);
                const key = nextBoxKey + '|' + nextRegion.mask.toString(16);
                if (seen.has(key)) continue;
                const nextIndex = nodes.length;
                seen.set(key, nextIndex);
                nodes.push({ boxKey: nextBoxKey, player: candidate.player, parent: currentIndex, move: moveCode, depth: current.depth + 1 });
                if (seen.size > MAX_NODES) return { limited: true, nodes: seen.size };
                queue.push([current.depth + 1 + heuristic(candidate.cells) * 4, sequence++, nextIndex]);
            }
        }
    }
    return { solved: false, nodes: seen.size };
}

const levels = requestedLevel ? data.levels.filter(level => level.number === requestedLevel) : data.levels;
assert.equal(levels.length, requestedLevel ? 1 : 23);
const results = levels.map(level => ({ number: level.number, ...solve(level) }));
assert.equal(results.filter(result => result.solved).length, results.length, JSON.stringify(results));
assert.equal(results.some(result => result.limited || result.solved === false), false, JSON.stringify(results));
console.log(JSON.stringify({ game: 'Sokoban IV', levels: results.length, solved: results.filter(result => result.solved).length, results }, null, 2));
