const catalog = require('../public/data/pk32-native-catalog.json').records.find(function (record) { return record.name === '同步移动'; });
const data = require('../public/data/pk32-sync-move-levels.json');
if (!catalog || data.extractedPayloadCount !== 261 || data.levels.length !== 261) throw new Error('sync move payload count mismatch');
if (!data.levels.every(function (level, index) { return level.number === index + 1 && /^[0-9]+$/.test(level.cells) && (index === 0 || level.offset > data.levels[index - 1].offset); })) throw new Error('sync move payload ordering or encoding mismatch');
if (!Array.isArray(data.rules) || !data.rules.length) throw new Error('sync move rules missing');
console.log(JSON.stringify({ name: data.name, payloads: data.levels.length, firstOffset: data.levels[0].offset, lastOffset: data.levels[data.levels.length - 1].offset }));
