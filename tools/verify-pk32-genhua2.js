const data = require('../public/data/pk32-genhua2-levels.json');
const strings = require('../output/pk32-reference/strings.json');
function check(label, ok) { if (!ok) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('28 native records', data.nativePayloadCount === 28 && data.levels.length === 28);
check('fixed record length', data.levels.every(x => x.cells.length === 36 && /^[0-9]+$/.test(x.cells)));
check('unique ordered offsets', new Set(data.levels.map(x => x.offset)).size === 28 && data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('exact native records', data.levels.every(x => strings.some(y => y.offset === x.offset && y.text === x.cells)));
console.log(JSON.stringify({ name: data.name, records: data.levels.length, recordLength: data.recordLength }));
