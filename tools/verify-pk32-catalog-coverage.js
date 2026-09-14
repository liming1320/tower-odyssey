'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const source = fs.readFileSync(path.join(root, 'public/js/minigames/pk32.js'), 'utf8');
const match = source.match(/'([^']+)'\s*\r?\n\s*\)\.split\('\|'\);/);
assert.ok(match, 'PK32 main catalog list not found');
const names = match[1].split('|');
assert.equal(catalog.total, 213);
assert.equal(catalog.records.length, 213);
assert.equal(names.length, 213);
assert.equal(new Set(names).size, names.length);
assert.equal(new Set(catalog.records.map(record => record.name)).size, catalog.records.length);
const catalogNames = new Set(catalog.records.map(record => record.name));
const entryNames = new Set(names);
assert.deepEqual([...entryNames].filter(name => !catalogNames.has(name)), []);
assert.deepEqual([...catalogNames].filter(name => !entryNames.has(name)), []);
const dataFiles = fs.readdirSync(path.join(root, 'public/data')).filter(file => /^pk32-.*-levels\.json$/.test(file));
const nativeDataNames = new Set();
for (const file of dataFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data', file), 'utf8'));
  if (data.name) nativeDataNames.add(data.name);
}
const variantSource = fs.readFileSync(path.join(root, 'public/js/minigames/pk32-variants.js'), 'utf8');
const nativeRendererNames = new Set([...variantSource.matchAll(/config\.name === '([^']+)'/g)].map(item => item[1]));
console.log(JSON.stringify({ catalog: names.length, nativeData: [...nativeDataNames].filter(name => entryNames.has(name)).length, nativeRenderer: [...nativeRendererNames].filter(name => entryNames.has(name)).length, rulesVerified: 0, unverified: names.length, fullGameRulesVerified: false }));
