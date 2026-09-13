const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '宇宙黑洞');
const data = require('../public/data/pk32-black-hole-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level count is 30', data.nativeLevelCount === 30 && catalog.levelCount === 30);
check('payload count is 41', data.extractedPayloadCount === 41 && data.levels.length === 41);
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
