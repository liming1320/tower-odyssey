const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '智慧之光');
const data = require('../public/data/pk32-light-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level count is 140', data.nativeLevelCount === 140 && data.extractedPayloadCount === 140 && data.levels.length === 140);
check('native board dispatch offsets are unique', new Set(data.levels.map(x => x.offset)).size === 140);
check('native state codes are preserved', data.levels.every(x => x.cells.match(/.{2}/g).slice(2).every(value => Number(value) >= 0 && Number(value) <= 99)));
check('all boards have encoded dimensions', data.levels.every(x => x.width >= 1 && x.height >= 1 && x.cells.length === 4 + x.width * x.height * 2));
check('offsets are native dispatch targets', data.levels.every(x => Number.isInteger(x.offset) && x.offset > 0));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
