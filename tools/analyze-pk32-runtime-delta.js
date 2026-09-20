'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const input = path.resolve(root, argument('--input') || 'output/pk32-reference/runtime-delta-integration');
const output = path.resolve(root, argument('--output') || 'output/pk32-reference/runtime-delta-evidence.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function printableAsciiRuns(bytes) {
  const runs = new Set();
  let start = 0;
  for (let index = 0; index <= bytes.length; index += 1) {
    const printable = index < bytes.length && bytes[index] >= 0x20 && bytes[index] <= 0x7e;
    if (printable) continue;
    if (index - start >= 5) {
      const text = bytes.subarray(start, index).toString('ascii').trim();
      if (/[A-Za-z0-9]/.test(text)) runs.add(text);
    }
    start = index + 1;
  }
  return [...runs].slice(0, 80);
}

function utf16Runs(bytes) {
  const runs = new Set();
  for (let start = 0; start + 6 <= bytes.length; start += 2) {
    let end = start;
    while (end + 2 <= bytes.length) {
      const code = bytes.readUInt16LE(end);
      if (!((code >= 0x20 && code <= 0x7e) || (code >= 0x4e00 && code <= 0x9fff))) break;
      end += 2;
    }
    if (end - start >= 6) {
      const text = bytes.subarray(start, end).toString('utf16le').trim();
      if (/^[\x20-\x7e\u4e00-\u9fff]+$/.test(text) && /[\u4e00-\u9fffA-Za-z0-9]/.test(text)) runs.add(text);
    }
  }
  return [...runs].slice(0, 80);
}

function signatures(bytes) {
  const found = [];
  const tests = [
    ['pe-image', Buffer.from('MZ')],
    ['bitmap', Buffer.from('BM')],
    ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['riff', Buffer.from('RIFF')],
    ['vb5', Buffer.from('VB5!')]
  ];
  for (const [name, needle] of tests) if (bytes.indexOf(needle) >= 0) found.push(name);
  return found;
}

const catalog = readJson(path.join(root, 'public', 'data', 'pk32-native-catalog.json')).records || [];
const entries = fs.existsSync(input) ? fs.readdirSync(input, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => path.join(input, entry.name))
  .filter(directory => fs.existsSync(path.join(directory, 'record.json')))
  .sort((left, right) => left.localeCompare(right)) : [];

const records = entries.map(directory => {
  const record = readJson(path.join(directory, 'record.json'));
  const manifestPath = path.join(directory, 'runtime-delta', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      directory: path.relative(root, directory).replace(/\\/g, '/'),
      uiPosition: record.uiPosition,
      pageNumber: record.pageNumber,
      status: record.status,
      runtimeDeltaCaptured: false,
      evidenceBoundary: 'No delta manifest was produced; this record cannot support rule recovery.'
    };
  }

  const manifest = readJson(manifestPath);
  const ascii = new Set();
  const utf16 = new Set();
  const resourceSignatures = new Set();
  const protectionTypes = new Map();
  for (const page of manifest.pages || []) {
    const typeKey = `${page.protection}/${page.type}`;
    protectionTypes.set(typeKey, (protectionTypes.get(typeKey) || 0) + 1);
    const pagePath = path.join(directory, 'runtime-delta', page.file || '');
    if (!page.file || !fs.existsSync(pagePath)) continue;
    const bytes = fs.readFileSync(pagePath);
    for (const text of printableAsciiRuns(bytes)) ascii.add(text);
    for (const text of utf16Runs(bytes)) utf16.add(text);
    for (const signature of signatures(bytes)) resourceSignatures.add(signature);
  }
  const text = [...ascii, ...utf16].join('\n');
  const titleMatches = catalog.filter(game => text.includes(game.name)).map(game => ({ id: game.id, name: game.name }));
  return {
    directory: path.relative(root, directory).replace(/\\/g, '/'),
    uiPosition: record.uiPosition,
    pageNumber: record.pageNumber,
    coordinate: record.coordinate,
    status: record.status,
    runtimeDeltaCaptured: true,
    delta: manifest.summary,
    pageTypes: [...protectionTypes].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    resourceSignatures: [...resourceSignatures].sort(),
    titleMatches,
    asciiStrings: [...ascii].sort().slice(0, 160),
    utf16Strings: [...utf16].sort().slice(0, 160),
    evidenceBoundary: 'Runtime delta confirms an observed process state only. It does not prove a catalog binding, rule recovery, full flow recovery, migration completion, or original completion.'
  };
});

const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  input: path.relative(root, input).replace(/\\/g, '/'),
  policy: {
    runtimeCaptureIsEvidenceOnly: true,
    titleMatchesRequireFurtherBindingReview: true,
    doesNotChangeMigrationStatus: true
  },
  summary: {
    records: records.length,
    runtimeDeltaRecords: records.filter(record => record.runtimeDeltaCaptured).length,
    truncatedDeltas: records.filter(record => record.delta && record.delta.truncated).length,
    titleMatchedRecords: records.filter(record => record.titleMatches && record.titleMatches.length).length,
    capturedBytes: records.reduce((sum, record) => sum + (record.delta ? record.delta.capturedBytes : 0), 0)
  },
  records
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...result.summary }));
