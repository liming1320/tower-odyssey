'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const inventory = JSON.parse(fs.readFileSync(path.join(reference, 'pk32-inventory.json'), 'utf8'));
const queue = JSON.parse(fs.readFileSync(path.join(reference, 'migration-queue.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(reference, 'migration-ledger.json'), 'utf8'));

assert.equal(inventory.summary.games, 213);
assert.equal(inventory.games.length, 213);
assert.equal(new Set(inventory.games.map(game => game.name)).size, 213);
assert.equal(inventory.summary.physicalFiles, 6);
assert.equal(inventory.summary.executables, 2);
assert.equal(inventory.summary.dlls, 1);
assert.equal(inventory.summary.hostSharedByAllGames, true);
assert.equal(inventory.engineGroups.length, 1);
assert.equal(inventory.engineGroups[0].games, 213);
assert.equal(queue.summary.total, 213);
assert.equal(queue.records.length, ledger.records.length);
assert.equal(queue.summary.originalComplete, 0);
assert.equal(queue.summary.dedicatedRenderer, queue.records.filter(record => record.renderer === 'dedicated-or-board').length);
assert.equal(queue.records.filter(record => record.originalComplete).length, 0);
for (const record of queue.records) {
    assert.equal(record.engineGroup, 'vb5-pk32-shared-host');
    assert.ok(record.sourceExePath);
    if (record.originalComplete) {
        assert.equal(record.originalAssetsVerified, true);
        assert.equal(record.originalLevelsVerified, true);
        assert.equal(record.originalRulesVerified, true);
    }
}
console.log(JSON.stringify({
    inventoryVerified: true,
    games: inventory.summary.games,
    physicalFiles: inventory.summary.physicalFiles,
    sharedHost: inventory.summary.hostSharedByAllGames,
    originalComplete: queue.summary.originalComplete,
    queueVerified: true
}));
