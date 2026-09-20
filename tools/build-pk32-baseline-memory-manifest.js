'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'output', 'pk32-reference', 'memory-dumps', 'Pk32-full-memory.dmp');
const output = path.join(root, 'output', 'pk32-reference', 'runtime-baseline-pages.json');
const pageSize = 0x1000;

function fail(message) {
  throw new Error(message);
}

function hex(value) {
  return '0x' + value.toString(16).padStart(8, '0');
}

function parseMemory64Ranges(dump) {
  if (dump.length < 32 || dump.toString('ascii', 0, 4) !== 'MDMP') fail('Not a standard MiniDump file.');
  const streamCount = dump.readUInt32LE(8);
  const directoryRva = dump.readUInt32LE(12);
  let memory64 = null;
  for (let index = 0; index < streamCount; index += 1) {
    const offset = directoryRva + index * 12;
    if (offset + 12 > dump.length) fail('MiniDump stream directory is truncated.');
    if (dump.readUInt32LE(offset) === 9) {
      memory64 = { rva: dump.readUInt32LE(offset + 8) };
      break;
    }
  }
  if (!memory64 || memory64.rva + 16 > dump.length) fail('Memory64ListStream is missing or truncated.');

  const count = Number(dump.readBigUInt64LE(memory64.rva));
  let dataOffset = Number(dump.readBigUInt64LE(memory64.rva + 8));
  const ranges = [];
  for (let index = 0; index < count; index += 1) {
    const descriptor = memory64.rva + 16 + index * 16;
    if (descriptor + 16 > dump.length) fail('Memory64ListStream descriptor is truncated.');
    const base = Number(dump.readBigUInt64LE(descriptor));
    const size = Number(dump.readBigUInt64LE(descriptor + 8));
    if (!Number.isSafeInteger(base) || !Number.isSafeInteger(size) || dataOffset + size > dump.length) {
      fail(`Unsupported or truncated memory range ${index}.`);
    }
    ranges.push({ base, size, dataOffset });
    dataOffset += size;
  }
  return ranges;
}

if (!fs.existsSync(source)) fail(`Baseline dump not found: ${path.relative(root, source)}`);
const dump = fs.readFileSync(source);
const ranges = parseMemory64Ranges(dump);
const pages = [];
for (const range of ranges) {
  for (let offset = 0; offset < range.size; offset += pageSize) {
    const size = Math.min(pageSize, range.size - offset);
    const bytes = dump.subarray(range.dataOffset + offset, range.dataOffset + offset + size);
    pages.push({
      address: hex(range.base + offset),
      size,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    });
  }
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: path.relative(root, source).replace(/\\/g, '/'),
  policy: {
    sourceIsLauncherBaselineOnly: true,
    changedPagesAreRuntimeEvidenceNotRuleRecovery: true,
    doesNotChangeMigrationStatus: true
  },
  pageSize,
  summary: {
    dumpBytes: dump.length,
    rangeCount: ranges.length,
    pageCount: pages.length,
    capturedBytes: pages.reduce((sum, page) => sum + page.size, 0)
  },
  pages
};
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...manifest.summary }));
