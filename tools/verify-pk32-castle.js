const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '魔法城堡');
const strings = require('../output/pk32-reference/strings.json');
const next = strings.filter(x => x.text.indexOf('扑克32--') === 0 && x.offset > catalog.titleOffset).sort((a, b) => a.offset - b.offset)[0];
const payloads = strings.filter(x => x.offset > catalog.titleOffset && x.offset < next.offset && /^[0-9]+$/.test(x.text));
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level prompt is 100', catalog.levelCount === 100);
check('native payload count is 70', catalog.payloadCount === 62 && payloads.length === 70);
check('payload boundaries are ordered', payloads.every((x, i) => i === 0 || x.offset > payloads[i - 1].offset));
check('catalog length histogram is represented', Object.entries(catalog.payloadLengths).every(([length, count]) => payloads.filter(x => x.text.length === Number(length)).length === count));
console.log(JSON.stringify({ levelCount: catalog.levelCount, payloadCount: payloads.length, titleOffset: catalog.titleOffset, nextTitleOffset: next.offset }));
