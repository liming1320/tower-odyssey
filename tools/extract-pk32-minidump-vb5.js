'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const dumpDirectory = path.join(reference, 'memory-dumps');
const dumpCandidates = [
  path.join(dumpDirectory, 'Pk32-full-memory.dmp'),
  path.join(dumpDirectory, 'Pk32.DMP')
];
const dumpPath = dumpCandidates.find(candidate => fs.existsSync(candidate));
const writeImage = process.argv.includes('--write-image');

function fail(message) {
  throw new Error(message);
}

function hex(value) {
  return `0x${Number(value >>> 0).toString(16).padStart(8, '0')}`;
}

function readCString(readVa, address, limit = 512) {
  if (!address) return '';
  const bytes = readVa(address, limit);
  if (!bytes) return '';
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end < 0 ? bytes.length : end).toString('latin1').trim();
}

function parseMiniDump(dump) {
  if (dump.length < 32 || dump.toString('ascii', 0, 4) !== 'MDMP') fail('Not a standard MiniDump file.');
  const streamCount = dump.readUInt32LE(8);
  const directoryRva = dump.readUInt32LE(12);
  const streams = [];
  for (let index = 0; index < streamCount; index += 1) {
    const offset = directoryRva + index * 12;
    if (offset + 12 > dump.length) fail('MiniDump stream directory is truncated.');
    streams.push({
      type: dump.readUInt32LE(offset),
      dataSize: dump.readUInt32LE(offset + 4),
      rva: dump.readUInt32LE(offset + 8)
    });
  }
  const memory64 = streams.find(stream => stream.type === 9);
  if (!memory64) fail('MiniDump does not contain a Memory64ListStream.');
  if (memory64.rva + 16 > dump.length) fail('Memory64ListStream header is truncated.');
  const count = Number(dump.readBigUInt64LE(memory64.rva));
  const baseRva = Number(dump.readBigUInt64LE(memory64.rva + 8));
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(baseRva)) fail('MiniDump uses unsupported 64-bit offsets.');
  const ranges = [];
  let dataOffset = baseRva;
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
  ranges.sort((left, right) => left.base - right.base);
  return { streamCount, ranges };
}

function createVaReader(dump, ranges) {
  return function readVa(address, size) {
    if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) || size < 0) return null;
    const chunks = [];
    let remaining = size;
    let cursor = address;
    while (remaining > 0) {
      const range = ranges.find(candidate => cursor >= candidate.base && cursor < candidate.base + candidate.size);
      if (!range) return null;
      const available = range.base + range.size - cursor;
      const length = Math.min(available, remaining);
      chunks.push(dump.subarray(range.dataOffset + cursor - range.base, range.dataOffset + cursor - range.base + length));
      cursor += length;
      remaining -= length;
    }
    return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
  };
}

function findLoadedImage(readVa, ranges) {
  for (const range of ranges) {
    const probe = readVa(range.base, 0x1000);
    if (!probe || probe.toString('ascii', 0, 2) !== 'MZ') continue;
    const peOffset = probe.readUInt32LE(0x3c);
    const pe = readVa(range.base + peOffset, 0x80);
    if (!pe || pe.toString('ascii', 0, 4) !== 'PE\0\0') continue;
    const optional = pe.subarray(24);
    if (optional.readUInt16LE(0) !== 0x10b) continue;
    return {
      base: optional.readUInt32LE(28),
      sizeOfImage: optional.readUInt32LE(56),
      entryPointRva: optional.readUInt32LE(16)
    };
  }
  fail('No loaded PE32 image was found in the MiniDump.');
}

function parseObject(readVa, address, index) {
  const raw = readVa(address, 48);
  if (!raw) return null;
  const objectInfoAddress = raw.readUInt32LE(0);
  const nameAddress = raw.readUInt32LE(24);
  const methodNameTableAddress = raw.readUInt32LE(32);
  const objectInfo = readVa(objectInfoAddress, 56);
  if (!objectInfo) return {
    index,
    name: readCString(readVa, nameAddress) || `object_${index}`,
    objectInfoAddress: hex(objectInfoAddress),
    objectInfoCaptured: false,
    declaredMethodCount: raw.readUInt32LE(28),
    methodNameTableAddress: hex(methodNameTableAddress),
    objectType: hex(raw.readUInt32LE(40))
  };
  const methodCount = objectInfo.readUInt16LE(32);
  const methodTableAddress = objectInfo.readUInt32LE(36);
  const methodTable = methodCount ? readVa(methodTableAddress, methodCount * 4) : Buffer.alloc(0);
  const methodNames = [];
  const controls = new Map();
  const namedEventSlots = raw.readUInt32LE(28);
  for (let methodIndex = 0; methodIndex < namedEventSlots; methodIndex += 1) {
    const entry = methodNameTableAddress ? readVa(methodNameTableAddress + methodIndex * 4, 4) : null;
    const name = entry ? readCString(readVa, entry.readUInt32LE(0)) : '';
    if (!name) continue;
    methodNames.push(name);
    const separator = name.lastIndexOf('_');
    if (separator <= 0 || separator === name.length - 1) continue;
    const control = name.slice(0, separator);
    const event = name.slice(separator + 1);
    if (!controls.has(control)) controls.set(control, new Set());
    controls.get(control).add(event);
  }
  const methodPointers = methodTable ? Array.from({ length: methodCount }, (_, methodIndex) => hex(methodTable.readUInt32LE(methodIndex * 4))) : [];
  const capturedBodies = methodTable ? methodPointers.filter(pointer => !!readVa(parseInt(pointer, 16), 1)).length : 0;
  const methodTableCaptured = Boolean(methodTable) && methodCount > 0 && capturedBodies > 0;
  return {
    index,
    name: readCString(readVa, nameAddress) || `object_${index}`,
    objectInfoAddress: hex(objectInfoAddress),
    objectInfoCaptured: true,
    objectInfoIndex: objectInfo.readUInt16LE(2),
    declaredMethodCount: namedEventSlots,
    methodCount,
    methodNameTableAddress: hex(methodNameTableAddress),
    methodTableAddress: hex(methodTableAddress),
    namedEventSlots,
    methodTableBytesCaptured: Boolean(methodTable) && methodCount > 0,
    methodTableCaptured,
    methodBodyCaptured: methodTableCaptured && capturedBodies === methodCount,
    capturedMethodBodies: capturedBodies,
    objectType: hex(raw.readUInt32LE(40)),
    events: methodNames,
    controls: [...controls].map(([name, events]) => ({ name, events: [...events].sort() })).sort((left, right) => left.name.localeCompare(right.name)),
    methodPointers
  };
}

function buildDefinitions(objects) {
  return objects.map(object => {
    const moduleMatch = /^Pk_(\d+)$/.exec(object.name);
    const family = object.name === 'PkForm' ? 'launcher-form' : moduleMatch ? 'numbered-game-module' : object.name.startsWith('Pk') ? 'shared-pk32-module' : 'external-module';
    return {
      objectIndex: object.index,
      objectName: object.name,
      family,
      candidateGameNumber: moduleMatch ? Number(moduleMatch[1]) : null,
      namedEvents: object.events || [],
      controls: object.controls || [],
      evidence: {
        objectInfoCaptured: object.objectInfoCaptured,
        methodTableCaptured: Boolean(object.methodTableCaptured),
        methodBodyCaptured: Boolean(object.methodBodyCaptured)
      },
      migrationStatus: 'requires-rule-recovery',
      promotionAllowed: false
    };
  });
}

function writeDocumentation(runtime, definitions) {
  const summary = runtime.summary;
  const lines = [
    '# PK32 VB5 Runtime Export',
    '',
    `- Source: \`${runtime.source}\``,
    `- Loaded image: \`${summary.imageBase}\`, ${summary.sizeOfImage} bytes`,
    `- VB runtime build: ${summary.runtimeBuild}; forms: ${summary.formCount}; objects: ${summary.objectCount}`,
    `- Objects with captured method tables: ${summary.methodTableCaptured}`,
    `- Objects with captured method bodies: ${summary.methodBodyCaptured}`,
    `- Numbered game-module candidates: ${definitions.filter(item => item.family === 'numbered-game-module').length}`,
    '',
    '## Evidence Boundary',
    '',
    'This export recovers VB5 object metadata, named event handlers, control/event families, and whether the MiniDump actually contains each method table or body.',
    'A named event is not recovered rule logic. Entries without captured method bodies remain migration candidates and must not be promoted to migrationComplete, verificationComplete, or originalComplete.',
    '',
    '## Outputs',
    '',
    '- `output/pk32-reference/vb5-runtime-export.json`: raw runtime metadata and capture status.',
    '- `output/pk32-reference/vb5-runtime-migration-definitions.json`: event-family migration candidates.',
    '- `output/pk32-reference/unpacked/Pk32-runtime-image.bin`: optional loaded-image reconstruction.',
    ''
  ];
  fs.writeFileSync(path.join(root, 'docs', 'pk32-vb5-runtime-export.md'), lines.join('\n'));
}

if (!dumpPath) fail(`MiniDump not found. Checked: ${dumpCandidates.join(', ')}`);
const dump = fs.readFileSync(dumpPath);
const miniDump = parseMiniDump(dump);
const readVa = createVaReader(dump, miniDump.ranges);
const image = findLoadedImage(readVa, miniDump.ranges);
const imageBytes = readVa(image.base, image.sizeOfImage);
if (!imageBytes) fail('Loaded image is not fully captured by the MiniDump.');
const vbOffset = imageBytes.indexOf(Buffer.from('VB5!'));
if (vbOffset < 0) fail('VB5 header was not found in the loaded image.');
const vbHeader = readVa(image.base + vbOffset, 104);
const projectInfoAddress = vbHeader.readUInt32LE(48);
const projectInfo = readVa(projectInfoAddress, 572);
if (!projectInfo) fail('VB5 ProjectInfo is not captured.');
const objectTableAddress = projectInfo.readUInt32LE(4);
const objectTable = readVa(objectTableAddress, 84);
if (!objectTable) fail('VB5 ObjectTable is not captured.');
const objectCount = objectTable.readUInt16LE(42);
const objectsAddress = objectTable.readUInt32LE(48);
const objects = Array.from({ length: objectCount }, (_, index) => parseObject(readVa, objectsAddress + index * 48, index)).filter(Boolean);
const runtime = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: path.relative(root, dumpPath).replace(/\\/g, '/'),
  policy: {
    namedEventsAreNotRuleRecovery: true,
    incompleteMethodCaptureCannotPromoteMigration: true,
    statusFieldsAreNotModified: true
  },
  image: {
    base: hex(image.base),
    sizeOfImage: image.sizeOfImage,
    entryPoint: hex(image.base + image.entryPointRva),
    vbHeader: hex(image.base + vbOffset),
    projectInfo: hex(projectInfoAddress),
    objectTable: hex(objectTableAddress)
  },
  summary: {
    dumpBytes: dump.length,
    memoryRangeCount: miniDump.ranges.length,
    imageBase: hex(image.base),
    sizeOfImage: image.sizeOfImage,
    runtimeBuild: vbHeader.readUInt16LE(4),
    formCount: vbHeader.readUInt16LE(68),
    threadCount: vbHeader.readUInt16LE(64),
    objectCount,
    methodTableCaptured: objects.filter(object => object.methodTableCaptured).length,
    methodBodyCaptured: objects.filter(object => object.methodBodyCaptured).length,
    namedEventCount: objects.reduce((total, object) => total + (object.events || []).length, 0)
  },
  objects
};
const definitions = {
  version: 1,
  source: 'output/pk32-reference/vb5-runtime-export.json',
  policy: {
    candidatesNeedGameBindingEvidence: true,
    candidatesNeedRuleRecoveryBeforePromotion: true,
    noMigrationStatusIsChanged: true
  },
  definitions: buildDefinitions(objects)
};
fs.writeFileSync(path.join(reference, 'vb5-runtime-export.json'), JSON.stringify(runtime, null, 2) + '\n');
fs.writeFileSync(path.join(reference, 'vb5-runtime-migration-definitions.json'), JSON.stringify(definitions, null, 2) + '\n');
if (writeImage) {
  const unpackedDirectory = path.join(reference, 'unpacked');
  fs.mkdirSync(unpackedDirectory, { recursive: true });
  fs.writeFileSync(path.join(unpackedDirectory, 'Pk32-runtime-image.bin'), imageBytes);
}
writeDocumentation(runtime, definitions.definitions);
console.log(JSON.stringify({
  runtimeExport: 'output/pk32-reference/vb5-runtime-export.json',
  migrationDefinitions: 'output/pk32-reference/vb5-runtime-migration-definitions.json',
  ...runtime.summary,
  wroteImage: writeImage
}));
