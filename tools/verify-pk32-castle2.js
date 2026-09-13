const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '魔法城堡二');
const data = require('../public/data/pk32-castle2-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level count is 40', data.nativeLevelCount === 40 && catalog.levelCount === 40);
check('extracted payload count is 37', data.extractedLevelCount === 37 && data.levels.length === 37);
check('payloads have unique ordered offsets', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('payloads are decimal strings', data.levels.every(x => /^[0-9]+$/.test(x.cells)));
check('length histogram matches catalog', Object.entries(catalog.payloadLengths).every(([length, count]) => data.levels.filter(x => x.cells.length === Number(length)).length === count));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedLevelCount: data.extractedLevelCount }));
