'use strict';

const fs = require('fs');

const file = process.argv[2] || 'F:/BaiduNetdiskDownload/FullTilt/CADET/CADET.EXE';
const wantedRva = process.argv[3] ? Number.parseInt(process.argv[3], 16) : null;
const data = fs.readFileSync(file);
const peOffset = data.readUInt32LE(0x3c);
if (data.readUInt32LE(peOffset) !== 0x00004550) throw new Error('Not a PE image');

const sectionCount = data.readUInt16LE(peOffset + 6);
const optionalSize = data.readUInt16LE(peOffset + 20);
const optionalOffset = peOffset + 24;
const imageBase = data.readUInt32LE(optionalOffset + 28);
const entryRva = data.readUInt32LE(optionalOffset + 16);
const sectionOffset = optionalOffset + optionalSize;
const sections = [];

for (let i = 0; i < sectionCount; i++) {
    const offset = sectionOffset + i * 40;
    const name = data.subarray(offset, offset + 8).toString('ascii').replace(/\0.*$/, '');
    sections.push({
        name,
        virtualSize: data.readUInt32LE(offset + 8),
        rva: data.readUInt32LE(offset + 12),
        rawSize: data.readUInt32LE(offset + 16),
        rawOffset: data.readUInt32LE(offset + 20),
        characteristics: data.readUInt32LE(offset + 36),
    });
}

function sectionForRva(rva) {
    return sections.find(section => rva >= section.rva && rva < section.rva + Math.max(section.virtualSize, section.rawSize));
}

function fileOffsetForRva(rva) {
    const section = sectionForRva(rva);
    return section ? section.rawOffset + rva - section.rva : -1;
}

function hex(value) {
    return '0x' + value.toString(16).padStart(6, '0');
}

function asciiAt(offset) {
    let value = '';
    while (offset < data.length && data[offset] >= 0x20 && data[offset] <= 0x7e) value += String.fromCharCode(data[offset++]);
    return value;
}

function xrefsToVa(va, section) {
    const pattern = Buffer.alloc(4);
    pattern.writeUInt32LE(va);
    const end = section.rawOffset + section.rawSize - 4;
    const refs = [];
    for (let offset = section.rawOffset; offset <= end; offset++) {
        if (data[offset] !== pattern[0] || data[offset + 1] !== pattern[1] || data[offset + 2] !== pattern[2] || data[offset + 3] !== pattern[3]) continue;
        refs.push(imageBase + section.rva + offset - section.rawOffset);
    }
    return refs;
}

console.log(JSON.stringify({ file, imageBase: hex(imageBase), entryRva: hex(entryRva), sections }, null, 2));

const rdata = sectionForRva(0x35000);
const text = sections.find(section => section.name === '.text');
if (rdata && text) {
    const constants = [];
    for (let offset = rdata.rawOffset; offset + 4 <= rdata.rawOffset + rdata.rawSize; offset += 4) {
        const value = data.readFloatLE(offset);
        if (!Number.isFinite(value) || Math.abs(value) < 0.001 || Math.abs(value) > 10000) continue;
        const rva = rdata.rva + offset - rdata.rawOffset;
        const refs = xrefsToVa(imageBase + rva, text);
        if (refs.length) constants.push({ rva: hex(rva), value, refs: refs.map(hex) });
    }
    console.log(JSON.stringify({ floatConstants: constants }, null, 2));
}

if (wantedRva != null) {
    const offset = fileOffsetForRva(wantedRva);
    if (offset < 0) throw new Error('RVA is outside a section');
    console.log(JSON.stringify({ rva: hex(wantedRva), fileOffset: hex(offset), bytes: data.subarray(offset, offset + 96).toString('hex'), ascii: asciiAt(offset) }, null, 2));
}
