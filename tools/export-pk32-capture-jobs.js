'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-native-catalog.json'), 'utf8'));
const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? Number(process.argv[index + 1]) : null;
};
const from = argument('--from') || 1;
const to = argument('--to') || 213;

if (!Array.isArray(catalog.records) || catalog.records.length !== 213) throw new Error('Expected 213 PK32 catalog records.');
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 213 || from > to) throw new Error('Invalid capture range.');

process.stdout.write('id\tcatalogIndex\tmoduleCandidate\tdownCount\tnameBase64\n');
for (let index = from - 1; index < to; index += 1) {
  const record = catalog.records[index];
  const nameBase64 = Buffer.from(record.name, 'utf8').toString('base64');
  process.stdout.write(`${record.id}\t${index + 1}\tPk_${String(index + 1).padStart(2, '0')}\t${index}\t${nameBase64}\n`);
}
