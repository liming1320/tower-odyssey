'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('./extract-pk32-sokoban4');
const root = path.resolve(__dirname, '..');
const image = fs.readFileSync(path.join(root, 'output/pk32-reference/module.bin'));
const original = extract(image);
const strings = new Map(require('../output/pk32-reference/strings.json').map(row => [row.offset, row.text]));
const data = require('../public/data/pk32-sokoban4-levels.json');

const publishedNative = Object.assign({}, data);
delete publishedNative.name;
assert.deepEqual(publishedNative, original, 'Published maps must match all native dispatch cases, not title order');
assert.equal(data.levels.length, 23);
assert.equal(data.fullGameRulesVerified, false);
for (const level of data.levels) {
    const prefix = String(level.width).padStart(2, '0') + String(level.height).padStart(2, '0');
    assert.equal(prefix + level.cells, strings.get(level.offset));
    assert.equal(level.cells.length, level.width * level.height);
    assert.equal(level.cells.split('6').length - 1, 1);
}
assert.equal(strings.get(data.ruleTextOffset), '\u6e38\u620f\u7684\u76ee\u7684\u5c31\u662f\u8981\u628a\u753b\u9762\u4e0a\u76f8\u540c\u989c\u8272\u7684\u7bb1\u5b50\u5168\u90e8\u653e\u5230\u4e00\u8d77\u3002');
assert.ok(data.levels.some(level => level.offset < 3076436), 'A valid board precedes the game title');
const changed = Buffer.from(image);
changed[0x1bf4239] = 18;
assert.throws(() => extract(changed), 'Changed native branch count must invalidate extraction');
console.log(JSON.stringify({ dispatchCases: data.levels.length, matchedNativeStrings: data.levels.length, fullGameRulesVerified: false }));
