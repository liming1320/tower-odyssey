const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '魔法城堡');
const strings = require('../output/pk32-reference/strings.json');
const next = strings.filter(x => x.text.indexOf('扑克32--') === 0 && x.offset > catalog.titleOffset).sort((a, b) => a.offset - b.offset)[0];
const payloads = strings.filter(x => x.offset > catalog.titleOffset && x.offset < next.offset && /^[0-9]+$/.test(x.text));
const extracted = require('../public/data/pk32-castle-levels.json');
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level prompt is 100', catalog.levelCount === 100);
check('native payload count is 70', catalog.payloadCount === 62 && payloads.length === 70);
check('payload boundaries are ordered', payloads.every((x, i) => i === 0 || x.offset > payloads[i - 1].offset));
check('generated payload count matches native candidates', extracted.extractedPayloadCount === payloads.length && extracted.levels.length === payloads.length);
check('generated payload offsets match native candidates', extracted.levels.every((x, i) => x.offset === payloads[i].offset && x.cells === payloads[i].text));
check('catalog length histogram is represented', Object.entries(catalog.payloadLengths).every(([length, count]) => payloads.filter(x => x.text.length === Number(length)).length === count));
console.log(JSON.stringify({ levelCount: catalog.levelCount, payloadCount: payloads.length, nonMatrixPayloads: payloads.filter(x => x.text.length % 2 === 1).length, titleOffset: catalog.titleOffset, nextTitleOffset: next.offset }));
