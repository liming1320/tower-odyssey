const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32-variants.js'), 'utf8');
const namesMatch = source.match(/const NAMES = '([^']+)'\.split\('\|'\);/);
if (!namesMatch) throw new Error('cannot locate PK32 variant names');
const names = namesMatch[1].split('|');
const specialNames = new Set(Array.from(source.matchAll(/config\.name === '([^']+)'/g), match => match[1]));
const modeNames = {};
for (const match of source.matchAll(/const ([A-Z0-9_]+) = new Set\('([^']*)'\.split\('\|'\)\);/g)) {
  for (const name of match[2].split('|').filter(Boolean)) modeNames[name] = match[1].toLowerCase();
}
const dataDir = path.join(root, 'public', 'data');
const dataByName = new Map();
for (const file of fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name))) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (data.name) dataByName.set(data.name, { file, records: Array.isArray(data.levels) ? data.levels.length : 0, nativeLevelCount: data.nativeLevelCount || null });
  } catch (_) {}
}
const rows = names.map((name, index) => {
  const data = dataByName.get(name);
  const renderer = specialNames.has(name) ? 'native-renderer' : (modeNames[name] ? 'mode-renderer' : 'generic-renderer');
  return { index: index + 1, name, renderer, mode: modeNames[name] || 'action', nativeData: data || null };
});
const result = {
  games: rows.length,
  nativeRenderer: rows.filter(row => row.renderer === 'native-renderer').length,
  modeRenderer: rows.filter(row => row.renderer === 'mode-renderer').length,
  genericRenderer: rows.filter(row => row.renderer === 'generic-renderer').length,
  withNativeData: rows.filter(row => row.nativeData).length,
  rows
};
console.log(JSON.stringify(result, null, 2));
