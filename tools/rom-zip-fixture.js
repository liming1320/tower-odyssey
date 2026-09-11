// 测试用的最小 ZIP 构造器（store 方式，不压缩），零依赖。
// 图鉴验证需要真实 ZIP：文件名 + CRC32 必须能被中央目录解析出来。
const CRC_T = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8');
    for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files) {
    const locals = [], centrals = [];
    let off = 0;
    for (const f of files) {
        const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
        const crc = crc32(data);
        const nm = Buffer.from(f.name, 'utf8');
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, nm, data);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nm.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
        ch.writeUInt32LE(off, 42);
        centrals.push(ch, nm);
        off += lh.length + nm.length + data.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
    return Buffer.concat([Buffer.concat(locals), cd, eocd]);
}
module.exports = { crc32, makeZip };
