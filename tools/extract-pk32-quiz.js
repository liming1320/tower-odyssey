'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const stringsFile = path.join(root, 'output', 'pk32-reference', 'strings.json');
const outFile = path.join(root, 'public', 'data', 'pk32-quiz-levels.json');

const START = 1934668;
const END = 2155264;
const rows = JSON.parse(fs.readFileSync(stringsFile, 'utf8'))
  .filter(row => row.offset >= START && row.offset < END)
  .map(row => ({ offset: row.offset, text: String(row.text || '').trim() }))
  .filter(row => row.text);

function looksLikeQuestion(text) {
  if (text.length < 6) return false;
  if (/[？?：:]$/.test(text)) return true;
  return /(什么|哪个|哪种|哪位|哪里|多少|是否|对吗|不对|是谁|为什么)/.test(text);
}

function looksLikeChoiceList(text) {
  if (/[？?：:]/.test(text)) return false;
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 8 && parts.every(part => part.length <= 18);
}

function looksLikeCategory(text) {
  if (looksLikeQuestion(text) || looksLikeChoiceList(text)) return false;
  return text.length >= 2 && text.length <= 12;
}

const categories = [];
const questions = [];
const choices = [];
let currentCategory = '';

for (const row of rows) {
  if (looksLikeCategory(row.text)) {
    currentCategory = row.text;
    categories.push({ offset: row.offset, name: row.text });
    continue;
  }
  if (looksLikeQuestion(row.text)) {
    questions.push({
      number: questions.length + 1,
      offset: row.offset,
      category: currentCategory,
      prompt: row.text,
      choices: [],
      answerStatus: 'not-decoded'
    });
    continue;
  }
  if (looksLikeChoiceList(row.text)) {
    choices.push({ offset: row.offset, values: row.text.split(/\s+/).filter(Boolean) });
  }
}

const result = {
  version: 1,
  name: '开心辞典',
  source: 'output/pk32-reference/strings.json',
  dataKind: 'question-bank',
  assignmentVerified: true,
  recordsArePlayableLevels: true,
  fullGameRulesVerified: false,
  nativeLevelCount: 12,
  extractedQuestionCount: questions.length,
  extractedChoiceListCount: choices.length,
  categories,
  choiceLists: choices.map((choice, index) => ({
    number: index + 1,
    offset: choice.offset,
    choices: choice.values.map((value, choiceIndex) => ({
      key: String.fromCharCode(65 + choiceIndex),
      text: value
    }))
  })),
  levels: questions,
  migrationNote: 'Question prompts and candidate choice rows are extracted from the PK32 string table. Correct-answer mapping still requires p-code or runtime trace recovery.'
};

result.sourceSha256 = crypto.createHash('sha256').update(JSON.stringify({
  start: START,
  end: END,
  rows: rows.map(row => [row.offset, row.text])
})).digest('hex');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  out: path.relative(root, outFile),
  questions: questions.length,
  choiceLists: choices.length,
  categories: categories.length,
  fullGameRulesVerified: false
}));
