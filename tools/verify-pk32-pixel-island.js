const data = require('../public/data/pk32-pixel-island-levels.json');
const strings = require('../output/pk32-reference/strings.json');
function check(label, ok) { if (!ok) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native count prompts preserved', JSON.stringify(data.nativeLevelCounts) === JSON.stringify([213, 50, 4]));
check('six native payloads present', data.payloadCount === 6 && data.levels.length === 6);
check('payload lengths match evidence', JSON.stringify(data.levels.map(x => x.length)) === JSON.stringify([246, 237, 204, 100, 100, 100]));
check('offsets unique and ordered', new Set(data.levels.map(x => x.offset)).size === 6 && data.levels.every((x, i) => i === 0 || x.offset > data.levels[i - 1].offset));
check('all records match native strings', data.levels.every(x => strings.some(y => y.offset === x.offset && y.text === x.cells)));
check('all native prompts preserved', data.prompts.length === 4);
console.log(JSON.stringify({ name: data.name, payloadCount: data.payloadCount, lengths: data.levels.map(x => x.length), prompts: data.prompts.length }));
