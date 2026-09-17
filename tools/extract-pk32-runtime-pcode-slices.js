'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const regionDir = path.join(reference, 'runtime-regions');
const opcodeCsv = path.join(root, 'tools', 'vb_opcodes.csv');
const methodEvidenceFile = path.join(reference, 'runtime-method-evidence.json');
const stringsFile = path.join(reference, 'strings.json');
const nativeCatalogFile = path.join(root, 'public', 'data', 'pk32-native-catalog.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function hex(value) {
  return '0x' + Number(value >>> 0).toString(16);
}

function loadOpcodes() {
  const primary = new Map();
  const aliases = [];
  const lines = fs.readFileSync(opcodeCsv, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = line.split('@');
    const opcode = parseInt(row[0], 16);
    if (!Number.isFinite(opcode)) continue;
    if (row[2] === 'DOC') aliases.push([opcode, parseInt(row[1], 16)]);
    else primary.set(opcode, { opcode, name: row[2], size: parseInt(row[1], 16) });
  }
  const db = new Map(primary);
  for (const [opcode, target] of aliases) {
    if (primary.has(target)) db.set(opcode, { ...primary.get(target), opcode });
  }
  return db;
}

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
    })
    .sort((a, b) => a.base - b.base);
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

function decodeToken(db, bytes, offset, maxVarLength) {
  if (offset >= bytes.length) return null;
  let opcode = bytes[offset];
  let opcodeBytes = 1;
  if (opcode > 0xfa) {
    if (offset + 1 >= bytes.length) {
      return { ok: false, reason: 'truncated-wide-opcode', offset, opcode, consumed: bytes.length - offset };
    }
    opcode = (bytes[offset] << 8) | bytes[offset + 1];
    opcodeBytes = 2;
  }
  const meta = db.get(opcode);
  if (!meta) return { ok: false, reason: 'unknown-opcode', offset, opcode, consumed: 1 };
  let consumed = opcodeBytes + meta.size;
  let variableLength = null;
  if (meta.size === -1) {
    if (offset + opcodeBytes + 2 > bytes.length) {
      return { ok: false, reason: 'truncated-variable-length', offset, opcode, name: meta.name, consumed: bytes.length - offset };
    }
    variableLength = bytes.readUInt16LE(offset + opcodeBytes);
    if (variableLength > maxVarLength) {
      return { ok: false, reason: 'suspicious-variable-length', offset, opcode, name: meta.name, variableLength, consumed: 1 };
    }
    consumed = opcodeBytes + 2 + variableLength;
  }
  if (offset + consumed > bytes.length) {
    return { ok: false, reason: 'token-overruns-region', offset, opcode, name: meta.name, consumed: bytes.length - offset };
  }
  const raw = bytes.subarray(offset, offset + consumed);
  return {
    ok: true,
    offset,
    opcode,
    opcodeHex: hex(opcode),
    name: meta.name,
    consumed,
    variableLength,
    rawHex: raw.toString('hex')
  };
}

function readU16LE(raw, offset) {
  return offset + 2 <= raw.length ? raw.readUInt16LE(offset) : null;
}

function readU32LE(raw, offset) {
  return offset + 4 <= raw.length ? raw.readUInt32LE(offset) : null;
}

function summarizeOperands(token) {
  const raw = Buffer.from(token.rawHex, 'hex');
  const operands = raw.subarray(token.opcode > 0xfa ? 2 : 1);
  return {
    u16: readU16LE(operands, 0),
    u32: readU32LE(operands, 0)
  };
}

function countNames(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token.name, (counts.get(token.name) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24)
    .map(([name, count]) => ({ name, count }));
}

function isExitToken(name) {
  return /^(ExitProc|Return|End$|End\b)/.test(name);
}

function stringRefsForSlice(tokens, stringsByOffset, catalogByTitleOffset) {
  const refs = [];
  for (const token of tokens) {
    if (token.name !== 'LitStr') continue;
    const operand = summarizeOperands(token).u16;
    if (!Number.isInteger(operand)) continue;
    const candidates = [operand, operand + 0x400000];
    for (const offset of candidates) {
      const text = stringsByOffset.get(offset);
      if (!text) continue;
      refs.push({
        tokenOffset: token.address,
        stringOffset: offset,
        text,
        game: catalogByTitleOffset.get(offset) || null
      });
    }
  }
  return refs;
}

function decodeSlicesForObject(object, regions, db, stringsByOffset, catalogByTitleOffset) {
  const seed = object.methodTableRva;
  const read = readBytes(regions, seed, 256 * 1024);
  if (!read) {
    return { object: object.name, seed, seedHex: hex(seed), addressSpace: 'rva-probe', trusted: false, region: null, slices: [], stop: { reason: 'seed-not-in-runtime-region' } };
  }
  const bytes = read.region.bytes.subarray(read.offset);
  const slices = [];
  const maxVarLength = 512;
  const maxTokens = 4000;
  const maxSlices = Math.max(1, object.declaredMethods || 1);
  let offset = 0;
  let tokens = [];
  let sliceStart = 0;
  let stop = null;
  for (let index = 0; index < maxTokens && offset < bytes.length && slices.length < maxSlices; index += 1) {
    const token = decodeToken(db, bytes, offset, maxVarLength);
    if (!token || !token.ok) {
      stop = token ? {
        reason: token.reason,
        address: hex(seed + token.offset),
        opcodeHex: token.opcode == null ? null : hex(token.opcode),
        name: token.name || null,
        variableLength: token.variableLength || null
      } : { reason: 'eof' };
      break;
    }
    const withAddress = {
      address: hex(seed + token.offset),
      opcodeHex: token.opcodeHex,
      name: token.name,
      consumed: token.consumed,
      rawHex: token.rawHex.length <= 64 ? token.rawHex : token.rawHex.slice(0, 64) + '...'
    };
    tokens.push(withAddress);
    offset += token.consumed;
    if (isExitToken(token.name)) {
      const refs = stringRefsForSlice(tokens, stringsByOffset, catalogByTitleOffset);
      slices.push({
        index: slices.length,
        start: hex(seed + sliceStart),
        end: hex(seed + offset),
        bytes: offset - sliceStart,
        tokenCount: tokens.length,
        exitToken: token.name,
        confidence: tokens.length >= 3 ? 'low-confidence-rva-token-probe' : 'tiny-token-run',
        trusted: false,
        addressSpace: 'rva-probe',
        opcodeCounts: countNames(tokens),
        stringRefs: refs.slice(0, 20),
        tokens: tokens.slice(0, 80)
      });
      sliceStart = offset;
      tokens = [];
    }
  }
  if (tokens.length) {
    const refs = stringRefsForSlice(tokens, stringsByOffset, catalogByTitleOffset);
    slices.push({
      index: slices.length,
      start: hex(seed + sliceStart),
      end: hex(seed + offset),
      bytes: offset - sliceStart,
      tokenCount: tokens.length,
      exitToken: null,
      confidence: 'unterminated-rva-token-probe',
      trusted: false,
      addressSpace: 'rva-probe',
      opcodeCounts: countNames(tokens),
      stringRefs: refs.slice(0, 20),
      tokens: tokens.slice(0, 80)
    });
  }
  return {
    object: object.name,
    declaredMethods: object.declaredMethods,
    seed,
    seedHex: hex(seed),
    methodTableVa: object.methodTableVa,
    methodTableVaHex: hex(object.methodTableVa),
    addressSpace: 'rva-probe',
    trusted: false,
    addressSpaceWarning: 'runtime-regions are VA-based; this decodes the old RVA hit only as a false-positive probe',
    region: read.region.file,
    regionOffset: read.offset,
    slices,
    stop
  };
}

const db = loadOpcodes();
const regions = readRegions();
const methodEvidence = readJson(methodEvidenceFile, { objects: [] });
const strings = readJson(stringsFile, []);
const catalog = readJson(nativeCatalogFile, { records: [] });
const stringsByOffset = new Map((Array.isArray(strings) ? strings : []).map(row => [row.offset, row.text]));
const catalogByTitleOffset = new Map((catalog.records || []).filter(row => row.titleOffset != null).map(row => [row.titleOffset, { id: row.id, name: row.name }]));

const objects = (methodEvidence.objects || []).map(object => decodeSlicesForObject(object, regions, db, stringsByOffset, catalogByTitleOffset));
const slices = objects.flatMap(object => object.slices.map(slice => ({ object: object.object, ...slice })));
const result = {
  version: 1,
  source: [
    'output/pk32-reference/runtime-method-evidence.json',
    'output/pk32-reference/runtime-regions/*.bin',
    'tools/vb_opcodes.csv'
  ],
  policy: {
    pcodeSlicesAreEvidenceOnly: true,
    noRuleMigrationPromotion: true,
    suspiciousVariableLengthStopsDecode: true,
    rvaSlicesAreUntrusted: true,
    methodBodyCaptured: false
  },
  summary: {
    opcodeCount: db.size,
    runtimeRegions: regions.length,
    objectsAnalyzed: objects.length,
    objectsWithSlices: objects.filter(object => object.slices.length).length,
    pcodeSlices: slices.length,
    trustedPcodeSlices: slices.filter(slice => slice.trusted).length,
    terminatedSlices: slices.filter(slice => slice.exitToken).length,
    trustedTerminatedSlices: slices.filter(slice => slice.trusted && slice.exitToken).length,
    stringReferencedSlices: slices.filter(slice => slice.stringRefs.length).length,
    gameReferencedSlices: slices.filter(slice => slice.stringRefs.some(ref => ref.game)).length,
    methodBodyCaptured: false
  },
  objects
};

const output = path.join(reference, 'runtime-pcode-slices.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...result.summary }));
