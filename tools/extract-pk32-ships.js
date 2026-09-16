'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const image = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const imageBase = 0x400000;
const jumpTable = 0x1c60414;
const layoutTable = 0x1c5cd84;
const levelCount = 52;

function readNativeString(pointer) {
    const length = image.readUInt32LE(pointer - 4);
    assert.equal(length % 2, 0, 'native BSTR length must be even at ' + pointer);
    assert.ok(pointer + length <= image.length, 'native BSTR exceeds module image at ' + pointer);
    return image.toString('utf16le', pointer, pointer + length);
}

function readDispatchString(table, index) {
    const caseAddress = image.readUInt32LE(table + index * 4);
    const caseOffset = caseAddress - imageBase;
    assert.equal(image[caseOffset], 0xba, 'level case must load a native string pointer: ' + (index + 1));
    const pointer = image.readUInt32LE(caseOffset + 1) - imageBase;
    return { caseOffset, pointer, text: readNativeString(pointer) };
}

const levels = [];
const layouts = [];
for (let index = 0; index < levelCount; index += 1) {
    const coordinate = readDispatchString(jumpTable, index);
    const layout = readDispatchString(layoutTable, index);
    const cells = coordinate.text;
    assert.ok(/^\d+$/.test(cells) && cells.length % 2 === 0, 'native coordinate payload mismatch: ' + (index + 1));
    for (const pair of cells.match(/\d{2}/g) || []) assert.ok(Number(pair) < 100, 'coordinate outside 10x10 board: ' + pair);
    assert.ok(/^\d{4}[0-6]+$/.test(layout.text), 'native layout payload mismatch: ' + (index + 1));
    const width = Number(layout.text.slice(0, 2));
    const height = Number(layout.text.slice(2, 4));
    const grid = layout.text.slice(4);
    assert.equal(grid.length, width * height, 'native layout dimensions mismatch: ' + (index + 1));
    layouts.push({ number: index + 1, caseOffset: layout.caseOffset, offset: layout.pointer, width, height, cells: grid });
    levels.push({ number: index + 1, caseOffset: coordinate.caseOffset, offset: coordinate.pointer, cells });
}

const result = { name: '航海迷题', levelCount, jumpTable, layoutTable, source: 'module.bin native dispatch tables', levels, layouts };
if (process.argv.includes('--write')) {
    const output = path.join(root, 'output/pk32-validation/pk32-ships-extracted.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}
if (require.main === module) console.log(JSON.stringify(result, null, 2));
module.exports = result;
