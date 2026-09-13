const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '禅宗迷宫');
const data = require('../public/data/pk32-zen-maze-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level count is 24', data.nativeLevelCount === 24 && catalog.levelCount === 24);
check('payload count is 7', data.extractedPayloadCount === 7 && data.levels.length === 7);
check('jump cost is 20', data.jumpCost === 20);
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount, jumpCost: data.jumpCost }));
