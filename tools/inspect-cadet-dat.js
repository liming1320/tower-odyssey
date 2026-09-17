'use strict';

const fs = require('fs');
const dat = fs.readFileSync(process.argv[2] || 'F:/BaiduNetdiskDownload/FullTilt/CADET/CADET.DAT');
const fixedSizes = [2, -1, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0];
let offset = 183 + dat.readUInt16LE(181);
const groupCount = dat.readUInt16LE(175);

for (let group = 0; group < groupCount; group++) {
    const entries = dat[offset++];
    let name = '';
    const bitmaps = [];
    for (let entry = 0; entry < entries; entry++) {
        const type = dat[offset++];
        const fixed = fixedSizes[type];
        const size = fixed >= 0 ? fixed : dat.readUInt32LE(offset);
        if (fixed < 0) offset += 4;
        const start = offset;
        if (type === 1) {
            bitmaps.push({
                resolution: dat[offset], width: dat.readInt16LE(offset + 1), height: dat.readInt16LE(offset + 3),
                x: dat.readInt16LE(offset + 5), y: dat.readInt16LE(offset + 7), payload: dat.readUInt32LE(offset + 9), flags: dat[offset + 13],
                firstBytes: group === 491 ? Array.from(dat.subarray(offset + 14, offset + 62)) : undefined,
            });
        } else if (type === 3) {
            name = dat.subarray(start, start + size).toString('latin1').replace(/\0.*$/, '');
        }
        offset += size;
    }
    if (name && /bump|turbo|flip|ball|plunger/i.test(name)) console.log(group, name, JSON.stringify(bitmaps));
}
