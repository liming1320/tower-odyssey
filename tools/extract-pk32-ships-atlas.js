'use strict';

// Publish the native ships bitmap with its olive transparency key removed.
// The source bitmap is kept in output/pk32-reference for audit purposes.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'output/pk32-reference/sheet-8c5aa6.png');
const target = path.join(root, 'public/img/pk32/ships-original.png');

function decodePng(file) {
    const input = fs.readFileSync(file);
    let offset = 8, width = 0, height = 0, colorType = 0, depth = 0;
    const chunks = [];
    while (offset < input.length) {
        const length = input.readUInt32BE(offset);
        const type = input.toString('ascii', offset + 4, offset + 8);
        const data = input.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colorType = data[9];
        }
        if (type === 'IDAT') chunks.push(data);
        offset += length + 12;
    }
    if (depth !== 8 || colorType !== 2) throw new Error('Expected an 8-bit RGB PNG');
    const channels = 3, stride = width * channels;
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const pixels = Buffer.alloc(height * stride);
    let sourceOffset = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = raw[sourceOffset++];
        const row = raw.subarray(sourceOffset, sourceOffset + stride);
        sourceOffset += stride;
        const output = pixels.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x += 1) {
            const left = x >= channels ? output[x - channels] : 0;
            const up = y ? pixels[(y - 1) * stride + x] : 0;
            const upLeft = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
            let value = row[x];
            if (filter === 1) value = (value + left) & 255;
            else if (filter === 2) value = (value + up) & 255;
            else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
            else if (filter === 4) {
                const estimate = left + up - upLeft;
                const pa = Math.abs(estimate - left), pb = Math.abs(estimate - up), pc = Math.abs(estimate - upLeft);
                value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
            }
            output[x] = value;
        }
    }
    return { width, height, pixels };
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const value of buffer) {
        crc ^= value;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const label = Buffer.from(type, 'ascii');
    const body = Buffer.concat([label, data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body), 0);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length, 0);
    return Buffer.concat([size, body, checksum]);
}

function encodePng(image) {
    const rows = [];
    for (let y = 0; y < image.height; y += 1) {
        const row = Buffer.alloc(1 + image.width * 4);
        row[0] = 0;
        for (let x = 0; x < image.width; x += 1) {
            const sourceOffset = (y * image.width + x) * 3;
            const targetOffset = 1 + x * 4;
            row[targetOffset] = image.pixels[sourceOffset];
            row[targetOffset + 1] = image.pixels[sourceOffset + 1];
            row[targetOffset + 2] = image.pixels[sourceOffset + 2];
            const key = image.pixels[sourceOffset] === 128 && image.pixels[sourceOffset + 1] === 128 && image.pixels[sourceOffset + 2] === 0;
            row[targetOffset + 3] = key ? 0 : 255;
        }
        rows.push(row);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(image.width, 0);
    header.writeUInt32BE(image.height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const image = decodePng(source);
fs.writeFileSync(target, encodePng(image));
console.log(JSON.stringify({ source, target, width: image.width, height: image.height, cellWidth: 70, cellHeight: 50 }));
