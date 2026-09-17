'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const pcodeDir = path.join(reference, 'pcode');
const regionDir = path.join(reference, 'runtime-regions');

function readRegions() {
  if (!fs.existsSync(regionDir)) return [];
  return fs.readdirSync(regionDir)
    .filter(name => /^[0-9a-f]{8}-[0-9a-f]{8}\.bin$/i.test(name))
    .map(name => {
      const [baseText, lengthText] = name.replace(/\.bin$/i, '').split('-');
      return {
        file: name,
        base: parseInt(baseText, 16),
        length: parseInt(lengthText, 16),
        bytes: fs.readFileSync(path.join(regionDir, name))
      };
    });
}

function findRegion(regions, address, size) {
  return regions.find(region => address >= region.base && address + size <= region.base + region.length) || null;
}

function readBytes(regions, address, size) {
  const region = findRegion(regions, address, size);
  if (!region) return null;
  const offset = address - region.base;
  return { region, offset, bytes: region.bytes.subarray(offset, offset + size) };
}

function parseObjectDump(file) {
  const text = fs.readFileSync(file, 'utf8');
  const object = {
    file: path.basename(file),
    index: Number((text.match(/^OBJECT #(\d+)/m) || [])[1]),
    name: (text.match(/^\s*Name\s*:\s*(.+)$/m) || [])[1] || '',
    declaredMethods: Number((text.match(/DeclaredMethods:\s*(\d+)/) || [])[1] || 0),
    methodTableVa: parseInt((text.match(/MethodTableVA\s*: 0x([0-9A-F]+)/i) || [])[1] || '0', 16),
    methodTableRva: parseInt((text.match(/RVA 0x([0-9A-F]+)/i) || [])[1] || '0', 16),
    fileSize: parseInt((text.match(/FileSize\s*: 0x([0-9A-F]+)/i) || [])[1] || '0', 16)
  };
  return Number.isFinite(object.index) ? object : null;
}

const regions = readRegions();
function pointerStats(bytes, entryCount, width) {
  const entries = [];
  let validPointers = 0;
  let zeroPointers = 0;
  let invalidHighPattern = 0;
  const count = Math.min(entryCount, Math.floor(bytes.length / width));
  for (let index = 0; index < count; index += 1) {
    const offset = index * width;
    const first = bytes.readUInt32LE(offset);
    const second = width >= 8 ? bytes.readUInt32LE(offset + 4) : null;
    const firstRegion = findRegion(regions, first, 1);
    const secondRegion = second == null ? null : findRegion(regions, second, 1);
    if (firstRegion) validPointers += 1;
    if (secondRegion) validPointers += 1;
    if (first === 0 || second === 0) zeroPointers += 1;
    if ((first & 0xff00ffff) === 0xdf00d844 || (first & 0xff00ffff) === 0xdf00d84a) invalidHighPattern += 1;
    entries.push({
      index,
      first,
      second,
      firstHex: '0x' + first.toString(16),
      secondHex: second == null ? null : '0x' + second.toString(16),
      firstRegion: firstRegion ? firstRegion.file : null,
      secondRegion: secondRegion ? secondRegion.file : null
    });
  }
  return { width, entries, validPointers, zeroPointers, invalidHighPattern };
}

function byteProfile(bytes) {
  const counts = new Map();
  let printable = 0;
  for (const byte of bytes) {
    counts.set(byte, (counts.get(byte) || 0) + 1);
    if (byte >= 0x20 && byte <= 0x7e) printable += 1;
  }
  const topBytes = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([byte, count]) => ({
    byte: '0x' + byte.toString(16).padStart(2, '0'),
    count
  }));
  return {
    printableRatio: bytes.length ? Number((printable / bytes.length).toFixed(4)) : 0,
    topBytes
  };
}

function procDscProbe(entries) {
  const probes = [];
  for (const entry of entries.slice(0, 32)) {
    for (const field of ['first', 'second']) {
      if (!Number.isInteger(entry[field])) continue;
      const target = readBytes(regions, entry[field], 10);
      if (!target) continue;
      const procTable = target.bytes.readUInt32LE(0);
      const frameSize = target.bytes.readUInt16LE(6);
      const procSize = target.bytes.readUInt16LE(8);
      const procTableRegion = findRegion(regions, procTable, 56);
      const reasonable = !!procTableRegion && procSize > 0 && procSize < 0x4000 && frameSize < 0x4000;
      probes.push({
        entry: entry.index,
        field,
        address: '0x' + entry[field].toString(16),
        region: target.region.file,
        procTable: '0x' + procTable.toString(16),
        procTableRegion: procTableRegion ? procTableRegion.file : null,
        frameSize,
        procSize,
        reasonable
      });
    }
  }
  return {
    checked: probes.length,
    reasonableCandidates: probes.filter(probe => probe.reasonable).length,
    probes: probes.slice(0, 16)
  };
}

function classifyProbe(read, pointer4, pointer8) {
  if (!read) return 'not-captured';
  const profile = byteProfile(read.bytes);
  const top = profile.topBytes[0];
  if (top && top.count / read.bytes.length > 0.65) return 'repeated-byte-data';
  if (pointer8.validPointers >= 2 && pointer8.invalidHighPattern === 0) return 'pointer-table-candidate';
  if (pointer8.invalidHighPattern > 0 || pointer4.invalidHighPattern > 0) return 'descriptor-like-or-unrelated-runtime-table';
  if (profile.printableRatio > 0.75) return 'printable-data';
  return 'unclassified-data';
}

const objects = fs.existsSync(pcodeDir) ? fs.readdirSync(pcodeDir)
  .filter(name => /^\d{3}_.+\.txt$/.test(name))
  .map(name => parseObjectDump(path.join(pcodeDir, name)))
  .filter(Boolean)
  .filter(object => object.declaredMethods > 0)
  .map(object => {
    const bytesNeeded = Math.max(8, object.declaredMethods * 8);
    const vaRead = readBytes(regions, object.methodTableVa, bytesNeeded);
    const rvaRead = readBytes(regions, object.methodTableRva, bytesNeeded);
    const vaPointer4 = vaRead ? pointerStats(vaRead.bytes, object.declaredMethods, 4) : { width: 4, entries: [], validPointers: 0, zeroPointers: 0, invalidHighPattern: 0 };
    const vaPointer8 = vaRead ? pointerStats(vaRead.bytes, object.declaredMethods, 8) : { width: 8, entries: [], validPointers: 0, zeroPointers: 0, invalidHighPattern: 0 };
    const rvaPointer4 = rvaRead ? pointerStats(rvaRead.bytes, object.declaredMethods, 4) : { width: 4, entries: [], validPointers: 0, zeroPointers: 0, invalidHighPattern: 0 };
    const rvaPointer8 = rvaRead ? pointerStats(rvaRead.bytes, object.declaredMethods, 8) : { width: 8, entries: [], validPointers: 0, zeroPointers: 0, invalidHighPattern: 0 };
    const vaClassification = classifyProbe(vaRead, vaPointer4, vaPointer8);
    const rvaClassification = classifyProbe(rvaRead, rvaPointer4, rvaPointer8);
    const vaProcDsc = procDscProbe(vaPointer8.entries);
    const rvaProcDsc = procDscProbe(rvaPointer8.entries);
    const runtimeTableFound = vaClassification === 'pointer-table-candidate' && vaProcDsc.reasonableCandidates > 0;
    const entries = rvaPointer8.entries.map(entry => ({ ...entry, addressSpace: 'rva-probe', trusted: false }));
    return {
      index: object.index,
      name: object.name,
      declaredMethods: object.declaredMethods,
      methodTableRva: object.methodTableRva,
      methodTableVa: object.methodTableVa,
      runtimeTableFound,
      methodBodyCaptured: false,
      runtimeRegion: vaRead ? vaRead.region.file : null,
      entryWidthAssumption: runtimeTableFound ? 8 : null,
      addressSpaceWarning: 'runtime-regions are VA-based; RVA hits are kept only as untrusted probes',
      vaProbe: {
        address: '0x' + object.methodTableVa.toString(16),
        region: vaRead ? vaRead.region.file : null,
        offset: vaRead ? vaRead.offset : null,
        classification: vaClassification,
        byteProfile: vaRead ? byteProfile(vaRead.bytes) : null,
        width4: { validPointers: vaPointer4.validPointers, zeroPointers: vaPointer4.zeroPointers, invalidHighPattern: vaPointer4.invalidHighPattern },
        width8: { validPointers: vaPointer8.validPointers, zeroPointers: vaPointer8.zeroPointers, invalidHighPattern: vaPointer8.invalidHighPattern },
        procDscProbe: vaProcDsc
      },
      rvaProbe: {
        address: '0x' + object.methodTableRva.toString(16),
        region: rvaRead ? rvaRead.region.file : null,
        offset: rvaRead ? rvaRead.offset : null,
        classification: rvaClassification,
        trusted: false,
        byteProfile: rvaRead ? byteProfile(rvaRead.bytes) : null,
        width4: { validPointers: rvaPointer4.validPointers, zeroPointers: rvaPointer4.zeroPointers, invalidHighPattern: rvaPointer4.invalidHighPattern },
        width8: { validPointers: rvaPointer8.validPointers, zeroPointers: rvaPointer8.zeroPointers, invalidHighPattern: rvaPointer8.invalidHighPattern },
        procDscProbe: rvaProcDsc
      },
      entries
    };
  }) : [];

const result = {
  version: 1,
  source: [
    'output/pk32-reference/pcode/*.txt',
    'output/pk32-reference/runtime-regions/*.bin'
  ],
  policy: {
    methodTableEvidenceIsNotRuleRecovery: true,
    entryWidthAssumptionRequiresThunkDecoding: true,
    runtimeRegionsAreVaBased: true,
    rvaProbeIsUntrusted: true
  },
  summary: {
    runtimeRegions: regions.length,
    objectsWithDeclaredMethods: objects.length,
    objectsWithRuntimeMethodTables: objects.filter(object => object.runtimeTableFound).length,
    objectsWithVaProbe: objects.filter(object => object.vaProbe && object.vaProbe.region).length,
    objectsWithRvaProbe: objects.filter(object => object.rvaProbe && object.rvaProbe.region).length,
    methodBodyCaptured: objects.filter(object => object.methodBodyCaptured).length,
    methodEntries: objects.reduce((sum, object) => sum + object.entries.length, 0),
    entriesWithRegionTargets: objects.reduce((sum, object) => sum + object.entries.filter(entry => entry.firstRegion || entry.secondRegion).length, 0),
    trustedMethodEntries: objects.reduce((sum, object) => sum + object.entries.filter(entry => entry.trusted).length, 0)
  },
  objects
};

const output = path.join(reference, 'runtime-method-evidence.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...result.summary }));
