const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function readPng(file) {
    const b = fs.readFileSync(file); let p = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; const chunks = [];
    while (p < b.length) { const len = b.readUInt32BE(p); const type = b.toString('ascii', p + 4, p + 8); const data = b.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; } if (type === 'IDAT') chunks.push(data); p += 12 + len; }
    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error('Unsupported PNG format: ' + bitDepth + '/' + colorType);
    const raw = zlib.inflateSync(Buffer.concat(chunks)); const channels = colorType === 6 ? 4 : 3; const stride = width * channels; const pixels = Buffer.alloc(height * stride); let src = 0;
    for (let y = 0; y < height; y += 1) { const filter = raw[src++]; const row = raw.subarray(src, src + stride); src += stride; const out = pixels.subarray(y * stride, (y + 1) * stride); for (let x = 0; x < stride; x += 1) { const left = x >= channels ? out[x - channels] : 0; const up = y ? pixels[(y - 1) * stride + x] : 0; const upLeft = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0; let v = row[x]; if (filter === 1) v = (v + left) & 255; else if (filter === 2) v = (v + up) & 255; else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 255; else if (filter === 4) { const q = left + up - upLeft; const pa = Math.abs(q - left), pb = Math.abs(q - up), pc = Math.abs(q - upLeft); v = (v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255; } out[x] = v; } }
    return { width, height, channels, pixels };
}

function occupied(image, x, y, size) {
    let count = 0;
    for (let yy = y; yy < Math.min(image.height, y + size); yy += 1) for (let xx = x; xx < Math.min(image.width, x + size); xx += 1) {
        const i = (yy * image.width + xx) * image.channels;
        if (image.channels === 4 ? image.pixels[i + 3] > 8 : image.pixels[i] < 245 || image.pixels[i + 1] < 245 || image.pixels[i + 2] < 245) count += 1;
    }
    return count;
}

const file = process.argv[2] || path.join(__dirname, '..', 'output', 'pk32-reference', 'sheet-5579f0.png');
const out = process.argv[3] || path.join(__dirname, '..', 'output', 'pk32-reference', 'atlas-5579f0.json');
const image = readPng(file); const size = 33; const cells = [];
for (let y = 0; y < image.height; y += size) for (let x = 0; x < image.width; x += size) cells.push({ x, y, width: Math.min(size, image.width - x), height: Math.min(size, image.height - y), pixels: occupied(image, x, y, size) });
const result = { file, width: image.width, height: image.height, cellSize: size, columns: Math.ceil(image.width / size), rows: Math.ceil(image.height / size), cells };
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ file, width: image.width, height: image.height, cells: cells.length, occupied: cells.filter(x => x.pixels > 0).length, output: out }));
