'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const names = new Set(catalog.records.map(record => record.name));
const files = fs.readdirSync(path.join(root, 'public/data')).filter(file => /^pk32-.*-levels\.json$/.test(file));
const rows = files.map(file => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data', file), 'utf8'));
  assert.ok(typeof data.name === 'string' && names.has(data.name), file + ': invalid catalog name');
  assert.ok(Array.isArray(data.levels) && data.levels.length > 0, file + ': empty levels');
  assert.equal(data.fullGameRulesVerified, false, file + ': completion flag must remain false');
  return { file, name: data.name, levels: data.levels.length };
});
assert.equal(new Set(rows.map(row => row.name)).size, rows.length, 'duplicate native data names');
console.log(JSON.stringify({ files: rows.length, records: rows.reduce((sum, row) => sum + row.levels, 0), names: rows.map(row => row.name), fullGameRulesVerified: false }));
