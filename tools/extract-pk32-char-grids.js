'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const strings = require(path.join(reference, 'strings.json'));
const catalog = require(path.join(root, 'public', 'data', 'pk32-native-catalog.json'));
const titles = strings
  .filter(row => row.text.indexOf('扑克32--') === 0 || row.text === '扑克32-纸牌魔法阵')
  .sort((a, b) => a.offset - b.offset);
const catalogByName = new Map(catalog.records.map(record => [record.name, record]));

function previousTitle(offset) {
  let result = null;
  for (const title of titles) {
    if (title.offset > offset) break;
    result = title;
  }
  return result;
}

function titleName(title) {
  return String(title && title.text || '').replace(/^扑克32--?/, '');
}

function candidateShape(value) {
  const length = value.length;
  const shapes = [];
  for (let width = 4; width <= 32; width += 1) {
    if (length % width) continue;
    const height = length / width;
    if (height >= 4 && height <= 32) shapes.push({ width, height });
  }
  return shapes.sort((a, b) => Math.abs(a.width - a.height) - Math.abs(b.width - b.height))[0] || null;
}

const candidates = strings
  .filter(row => /^[0X?S+\-]+$/.test(row.text) && row.text.length >= 80 && !/^\d+$/.test(row.text))
  .map(row => {
    const title = previousTitle(row.offset);
    const name = titleName(title);
    const game = catalogByName.get(name);
    const shape = candidateShape(row.text);
    return {
      sectionId: game ? game.id : null,
      sectionName: name,
      sourceOffset: row.offset,
      sourceLength: row.text.length,
      shape,
      symbols: [...new Set(row.text.split(''))].sort(),
      value: row.text
    };
  });

const groups = [];
const bySection = new Map();
candidates.forEach(record => {
  const key = record.sectionId || record.sectionName || 'unassigned';
  if (!bySection.has(key)) bySection.set(key, []);
  bySection.get(key).push(record);
});
bySection.forEach((items, key) => {
  groups.push({
    sectionId: items[0].sectionId,
    sectionName: items[0].sectionName,
    assignmentVerified: false,
    recordsArePlayableLevels: false,
    fullGameRulesVerified: false,
    count: items.length,
    shapes: [...new Set(items.map(item => item.shape ? item.shape.width + 'x' + item.shape.height : 'unknown'))],
    records: items
  });
});

const result = {
  version: 1,
  source: 'output/pk32-reference/strings.json',
  dataKind: 'native-char-grid-candidates',
  assignmentVerified: false,
  recordsArePlayableLevels: false,
  fullGameRulesVerified: false,
  total: candidates.length,
  groups
};

const output = path.join(root, 'public', 'data', 'pk32-char-grid-candidates.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), groups: groups.length, records: result.total }));
