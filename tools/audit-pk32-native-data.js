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
  rows.push({
    file,
    name: data.name || null,
    nativeLevelCount: Number.isInteger(data.nativeLevelCount) ? data.nativeLevelCount : null,
    extractedPayloadCount: Number.isInteger(data.extractedPayloadCount) ? data.extractedPayloadCount : levels.length,
    records: levels.length,
    malformedRecords: malformed.length,
    orderedOffsets: offsets.every((value, index) => index === 0 || value > offsets[index - 1]),
    completeByCount: Number.isInteger(data.nativeLevelCount) && data.nativeLevelCount === levels.length,
    status: malformed.length || !offsets.every((value, index) => index === 0 || value > offsets[index - 1]) ? 'needs-review' : 'valid-data-shape'
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
