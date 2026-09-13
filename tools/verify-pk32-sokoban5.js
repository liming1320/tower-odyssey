const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '推箱子五');
const data = require('../public/data/pk32-sokoban5-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('level count remains unknown', data.nativeLevelCount === null && catalog.levelCount === null);
check('payload count is 4', data.extractedPayloadCount === 4 && data.levels.length === 4);
check('six by six payloads', data.levels.every(x => x.cells.length === 36 && /^[0-9]+$/.test(x.cells)));
check('offsets match catalog samples', data.levels.every((x, i) => x.offset === catalog.payloadSamples[i].offset));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
