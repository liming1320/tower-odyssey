const fs = require('fs');
const path = require('path');
const strings = require(path.join(__dirname, '..', 'output', 'pk32-reference', 'strings.json'));
const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '上一百层');
const next = strings.filter(x => x.text.indexOf('扑克32--') === 0 && x.offset > catalog.titleOffset).sort((a, b) => a.offset - b.offset)[0];
const levels = strings.filter(x => x.offset > catalog.titleOffset && x.offset < next.offset && /^[0-9]+$/.test(x.text) && x.text.length === 192).map((x, i) => ({ number: i + 1, offset: x.offset, cells: x.text }));
if (levels.length !== 1) throw new Error('payload count mismatch: ' + levels.length);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-previous-hundred-levels.json'), JSON.stringify({ name: catalog.name, nativeLevelCount: null, extractedPayloadCount: levels.length, levels }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ levels: levels.length, offset: levels[0].offset }));
