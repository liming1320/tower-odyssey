const fs = require('fs');
const path = require('path');
const data = require('../public/data/pk32-cube2-levels.json');
const catalog = require('../public/data/pk32-native-catalog.json').records.find(function (record) { return record.name === data.name; });
if (!catalog || data.extractedPayloadCount !== catalog.payloadCount || data.levels.length !== catalog.payloadCount) throw new Error('cube2 count mismatch');
data.levels.forEach(function (level, index) {
    if (level.number !== index + 1 || !/^[0-9]+$/.test(level.cells) || level.cells.length !== level.length) throw new Error('invalid cube2 level ' + (index + 1));
});
const actual = data.levels.reduce(function (counts, level) { counts[level.length] = (counts[level.length] || 0) + 1; return counts; }, {});
Object.keys(catalog.payloadLengths).forEach(function (length) { if (actual[length] !== catalog.payloadLengths[length]) throw new Error('length mismatch: ' + length); });
console.log(JSON.stringify({ name: data.name, payloads: data.levels.length, lengths: actual }));
