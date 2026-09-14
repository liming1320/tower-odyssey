const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '七盏灯');
const data = require('../public/data/pk32-seven-lamps-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('level count remains unknown', data.nativeLevelCount === null && catalog.levelCount === null);
check('payload count is 10', data.extractedPayloadCount === 10 && data.levels.length === 10);
check('offsets are ordered', data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('length histogram matches', Object.entries(catalog.payloadLengths).every(([n, count]) => data.levels.filter(x => x.cells.length === Number(n)).length === count));
check('payloads encode their own dimensions', data.levels.every(x => { const width = Number(x.cells.slice(0, 2)), height = Number(x.cells.slice(2, 4)); return width > 0 && height > 0 && x.cells.length === 4 + width * height; }));
console.log(JSON.stringify({ nativeLevelCount: data.nativeLevelCount, extractedPayloadCount: data.extractedPayloadCount }));
