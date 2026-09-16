'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { classifyPayload } = require('./lib/pk32-payload-profile');

const root = path.resolve(__dirname, '..');
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const targets = [
    { name: '魔力纸牌', file: 'pk32-magic-cards-levels.json', families: ['dimension-prefix-paired-cell'] },
    { name: '多彩泡泡', file: 'pk32-colorful-bubbles-levels.json', families: ['dimension-prefix-paired-cell'] },
    { name: '魔塔三', file: 'pk32-tower3-levels.json', families: ['dimension-prefix-paired-cell'] },
    { name: '魔塔四', file: 'pk32-tower4-levels.json', families: ['dimension-prefix-paired-cell', 'dimension-prefix-single-cell'] },
    { name: '魅力之球', file: 'pk32-charm-ball-levels.json', families: ['dimension-prefix-single-cell'] },
    { name: '骰子王', file: 'pk32-dice-king-levels.json', families: ['dimension-prefix-single-cell'] },
    { name: '数谜', file: 'pk32-number-riddle-levels.json', families: ['dimension-prefix-single-cell'] },
    { name: '变色彩球', file: 'pk32-color-changing-balls-levels.json', families: ['dimension-prefix-single-cell'] },
    { name: '推箱子三', file: 'pk32-sokoban3-levels.json', families: ['compact-dimension-grid'] }
];

function prefixLength(profile) {
    return profile.family === 'compact-dimension-grid' ? 2 : 4;
}

const summary = [];
for (const target of targets) {
    const record = catalog.records.find(item => item.name === target.name);
    if (!record) throw new Error('missing native catalog record: ' + target.name);
    if (!record.payloadAssignment || record.payloadAssignment.confidence !== 'candidate') throw new Error('payload assignment requires review: ' + target.name);
    const matched = (record.nativePayloads || []).map(payload => ({ payload, profile: classifyPayload(payload) })).filter(item => item.profile.confidence === 'exact-structure' && target.families.includes(item.profile.family));
    const levels = matched.map((item, index) => ({
        number: index + 1,
        sourceOffset: item.payload.offset,
        sourceLength: item.payload.length,
        width: item.profile.width,
        height: item.profile.height,
        cellWidth: item.profile.cellWidth,
        encodingFamily: item.profile.family,
        cells: item.payload.value.slice(prefixLength(item.profile))
    }));
    const output = {
        version: 1,
        name: target.name,
        source: 'PK32 native numeric strings; exact dimension formula only',
        dataKind: 'native-grid-record-candidate',
        assignmentVerified: false,
        assignmentConfidence: 'candidate',
        assignmentRequires: 'native code reference from game dispatcher to payload offset',
        recordsArePlayableLevels: false,
        fullGameRulesVerified: false,
        nativePayloadCount: record.payloadCount,
        extractedLevelCount: levels.length,
        unmatchedPayloadCount: record.payloadCount - levels.length,
        acceptedFamilies: target.families,
        levels
    };
    fs.writeFileSync(path.join(root, 'public/data', target.file), JSON.stringify(output, null, 2) + '\n');
    summary.push({ name: target.name, file: target.file, extracted: levels.length, total: record.payloadCount });
}

console.log(JSON.stringify({ games: summary.length, records: summary.reduce((sum, item) => sum + item.extracted, 0), summary }));
