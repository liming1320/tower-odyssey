'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { decodePayload } = require('./lib/pk32-payload-profile');

const root = path.resolve(__dirname, '..');
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const registry = require(path.join(root, 'public/data/pk32-structured-payloads.json'));
const queue = require(path.join(root, 'output/pk32-reference/migration-queue.json'));
const ownership = require(path.join(root, 'output/pk32-reference/native-ownership.json'));
const nativeById = new Map(catalog.records.map(record => [record.id, record]));
const ownershipByPayload = new Map(ownership.payloadEvidence.map(record => [record.gameId + ':' + record.offset, record]));

assert.equal(registry.assignmentVerified, false);
assert.equal(registry.assignmentConfidence, 'candidate');
assert.equal(registry.recordsArePlayableLevels, false);
assert.equal(registry.fullGameRulesVerified, false);
assert.equal(registry.gameCount, registry.games.length);
assert.ok(Array.isArray(registry.skippedAssignments));
assert.equal(registry.payloadCount, registry.games.reduce((sum, game) => sum + game.decodedPayloadCount, 0));
assert.equal(registry.nativeUsageVerifiedPayloadCount, registry.payloadCount);
assert.ok(registry.catalogAssignmentConflictGames > 0);
assert.equal(registry.groups.length, new Set(registry.games.map(game => game.dominantFamily)).size);
assert.ok(registry.groups.every(group => group.semanticsVerified === false));

let checked = 0;
for (const game of registry.games) {
    const source = nativeById.get(game.id);
    assert(source, 'missing source game ' + game.id);
    assert.equal(source.name, game.name);
    assert.equal(game.assignmentVerified, false);
    assert.equal(game.assignmentConfidence, 'candidate');
    assert.equal(game.recordsArePlayableLevels, false);
    assert.equal(game.fullGameRulesVerified, false);
    assert.equal(game.nativeUsageVerified, true);
    assert.equal(game.ownershipVerified, false);
    assert.equal(game.decodedPayloadCount, source.nativePayloads.length);
    game.payloads.forEach((record, index) => {
        const payload = source.nativePayloads[index];
        const decoded = decodePayload(payload);
        const numericUnits = decoded.units.map(Number).filter(Number.isFinite);
        const nativeEvidence = ownershipByPayload.get(game.id + ':' + payload.offset);
        assert(nativeEvidence, 'missing native ownership evidence');
        assert.equal(record.offset, payload.offset);
        assert.equal(record.length, payload.length);
        assert.equal(record.family, decoded.family);
        assert.equal(record.confidence, decoded.confidence);
        assert.deepEqual(record.structure, decoded.structure);
        assert.equal(record.unitCount, decoded.units.length);
        assert.equal(record.unitMin, numericUnits.length ? Math.min(...numericUnits) : null);
        assert.equal(record.unitMax, numericUnits.length ? Math.max(...numericUnits) : null);
        assert.equal(record.trailerLength, decoded.trailer ? decoded.trailer.length : 0);
        assert.equal(record.sourceSha256, crypto.createHash('sha256').update(payload.value).digest('hex'));
        assert.equal(record.nativeUsageVerified, true);
        assert.deepEqual(record.nativeDispatcherIndexes, nativeEvidence.dispatcherIndexes);
        assert.equal(record.catalogAssignmentConflict, nativeEvidence.catalogAssignmentConflict);
        assert.equal(record.ownershipVerified, false);
        if (record.family === 'legacy-100-stream') {
            assert.equal(record.structure.marker, '100');
            assert.equal(record.structure.headerCountFits, true);
            assert.equal(record.structure.headerValue, record.unitCount);
            assert.ok(record.trailerLength > 0);
        }
        if (record.family === 'three-digit-index-candidate') assert.ok(record.unitMax <= 255);
        if (record.family === 'fixed-area-candidate') assert.ok(record.structure.candidateShapes.length > 0);
        checked += 1;
    });
}

assert.equal(checked, registry.payloadCount);
assert.equal(queue.summary.awaitingAdapter, 0);
assert.equal(queue.summary.structuredPayloadGames, registry.gameCount);
console.log(JSON.stringify({ games: registry.gameCount, payloads: checked, groups: registry.groups.length, nativeUsageVerified: registry.nativeUsageVerifiedPayloadCount, assignmentConflictGames: registry.catalogAssignmentConflictGames, awaitingAdapter: queue.summary.awaitingAdapter, hashesVerified: true, semanticsVerified: false }));
