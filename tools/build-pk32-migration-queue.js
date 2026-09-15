// Build the PK32 migration queue from inventory, native data and renderer evidence.
// Queue status is deliberately conservative: it never promotes a game to complete.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const inventory = JSON.parse(fs.readFileSync(path.join(reference, 'pk32-inventory.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(reference, 'migration-ledger.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'public/js/minigames/pk32.js'), 'utf8');
const variants = fs.readFileSync(path.join(root, 'public/js/minigames/pk32-variants.js'), 'utf8');

const dataDir = path.join(root, 'public', 'data');
const dataByName = new Map();
for (const file of fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name))) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        if (data.assignmentVerified === false) continue;
        if (data.name) dataByName.set(data.name, {
            file,
            levelCount: Array.isArray(data.levels) ? data.levels.length : 0,
            declaredLevelCount: data.nativeLevelCount || data.extractedLevelCount || data.count || null,
            fullRules: data.fullGameRulesVerified === true,
            source: data.source || null
        });
    } catch (_) {}
}

// Keep this classification in step with audit-pk32-renderers.js. The variant
// dispatcher is a long ternary expression, so a line-oriented regex misses
// dedicated renderers when formatting changes or branches wrap.
const rendererNames = new Set();
for (const match of source.matchAll(/'([^']+)'\s*:\s*\{\s*family:\s*'[^']+'\s*,\s*id:\s*'([^']+)'/g)) rendererNames.add(match[1]);
for (const match of variants.matchAll(/config\.name === '([^']+)'\s*\?\s*(renderNative[A-Za-z0-9_]*)/g)) rendererNames.add(match[1]);
for (const match of variants.matchAll(/if\s*\(config\.name === '([^']+)'\)\s*return\s+(renderNative[A-Za-z0-9_]*)/g)) rendererNames.add(match[1]);

// These launchers are separate modules, so they are not visible in the
// variants dispatcher scan above. Keep them explicit until the catalog has
// a machine-readable renderer manifest.
['魔塔', '强手棋', '智慧之光', '独粒钻石', '木乃伊', '电磁彩球', '建筑制造', '同色方块'].forEach(name => rendererNames.add(name));

const rows = ledger.records.map(record => {
    const data = dataByName.get(record.name) || null;
    const renderer = rendererNames.has(record.name) ? 'dedicated-or-board' : record.launcher ? 'shared-mode-or-placeholder' : 'none';
    const originalComplete = record.originalComplete === true && record.originalAssetsVerified === true && record.originalLevelsVerified === true && record.originalRulesVerified === true;
    let status = 'unstarted';
    if (originalComplete) status = 'original-complete';
    else if (data && data.fullRules && renderer === 'dedicated-or-board') status = 'flow-and-rules-review';
    else if (data && renderer === 'dedicated-or-board') status = 'native-data-dedicated-renderer';
    else if (data) status = 'native-data-needs-rules-and-assets';
    else if (renderer === 'shared-mode-or-placeholder') status = 'renderer-needs-original-evidence';
    return {
        id: record.id,
        index: record.index,
        name: record.name,
        group: record.group,
        engineGroup: 'vb5-pk32-shared-host',
        sourceExePath: inventory.engineGroups[0] && inventory.engineGroups[0].executable,
        migrationStatus: status,
        data: data,
        renderer,
        launcherVerified: record.launcherVerified === true,
        originalAssetsVerified: record.originalAssetsVerified === true,
        originalLevelsVerified: record.originalLevelsVerified === true,
        originalRulesVerified: record.originalRulesVerified === true,
        originalComplete,
        nextEvidence: originalComplete ? [] : ['original startup/menu capture', 'asset-to-object mapping', 'observable rule trace', 'complete first-flow verification']
    };
});

const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: ['pk32-inventory.json', 'migration-ledger.json', 'public/data/pk32-*-levels.json', 'public/js/minigames/pk32.js', 'public/js/minigames/pk32-variants.js'],
    completionRule: 'Only assets, original level/round data, observable rules and complete flow evidence can promote originalComplete.',
    engineGroups: inventory.engineGroups,
    summary: {
        total: rows.length,
        originalComplete: rows.filter(row => row.originalComplete).length,
        nativeData: rows.filter(row => row.data).length,
        dedicatedRenderer: rows.filter(row => row.renderer === 'dedicated-or-board').length,
        needsOriginalEvidence: rows.filter(row => row.migrationStatus !== 'original-complete').length
    },
    records: rows
};

const output = path.join(reference, 'migration-queue.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, ...result.summary }));
