const fs = require('fs');
const path = require('path');
const strings = require(path.join(__dirname, '..', 'output', 'pk32-reference', 'strings.json'));
const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '推箱子五');
const next = strings.filter(x => x.text.indexOf('扑克32--') === 0 && x.offset > catalog.titleOffset).sort((a, b) => a.offset - b.offset)[0];
const levels = strings.filter(x => x.offset > catalog.titleOffset && x.offset < next.offset && /^[0-9]+$/.test(x.text) && x.text.length === 36).map((x, i) => ({ number: i + 1, offset: x.offset, cells: x.text }));
if (levels.length !== catalog.payloadCount) throw new Error('payload count mismatch: ' + levels.length);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-sokoban5-levels.json'), JSON.stringify({ name: catalog.name, nativeLevelCount: null, extractedPayloadCount: levels.length, width: 6, height: 6, encoding: 'six by six decimal cells', levels }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ levels: levels.length, firstOffset: levels[0].offset, lastOffset: levels[levels.length - 1].offset }));
