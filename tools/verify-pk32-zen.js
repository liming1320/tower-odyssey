const fs = require('fs');
const path = require('path');
const levels = require(path.join(__dirname, '..', 'public', 'data', 'pk32-zen-garden-levels.json'));
const strings = require(path.join(__dirname, '..', 'output', 'pk32-reference', 'strings.json'));
function check(label, value) {
  if (!value) throw new Error('FAIL ' + label);
  console.log('PASS ' + label);
}
check('native count is 64', levels.nativeLevelCount === 64);
check('extracted count matches records', levels.extractedLevelCount === levels.levels.length && levels.levels.length === 19);
check('offsets are unique', new Set(levels.levels.map(x => x.offset)).size === levels.levels.length);
check('all saved strings are native strings', levels.levels.every(x => strings.some(y => y.offset === x.offset && y.text === x.cells)));
check('all layouts contain road cells', levels.levels.every(x => /[1-3]/.test(x.cells)));
console.log(JSON.stringify({ nativeLevelCount: levels.nativeLevelCount, extractedLevelCount: levels.extractedLevelCount, exactRecords: levels.levels.length }));
