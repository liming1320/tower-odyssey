const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '七巧板');
const data = require('../public/data/pk32-tangram-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level count is 80', data.nativeLevelCount === 80 && catalog.levelCount === 80);
check('payload count is 37', data.extractedLevelCount === 37 && data.levels.length === 37);
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedLevelCount: data.extractedLevelCount, puzzlesPerLevel: data.puzzlesPerLevel }));
