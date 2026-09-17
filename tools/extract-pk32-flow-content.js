'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const sourceFile = path.join(root, 'public', 'js', 'minigames', 'pk32.js');
const nativeFile = path.join(root, 'public', 'data', 'pk32-native-catalog.json');
const stringsFile = path.join(reference, 'strings.json');
const outFile = path.join(root, 'public', 'data', 'pk32-flow-content.json');

const source = fs.readFileSync(sourceFile, 'utf8');
const nativeCatalog = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
const strings = JSON.parse(fs.readFileSync(stringsFile, 'utf8'));
const context = { window: { MiniGames: {} } };
vm.createContext(context);
vm.runInContext(source, context);

const nativeById = new Map(nativeCatalog.records.map(record => [record.id, record]));
const titleRows = new Map();
strings.forEach(row => {
  const text = String(row.text || '');
  if (!text.startsWith('扑克32--')) return;
  const name = text.slice('扑克32--'.length).trim();
  if (!titleRows.has(name)) titleRows.set(name, []);
  titleRows.get(name).push({ offset: row.offset, text });
});

function compactHelp(help) {
  return (Array.isArray(help) ? help : [])
    .map(text => String(text || '').trim())
    .filter(Boolean)
    .slice(0, 24);
}

const records = (context.window.PK32Catalog || []).map(record => {
  const native = nativeById.get(record.id) || {};
  const titles = titleRows.get(record.name) || [];
  const help = compactHelp(native.help);
  const launcherTypes = ['playable', 'module', 'casual', 'action', 'strategy', 'card', 'puzzle', 'variant']
    .filter(key => record[key])
    .map(key => ({ type: key, value: record[key] }));
  return {
    id: record.id,
    index: record.index,
    name: record.name,
    group: record.group,
    titleOffsets: titles.map(row => row.offset),
    titleTexts: titles.map(row => row.text),
    help,
    evidence: record.evidence || '',
    levelText: record.levelText || '',
    launcherTypes,
    nativePayloadCount: native.payloadCount || 0,
    nativeLevelCount: native.levelCount == null ? null : native.levelCount,
    payloadProfile: native.payloadProfile || null,
    contentEvidenceMigrated: titles.length > 0 || help.length > 0 || !!record.evidence || (native.payloadCount || 0) > 0,
    rulesEvidenceMigrated: help.length > 0 || (native.payloadCount || 0) > 0
  };
});

const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: [
    'public/js/minigames/pk32.js',
    'public/data/pk32-native-catalog.json',
    'output/pk32-reference/strings.json'
  ],
  summary: {
    total: records.length,
    contentEvidenceMigrated: records.filter(record => record.contentEvidenceMigrated).length,
    rulesEvidenceMigrated: records.filter(record => record.rulesEvidenceMigrated).length,
    titleBound: records.filter(record => record.titleOffsets.length > 0).length,
    helpBound: records.filter(record => record.help.length > 0).length,
    launcherBound: records.filter(record => record.launcherTypes.length > 0).length
  },
  records
};

result.sourceSha256 = crypto.createHash('sha256').update(JSON.stringify(records.map(record => ({
  id: record.id,
  name: record.name,
  titleOffsets: record.titleOffsets,
  help: record.help,
  payloadCount: record.nativePayloadCount
})))).digest('hex');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out: path.relative(root, outFile), ...result.summary }));
