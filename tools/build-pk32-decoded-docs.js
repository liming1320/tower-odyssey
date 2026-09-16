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
  const hasDecodedLevels = playableLevelFiles.length > 0;
  const hasStructuredPayloads = !!structuredRecord;
  const canAutoBindContent = hasDecodedLevels && hasDedicatedAdapter;
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
      sharedAtlasCount: record.migrationEvidence && record.migrationEvidence.sharedAtlasCount || 0,
      gameSpecificAssetMapping: record.migrationEvidence && record.migrationEvidence.gameSpecificAssetMapping === true
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
    gameSpecificAssetMappings: records.filter(record => record.resources.gameSpecificAssetMapping).length,
    assetsMigrated: records.filter(record => record.migration.assetsMigrated).length,
    levelsMigrated: records.filter(record => record.migration.levelsMigrated).length,
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
  '| Games with game-specific asset mapping | ' + result.summary.gameSpecificAssetMappings + ' |',
  '| Assets migrated | ' + result.summary.assetsMigrated + ' |',
  '| Levels migrated | ' + result.summary.levelsMigrated + ' |',
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
  '| ID | Name | Phase | Resource package | Level files | Structured payloads | Native payloads | Auto-bind | Migration complete | Verification complete | Blockers |',
  '| --- | --- | --- | --- | ---: | --- | ---: | --- | --- | --- | --- |',
  ...records.map(record => '| ' + [
    record.id,
    record.name,
    record.migrationPhase,
    record.resources.packageBound ? 'shared atlases ' + record.resources.sharedAtlasCount : '',
    record.levelFiles.length,
    record.structuredPayloads ? record.structuredPayloads.family + ' / ' + record.structuredPayloads.payloads : '',
    record.native.payloadCount,
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
