const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '交换彩球');
const data = require('../public/data/pk32-swap-balls-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('level count remains unknown', data.nativeLevelCount === null && catalog.levelCount === null);
check('payload count is 1', data.extractedPayloadCount === 1 && data.levels.length === 1);
check('payload matches catalog', data.levels[0].offset === catalog.payloadSamples[0].offset && data.levels[0].cells.length === 192);
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
