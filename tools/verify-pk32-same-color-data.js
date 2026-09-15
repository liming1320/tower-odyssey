'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const data = require('../public/data/pk32-same-color-levels.json');

assert.equal(data.name, '\u540c\u8272\u65b9\u5757');
assert.equal(data.fullGameRulesVerified, false);
assert.equal(data.nativeLevelCount, null);
assert.equal(data.extractedPayloadCount, 3);
assert.deepEqual(data.levels.map(level => level.offset), [1127272, 1127768, 1128252]);
assert.ok(data.levels.every(level => level.width === 12 && level.height === 16 && /^[0-6]{192}$/.test(level.cells)));
assert.deepEqual(data.levels.map(level => crypto.createHash('sha256').update(level.cells).digest('hex')), [
  '89f3b348fef7e217eef48e9671183aaf49b11d7c63823ad6848f323daee82e6c',
  'f2fdca6aa2c34133b5e3f3c57fe128bbf8aed21c6ead4fe19be9367a0841c652',
  '531ad2373e0c61a7670e2ca9cad97727fdccfb7dfb6e8714e818d3895366cc86'
]);
console.log(JSON.stringify({ name: data.name, nativeBoards: data.levels.length, width: 12, height: 16, fullGameRulesVerified: false }));
