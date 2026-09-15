const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const catalogFile = path.join(root, 'public', 'js', 'minigames', 'pk32.js');
const source = fs.readFileSync(catalogFile, 'utf8');
const match = source.match(/const NAMES = \(\s*'([\s\S]*?)'\s*\)\.split\('\|'\)/);
if (!match) throw new Error('PK32 catalog declaration not found');

const names = match[1].split('|');
const unique = new Set(names);
if (names.length !== 213) throw new Error('Expected 213 catalog entries, got ' + names.length);
if (unique.size !== names.length) throw new Error('Duplicate PK32 catalog entry');

const vm = require('vm');
const runtime = { window: { MiniGames: {} } };
vm.createContext(runtime);
vm.runInContext(source, runtime, { filename: catalogFile });
const catalog = runtime.window.PK32Catalog;
if (!catalog || catalog.length !== names.length) throw new Error('PK32 runtime catalog failed to load');
const missing = catalog.filter(record => !record.playable && !record.module && !record.casual &&
    !record.action && !record.strategy && !record.card && !record.puzzle && !record.variant);
if (missing.length) throw new Error('Unmapped entries: ' + missing.join(', '));
const launcherMapped = catalog.filter(record => record.playable || record.module || record.casual || record.action || record.strategy || record.card || record.puzzle || record.variant).length;
const originalComplete = catalog.filter(record => record.originalComplete === true).length;
const nativeCatalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-native-catalog.json'), 'utf8'));
if (nativeCatalog.total !== 213 || nativeCatalog.records.length !== 213) throw new Error('Native catalog must contain 213 records');
if (nativeCatalog.records.filter(record => record.titleFound).length < 200) throw new Error('Native title coverage unexpectedly low');
const peg = nativeCatalog.records.find(record => record.name === '独粒钻石');
if (!peg || peg.levelCount !== 17 || !/initialization switch cases/.test(peg.levelCountBasis || '')) throw new Error('独粒钻石 native board evidence changed');
if (nativeCatalog.records.some(record => record.originalComplete === true)) throw new Error('Native evidence must not imply migration completion');

const dir = path.join(root, 'public', 'js', 'minigames');
const files = fs.readdirSync(dir).filter(file => /^pk32.*\.js$/.test(file));
files.forEach(file => execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'inherit' }));

console.log(JSON.stringify({ total: names.length, unique: unique.size, launcherMapped, originalComplete, nativeTitles: nativeCatalog.records.filter(record => record.titleFound).length, nativeConfirmedLevels: nativeCatalog.records.filter(record => record.levelCount != null).length, syntaxChecked: files.length }));
