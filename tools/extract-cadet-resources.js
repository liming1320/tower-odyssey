/* Extract selected Full Tilt Space Cadet 8-bit sprite groups as transparent PNGs. */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const source = process.argv[2] || 'F:/BaiduNetdiskDownload/FullTilt/CADET/CADET.DAT';
const output = process.argv[3] || path.join(__dirname, '..', 'public', 'img', 'pinball');
const wanted = {
    213: 'cadet-ball.png',
    474: 'cadet-flip-left.png',
    482: 'cadet-flip-right.png',
    491: 'cadet-bump-1.png',
    499: 'cadet-bump-2.png',
    507: 'cadet-bump-3.png',
    515: 'cadet-bump-4.png',
    524: 'cadet-bump-5.png',
    532: 'cadet-bump-6.png',
    540: 'cadet-bump-7.png',
    592: 'cadet-plunger.png',
    622: 'cadet-kick-left-rest.png',
    623: 'cadet-kick-left-hit.png',
    624: 'cadet-kick-right-rest.png',
    625: 'cadet-kick-right-hit.png',
};
for (let frame = 0; frame < 8; frame++) {
    wanted[474 + frame] = `cadet-flip-left-${frame}.png`;
    wanted[482 + frame] = `cadet-flip-right-${frame}.png`;
    wanted[491 + frame] = `cadet-bump-1-${frame}.png`;
    wanted[499 + frame] = `cadet-bump-2-${frame}.png`;
    wanted[507 + frame] = `cadet-bump-3-${frame}.png`;
    wanted[515 + frame] = `cadet-bump-4-${frame}.png`;
    wanted[524 + frame] = `cadet-bump-5-${frame}.png`;
    wanted[532 + frame] = `cadet-bump-6-${frame}.png`;
    wanted[540 + frame] = `cadet-bump-7-${frame}.png`;
}

const dat = fs.readFileSync(source);
const readU8 = () => dat[offset++];
const readU16 = () => { const value = dat.readUInt16LE(offset); offset += 2; return value; };
const readI16 = () => { const value = dat.readInt16LE(offset); offset += 2; return value; };
const readU32 = () => { const value = dat.readUInt32LE(offset); offset += 4; return value; };
let offset = 0;

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type, 'ascii');
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    name.copy(head, 4);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
    return Buffer.concat([head, data, tail]);
}

function writePng(file, width, height, rgba) {
    const scanlines = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const target = y * (width * 4 + 1);
        scanlines[target] = 0;
        rgba.copy(scanlines, target + 1, y * width * 4, (y + 1) * width * 4);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(scanlines)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    fs.writeFileSync(file, png);
}

function decodeBitmap(header, payload) {
    const { width, height, flags } = header;
    const pixels = Buffer.alloc(width * height, 255);
    if (!(flags & 4)) {
        const stride = (width + 3) & ~3;
        for (let y = 0; y < height; y++) payload.copy(pixels, y * width, y * stride, y * stride + width);
        return pixels;
    }

    let cursor = 0;
    let destination = 0;
    while (cursor + 2 <= payload.length) {
        const stride = payload.readInt16LE(cursor); cursor += 2;
        if (stride < 0) break;
        // Full Tilt spliced rows are addressed against its 600px internal table width.
        destination += stride > width ? stride + width - 600 : stride;
        if (cursor + 2 > payload.length) break;
        let count = payload.readUInt16LE(cursor); cursor += 2;
        while (count-- > 0 && cursor + 3 <= payload.length) {
            cursor += 2;
            if (destination < pixels.length) pixels[destination] = payload[cursor];
            cursor += 1;
            destination += 1;
        }
    }
    return pixels;
}

function render(header, pixels, palette) {
    const rgba = Buffer.alloc(header.width * header.height * 4);
    for (let sourceY = 0; sourceY < header.height; sourceY++) {
        const targetY = header.height - sourceY - 1;
        for (let x = 0; x < header.width; x++) {
            const index = pixels[sourceY * header.width + x];
            const target = (targetY * header.width + x) * 4;
            if (index === 0 || index === 255) continue;
            const color = palette[index] || [0, 0, 0, 0];
            rgba[target] = color[2];
            rgba[target + 1] = color[1];
            rgba[target + 2] = color[0];
            rgba[target + 3] = 255;
        }
    }
    return rgba;
}

offset = 175;
const groups = readU16();
offset = 183 + dat.readUInt16LE(181);
let palette = null;
const sprites = new Map();
for (let group = 0; group < groups; group++) {
    const count = readU8();
    for (let entry = 0; entry < count; entry++) {
        const type = readU8();
        const fixed = type === 0 || type === 2 ? 2 : type === 13 ? 0 : -1;
        const size = fixed >= 0 ? fixed : readU32();
        if (type === 1) {
            const header = {
                resolution: readU8(), width: readI16(), height: readI16(), x: readI16(), y: readI16(),
                payloadSize: readU32(), flags: readU8(),
            };
            const payload = dat.subarray(offset, offset + header.payloadSize);
            offset += header.payloadSize;
            if (wanted[group] && header.resolution === 0) sprites.set(group, { header, payload });
        } else {
            const value = dat.subarray(offset, offset + size);
            offset += size;
            if (type === 5 && !palette) {
                palette = [];
                for (let index = 0; index < 256; index++) palette.push([value[index * 4], value[index * 4 + 1], value[index * 4 + 2], value[index * 4 + 3]]);
            }
        }
    }
}

if (!palette) throw new Error('CADET.DAT palette was not found');
fs.mkdirSync(output, { recursive: true });
for (const [group, name] of Object.entries(wanted)) {
    const sprite = sprites.get(Number(group));
    if (!sprite) throw new Error(`Sprite group ${group} was not found`);
    const indexed = decodeBitmap(sprite.header, sprite.payload);
    writePng(path.join(output, name), sprite.header.width, sprite.header.height, render(sprite.header, indexed, palette));
    console.log(`${name}: ${sprite.header.width}x${sprite.header.height} at ${sprite.header.x},${sprite.header.y}`);
}
