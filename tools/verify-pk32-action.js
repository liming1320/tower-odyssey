const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32-action.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-breakout-levels.json'), 'utf8'));
function check(label, value) {
  if (!value) throw new Error('FAIL ' + label);
  console.log('PASS ' + label);
}
check('action module exports startGame', /global\.PK32Action\s*=/.test(source) && /startGame/.test(source));
check('breakout has native level loader', /loadNativeBreakout/.test(source) && /pk32-breakout-levels\.json/.test(source));
check('native breakout has 44 records', data.levels.length === 44 && data.extractedPayloadCount === 44);
check('native breakout records are preserved numeric payloads', data.levels.every(level => /^\d+$/.test(level.cells)));
check('native breakout matrix layouts are identified', data.levels.filter(level => level.cells.length === 150).length === 42);
check('native breakout supports level selection', /选择打砖块原生关卡/.test(source) && /nativeBreakoutLevel/.test(source));
console.log(JSON.stringify({ name: data.name, levels: data.levels.length, layout: '15x10' }));
