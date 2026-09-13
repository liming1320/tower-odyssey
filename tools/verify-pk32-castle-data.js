const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '魔法城堡');
const data = require('../public/data/pk32-castle-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level count is 100', data.nativeLevelCount === 100);
check('payload count is 62', data.extractedPayloadCount === 62 && data.levels.length === 62);
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
