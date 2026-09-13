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

const dir = path.join(root, 'public', 'js', 'minigames');
const files = fs.readdirSync(dir).filter(file => /^pk32.*\.js$/.test(file));
files.forEach(file => execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'inherit' }));

console.log(JSON.stringify({ total: names.length, unique: unique.size, launcherMapped, originalComplete, syntaxChecked: files.length }));
