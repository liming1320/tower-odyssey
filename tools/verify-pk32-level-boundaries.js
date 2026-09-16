'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const catalog = require('../public/data/pk32-native-catalog.json').records;
const dataFiles = fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name));
const dataByName = new Map();
dataFiles.forEach(file => {
    const value = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (value && value.name) dataByName.set(value.name, { file, value });
});

const rows = catalog.filter(record => Number.isInteger(record.levelCount) && record.levelCount > 0).map(record => {
    const entry = dataByName.get(record.name);
    if (!entry) return { name: record.name, nativeLevelCount: record.levelCount, status: 'data-file-missing' };
    const data = entry.value;
    const extracted = Array.isArray(data.levels) ? data.levels.length : 0;
    const dataCountMatches = data.nativeLevelCount == null || data.nativeLevelCount === record.levelCount;
    const status = !dataCountMatches ? 'count-mismatch' : data.nativeLevelCount == null ? 'extracted-count-unknown' : extracted >= record.levelCount ? (extracted === record.levelCount ? 'complete-count' : 'extra-payloads-withheld') : 'extracted-incomplete';
    return {
        name: record.name,
        file: entry.file,
        nativeLevelCount: record.levelCount,
        dataNativeLevelCount: data.nativeLevelCount == null ? null : data.nativeLevelCount,
        extractedPayloadCount: data.extractedPayloadCount == null ? extracted : data.extractedPayloadCount,
        extractedRecords: extracted,
        status
    };
});

const mismatches = rows.filter(row => row.status === 'count-mismatch');
if (mismatches.length) throw new Error('native level boundary mismatch: ' + JSON.stringify(mismatches));
console.log(JSON.stringify({ checked: rows.length, completeCount: rows.filter(row => row.status === 'complete-count').length, extraPayloadsWithheld: rows.filter(row => row.status === 'extra-payloads-withheld').length, extractedIncomplete: rows.filter(row => row.status === 'extracted-incomplete').length, extractedCountUnknown: rows.filter(row => row.status === 'extracted-count-unknown').length, dataFileMissing: rows.filter(row => row.status === 'data-file-missing').length, rows }));
