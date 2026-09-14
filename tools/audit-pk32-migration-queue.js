'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/minigames/pk32.js'), 'utf8');
const variants = fs.readFileSync(path.join(root, 'public/js/minigames/pk32-variants.js'), 'utf8');
const rendererNames = new Set((variants.match(/config\.name === '([^']+)'/g) || []).map(value => value.slice(15, -1)));
const namesMatch = source.match(/const NAMES = \(\s*'([^']+)'\s*\)\.split\('\|'\)/);
if (!namesMatch) throw new Error('PK32 catalog names not found');
const names = namesMatch[1].split('|');
const dataDir = path.join(root, 'public/data');
const data = fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name)).map(name => {
    const file = path.join(dataDir, name);
    let json = null;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {}
    const levels = json && (json.levels || json.confirmedLevels);
    return {
        file: name,
        name: json && json.name || null,
        records: Array.isArray(levels) ? levels.length : 0,
        declared: json && (json.nativeLevelCount || json.levelCount || null),
    };
});

const rows = names.map((name, index) => {
    const native = data.find(item => item.name === name) || null;
    const variant = variants.indexOf("CONFIG['" + name + "']") >= 0 || variants.indexOf("'" + name + "'") >= 0;
    const hasNativeRenderer = rendererNames.has(name);
    const generic = variant && !hasNativeRenderer;
    const preview = generic || /<pre|规则解析中|载荷加载/.test(variants);
    return {
        index: index + 1,
        name,
        nativeData: native,
        variant,
        genericRenderer: generic,
        previewRisk: preview,
        migrationStatus: native && native.declared && native.records >= native.declared && !generic ? 'data-complete-rules-review' : generic ? 'generic-placeholder' : native ? 'data-partial' : 'no-native-data',
    };
});

const summary = {
    total: rows.length,
    genericPlaceholder: rows.filter(row => row.migrationStatus === 'generic-placeholder').length,
    dataCompleteRulesReview: rows.filter(row => row.migrationStatus === 'data-complete-rules-review').length,
    dataPartial: rows.filter(row => row.migrationStatus === 'data-partial').length,
    noNativeData: rows.filter(row => row.migrationStatus === 'no-native-data').length,
    rows,
};
console.log(JSON.stringify(summary, null, 2));
