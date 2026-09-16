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
const ambiguousLaunchers = catalog.filter(record => [
    record.playable, record.module, record.variant, record.puzzle, record.action, record.casual, record.strategy, record.card
].filter(Boolean).length > 1);
const allowedAmbiguous = new Set(['24点二', '21点二', '数字魔方', '跟花二', '推箱子二', '推箱子三', '推箱子五', '连结电线二', '推箱子六', '交换彩球', '飞一百米', '接水管', '七巧板']);
const unexpectedAmbiguous = ambiguousLaunchers.filter(record => !allowedAmbiguous.has(record.name));
if (unexpectedAmbiguous.length) throw new Error('Unexpected multi-launcher entries: ' + unexpectedAmbiguous.map(record => record.name).join(', '));
const distinctPairs = [
    ['魔塔', '魔塔四'],
    ['推箱子', '推箱子二'],
    ['跟花', '跟花二']
];
distinctPairs.forEach(pair => {
    const a = catalog.find(record => record.name === pair[0]);
    const b = catalog.find(record => record.name === pair[1]);
    if (!a || !b || a.id === b.id) throw new Error('Distinct PK32 games were merged: ' + pair.join(' / '));
});
const nativeCatalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-native-catalog.json'), 'utf8'));
if (nativeCatalog.total !== 213 || nativeCatalog.records.length !== 213) throw new Error('Native catalog must contain 213 records');
if (nativeCatalog.records.filter(record => record.titleFound).length < 200) throw new Error('Native title coverage unexpectedly low');
const rawHelp = nativeCatalog.records.filter(record => (record.help || []).some(text => {
    const value = String(text || '').trim();
    if (value.length < 8 || /[\u4e00-\u9fff]/.test(value) || !/^[0-9A-Z]+$/i.test(value)) return false;
    if (value.length >= 32) return true;
    const digits = (value.match(/\d/g) || []).length;
    return digits / value.length >= 0.5;
}));
if (rawHelp.length) throw new Error('Native help contains raw payload strings: ' + rawHelp.slice(0, 8).map(record => record.name).join(', '));
const peg = nativeCatalog.records.find(record => record.name === '独粒钻石');
if (!peg || peg.levelCount !== 17 || !/initialization switch cases/.test(peg.levelCountBasis || '')) throw new Error('独粒钻石 native board evidence changed');
if (nativeCatalog.records.some(record => record.originalComplete === true)) throw new Error('Native evidence must not imply migration completion');

const dir = path.join(root, 'public', 'js', 'minigames');
const files = fs.readdirSync(dir).filter(file => /^pk32.*\.js$/.test(file));
files.forEach(file => execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'inherit' }));

console.log(JSON.stringify({ total: names.length, unique: unique.size, launcherMapped, originalComplete, nativeTitles: nativeCatalog.records.filter(record => record.titleFound).length, nativeConfirmedLevels: nativeCatalog.records.filter(record => record.levelCount != null).length, syntaxChecked: files.length }));
