const fs = require('fs');
const path = require('path');

const strings = require(path.join(__dirname, '..', 'output', 'pk32-reference', 'strings.json'));
const catalog = require('../public/data/pk32-native-catalog.json').records.find(function (record) { return record.name === '建筑制造'; });
const nextTitle = strings.filter(function (item) {
    return item.text.indexOf('扑克32--') === 0 && item.offset > catalog.titleOffset;
}).sort(function (a, b) { return a.offset - b.offset; })[0];
const levels = strings.filter(function (item) {
    return item.offset > catalog.titleOffset && item.offset < nextTitle.offset && /^[0-9]+$/.test(item.text) && [29, 36, 192].indexOf(item.text.length) >= 0;
}).map(function (item, index) {
    return { number: index + 1, offset: item.offset, cells: item.text, width: item.text.length === 192 ? 16 : item.text.length === 36 ? 6 : null };
});
if (levels.length !== catalog.payloadCount) throw new Error('payload count mismatch: ' + levels.length);
const output = {
    name: catalog.name,
    nativeLevelCount: null,
    extractedPayloadCount: levels.length,
    payloadLengths: catalog.payloadLengths,
    rules: catalog.help.slice(-3),
    levels
};
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-building-levels.json'), JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ payloads: levels.length, lengths: levels.reduce(function (counts, level) { counts[level.cells.length] = (counts[level.cells.length] || 0) + 1; return counts; }, {}) }));
