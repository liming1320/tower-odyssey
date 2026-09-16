'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { classifyPayload } = require('./lib/pk32-payload-profile');

const root = path.resolve(__dirname, '..');
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const files = [
    'pk32-magic-cards-levels.json', 'pk32-colorful-bubbles-levels.json', 'pk32-tower3-levels.json',
    'pk32-tower4-levels.json', 'pk32-charm-ball-levels.json', 'pk32-dice-king-levels.json',
    'pk32-number-riddle-levels.json', 'pk32-color-changing-balls-levels.json', 'pk32-sokoban3-levels.json'
];

let records = 0;
for (const file of files) {
    const data = require(path.join(root, 'public/data', file));
    const source = catalog.records.find(record => record.name === data.name);
    assert(source, 'missing source catalog record for ' + data.name);
    assert.equal(data.assignmentVerified, false);
    assert.equal(data.assignmentConfidence, 'candidate');
    assert.equal(data.recordsArePlayableLevels, false);
    assert.equal(data.fullGameRulesVerified, false);
    assert.equal(data.nativePayloadCount, source.payloadCount);
    assert.equal(data.extractedLevelCount, data.levels.length);
    assert.equal(data.extractedLevelCount + data.unmatchedPayloadCount, data.nativePayloadCount);
    data.levels.forEach(level => {
        const payload = source.nativePayloads.find(item => item.offset === level.sourceOffset);
        assert(payload, data.name + ' missing source offset ' + level.sourceOffset);
        const profile = classifyPayload(payload);
        assert.equal(payload.length, level.sourceLength);
        assert.equal(level.cells.length, level.width * level.height * level.cellWidth);
        assert.equal(level.encodingFamily, profile.family);
        assert.equal(profile.confidence, 'exact-structure');
        assert.equal(profile.semanticsVerified, false);
    });
    records += data.levels.length;
}

assert.equal(records, 355);
console.log(JSON.stringify({ games: files.length, records, exactStructureVerified: true, playableLevelsClaimed: false, fullGameRulesVerified: false }));
