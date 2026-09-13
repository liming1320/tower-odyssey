const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '飞一百米');
const data = require('../public/data/pk32-fly-hundred-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('level count remains unknown', data.nativeLevelCount === null && catalog.levelCount === null);
check('payload count is 3', data.extractedPayloadCount === 3 && data.levels.length === 3);
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
