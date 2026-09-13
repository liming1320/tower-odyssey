const fs = require('fs');
const path = require('path');
const data = require(path.join(__dirname, '..', 'public', 'data', 'pk32-electromagnetic-levels.json'));
const strings = require(path.join(__dirname, '..', 'output', 'pk32-reference', 'strings.json'));
function check(label, ok) { if (!ok) throw new Error('FAIL ' + label); console.log('PASS ' + label); }
check('native count is 160', data.nativeLevelCount === 160);
check('grid is 16x16', data.width === 16 && data.height === 16);
check('all 160 boards are present', data.levels.length === 160 && data.extractedLevelCount === 160);
check('offsets are unique', new Set(data.levels.map(x => x.offset)).size === 160);
check('each board has 256 decimal cells', data.levels.every(x => x.cells.length === 256 && /^[0-9]+$/.test(x.cells)));
check('every board matches native string', data.levels.every(x => strings.some(y => y.offset === x.offset && y.text === x.cells)));
console.log(JSON.stringify({ name: data.name, nativeLevelCount: data.nativeLevelCount, extractedLevelCount: data.extractedLevelCount, width: data.width, height: data.height }));
