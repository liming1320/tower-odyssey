const catalog = require('../public/data/pk32-native-catalog.json').records.find(function (record) { return record.name === '七巧板'; });
const data = require('../public/data/pk32-tangram-levels.json');
if (!catalog || data.nativeLevelCount !== 80 || data.extractedLevelCount !== 37 || data.levels.length !== 37) throw new Error('tangram metadata mismatch');
if (!data.levels.every(function (level, index) { return level.number === index + 1 && [76, 150].indexOf(level.cells.length) >= 0 && /^[0-9]+$/.test(level.cells) && (index === 0 || level.offset > data.levels[index - 1].offset); })) throw new Error('tangram payload mismatch');
if (data.puzzlesPerLevel !== 10) throw new Error('tangram puzzle grouping mismatch');
console.log(JSON.stringify({ name: data.name, nativeLevelCount: data.nativeLevelCount, payloads: data.levels.length, puzzlesPerLevel: data.puzzlesPerLevel }));
