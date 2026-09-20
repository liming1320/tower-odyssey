'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const queue = JSON.parse(fs.readFileSync(path.join(reference, 'migration-queue.json'), 'utf8'));
const structured = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-structured-payloads.json'), 'utf8'));
const resources = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-resource-manifest.json'), 'utf8'));
const runtimeEvidenceFile = path.join(reference, 'runtime-representative-evidence.json');
const runtimeEvidence = fs.existsSync(runtimeEvidenceFile) ? JSON.parse(fs.readFileSync(runtimeEvidenceFile, 'utf8')) : null;
const runtimeByIndex = new Map((runtimeEvidence && runtimeEvidence.records || []).map(record => [Number(record.uiPosition), record]));

function usableRuntimeEvidence(record) {
  return record && record.status === 'captured-unverified' && record.runtimeDeltaCaptured === true;
}

const structuredById = new Map();
for (const group of structured.groups || []) {
  for (const game of group.games || []) structuredById.set(game.id, {
    family: group.family,
    semanticsVerified: group.semanticsVerified === true,
    payloadCount: game.payloadCount || 0
  });
}

const resourceById = new Map((resources.records || []).map(record => [record.id, record]));
const groupMap = new Map();

function resourceFamily(record) {
  const resource = resourceById.get(record.id);
  if (!resource) return 'none';
  if (resource.gameSpecificAssetMapping === true) {
    return 'game-specific:' + (resource.atlasIds || []).slice().sort().join(',');
  }
  return 'shared-atlas:' + (resource.atlasIds || []).length;
}

function adapterFamily(record, payload) {
  if (record.migrationEvidence && record.migrationEvidence.dedicatedAdapterBound) return 'dedicated-adapter';
  if (payload) return 'structured-payload-candidate';
  if (record.migrationEvidence && record.migrationEvidence.genericAdapterBound) return 'shared-adapter';
  return 'catalog-only';
}

function staticStage(record, payload) {
  const evidence = record.migrationEvidence || {};
  if (record.migration && record.migration.rulesMigrated && record.migration.fullFlowMigrated) return 'static-rule-candidate';
  if (record.migration && record.migration.levelsMigrated && evidence.dedicatedAdapterBound) return 'static-content-candidate';
  if (payload || evidence.dedicatedAdapterBound) return 'static-adapter-candidate';
  if (evidence.resourcePackageBound && record.flowContent) return 'static-evidence-bound';
  return 'catalog-only';
}

for (const record of queue.records || []) {
  const payload = structuredById.get(record.id) || null;
  const payloadFamily = payload ? payload.family : (record.payloadFormatCandidate && record.payloadFormatCandidate.dominantFamily) || 'none';
  const launcherFamily = record.flowContent && Array.isArray(record.flowContent.launcherTypes)
    ? record.flowContent.launcherTypes.slice().sort().join(',') || 'none'
    : 'none';
  const catalogFamily = `${record.group || 'unknown'}:${launcherFamily}`;
  const key = [adapterFamily(record, payload), payloadFamily, resourceFamily(record), catalogFamily].join('|');
  if (!groupMap.has(key)) groupMap.set(key, []);
  groupMap.get(key).push({ record, payload });
}

const groups = [...groupMap.entries()].map(([key, members], index) => {
  const representative = members.find(member => {
    const evidence = member.record.migrationEvidence || {};
    return evidence.dedicatedAdapterBound || member.payload;
  }) || members[0];
  const needsRuntimeSample = members.some(member => {
    const migration = member.record.migration || {};
    return migration.rulesMigrated !== true || migration.fullFlowMigrated !== true;
  });
  const sampledRuntimeRecord = runtimeByIndex.get(representative.record.index) || null;
  return {
    id: `static-group-${String(index + 1).padStart(3, '0')}`,
    key,
    gameCount: members.length,
    representative: {
      id: representative.record.id,
      index: representative.record.index,
      name: representative.record.name
    },
    runtimeSampleStatus: sampledRuntimeRecord ? sampledRuntimeRecord.status : 'not-sampled',
    runtimeEvidence: usableRuntimeEvidence(sampledRuntimeRecord) ? {
      status: sampledRuntimeRecord.status,
      directory: sampledRuntimeRecord.directory,
      delta: sampledRuntimeRecord.delta || null,
      titleMatches: sampledRuntimeRecord.titleMatches || [],
      resourceSignatures: sampledRuntimeRecord.resourceSignatures || []
    } : null,
    runtimeSamplePolicy: needsRuntimeSample ? 'one-representative-per-static-group' : 'not-required-by-static-evidence',
    runtimeSampleCount: needsRuntimeSample ? 1 : 0,
    games: members.map(member => ({
      id: member.record.id,
      index: member.record.index,
      name: member.record.name,
      staticStage: staticStage(member.record, member.payload),
      adapterReuseCandidate: members.length > 1,
      runtimeSampleRequired: needsRuntimeSample && member.record.id === representative.record.id,
      migrationComplete: false,
      originalComplete: false
    }))
  };
}).sort((left, right) => right.gameCount - left.gameCount || left.id.localeCompare(right.id));

const games = groups.flatMap(group => group.games);
const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    staticExtractionFirst: true,
    runtimeSamplingIsRepresentativeOnly: true,
    noPerGameRuntimeRequirement: true,
    adapterReuseRequiresSameStaticGroup: true,
    doesNotPromoteMigrationCompletion: true,
    doesNotPromoteOriginalCompletion: true
  },
  source: [
    'output/pk32-reference/migration-queue.json',
    'public/data/pk32-structured-payloads.json',
    'public/data/pk32-resource-manifest.json'
    ,...(runtimeEvidence ? ['output/pk32-reference/runtime-representative-evidence.json'] : [])
  ],
  summary: {
    games: games.length,
    groups: groups.length,
    adapterReuseCandidates: games.filter(game => game.adapterReuseCandidate).length,
    runtimeRepresentatives: groups.reduce((sum, group) => sum + group.runtimeSampleCount, 0),
    runtimeEvidenceBoundGroups: groups.filter(group => group.runtimeEvidence).length,
    runtimeSampleFailedGroups: groups.filter(group => group.runtimeSampleStatus !== 'captured-unverified' && group.runtimeSampleStatus !== 'not-sampled').length,
    staticStages: Object.fromEntries([...new Set(games.map(game => game.staticStage))].map(stage => [stage, games.filter(game => game.staticStage === stage).length])),
    migrationComplete: 0,
    originalComplete: 0
  },
  groups
};

const output = path.join(reference, 'static-migration-groups.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...result.summary }));
