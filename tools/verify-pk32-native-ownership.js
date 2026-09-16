'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const report = require(path.join(root, 'output/pk32-reference/native-ownership.json'));
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const moduleBytes = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));

assert.equal(report.source.moduleSha256, crypto.createHash('sha256').update(moduleBytes).digest('hex'));
assert.equal(report.summary.gameCount, 213);
assert.equal(report.summary.payloadCount, catalog.records.reduce((sum, game) => sum + (game.nativePayloads || []).length, 0));
assert.equal(report.summary.ownershipVerified, 0, 'native usage alone must not promote ownership');
assert.equal(report.policy.titleOrderProvesOwnership, false);
assert.equal(report.policy.nativeUsageProvesOwnership, false);
assert.equal(report.policy.originalCompletePromoted, false);

for (const row of report.payloadEvidence) {
    const game = catalog.records.find(candidate => candidate.id === row.gameId);
    assert.ok(game, 'unknown game: ' + row.gameId);
    const payload = game.nativePayloads[row.payloadIndex];
    assert.equal(row.offset, payload.offset);
    assert.equal(row.length, payload.length);
    assert.equal(row.sourceSha256, crypto.createHash('sha256').update(payload.value).digest('hex'));
    if (row.nativeUsageVerified) {
        assert.ok(row.directCodeReferences.length || row.dispatcherIndexes.length);
    }
    assert.equal(row.ownershipVerified, false);
}

const knightPayloadOffsets = new Set(catalog.records.find(game => game.name === '马跳棋盘').nativePayloads.map(row => row.offset));
const knightDispatcher = report.dispatchers.find(dispatcher =>
    dispatcher.caseCount === 24 && dispatcher.cases.filter(row => knightPayloadOffsets.has(row.stringRva)).length >= 15
);
assert.ok(knightDispatcher, 'the native 24-case knight-board dispatcher must be recovered');
assert.equal(knightDispatcher.stringCaseCount, 24);
assert.equal(knightDispatcher.catalogAssignmentConflict, true, 'title slicing must expose the cross-title assignment conflict');
assert.ok(knightDispatcher.candidateGameIds.includes('pk32-185'));
assert.ok(knightDispatcher.candidateGameIds.includes('pk32-186'));
assert.equal(knightDispatcher.ownershipVerified, false);

console.log(JSON.stringify({
    payloads: report.summary.payloadCount,
    directCodeReferenced: report.summary.directCodeReferencedPayloads,
    dispatcherReferenced: report.summary.dispatcherReferencedPayloads,
    dispatchers: report.summary.dispatcherCount,
    conflictingDispatchers: report.summary.conflictingDispatcherCount,
    recoveredUnassigned: report.summary.recoveredUnassignedNumericStrings,
    knightCases: knightDispatcher.caseCount
}));
