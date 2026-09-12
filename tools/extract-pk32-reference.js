// Offline extraction of resource data from the user's PK32 executable image.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const input = process.argv[2] || 'output/pk32-reference/module.bin';
const output = process.argv[3] || 'output/pk32-reference';
const b = fs.readFileSync(input);
fs.mkdirSync(output, { recursive: true });
const strings = [];
for (let i = 0; i < b.length - 8; i += 2) {
    const n = b.readUInt32LE(i);
    if (n < 2 || n > 100000 || n % 2 || i + n + 6 > b.length || b.readUInt16LE(i + n + 4)) continue;
    const text = b.subarray(i + 4, i + 4 + n).toString('utf16le');
    if (/^[\x20-\x7e\r\n\t\u3000-\u9fff\uff00-\uffef]+$/.test(text)) strings.push({ offset: i + 4, text });
}
fs.writeFileSync(path.join(output, 'strings.json'), JSON.stringify(strings, null, 2));
const tower = strings.filter(s => s.offset >= 0x1d4bec && s.offset <= 0x1d7544 && /^\d{242}$/.test(s.text));
fs.writeFileSync(path.join(output, 'tower1-maps.json'), JSON.stringify(tower, null, 2));
const numericMaps = strings.filter(s => /^\d+$/.test(s.text) && (s.text.length === 242 || s.text.length === 900));
const towerSets = [
    { name: '魔塔', min: 0x1d4bec, max: 0x1d7544, width: 11, height: 11 },
    { name: '魔塔二', min: 0x2a9064, max: 0x2af6f4, width: 11, height: 11 },
    { name: '魔塔三', min: 0x2b1098, max: 0x2b4408, width: 11, height: 11 },
    { name: '魔塔四', min: 0x2fe278, max: 0x3013e8, width: 30, height: 30 }
].map(set => Object.assign(set, { maps: numericMaps.filter(s => s.offset >= set.min && s.offset <= set.max) }));
fs.writeFileSync(path.join(output, 'tower-maps-index.json'), JSON.stringify(towerSets, null, 2));
const bitmaps = [];
for (let p = 0; (p = b.indexOf(Buffer.from('BM'), p)) >= 0; p++) {
    if (p + 54 >= b.length) break;
    const size = b.readUInt32LE(p + 2), off = b.readUInt32LE(p + 10), dib = b.readUInt32LE(p + 14);
    const width = b.readInt32LE(p + 18), height = b.readInt32LE(p + 22);
    if (size <= 54 || size >= 20000000 || p + size > b.length || off < 54 || off >= size || dib !== 40 || width <= 0 || width >= 4096 || Math.abs(height) >= 4096) continue;
    if (width < 100 || Math.abs(height) < 100) continue;
    const file = 'sheet-' + p.toString(16) + '.bmp';
    const bytes = b.subarray(p, p + size);
    fs.writeFileSync(path.join(output, file), bytes);
    bitmaps.push({ file, offset: p, width, height, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
fs.writeFileSync(path.join(output, 'bitmaps.json'), JSON.stringify(bitmaps, null, 2));
console.log(JSON.stringify({ strings: strings.length, tower1Maps: tower.length, towerSets: towerSets.map(s => ({ name: s.name, maps: s.maps.length, width: s.width, height: s.height })), bitmaps: bitmaps.length }));
