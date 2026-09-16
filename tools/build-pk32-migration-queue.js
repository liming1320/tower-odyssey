// Build the PK32 migration queue from inventory, native data and renderer evidence.
// Queue status is deliberately conservative: it never promotes a game to complete.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const inventory = JSON.parse(fs.readFileSync(path.join(reference, 'pk32-inventory.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(reference, 'migration-ledger.json'), 'utf8'));
const nativeCatalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-native-catalog.json'), 'utf8'));
const ownershipFile = path.join(reference, 'native-ownership.json');
const nativeOwnership = fs.existsSync(ownershipFile) ? JSON.parse(fs.readFileSync(ownershipFile, 'utf8')) : null;
const ownershipByGame = new Map();
for (const row of nativeOwnership && nativeOwnership.payloadEvidence || []) {
    if (!ownershipByGame.has(row.gameId)) ownershipByGame.set(row.gameId, []);
    ownershipByGame.get(row.gameId).push(row);
}
const source = fs.readFileSync(path.join(root, 'public/js/minigames/pk32.js'), 'utf8');
const variants = fs.readFileSync(path.join(root, 'public/js/minigames/pk32-variants.js'), 'utf8');

const dataDir = path.join(root, 'public', 'data');
const dataByName = new Map();
const candidateDataByName = new Map();
const nativeByName = new Map(nativeCatalog.records.map(record => [record.name, record]));
for (const file of fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name))) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        if (data.name) (data.assignmentVerified === false ? candidateDataByName : dataByName).set(data.name, {
            file,
            levelCount: Array.isArray(data.levels) ? data.levels.length : 0,
            recordCount: Array.isArray(data.levels) ? data.levels.length : 0,
            declaredLevelCount: data.nativeLevelCount || data.extractedLevelCount || data.count || null,
            fullRules: data.fullGameRulesVerified === true,
            dataKind: data.dataKind || 'native-level-records',
            recordsArePlayableLevels: data.recordsArePlayableLevels !== false,
            source: data.source || null
        });
    } catch (_) {}
}
const structuredFile = path.join(dataDir, 'pk32-structured-payloads.json');
const structuredPayloads = fs.existsSync(structuredFile) ? JSON.parse(fs.readFileSync(structuredFile, 'utf8')) : null;
if (structuredPayloads) {
    for (const game of structuredPayloads.games || []) {
        if (dataByName.has(game.name) || candidateDataByName.has(game.name)) continue;
        candidateDataByName.set(game.name, {
            file: 'pk32-structured-payloads.json',
            levelCount: 0,
            recordCount: game.decodedPayloadCount || 0,
            declaredLevelCount: null,
            fullRules: false,
            dataKind: game.dataKind,
            recordsArePlayableLevels: false,
            source: game.source || null
        });
    }
}

// Keep this classification in step with audit-pk32-renderers.js. The variant
// dispatcher is a long ternary expression, so a line-oriented regex misses
// dedicated renderers when formatting changes or branches wrap.
const rendererNames = new Set();
for (const match of source.matchAll(/'([^']+)'\s*:\s*\{\s*family:\s*'[^']+'\s*,\s*id:\s*'([^']+)'/g)) rendererNames.add(match[1]);
for (const match of variants.matchAll(/config\.name === '([^']+)'\s*\?\s*(renderNative[A-Za-z0-9_]*)/g)) rendererNames.add(match[1]);
for (const match of variants.matchAll(/if\s*\(config\.name === '([^']+)'\)\s*return\s+(renderNative[A-Za-z0-9_]*)/g)) rendererNames.add(match[1]);
const catalogContext = { window: { MiniGames: {} } };
vm.createContext(catalogContext);
vm.runInContext(source, catalogContext);
(catalogContext.window.PK32Catalog || []).filter(record => record.dedicated).forEach(record => rendererNames.add(record.name));

// These launchers are separate modules, so they are not visible in the
// variants dispatcher scan above. Keep them explicit until the catalog has
// a machine-readable renderer manifest.
['魔塔', '强手棋', '智慧之光', '独粒钻石', '木乃伊', '电磁彩球', '建筑制造', '同色方块'].forEach(name => rendererNames.add(name));

const rows = ledger.records.map(record => {
    const data = dataByName.get(record.name) || null;
    const candidateData = candidateDataByName.get(record.name) || null;
    const native = nativeByName.get(record.name) || null;
    const nativePayloadCount = native && Array.isArray(native.nativePayloads) ? native.nativePayloads.length : 0;
    const renderer = rendererNames.has(record.name) ? 'dedicated-or-board' : record.launcher ? 'shared-mode-or-placeholder' : 'none';
    const migration = {
        assetsMigrated: record.assetsMigrated === true || record.originalAssetsVerified === true,
        levelsMigrated: record.levelsMigrated === true || record.originalLevelsVerified === true,
        rulesMigrated: record.rulesMigrated === true || record.originalRulesVerified === true,
        fullFlowMigrated: record.fullFlowMigrated === true || record.originalComplete === true
    };
    migration.migrationComplete = migration.assetsMigrated && migration.levelsMigrated && migration.rulesMigrated && migration.fullFlowMigrated;
    const verification = {
        assetsVerified: record.originalAssetsVerified === true,
        levelsVerified: record.originalLevelsVerified === true,
        rulesVerified: record.originalRulesVerified === true,
        fullFlowVerified: record.fullFlowVerified === true || record.originalComplete === true
    };
    verification.verificationComplete = verification.assetsVerified && verification.levelsVerified && verification.rulesVerified && verification.fullFlowVerified;
    const originalComplete = migration.migrationComplete && verification.verificationComplete;
    const ownershipRows = ownershipByGame.get(record.id) || [];
    const migrationEvidence = {
        catalogRegistered: true,
        rawPayloadsBound: nativePayloadCount > 0 && ownershipRows.length === nativePayloadCount && ownershipRows.every(row => row.nativeUsageVerified === true),
        structuredPayloadsBound: !!candidateData,
        dedicatedAdapterBound: renderer === 'dedicated-or-board',
        contentComplete: migration.migrationComplete,
        verificationComplete: verification.verificationComplete
    };
    const migrationPhase = verification.verificationComplete ? 'verification-complete'
        : migration.migrationComplete ? 'content-migration-complete'
        : migrationEvidence.dedicatedAdapterBound ? 'partial-content-migration'
        : migrationEvidence.structuredPayloadsBound || migrationEvidence.rawPayloadsBound ? 'payload-migration'
        : 'catalog-migration';
    let status = 'unstarted';
    if (originalComplete) status = 'original-complete';
    else if (data && data.fullRules && renderer === 'dedicated-or-board') status = 'flow-and-rules-review';
    else if (data && renderer === 'dedicated-or-board') status = 'native-data-dedicated-renderer';
    else if (data) status = 'native-data-needs-rules-and-assets';
    else if (candidateData) status = 'structured-data-assignment-review';
    else if (nativePayloadCount && native && native.payloadAssignment && native.payloadAssignment.confidence === 'low') status = 'payload-assignment-review';
    else if (nativePayloadCount && renderer === 'dedicated-or-board') status = 'native-payloads-dedicated-renderer';
    else if (nativePayloadCount) status = 'native-payloads-awaiting-adapter';
    else if (renderer === 'shared-mode-or-placeholder') status = 'renderer-needs-original-evidence';
    return {
        id: record.id,
        index: record.index,
        name: record.name,
        group: record.group,
        engineGroup: 'vb5-pk32-shared-host',
        sourceExePath: inventory.engineGroups[0] && inventory.engineGroups[0].executable,
        migrationStatus: status,
        data: data,
        candidateData,
        nativePayloadCount,
        nativePayloadLengths: native && native.payloadLengths || {},
        payloadFormatCandidate: native && native.payloadProfile || null,
        payloadAssignment: native && native.payloadAssignment || null,
        renderer,
        launcherVerified: record.launcherVerified === true,
        originalAssetsVerified: record.originalAssetsVerified === true,
        originalLevelsVerified: record.originalLevelsVerified === true,
        originalRulesVerified: record.originalRulesVerified === true,
        migration,
        verification,
        migrationComplete: migration.migrationComplete,
        verificationComplete: verification.verificationComplete,
        migrationEvidence,
        migrationPhase,
        originalComplete,
        nextEvidence: originalComplete ? [] : ['original startup/menu capture', 'asset-to-object mapping', 'observable rule trace', 'complete first-flow verification']
    };
});

const payloadFormatGroups = [];
const groupedRows = new Map();
rows.filter(row => row.migrationStatus === 'native-payloads-awaiting-adapter').forEach(row => {
    const family = row.payloadFormatCandidate && row.payloadFormatCandidate.dominantFamily || 'unclassified';
    if (!groupedRows.has(family)) groupedRows.set(family, []);
    groupedRows.get(family).push(row);
});
groupedRows.forEach((games, family) => {
    payloadFormatGroups.push({
        family,
        semanticsVerified: false,
        gameCount: games.length,
        payloadCount: games.reduce((sum, game) => sum + game.nativePayloadCount, 0),
        games: games.map(game => ({ id: game.id, name: game.name, nativePayloadCount: game.nativePayloadCount }))
    });
});
payloadFormatGroups.sort((a, b) => b.gameCount - a.gameCount || a.family.localeCompare(b.family));

const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: ['pk32-inventory.json', 'migration-ledger.json', 'public/data/pk32-native-catalog.json', 'public/data/pk32-*-levels.json', 'public/js/minigames/pk32.js', 'public/js/minigames/pk32-variants.js'],
    completionRule: 'Content migration and original verification are tracked independently; originalComplete requires both to be complete.',
    engineGroups: inventory.engineGroups,
    payloadFormatGroups,
    structuredPayloadGroups: structuredPayloads && structuredPayloads.groups || [],
    summary: {
        total: rows.length,
        originalComplete: rows.filter(row => row.originalComplete).length,
        migrationComplete: rows.filter(row => row.migrationComplete).length,
        verificationComplete: rows.filter(row => row.verificationComplete).length,
        payloadMigration: rows.filter(row => row.migrationPhase === 'payload-migration').length,
        partialContentMigration: rows.filter(row => row.migrationPhase === 'partial-content-migration').length,
        nativeData: rows.filter(row => row.data).length,
        candidateData: rows.filter(row => row.candidateData).length,
        rawNativePayloads: rows.reduce((sum, row) => sum + row.nativePayloadCount, 0),
        awaitingAdapter: rows.filter(row => row.migrationStatus === 'native-payloads-awaiting-adapter').length,
        assignmentReview: rows.filter(row => row.migrationStatus === 'payload-assignment-review' || row.migrationStatus === 'structured-data-assignment-review').length,
        payloadFormatGroups: payloadFormatGroups.length,
        structuredPayloadGames: structuredPayloads ? structuredPayloads.gameCount : 0,
        dedicatedRenderer: rows.filter(row => row.renderer === 'dedicated-or-board').length,
        needsOriginalEvidence: rows.filter(row => row.migrationStatus !== 'original-complete').length
    },
    records: rows
};

const output = path.join(reference, 'migration-queue.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, ...result.summary }));
