'use strict';

// Validate extracted PK32 payloads without promoting any game to complete.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, 'pk32-native-catalog.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'output', 'pk32-reference', 'migration-ledger.json'), 'utf8'));
const names = new Set(catalog.records.map(record => record.name));
const files = fs.readdirSync(dataDir).filter(file => /^pk32-.*-levels\.json$/.test(file));
const rows = [];

for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (data.assignmentVerified === false) continue;
    assert.ok(data.name, file + ': missing name');
    assert.ok(names.has(data.name), file + ': name is not in the 213-item catalog');
    assert.ok(Array.isArray(data.levels), file + ': levels must be an array');
    assert.ok(data.levels.length > 0, file + ': empty levels array');
    assert.ok(data.fullGameRulesVerified !== true, file + ': data cannot promote rules by itself');
    data.levels.forEach((level, index) => {
        if (level.number != null) assert.equal(level.number, index + 1, file + ': level numbering is not contiguous');
        const cells = level.cells;
        assert.equal(typeof cells, 'string', file + ' level ' + (index + 1) + ': cells must be a string');
        assert.ok(cells.length > 0, file + ' level ' + (index + 1) + ': empty payload');
        assert.match(cells, /^[0-9]+$/, file + ' level ' + (index + 1) + ': payload is not numeric');
    });
    if (data.extractedLevelCount != null) assert.equal(data.levels.length, data.extractedLevelCount, file + ': extracted count mismatch');
    // A declared count can be larger or smaller than the extracted payload
    // set. Keep that discrepancy visible; it is exactly what the next
    // reverse-engineering pass must resolve.
    const nativeLevelCount = data.nativeLevelCount || null;
    rows.push({ file, name: data.name, levels: data.levels.length, nativeLevelCount, countStatus: nativeLevelCount == null ? 'undeclared' : nativeLevelCount === data.levels.length ? 'matched' : 'needs-runtime-confirmation' });
}

const expected = { '同步移动': 261, '木乃伊': 222, '电磁彩球': 160, '同色方块': 3 };
for (const [name, count] of Object.entries(expected)) {
    const row = rows.find(item => item.name === name);
    assert.ok(row, name + ': extracted data file missing');
    assert.equal(row.levels, count, name + ': extracted payload count mismatch');
}

assert.equal(catalog.total, 213);
assert.equal(ledger.total, 213);
assert.equal(ledger.records.filter(record => record.originalComplete === true).length, 0);
console.log(JSON.stringify({ catalog: catalog.total, dataFiles: rows.length, payloads: rows.reduce((sum, row) => sum + row.levels, 0), originalComplete: 0, expected }));
