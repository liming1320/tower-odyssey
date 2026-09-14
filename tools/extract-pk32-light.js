const fs = require('fs');
const path = require('path');
const image = fs.readFileSync(path.join(__dirname, '..', 'output', 'pk32-reference', 'module.bin'));
const base = 0x400000, table = 0x1c30240;
const levels = [];
for (let i = 0; i < 140; i += 1) {
  const target = image.readUInt32LE(table + i * 4) - base;
  if (image[target] !== 0xba) throw new Error('invalid native board case ' + i);
  const pointer = image.readUInt32LE(target + 1) - base;
  const bytes = image.readUInt32LE(pointer - 4);
  const cells = image.subarray(pointer, pointer + bytes).toString('utf16le');
  const width = Number(cells.slice(0, 2)), height = Number(cells.slice(2, 4));
  if (!width || !height || cells.length !== 4 + width * height * 2) throw new Error('invalid board ' + i);
  levels.push({ number: i + 1, offset: pointer, width, height, cells });
}
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-light-levels.json'), JSON.stringify({ name: '智慧之光', nativeLevelCount: 140, extractedPayloadCount: 140, objective: 'light all lightable objects', levels }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ levels: levels.length, firstOffset: levels[0].offset, lastOffset: levels[levels.length - 1].offset }));
