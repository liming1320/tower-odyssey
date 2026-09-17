'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const dataDir = path.join(root, 'public', 'data');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function boolText(value) {
  return value ? 'yes' : 'no';
}

function escapeCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function listLevelFiles() {
  if (!fs.existsSync(dataDir)) return new Map();
  const result = new Map();
  const nameFallbacks = new Map([
    ['pk32-sokoban4-levels.json', '推箱子四']
  ]);
  for (const file of fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name))) {
    const data = readJson(path.join(dataDir, file), null);
    const dataName = data && (data.name || nameFallbacks.get(file));
    if (!dataName) continue;
    if (!result.has(dataName)) result.set(dataName, []);
    result.get(dataName).push({
      file: 'public/data/' + file,
      count: Array.isArray(data.levels) ? data.levels.length : data.count || data.extractedLevelCount || data.extractedPayloadCount || null,
      recordsArePlayableLevels: data.recordsArePlayableLevels !== false,
      fullGameRulesVerified: data.fullGameRulesVerified === true,
      assignmentVerified: data.assignmentVerified !== false,
      dataKind: data.dataKind || 'native-level-records'
    });
  }
  const pegBoards = readJson(path.join(dataDir, 'pk32-peg-native-boards.json'), null);
  if (pegBoards && pegBoards.name && Array.isArray(pegBoards.levels)) {
    if (!result.has(pegBoards.name)) result.set(pegBoards.name, []);
    result.get(pegBoards.name).push({
      file: 'public/data/pk32-peg-native-boards.json',
      count: pegBoards.levels.length,
      recordsArePlayableLevels: true,
      fullGameRulesVerified: pegBoards.fullGameRulesVerified === true,
      assignmentVerified: true,
      dataKind: 'native-initialization-boards'
    });
  }
  return result;
}

const queue = readJson(path.join(reference, 'migration-queue.json'), { records: [], summary: {} });
const nativeCatalog = readJson(path.join(root, 'public', 'data', 'pk32-native-catalog.json'), { records: [] });
const structured = readJson(path.join(root, 'public', 'data', 'pk32-structured-payloads.json'), { games: [], groups: [] });
const nativeMap = readJson(path.join(reference, 'native-migration-map.json'), { records: [], handlerGroups: [] });
const levelFilesByName = listLevelFiles();
const nativeById = new Map((nativeCatalog.records || []).map(record => [record.id, record]));
const structuredById = new Map((structured.games || []).map(record => [record.id, record]));
const nativeMapById = new Map((nativeMap.records || []).map(record => [record.id, record]));

const records = (queue.records || []).map(record => {
  const native = nativeById.get(record.id) || {};
  const structuredRecord = structuredById.get(record.id) || null;
  const mapRecord = nativeMapById.get(record.id) || null;
  const levelFiles = levelFilesByName.get(record.name) || [];
  const playableLevelFiles = levelFiles.filter(file => file.recordsArePlayableLevels && file.assignmentVerified);
  const hasDedicatedAdapter = record.renderer === 'dedicated-or-board';
  const hasResourcePackage = record.migrationEvidence && record.migrationEvidence.resourcePackageBound === true;
  const hasCatalogEvidenceAdapter = record.migrationEvidence && record.migrationEvidence.catalogEvidenceAdapterBound === true;
  const hasTitleReference = record.migrationEvidence && record.migrationEvidence.titleReferenceBound === true;
  const hasLaunchEvidence = record.migrationEvidence && record.migrationEvidence.launchEvidenceBound === true;
  const hasHelpTextEvidence = record.migrationEvidence && record.migrationEvidence.helpTextEvidenceBound === true;
  const hasSharedPcodeMetadata = record.migrationEvidence && record.migrationEvidence.sharedPcodeMetadataBound === true;
  const hasSharedRuntimeMethodTable = record.migrationEvidence && record.migrationEvidence.sharedRuntimeMethodTableBound === true;
  const hasCharGridCandidates = record.migrationEvidence && record.migrationEvidence.charGridCandidatesBound === true;
  const hasEmbeddedLevelAdapter = record.migrationEvidence && record.migrationEvidence.embeddedLevelAdapterBound === true;
  const hasCandidateDataRenderer = record.migrationEvidence && record.migrationEvidence.candidateDataRendererBound === true;
  const hasDecodedLevels = playableLevelFiles.length > 0;
  const hasStructuredPayloads = !!structuredRecord;
  const canAutoBindContent = (hasDecodedLevels || hasEmbeddedLevelAdapter) && hasDedicatedAdapter;
  const canAutoCompleteMigration = record.migrationComplete === true;
  const blockers = [];
  if (!hasDecodedLevels && !hasStructuredPayloads && !(native.payloadCount > 0)) blockers.push('no decoded content');
  if (hasStructuredPayloads && structuredRecord.recordsArePlayableLevels === false) blockers.push('payload semantics not level-ready');
  if (!hasDedicatedAdapter) blockers.push('no dedicated adapter');
  if (!record.migration.rulesMigrated) blockers.push('rules not fully migrated');
  if (!record.migration.fullFlowMigrated) blockers.push('full flow not migrated');
  return {
    id: record.id,
    index: record.index,
    name: record.name,
    group: record.group,
    launcher: record.launcher,
    renderer: record.renderer,
    migrationPhase: record.migrationPhase,
    migration: record.migration,
    verification: record.verification,
    originalComplete: record.originalComplete,
    native: {
      titleFound: native.titleFound === true,
      levelCount: native.levelCount == null ? null : native.levelCount,
      levelCountBasis: native.levelCountBasis || null,
      payloadCount: native.payloadCount || 0,
      payloadProfile: native.payloadProfile || null,
      payloadAssignment: native.payloadAssignment || null
    },
    resources: {
      packageBound: hasResourcePackage,
      catalogEvidenceAdapter: hasCatalogEvidenceAdapter,
      titleReference: hasTitleReference,
      launchEvidence: hasLaunchEvidence,
      helpTextEvidence: hasHelpTextEvidence,
      sharedPcodeMetadata: hasSharedPcodeMetadata,
      sharedRuntimeMethodTable: hasSharedRuntimeMethodTable,
      runtimeMethodEntries: record.migrationEvidence && record.migrationEvidence.runtimeMethodEntries || 0,
      runtimeMethodRegionTargets: record.migrationEvidence && record.migrationEvidence.runtimeMethodRegionTargets || 0,
      runtimePcodeSlices: record.migrationEvidence && record.migrationEvidence.runtimePcodeSlices || 0,
      runtimePcodeTrustedSlices: record.migrationEvidence && record.migrationEvidence.runtimePcodeTrustedSlices || 0,
      runtimePcodeTerminatedSlices: record.migrationEvidence && record.migrationEvidence.runtimePcodeTerminatedSlices || 0,
      methodBodyCaptured: record.migrationEvidence && record.migrationEvidence.methodBodyCaptured === true,
      charGridCandidateCount: record.migrationEvidence && record.migrationEvidence.charGridCandidateCount || 0,
      charGridCandidates: hasCharGridCandidates,
      evidenceConfidence: record.migrationEvidence && record.migrationEvidence.evidenceConfidence || 'unknown',
      sharedAtlasCount: record.migrationEvidence && record.migrationEvidence.sharedAtlasCount || 0,
      gameSpecificAssetMapping: record.migrationEvidence && record.migrationEvidence.gameSpecificAssetMapping === true,
      embeddedLevelAdapter: hasEmbeddedLevelAdapter,
      candidateDataRenderer: hasCandidateDataRenderer
    },
    structuredPayloads: structuredRecord ? {
      file: 'public/data/pk32-structured-payloads.json',
      family: structuredRecord.dominantFamily,
      payloads: structuredRecord.decodedPayloadCount,
      nativeUsageVerified: structuredRecord.nativeUsageVerified === true,
      ownershipVerified: structuredRecord.ownershipVerified === true,
      recordsArePlayableLevels: structuredRecord.recordsArePlayableLevels === true,
      fullGameRulesVerified: structuredRecord.fullGameRulesVerified === true
    } : null,
    levelFiles,
    nativeHandlers: mapRecord ? {
      launchMapped: mapRecord.launchMapped === true,
      payloadHandlerRvas: mapRecord.payloadHandlerRvas || [],
      payloadDispatcherIndexes: mapRecord.payloadDispatcherIndexes || [],
      ownershipVerified: mapRecord.ownershipVerified === true
    } : null,
    automation: {
      canAutoBindContent,
      canAutoCompleteMigration,
      blockers
    }
  };
});

const groups = new Map();
for (const record of records) {
  const key = record.structuredPayloads && record.structuredPayloads.family
    || record.native.payloadProfile && record.native.payloadProfile.dominantFamily
    || 'no-payload';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(record);
}

const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: [
    'output/pk32-reference/migration-queue.json',
    'public/data/pk32-native-catalog.json',
    'public/data/pk32-structured-payloads.json',
    'public/data/pk32-*-levels.json'
  ],
  policy: {
    decodedPayloadIsNotPlayableLevel: true,
    migrationCompleteRequiresAssetsLevelsRulesAndFullFlow: true,
    originalCompleteRequiresMigrationAndVerification: true
  },
  summary: {
    games: records.length,
    withLevelFiles: records.filter(record => record.levelFiles.length).length,
    withStructuredPayloads: records.filter(record => record.structuredPayloads).length,
    withNativePayloads: records.filter(record => record.native.payloadCount > 0).length,
    withResourcePackages: records.filter(record => record.resources.packageBound).length,
    withCatalogEvidenceAdapters: records.filter(record => record.resources.catalogEvidenceAdapter).length,
    withTitleReferenceEvidence: records.filter(record => record.resources.titleReference).length,
    withLaunchEvidence: records.filter(record => record.resources.launchEvidence).length,
    withHelpTextEvidence: records.filter(record => record.resources.helpTextEvidence).length,
    withSharedPcodeMetadata: records.filter(record => record.resources.sharedPcodeMetadata).length,
    withSharedRuntimeMethodTables: records.filter(record => record.resources.sharedRuntimeMethodTable).length,
    runtimeMethodEntries: records.reduce((max, record) => Math.max(max, record.resources.runtimeMethodEntries), 0),
    runtimeMethodRegionTargets: records.reduce((max, record) => Math.max(max, record.resources.runtimeMethodRegionTargets), 0),
    runtimePcodeSlices: records.reduce((max, record) => Math.max(max, record.resources.runtimePcodeSlices), 0),
    runtimePcodeTrustedSlices: records.reduce((max, record) => Math.max(max, record.resources.runtimePcodeTrustedSlices), 0),
    runtimePcodeTerminatedSlices: records.reduce((max, record) => Math.max(max, record.resources.runtimePcodeTerminatedSlices), 0),
    methodBodyCaptured: records.filter(record => record.resources.methodBodyCaptured).length,
    withCharGridCandidates: records.filter(record => record.resources.charGridCandidates).length,
    charGridCandidates: records.reduce((sum, record) => sum + record.resources.charGridCandidateCount, 0),
    gameSpecificAssetMappings: records.filter(record => record.resources.gameSpecificAssetMapping).length,
    embeddedLevelAdapters: records.filter(record => record.resources.embeddedLevelAdapter).length,
    candidateDataRenderers: records.filter(record => record.resources.candidateDataRenderer).length,
    assetsMigrated: records.filter(record => record.migration.assetsMigrated).length,
    levelsMigrated: records.filter(record => record.migration.levelsMigrated).length,
    adapterPlayableMigrated: records.filter(record => record.migration.adapterPlayableMigrated).length,
    flowContentMigrated: records.filter(record => record.migration.flowContentMigrated).length,
    rulesMigrated: records.filter(record => record.migration.rulesMigrated).length,
    fullFlowMigrated: records.filter(record => record.migration.fullFlowMigrated).length,
    canAutoBindContent: records.filter(record => record.automation.canAutoBindContent).length,
    migrationComplete: records.filter(record => record.migration.migrationComplete).length,
    verificationComplete: records.filter(record => record.verification.verificationComplete).length,
    originalComplete: records.filter(record => record.originalComplete).length
  },
  payloadGroups: [...groups].map(([family, items]) => ({
    family,
    games: items.length,
    payloads: items.reduce((sum, item) => sum + item.native.payloadCount, 0),
    autoBindableGames: items.filter(item => item.automation.canAutoBindContent).length,
    names: items.map(item => item.name)
  })).sort((a, b) => b.games - a.games || a.family.localeCompare(b.family)),
  records
};

const outputJson = path.join(reference, 'decoded-content-index.json');
fs.mkdirSync(path.dirname(outputJson), { recursive: true });
fs.writeFileSync(outputJson, JSON.stringify(result, null, 2) + '\n');

const docLines = [
  '# PK32 decoded content migration index',
  '',
  '> Generated by `node tools/build-pk32-decoded-docs.js`. This document records decoded evidence and migration readiness; it does not mark a game complete by itself.',
  '',
  '## Summary',
  '',
  '| Metric | Value |',
  '| --- | ---: |',
  '| Games | ' + result.summary.games + ' |',
  '| Games with level data files | ' + result.summary.withLevelFiles + ' |',
  '| Games with structured payloads | ' + result.summary.withStructuredPayloads + ' |',
  '| Games with native payloads | ' + result.summary.withNativePayloads + ' |',
  '| Games with resource packages | ' + result.summary.withResourcePackages + ' |',
  '| Games with catalog evidence adapters | ' + result.summary.withCatalogEvidenceAdapters + ' |',
  '| Games with title-reference evidence | ' + result.summary.withTitleReferenceEvidence + ' |',
  '| Games with launch evidence | ' + result.summary.withLaunchEvidence + ' |',
  '| Games with help-text evidence | ' + result.summary.withHelpTextEvidence + ' |',
  '| Games with shared p-code metadata | ' + result.summary.withSharedPcodeMetadata + ' |',
  '| Games with shared runtime method tables | ' + result.summary.withSharedRuntimeMethodTables + ' |',
  '| Runtime method table entries | ' + result.summary.runtimeMethodEntries + ' |',
  '| Runtime method entries with region targets | ' + result.summary.runtimeMethodRegionTargets + ' |',
  '| Runtime p-code probe slices | ' + result.summary.runtimePcodeSlices + ' |',
  '| Trusted runtime p-code slices | ' + result.summary.runtimePcodeTrustedSlices + ' |',
  '| Runtime p-code probe slices with exit token | ' + result.summary.runtimePcodeTerminatedSlices + ' |',
  '| Method bodies captured | ' + result.summary.methodBodyCaptured + ' |',
  '| Games with char-grid candidates | ' + result.summary.withCharGridCandidates + ' |',
  '| Char-grid candidates | ' + result.summary.charGridCandidates + ' |',
  '| Games with game-specific asset mapping | ' + result.summary.gameSpecificAssetMappings + ' |',
  '| Games with embedded level adapters | ' + result.summary.embeddedLevelAdapters + ' |',
  '| Games with candidate data renderers | ' + result.summary.candidateDataRenderers + ' |',
  '| Assets migrated | ' + result.summary.assetsMigrated + ' |',
  '| Levels migrated | ' + result.summary.levelsMigrated + ' |',
  '| Playable adapters migrated | ' + result.summary.adapterPlayableMigrated + ' |',
  '| Flow/text content migrated | ' + result.summary.flowContentMigrated + ' |',
  '| Rules migrated | ' + result.summary.rulesMigrated + ' |',
  '| Full flow migrated | ' + result.summary.fullFlowMigrated + ' |',
  '| Auto-bindable content games | ' + result.summary.canAutoBindContent + ' |',
  '| Content migration complete | ' + result.summary.migrationComplete + ' |',
  '| Original verification complete | ' + result.summary.verificationComplete + ' |',
  '| Original complete | ' + result.summary.originalComplete + ' |',
  '',
  '## Payload groups',
  '',
  '| Family | Games | Payloads | Auto-bindable |',
  '| --- | ---: | ---: | ---: |',
  ...result.payloadGroups.map(group => '| ' + escapeCell(group.family) + ' | ' + group.games + ' | ' + group.payloads + ' | ' + group.autoBindableGames + ' |'),
  '',
  '## Game readiness',
  '',
  '| ID | Name | Phase | Evidence | Resource package | Level files | Structured payloads | Native payloads | Char grids | Auto-bind | Migration complete | Verification complete | Blockers |',
  '| --- | --- | --- | --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | --- |',
  ...records.map(record => '| ' + [
    record.id,
    record.name,
    record.migrationPhase,
    record.resources.evidenceConfidence,
    record.resources.packageBound ? 'shared atlases ' + record.resources.sharedAtlasCount : '',
    record.levelFiles.length,
    record.structuredPayloads ? record.structuredPayloads.family + ' / ' + record.structuredPayloads.payloads : '',
    record.native.payloadCount,
    record.resources.charGridCandidateCount,
    boolText(record.automation.canAutoBindContent),
    boolText(record.migration.migrationComplete),
    boolText(record.verification.verificationComplete),
    record.automation.blockers.join('; ')
  ].map(escapeCell).join(' | ') + ' |')
];

const docsDir = path.join(root, 'docs');
fs.mkdirSync(docsDir, { recursive: true });
const outputDoc = path.join(docsDir, 'pk32-decoded-content.md');
fs.writeFileSync(outputDoc, docLines.join('\n') + '\n');

console.log(JSON.stringify({
  json: path.relative(root, outputJson),
  doc: path.relative(root, outputDoc),
  ...result.summary
}));
