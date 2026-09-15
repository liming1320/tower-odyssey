const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const files = fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name)).sort();
const rows = [];
for (const file of files) {
  const full = path.join(dataDir, file);
  let data;
  try { data = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (error) {
    rows.push({ file, status: 'invalid-json', error: error.message });
    continue;
  }
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const malformed = levels.filter(level => !level || typeof level.cells !== 'string' || !/^\d+$/.test(level.cells));
  const offsets = levels.map(level => level && level.offset).filter(Number.isInteger);
  const name = typeof data.name === 'string' && data.name.trim() ? data.name : null;
  const declaredPayloadCount = Number.isInteger(data.extractedPayloadCount) ? data.extractedPayloadCount : null;
  const duplicateOffsets = offsets.length !== new Set(offsets).size;
  const sourceOrder = offsets.every((value, index) => index === 0 || value > offsets[index - 1]);
  const issues = [];
  if (!name) issues.push('missing-game-name');
  if (!levels.length) issues.push('empty-level-set');
  if (malformed.length) issues.push('malformed-payload');
  if (declaredPayloadCount != null && declaredPayloadCount !== levels.length) issues.push('declared-payload-count-mismatch');
  if (offsets.length !== levels.length) issues.push('missing-source-offset');
  if (duplicateOffsets) issues.push('duplicate-source-offset');
  rows.push({
    file,
    name,
    nativeLevelCount: Number.isInteger(data.nativeLevelCount) ? data.nativeLevelCount : null,
    extractedPayloadCount: declaredPayloadCount == null ? levels.length : declaredPayloadCount,
    records: levels.length,
    malformedRecords: malformed.length,
    sourceOffsetsPresent: offsets.length === levels.length,
    sourceOrder,
    duplicateOffsets,
    completeByCount: Number.isInteger(data.nativeLevelCount) && data.nativeLevelCount === levels.length,
    issues,
    status: issues.length ? 'needs-review' : 'valid-data-shape'
  });
}
const result = {
  files: rows.length,
  validDataShape: rows.filter(row => row.status === 'valid-data-shape').length,
  needsReview: rows.filter(row => row.status !== 'valid-data-shape').length,
  countComplete: rows.filter(row => row.completeByCount).length,
  rows
};
console.log(JSON.stringify(result, null, 2));
