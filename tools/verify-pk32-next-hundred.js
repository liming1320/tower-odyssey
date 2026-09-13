const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '下一百层');
const data = require('../public/data/pk32-next-hundred-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('level count remains unknown', data.nativeLevelCount === null && catalog.levelCount === null);
check('payload count is 4', data.extractedPayloadCount === 4 && data.levels.length === 4);
check('all payloads are 192 characters', data.levels.every(x => x.cells.length === 192 && /^[0-9]+$/.test(x.cells)));
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
