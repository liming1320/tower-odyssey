const catalog = require('../public/data/pk32-native-catalog.json').records.find(x => x.name === '数谜');
const strings = require('../output/pk32-reference/strings.json');
const nextTitle = strings.filter(x => x.text.indexOf('扑克32--') === 0 && x.offset > catalog.titleOffset).sort((a, b) => a.offset - b.offset)[0];
const payloads = strings.filter(x => x.offset > catalog.titleOffset && x.offset < nextTitle.offset && /^[0-9]+$/.test(x.text));
function check(label, value) { if (!value) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native level prompt is 140', catalog.levelCount === 140);
check('native title boundary exists', !!nextTitle);
check('native numeric payload count is 97', catalog.payloadCount === 97 && payloads.length === 97);
check('payload lengths match catalog histogram', payloads.reduce((a, x) => { a[x.text.length] = (a[x.text.length] || 0) + 1; return a; }, {}).__proto__ && Object.entries(catalog.payloadLengths).every(([k, v]) => payloads.filter(x => x.text.length === Number(k)).length === v));
check('payload offsets are strictly increasing', payloads.every((x, i) => i === 0 || x.offset > payloads[i - 1].offset));
console.log(JSON.stringify({ titleOffset: catalog.titleOffset, nextTitleOffset: nextTitle.offset, levelCount: catalog.levelCount, payloadCount: payloads.length, firstPayloadOffset: payloads[0].offset, lastPayloadOffset: payloads[payloads.length - 1].offset }));
