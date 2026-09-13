const fs = require('fs');
const path = require('path');
const strings = require(path.join(__dirname, '..', 'output', 'pk32-reference', 'strings.json'));
const title = strings.find(x => x.text === '扑克32--跟花二');
const next = strings.filter(x => x.text.indexOf('扑克32--') === 0 && x.offset > title.offset).sort((a, b) => a.offset - b.offset)[0];
const levels = strings.filter(x => x.offset > title.offset && x.offset < next.offset && /^[0-9]+$/.test(x.text) && x.text.length === 36).map((x, i) => ({ number: i + 1, offset: x.offset, cells: x.text }));
if (levels.length !== 28) throw new Error('Expected 28 native records, got ' + levels.length);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-genhua2-levels.json'), JSON.stringify({ name: '跟花二', nativePayloadCount: 28, extractedPayloadCount: levels.length, recordLength: 36, levels }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ levels: levels.length, firstOffset: levels[0].offset, lastOffset: levels[levels.length - 1].offset }));
