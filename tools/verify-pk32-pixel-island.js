const data = require('../public/data/pk32-pixel-island-levels.json');
if (data.name !== '像素岛' || data.nativeLevelCounts.join(',') !== '213,50,4' || data.levels.length !== 6) throw new Error('pixel island metadata mismatch');
const gridLevels = data.levels.filter(function (level) { return level.length === 100; });
if (gridLevels.length !== 3 || !gridLevels.every(function (level) { return /^[01]+$/.test(level.cells) && level.cells.length === 100; })) throw new Error('pixel island 5x5 states mismatch');
if (!data.prompts.some(function (prompt) { return prompt.text.indexOf('5x5') >= 0 && prompt.text.indexOf('消失') >= 0; })) throw new Error('pixel island rule prompt missing');
console.log(JSON.stringify({ name: data.name, nativeLevelCounts: data.nativeLevelCounts, fiveByFiveRecords: gridLevels.length }));
