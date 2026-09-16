'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { decodePayload } = require('./lib/pk32-payload-profile');

const root = path.resolve(__dirname, '..');
const queue = require(path.join(root, 'output/pk32-reference/migration-queue.json'));
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const nativeOwnershipPath = path.join(root, 'output/pk32-reference/native-ownership.json');
const nativeOwnership = fs.existsSync(nativeOwnershipPath) ? require(nativeOwnershipPath) : null;
const nativeEvidenceByPayload = new Map((nativeOwnership && nativeOwnership.payloadEvidence || []).map(record => [record.gameId + ':' + record.offset, record]));
const nativeById = new Map(catalog.records.map(record => [record.id, record]));
const targetIds = new Set([...(queue.payloadFormatGroups || []), ...(queue.structuredPayloadGroups || [])].flatMap(group => group.games || []).map(game => game.id));
const pending = queue.records.filter(record => record.migrationStatus === 'native-payloads-awaiting-adapter' || targetIds.has(record.id));

const skippedAssignments = [];
const games = pending.flatMap(record => {
    const native = nativeById.get(record.id);
    if (!native || !native.payloadAssignment || native.payloadAssignment.confidence !== 'candidate') {
        skippedAssignments.push({
            id: record.id,
            name: record.name,
            reason: native && native.payloadAssignment ? 'payload assignment confidence is ' + native.payloadAssignment.confidence : 'missing native payload assignment'
        });
        return [];
    }
    const payloads = native.nativePayloads.map(payload => {
        const decoded = decodePayload(payload);
        const nativeEvidence = nativeEvidenceByPayload.get(record.id + ':' + payload.offset) || null;
        const numericUnits = decoded.units.map(Number).filter(Number.isFinite);
        return {
            offset: decoded.offset,
            length: decoded.length,
            family: decoded.family,
            confidence: decoded.confidence,
            semanticsVerified: false,
            structure: decoded.structure,
            unitCount: decoded.units.length,
            unitMin: numericUnits.length ? Math.min(...numericUnits) : null,
            unitMax: numericUnits.length ? Math.max(...numericUnits) : null,
            trailerLength: decoded.trailer ? decoded.trailer.length : 0,
            sourceSha256: crypto.createHash('sha256').update(payload.value).digest('hex'),
            nativeUsageVerified: !!(nativeEvidence && nativeEvidence.nativeUsageVerified),
            nativeHandlerRvas: nativeEvidence ? [...new Set(nativeEvidence.directCodeReferences.map(reference => reference.functionRva).filter(Number.isInteger))] : [],
            nativeDispatcherIndexes: nativeEvidence ? nativeEvidence.dispatcherIndexes : [],
            catalogAssignmentConflict: !!(nativeEvidence && nativeEvidence.catalogAssignmentConflict),
            ownershipVerified: false
        };
    });
    const nativeHandlerRvas = [...new Set(payloads.flatMap(payload => payload.nativeHandlerRvas))].sort((a, b) => a - b);
    const nativeDispatcherIndexes = [...new Set(payloads.flatMap(payload => payload.nativeDispatcherIndexes))].sort((a, b) => a - b);
    return [{
        id: record.id,
        name: record.name,
        group: record.group,
        source: 'PK32 native numeric strings',
        dataKind: 'structured-native-payloads',
        dominantFamily: native.payloadProfile.dominantFamily,
        payloadFamilyCounts: native.payloadProfile.familyCounts,
        assignmentVerified: false,
        assignmentConfidence: 'candidate',
        assignmentRequires: 'native code reference from game dispatcher to payload offset',
        nativeUsageVerified: payloads.every(payload => payload.nativeUsageVerified),
        nativeHandlerRvas,
        nativeDispatcherIndexes,
        catalogAssignmentConflict: payloads.some(payload => payload.catalogAssignmentConflict),
        ownershipVerified: false,
        recordsArePlayableLevels: false,
        fullGameRulesVerified: false,
        nativePayloadCount: native.payloadCount,
        decodedPayloadCount: payloads.length,
        payloads
    }];
});

const groups = [];
const gamesByFamily = new Map();
games.forEach(game => {
    if (!gamesByFamily.has(game.dominantFamily)) gamesByFamily.set(game.dominantFamily, []);
    gamesByFamily.get(game.dominantFamily).push(game);
});
gamesByFamily.forEach((items, family) => groups.push({
    family,
    semanticsVerified: false,
    gameCount: items.length,
    payloadCount: items.reduce((sum, item) => sum + item.decodedPayloadCount, 0),
    games: items.map(item => ({ id: item.id, name: item.name, payloadCount: item.decodedPayloadCount }))
}));
groups.sort((a, b) => b.gameCount - a.gameCount || a.family.localeCompare(b.family));

const result = {
    version: 1,
    source: 'public/data/pk32-native-catalog.json + output/pk32-reference/migration-queue.json',
    dataKind: 'structured-native-payload-registry',
    assignmentVerified: false,
    assignmentConfidence: 'candidate',
    recordsArePlayableLevels: false,
    fullGameRulesVerified: false,
    gameCount: games.length,
    payloadCount: games.reduce((sum, game) => sum + game.decodedPayloadCount, 0),
    nativeUsageVerifiedPayloadCount: games.reduce((sum, game) => sum + game.payloads.filter(payload => payload.nativeUsageVerified).length, 0),
    catalogAssignmentConflictGames: games.filter(game => game.catalogAssignmentConflict).length,
    skippedAssignments,
    groups,
    games
};

const output = path.join(root, 'public/data/pk32-structured-payloads.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), games: result.gameCount, payloads: result.payloadCount, skippedAssignments: skippedAssignments.length, groups: groups.map(group => ({ family: group.family, games: group.gameCount, payloads: group.payloadCount })) }));
