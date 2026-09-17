'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const publicData = path.join(root, 'public', 'data');
const publicImageRoot = path.join(root, 'public', 'img', 'pk32', 'original');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

const audit = readJson(path.join(reference, 'extraction-audit.json'), { images: [] });
const catalog = readJson(path.join(publicData, 'pk32-native-catalog.json'), { records: [] });
const structured = readJson(path.join(publicData, 'pk32-structured-payloads.json'), { games: [] });
const charGrids = readJson(path.join(publicData, 'pk32-char-grid-candidates.json'), { groups: [] });
const imageFiles = new Set(fs.existsSync(publicImageRoot) ? fs.readdirSync(publicImageRoot) : []);
const atlases = (audit.images || []).map(image => {
  const png = image.file.replace(/\.bmp$/i, '.png');
  return {
    id: path.basename(png, '.png'),
    sourceFile: image.file,
    path: '/img/pk32/original/' + png,
    width: image.width,
    height: image.height,
    bits: image.bits,
    sha256: image.sha256,
    sourceBytesVerified: image.sourceBytesVerified === true,
    available: imageFiles.has(png),
    binding: 'shared-module-atlas'
  };
});
const structuredById = new Map((structured.games || []).map(game => [game.id, game]));
const charGridsById = new Map((charGrids.groups || []).filter(group => group.sectionId).map(group => [group.sectionId, group]));

const records = (catalog.records || []).map(record => {
  const structuredRecord = structuredById.get(record.id);
  const charGridRecord = charGridsById.get(record.id);
  return {
    id: record.id,
    name: record.name,
    group: record.group,
    assetBinding: 'shared-module-atlas',
    gameSpecificAssetMapping: false,
    atlasIds: atlases.filter(atlas => atlas.available).map(atlas => atlas.id),
    nativePayloadCount: record.payloadCount || 0,
    structuredPayloadCount: structuredRecord ? structuredRecord.decodedPayloadCount || 0 : 0,
    charGridCandidateCount: charGridRecord ? charGridRecord.count || 0 : 0,
    helpTextCount: Array.isArray(record.help) ? record.help.length : 0,
    resourcePackageBound: atlases.some(atlas => atlas.available) || (record.payloadCount || 0) > 0 || !!structuredRecord || !!charGridRecord
  };
});

const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    sharedAtlasBindingIsContentMigration: true,
    sharedAtlasBindingDoesNotProveGameSpecificSpriteOwnership: true,
    gameSpecificAssetMappingRequiresManualOrNativeObjectEvidence: true
  },
  source: [
    'output/pk32-reference/extraction-audit.json',
    'public/data/pk32-native-catalog.json',
    'public/data/pk32-structured-payloads.json'
  ],
  summary: {
    games: records.length,
    atlases: atlases.length,
    availableAtlases: atlases.filter(atlas => atlas.available).length,
    sharedResourcePackagesBound: records.filter(record => record.resourcePackageBound).length,
    gameSpecificAssetMappings: records.filter(record => record.gameSpecificAssetMapping).length,
    charGridCandidateGames: records.filter(record => record.charGridCandidateCount).length,
    charGridCandidates: records.reduce((sum, record) => sum + record.charGridCandidateCount, 0),
    sourceBytesVerifiedAtlases: atlases.filter(atlas => atlas.sourceBytesVerified).length
  },
  atlases,
  records
};

const output = path.join(publicData, 'pk32-resource-manifest.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...result.summary }));
