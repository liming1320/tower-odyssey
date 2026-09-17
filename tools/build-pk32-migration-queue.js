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
const catalogEvidenceAdapterBound = /data-pk32-evidence/.test(source);
const sharedPcodeMetadataBound = fs.existsSync(path.join(reference, 'pcode', '_INDEX.txt'));
const titleReferencedByGame = new Set();
for (const row of nativeOwnership && nativeOwnership.titleReferenceFunctions || []) {
    for (const game of row.games || []) titleReferencedByGame.add(game.gameId);
}
const launchMappedByGame = new Set();
for (const edge of nativeOwnership && nativeOwnership.launchEdges || []) {
    for (const game of edge.games || []) launchMappedByGame.add(game.gameId);
}

const dataDir = path.join(root, 'public', 'data');
const dataByName = new Map();
const candidateDataByName = new Map();
const nativeByName = new Map(nativeCatalog.records.map(record => [record.name, record]));
const levelFileNameFallbacks = new Map([
    ['pk32-sokoban4-levels.json', '推箱子四']
]);
for (const file of fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name))) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        const dataName = data.name || levelFileNameFallbacks.get(file);
        if (dataName) (data.assignmentVerified === false ? candidateDataByName : dataByName).set(dataName, {
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
const resourceManifestFile = path.join(dataDir, 'pk32-resource-manifest.json');
const resourceManifest = fs.existsSync(resourceManifestFile) ? JSON.parse(fs.readFileSync(resourceManifestFile, 'utf8')) : null;
const resourceById = new Map((resourceManifest && resourceManifest.records || []).map(record => [record.id, record]));
const nativeById = new Map(nativeCatalog.records.map(record => [record.id, record]));
const runtimeMethodEvidenceFile = path.join(reference, 'runtime-method-evidence.json');
const runtimeMethodEvidence = fs.existsSync(runtimeMethodEvidenceFile) ? JSON.parse(fs.readFileSync(runtimeMethodEvidenceFile, 'utf8')) : null;
const sharedRuntimeMethodTableBound = !!(runtimeMethodEvidence && runtimeMethodEvidence.summary && runtimeMethodEvidence.summary.objectsWithRuntimeMethodTables > 0);
const runtimePcodeSlicesFile = path.join(reference, 'runtime-pcode-slices.json');
const runtimePcodeSlices = fs.existsSync(runtimePcodeSlicesFile) ? JSON.parse(fs.readFileSync(runtimePcodeSlicesFile, 'utf8')) : null;
const sharedRuntimePcodeSlicesBound = !!(runtimePcodeSlices && runtimePcodeSlices.summary && runtimePcodeSlices.summary.trustedPcodeSlices > 0);
const structuredRulesMigrated = new Set(['扩展线路', '马跳棋盘', '数独', '平面魔方', '吃豆子', '彩球连线', '移彩球', '跳跃棋', '跳棋二', '拼疑犯', '反应测试', '24点二', '21点二', '记忆考验', '汉诺塔', '老虎机', '三张牌', '梭哈六', '海豚骰', '彩球迷宫']);
const boardRulesMigrated = new Set(['井字牌', '黑白棋', '跳棋', '五子棋', '斗兽棋', '四子棋']);
const nativeAdapterRulesMigrated = new Set([
    '强手棋', '接水管', '同色方块', '华容道', '智慧之光', '电磁彩球', '魔法城堡',
    '推箱子', '推箱子四', '推箱子五', '连结电线二', '像素岛', '禅宗花园', '禅宗迷宫', '航海迷题', '下一百层', '打砖块', '海底寻宝',
    '爆破彩球', '七盏灯', '交换彩球', '碰撞彩球', '反射镜'
]);
const nativeAdapterPlayableMigrated = new Set([
    ...nativeAdapterRulesMigrated,
    '魔塔', '魔塔二', '魔塔三', '魔塔四',
    '独粒钻石', '建筑制造', '上一百层', '飞一百米', '魔法城堡二', '摘花朵', '木乃伊', '同步移动', '坦克大战', '宇宙黑洞', '七巧板', '立体魔方二', '跟花二'
]);
const embeddedLevelAdapterMigrated = new Set(['魔塔', '魔塔二', '魔塔三', '魔塔四']);
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
    const resources = resourceById.get(record.id) || null;
    const native = nativeById.get(record.id) || nativeByName.get(record.name) || null;
    const name = native && native.name || resources && resources.name || record.name;
    const data = dataByName.get(name) || dataByName.get(record.name) || null;
    const candidateData = candidateDataByName.get(name) || candidateDataByName.get(record.name) || null;
    const nativePayloadCount = native && Array.isArray(native.nativePayloads) ? native.nativePayloads.length : 0;
    const renderer = rendererNames.has(name) ? 'dedicated-or-board' : record.launcher ? 'shared-mode-or-placeholder' : 'none';
    const titleReferenceBound = titleReferencedByGame.has(record.id);
    const launchEvidenceBound = launchMappedByGame.has(record.id);
    const helpTextEvidenceBound = !!(native && Array.isArray(native.help) && native.help.length);
    const evidenceConfidence = renderer === 'dedicated-or-board' || data || candidateData || nativePayloadCount ? 'content-bound'
        : titleReferenceBound && launchEvidenceBound && helpTextEvidenceBound ? 'catalog-launch-help'
        : titleReferenceBound && launchEvidenceBound ? 'catalog-launch'
        : titleReferenceBound || helpTextEvidenceBound ? 'catalog-text'
        : 'catalog-only';
    const migration = {
        assetsMigrated: record.assetsMigrated === true || record.originalAssetsVerified === true || (resources && resources.resourcePackageBound === true),
        levelsMigrated: record.levelsMigrated === true || record.originalLevelsVerified === true || !!(data && data.recordsArePlayableLevels !== false) || embeddedLevelAdapterMigrated.has(name) || !!(candidateData && structuredRulesMigrated.has(name)) || boardRulesMigrated.has(name),
        adapterPlayableMigrated: nativeAdapterPlayableMigrated.has(name) || structuredRulesMigrated.has(name) || boardRulesMigrated.has(name),
        rulesMigrated: record.rulesMigrated === true || record.originalRulesVerified === true || structuredRulesMigrated.has(name) || boardRulesMigrated.has(name) || nativeAdapterRulesMigrated.has(name),
        fullFlowMigrated: record.fullFlowMigrated === true || record.originalComplete === true,
        evidenceAdapterMigrated: catalogEvidenceAdapterBound
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
        catalogEvidenceAdapterBound,
        titleReferenceBound,
        launchEvidenceBound,
        helpTextEvidenceBound,
        sharedPcodeMetadataBound,
        sharedRuntimeMethodTableBound,
        runtimeMethodEntries: runtimeMethodEvidence && runtimeMethodEvidence.summary ? runtimeMethodEvidence.summary.methodEntries || 0 : 0,
        runtimeMethodRegionTargets: runtimeMethodEvidence && runtimeMethodEvidence.summary ? runtimeMethodEvidence.summary.entriesWithRegionTargets || 0 : 0,
        sharedRuntimePcodeSlicesBound,
        runtimePcodeSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.pcodeSlices || 0 : 0,
        runtimePcodeTrustedSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.trustedPcodeSlices || 0 : 0,
        runtimePcodeTerminatedSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.terminatedSlices || 0 : 0,
        runtimePcodeTrustedTerminatedSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.trustedTerminatedSlices || 0 : 0,
        methodBodyCaptured: !!(runtimePcodeSlices && runtimePcodeSlices.summary && runtimePcodeSlices.summary.methodBodyCaptured),
        evidenceConfidence,
        resourcePackageBound: resources ? resources.resourcePackageBound === true : false,
        sharedAtlasCount: resources ? resources.atlasIds.length : 0,
        gameSpecificAssetMapping: resources ? resources.gameSpecificAssetMapping === true : false,
        charGridCandidatesBound: resources ? (resources.charGridCandidateCount || 0) > 0 : false,
        charGridCandidateCount: resources ? resources.charGridCandidateCount || 0 : 0,
        dedicatedAdapterBound: renderer === 'dedicated-or-board',
        candidateDataRendererBound: !!candidateData && renderer === 'dedicated-or-board',
        contentComplete: migration.migrationComplete,
        verificationComplete: verification.verificationComplete,
        rulesMigratedByStructureFamily: structuredRulesMigrated.has(name) && candidateData ? candidateData.dataKind : null,
        rulesMigratedByBoardEngine: boardRulesMigrated.has(name),
        rulesMigratedByNativeAdapter: nativeAdapterRulesMigrated.has(name),
        embeddedLevelAdapterBound: embeddedLevelAdapterMigrated.has(name),
        playableNativeAdapterBound: nativeAdapterPlayableMigrated.has(name),
        playableAdapterBound: nativeAdapterPlayableMigrated.has(name) || structuredRulesMigrated.has(name) || boardRulesMigrated.has(name)
    };
    const migrationPhase = verification.verificationComplete ? 'verification-complete'
        : migration.migrationComplete ? 'content-migration-complete'
        : migrationEvidence.dedicatedAdapterBound ? 'partial-content-migration'
        : migrationEvidence.structuredPayloadsBound || migrationEvidence.rawPayloadsBound ? 'payload-migration'
        : migrationEvidence.catalogEvidenceAdapterBound ? 'evidence-adapter-migration'
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
    else if (migration.adapterPlayableMigrated) status = 'adapter-playable-needs-original-evidence';
    else if (migration.evidenceAdapterMigrated) status = 'catalog-evidence-adapter-bound';
    else if (renderer === 'shared-mode-or-placeholder') status = 'renderer-needs-original-evidence';
    return {
        id: record.id,
        index: record.index,
        name,
        group: record.group,
        engineGroup: 'vb5-pk32-shared-host',
        sourceExePath: inventory.engineGroups[0] && inventory.engineGroups[0].executable,
        migrationStatus: status,
        data: data,
        candidateData,
        resources,
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
    resourceManifest: resourceManifest ? {
        file: 'public/data/pk32-resource-manifest.json',
        atlases: resourceManifest.summary.availableAtlases,
        sharedResourcePackagesBound: resourceManifest.summary.sharedResourcePackagesBound,
        gameSpecificAssetMappings: resourceManifest.summary.gameSpecificAssetMappings
    } : null,
    summary: {
        total: rows.length,
        originalComplete: rows.filter(row => row.originalComplete).length,
        migrationComplete: rows.filter(row => row.migrationComplete).length,
        verificationComplete: rows.filter(row => row.verificationComplete).length,
        payloadMigration: rows.filter(row => row.migrationPhase === 'payload-migration').length,
        partialContentMigration: rows.filter(row => row.migrationPhase === 'partial-content-migration').length,
        evidenceAdapterMigration: rows.filter(row => row.migrationPhase === 'evidence-adapter-migration').length,
        catalogMigration: rows.filter(row => row.migrationPhase === 'catalog-migration').length,
        nativeData: rows.filter(row => row.data).length,
        candidateData: rows.filter(row => row.candidateData).length,
        assetsMigrated: rows.filter(row => row.migration.assetsMigrated).length,
        levelsMigrated: rows.filter(row => row.migration.levelsMigrated).length,
        rulesMigrated: rows.filter(row => row.migration.rulesMigrated).length,
        adapterPlayableMigrated: rows.filter(row => row.migration.adapterPlayableMigrated).length,
        fullFlowMigrated: rows.filter(row => row.migration.fullFlowMigrated).length,
        rawNativePayloads: rows.reduce((sum, row) => sum + row.nativePayloadCount, 0),
        awaitingAdapter: rows.filter(row => row.migrationStatus === 'native-payloads-awaiting-adapter').length,
        assignmentReview: rows.filter(row => row.migrationStatus === 'payload-assignment-review' || row.migrationStatus === 'structured-data-assignment-review').length,
        payloadFormatGroups: payloadFormatGroups.length,
        structuredPayloadGames: structuredPayloads ? structuredPayloads.gameCount : 0,
        sharedResourcePackagesBound: rows.filter(row => row.migrationEvidence.resourcePackageBound).length,
        gameSpecificAssetMappings: rows.filter(row => row.migrationEvidence.gameSpecificAssetMapping).length,
        evidenceAdapterMigrated: rows.filter(row => row.migration.evidenceAdapterMigrated).length,
        catalogEvidenceAdapter: rows.filter(row => row.migrationEvidence.catalogEvidenceAdapterBound).length,
        titleReferenceEvidence: rows.filter(row => row.migrationEvidence.titleReferenceBound).length,
        launchEvidence: rows.filter(row => row.migrationEvidence.launchEvidenceBound).length,
        helpTextEvidence: rows.filter(row => row.migrationEvidence.helpTextEvidenceBound).length,
        sharedPcodeMetadata: rows.filter(row => row.migrationEvidence.sharedPcodeMetadataBound).length,
        sharedRuntimeMethodTable: rows.filter(row => row.migrationEvidence.sharedRuntimeMethodTableBound).length,
        runtimeMethodEntries: runtimeMethodEvidence && runtimeMethodEvidence.summary ? runtimeMethodEvidence.summary.methodEntries || 0 : 0,
        runtimeMethodRegionTargets: runtimeMethodEvidence && runtimeMethodEvidence.summary ? runtimeMethodEvidence.summary.entriesWithRegionTargets || 0 : 0,
        sharedRuntimePcodeSlices: rows.filter(row => row.migrationEvidence.sharedRuntimePcodeSlicesBound).length,
        runtimePcodeSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.pcodeSlices || 0 : 0,
        runtimePcodeTrustedSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.trustedPcodeSlices || 0 : 0,
        runtimePcodeTerminatedSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.terminatedSlices || 0 : 0,
        runtimePcodeTrustedTerminatedSlices: runtimePcodeSlices && runtimePcodeSlices.summary ? runtimePcodeSlices.summary.trustedTerminatedSlices || 0 : 0,
        methodBodyCaptured: runtimePcodeSlices && runtimePcodeSlices.summary && runtimePcodeSlices.summary.methodBodyCaptured ? 1 : 0,
        charGridCandidateGames: rows.filter(row => row.migrationEvidence.charGridCandidatesBound).length,
        charGridCandidates: rows.reduce((sum, row) => sum + row.migrationEvidence.charGridCandidateCount, 0),
        candidateDataRenderer: rows.filter(row => row.migrationEvidence.candidateDataRendererBound).length,
        dedicatedRenderer: rows.filter(row => row.renderer === 'dedicated-or-board').length,
        needsOriginalEvidence: rows.filter(row => row.migrationStatus !== 'original-complete').length
    },
    records: rows
};

const output = path.join(reference, 'migration-queue.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, ...result.summary }));
