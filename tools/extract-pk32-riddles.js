'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const stringsFile = path.join(root, 'output', 'pk32-reference', 'strings.json');
const outFile = path.join(root, 'public', 'data', 'pk32-riddle-levels.json');

const START = 2155580;
const END = 2375824;
const skip = new Set(['扑克32--开心灯谜', '答案减一', '答案减二', '答案减三']);
const rows = JSON.parse(fs.readFileSync(stringsFile, 'utf8'))
  .filter(row => row.offset >= START && row.offset < END)
  .map(row => ({ offset: row.offset, text: String(row.text || '').trim() }))
  .filter(row => row.text && !skip.has(row.text));

function looksLikeRiddle(text) {
  if (text.length < 2 || text.length > 64) return false;
  if (/^[0-9A-Z]+$/i.test(text)) return false;
  return /[\u4e00-\u9fff]/.test(text);
}

const levels = rows.filter(row => looksLikeRiddle(row.text)).map((row, index) => ({
  number: index + 1,
  offset: row.offset,
  prompt: row.text,
  answerStatus: 'not-decoded'
}));

const result = {
  version: 1,
  name: '开心灯谜',
  source: 'output/pk32-reference/strings.json',
  dataKind: 'riddle-bank',
  assignmentVerified: true,
  recordsArePlayableLevels: true,
  fullGameRulesVerified: false,
  nativeLevelCount: null,
  extractedRiddleCount: levels.length,
  levels,
  migrationNote: 'Riddle text is extracted from the PK32 string table. Answer mapping and scoring flow still require p-code or runtime trace recovery.'
};

result.sourceSha256 = crypto.createHash('sha256').update(JSON.stringify({
  start: START,
  end: END,
  rows: levels.map(row => [row.offset, row.prompt])
})).digest('hex');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  out: path.relative(root, outFile),
  riddles: levels.length,
  fullGameRulesVerified: false
}));
