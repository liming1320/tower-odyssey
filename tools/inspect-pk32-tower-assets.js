// Produce evidence for the custom PicForm/BMP asset block used by PK32.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'output', 'pk32-reference');
const file = process.argv[2] || path.join(root, 'module.bin');
const bmpOffset = Number(process.argv[3] || 0x5579f0);
const b = fs.readFileSync(file);
const u16 = o => b.readUInt16LE(o);
const u32 = o => b.readUInt32LE(o);
if (b.toString('ascii', bmpOffset, bmpOffset + 2) !== 'BM') throw new Error('BMP signature not found');
const width = b.readInt32LE(bmpOffset + 18);
const height = b.readInt32LE(bmpOffset + 22);
const bits = u16(bmpOffset + 28);
const pixelOffset = u32(bmpOffset + 10);
const paletteOffset = bmpOffset + 54;
const palette = [];
for (let i = 0; i < (1 << bits); i += 1) palette.push([b[paletteOffset + i * 4 + 2], b[paletteOffset + i * 4 + 1], b[paletteOffset + i * 4]]);
const stride = Math.ceil(width * bits / 32) * 4;
const cellSize = 33;
const columns = Math.ceil(width / cellSize);
const rows = Math.ceil(Math.abs(height) / cellSize);
function cellHash(cx, cy) {
  const out = Buffer.alloc(cellSize * cellSize);
  for (let y = 0; y < cellSize; y += 1) {
    const sourceY = height > 0 ? height - 1 - (cy * cellSize + y) : cy * cellSize + y;
    for (let x = 0; x < cellSize; x += 1) {
      const sourceX = cx * cellSize + x;
      const byte = sourceX < width && sourceY < Math.abs(height) ? b[bmpOffset + pixelOffset + sourceY * stride + Math.floor(sourceX / 2)] : 0;
      out[y * cellSize + x] = sourceX % 2 ? byte & 15 : byte >> 4;
    }
  }
  return crypto.createHash('sha256').update(out).digest('hex').slice(0, 16);
}
const cells = [];
for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) cells.push({ index: y * columns + x, x, y, hash: cellHash(x, y) });
const result = {
  file, bmpOffset, bmpSize: u32(bmpOffset + 2), width, height, bits, pixelOffset,
  palette, cellSize, columns, rows, cells,
  adjacentBytesBefore: b.subarray(Math.max(0, bmpOffset - 64), bmpOffset).toString('hex'),
  adjacentAsciiBefore: b.subarray(Math.max(0, bmpOffset - 64), bmpOffset).toString('ascii').replace(/[^\x20-\x7e]/g, '.')
};
const out = path.join(root, 'tower-asset-inspection.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ out, bmpOffset: bmpOffset.toString(16), width, height, bits, paletteColors: palette.length, cells: cells.length, uniqueCells: new Set(cells.map(x => x.hash)).size, adjacentAsciiBefore: result.adjacentAsciiBefore }));
