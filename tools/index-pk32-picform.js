// Index custom PicForm blocks and the BMP payload that follows each block.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = process.argv[2] || path.join(__dirname, '..', 'output', 'pk32-reference', 'module.bin');
const out = process.argv[3] || path.join(__dirname, '..', 'output', 'pk32-reference', 'picform-index.json');
const b = fs.readFileSync(file);
const u16 = o => b.readUInt16LE(o);
const u32 = o => b.readUInt32LE(o);
const rows = [];
for (let p = 0; (p = b.indexOf(Buffer.from('PicForm'), p)) >= 0; p += 1) {
  const bmp = b.indexOf(Buffer.from('BM'), p + 7);
  if (bmp < 0 || bmp > p + 0x80 || bmp + 54 > b.length) continue;
  const size = u32(bmp + 2), width = b.readInt32LE(bmp + 18), height = b.readInt32LE(bmp + 22), bits = u16(bmp + 28);
  if (size < 54 || size > 20000000 || bmp + size > b.length || width <= 0 || height === 0 || bits > 32) continue;
  const block = b.subarray(p, bmp);
  // Serialized Index property: tag 2 at +14, UInt16 value at +15.
  const id = block.length >= 18 && block[14] === 2 && block[17] === 3 ? u16(p + 15) : null;
  rows.push({ headerOffset: p, bmpOffset: bmp, internalId: id, width, height, bits, size, sha256: crypto.createHash('sha256').update(b.subarray(bmp, bmp + size)).digest('hex') });
}
const unique = rows.filter((row, i) => rows.findIndex(other => other.bmpOffset === row.bmpOffset) === i);
fs.writeFileSync(out, JSON.stringify({ file, count: unique.length, records: unique }, null, 2));
console.log(JSON.stringify({ out, count: unique.length, ids: unique.map(x => x.internalId), sizes: unique.map(x => [x.width, x.height, x.bits]) }));
