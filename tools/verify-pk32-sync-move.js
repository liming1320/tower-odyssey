const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '同步移动');
const data = require('../public/data/pk32-sync-move-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('level count remains unknown', data.nativeLevelCount === null && catalog.levelCount === null);
check('payload count is 261', data.extractedPayloadCount === 261 && data.levels.length === 261);
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
