'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const report = require(path.join(root, 'output/pk32-reference/native-ownership.json'));
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const queue = require(path.join(root, 'output/pk32-reference/migration-queue.json'));
const queueById = new Map(queue.records.map(record => [record.id, record]));

const titleFunctionsByGame = new Map(catalog.records.map(game => [game.id, []]));
for (const row of report.titleReferenceFunctions || []) {
    for (const game of row.games) titleFunctionsByGame.get(game.gameId).push(row.functionRva);
}
const launchEdgesByGame = new Map(catalog.records.map(game => [game.id, []]));
for (const edge of report.launchEdges || []) {
    for (const game of edge.games) launchEdgesByGame.get(game.gameId).push({
        controlDispatcherIndex: edge.controlDispatcherIndex,
        caseIndex: edge.caseIndex,
        branchTargetRva: edge.branchTargetRva,
        directCallRvas: edge.directCallRvas,
        assignmentVerified: edge.assignmentVerified
    });
}
const payloadsByGame = new Map(catalog.records.map(game => [game.id, []]));
for (const row of report.payloadEvidence) payloadsByGame.get(row.gameId).push(row);

const titleSeeds = (report.titleReferenceFunctions || []).flatMap(row => row.games.map(game => ({
    gameId: game.gameId,
    name: game.name,
    functionRva: row.functionRva
}))).sort((a, b) => a.functionRva - b.functionRva);

function nearestTitleFunctions(functionRva) {
    if (!Number.isInteger(functionRva) || !titleSeeds.length) return [];
    let bestDistance = Infinity;
    const matches = [];
    for (const seed of titleSeeds) {
        const distance = Math.abs(seed.functionRva - functionRva);
        if (distance < bestDistance) {
            bestDistance = distance;
            matches.length = 0;
            matches.push(seed);
        } else if (distance === bestDistance) matches.push(seed);
    }
    return matches.map(seed => ({ gameId: seed.gameId, name: seed.name, titleFunctionRva: seed.functionRva, distance: bestDistance }));
}

const records = catalog.records.map(game => {
    const queueRecord = queueById.get(game.id);
    const payloads = payloadsByGame.get(game.id);
    const handlerRvas = [...new Set(payloads.flatMap(row => row.directCodeReferences.map(reference => reference.functionRva).filter(Number.isInteger)))].sort((a, b) => a - b);
    const dispatcherIndexes = [...new Set(payloads.flatMap(row => row.dispatcherIndexes))].sort((a, b) => a - b);
    const moduleCandidates = handlerRvas.map(handlerRva => ({ handlerRva, nearestTitles: nearestTitleFunctions(handlerRva) }));
    const launchEdges = launchEdgesByGame.get(game.id);
    return {
        id: game.id,
        name: game.name,
        titleOffset: game.titleOffset,
        titleReferenceFunctions: [...new Set(titleFunctionsByGame.get(game.id))].sort((a, b) => a - b),
        launchEdges,
        launchMapped: launchEdges.length > 0,
        payloadCount: payloads.length,
        nativeUsageVerified: payloads.length > 0 && payloads.every(row => row.nativeUsageVerified),
        payloadHandlerRvas: handlerRvas,
        payloadDispatcherIndexes: dispatcherIndexes,
        catalogAssignmentConflict: payloads.some(row => row.catalogAssignmentConflict),
        moduleCandidates,
        ownershipVerified: false,
        migration: queueRecord.migration,
        verification: queueRecord.verification,
        migrationComplete: queueRecord.migrationComplete,
        verificationComplete: queueRecord.verificationComplete,
        migrationEvidence: queueRecord.migrationEvidence,
        migrationPhase: queueRecord.migrationPhase,
        originalComplete: queueRecord.originalComplete
    };
});

const handlerGroups = new Map();
for (const record of records) {
    for (const handlerRva of record.payloadHandlerRvas) {
        if (!handlerGroups.has(handlerRva)) handlerGroups.set(handlerRva, []);
        handlerGroups.get(handlerRva).push(record.id);
    }
}
const groups = [...handlerGroups].map(([handlerRva, gameIds]) => ({
    handlerRva,
    gameIds,
    names: gameIds.map(id => records.find(record => record.id === id).name),
    catalogAssignmentConflict: gameIds.length > 1,
    ownershipVerified: false
})).sort((a, b) => a.handlerRva - b.handlerRva);

const result = {
    version: 1,
    source: 'output/pk32-reference/native-ownership.json',
    policy: {
        codeLocalityProvesOwnership: false,
        launchEdgeProvesOwnership: false,
        ownershipRequires: 'menu/object event edge and payload handler edge must converge on the same game module',
        originalCompletePromoted: false
    },
    summary: {
        games: records.length,
        titleReferenced: records.filter(record => record.titleReferenceFunctions.length).length,
        launchMapped: records.filter(record => record.launchMapped).length,
        nativePayloadGames: records.filter(record => record.payloadCount).length,
        nativeUsageVerifiedGames: records.filter(record => record.nativeUsageVerified).length,
        handlerGroups: groups.length,
        sharedHandlerGroups: groups.filter(group => group.catalogAssignmentConflict).length,
        catalogAssignmentConflictGames: records.filter(record => record.catalogAssignmentConflict).length,
        ownershipVerified: 0,
        assetsMigrated: records.filter(record => record.migration.assetsMigrated).length,
        levelsMigrated: records.filter(record => record.migration.levelsMigrated).length,
        adapterPlayableMigrated: records.filter(record => record.migration.adapterPlayableMigrated).length,
        rulesMigrated: records.filter(record => record.migration.rulesMigrated).length,
        fullFlowMigrated: records.filter(record => record.migration.fullFlowMigrated).length,
        sharedResourcePackagesBound: records.filter(record => record.migrationEvidence && record.migrationEvidence.resourcePackageBound).length,
        gameSpecificAssetMappings: records.filter(record => record.migrationEvidence && record.migrationEvidence.gameSpecificAssetMapping).length,
        migrationComplete: records.filter(record => record.migrationComplete).length,
        verificationComplete: records.filter(record => record.verificationComplete).length,
        payloadMigration: records.filter(record => record.migrationPhase === 'payload-migration').length,
        partialContentMigration: records.filter(record => record.migrationPhase === 'partial-content-migration').length,
        originalComplete: records.filter(record => record.originalComplete).length
    },
    handlerGroups: groups,
    records
};

const output = path.join(root, 'output/pk32-reference/native-migration-map.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
const publicStatus = {
    version: 1,
    summary: result.summary,
    records: records.map(record => ({
        id: record.id,
        name: record.name,
        migration: record.migration,
        verification: record.verification,
        migrationComplete: record.migrationComplete,
        verificationComplete: record.verificationComplete,
        migrationEvidence: record.migrationEvidence,
        migrationPhase: record.migrationPhase,
        originalComplete: record.originalComplete
    }))
};
const publicOutput = path.join(root, 'public/data/pk32-migration-status.json');
fs.writeFileSync(publicOutput, JSON.stringify(publicStatus, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), publicOutput: path.relative(root, publicOutput), ...result.summary }));
