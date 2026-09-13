const data = require('../public/data/pk32-sea-treasure-levels.json');
if (data.name !== '海底寻宝' || data.extractedPayloadCount !== 1 || data.levels.length !== 1) throw new Error('sea treasure metadata mismatch');
const level = data.levels[0];
if (level.cells.length !== 150 || !/^[0-9]+$/.test(level.cells) || !Number.isInteger(level.offset)) throw new Error('sea treasure native grid mismatch');
if (!Array.isArray(data.controls) || !data.controls.some(function (text) { return text.indexOf('ASDW') >= 0 && text.indexOf('小键盘') >= 0; })) throw new Error('sea treasure controls missing');
console.log(JSON.stringify({ name: data.name, payloads: data.levels.length, width: 15, height: 10, offset: level.offset }));
