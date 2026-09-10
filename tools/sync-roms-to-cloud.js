#!/usr/bin/env node
/* 一键把本机的模拟器 ROM 同步到云端
 *
 *   node tools/sync-roms-to-cloud.js [输出 zip 路径]
 *
 * 工作流：
 *   1) 本机跑这条命令，产出 roms-cloud-pack-<时间>.zip（含 data/roms/*.bin + 元数据片段 + 云端导入脚本）
 *   2) 用户手动把这个 zip 拷到云端：
 *        scp roms-cloud-pack-<时间>.zip root@152.136.167.250:/www/wwwroot/tower-odyssey/data/
 *   3) 在云端跑：
 *        cd /www/wwwroot/tower-odyssey && node tools/sync-roms-from-pack.js data/roms-cloud-pack-<时间>.zip
 *      脚本会自动：解压 bin 到 data/roms/ + 合并 db.json 的 roms 字段（不破坏账号/邮件/聊天等其它数据）
 *
 * 设计原则：
 *   - 云端 db.json 的 users/mails/channels/... 不被覆盖，只追加/合并 roms
 *   - 已存在同 id 的 ROM 跳过（避免覆盖云端元数据）
 *   - 已存在同 hash 的 ROM 跳过（避免重复）
 *   - 操作前自动备份 db.json
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ROMS_DIR = path.join(ROOT, 'data', 'roms');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const BAK_DIR = path.join(ROOT, 'data', 'backups');

const stamp = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// ---------- 极简 zip 写入器（store / deflate，仅支持 .bin + json，避免引入 archiver）----------
function crc32(buf) {
    let crc = ~0 >>> 0;
    for (let i = 0; i < buf.length; i++) {
        crc = crc ^ buf[i];
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (~crc) >>> 0;
}

function writeZip(outPath, entries) {
    const chunks = []; let offset = 0;
    const central = [];
    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, 'utf8');
        const data = e.data;
        const compressed = e.method === 'deflate' ? zlib.deflateRawSync(data) : data;
        const method = e.method === 'deflate' ? 8 : 0;
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(1 << 11, 6);          // UTF-8 flag
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        chunks.push(local, nameBuf, compressed);
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(1 << 11, 8);
        cd.writeUInt16LE(method, 10);
        cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(compressed.length, 20);
        cd.writeUInt32LE(data.length, 24);
        cd.writeUInt16LE(nameBuf.length, 28);
        cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
        cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
        cd.writeUInt32LE(0, 38);
        cd.writeUInt32LE(offset, 42);
        central.push(cd, nameBuf);
        offset += local.length + nameBuf.length + compressed.length;
    }
    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    fs.writeFileSync(outPath, Buffer.concat([...chunks, cdBuf, eocd]));
}

// ---------- 收集本机 ROM ----------
if (!fs.existsSync(DB_PATH)) { console.error('✗ 本机 db.json 不存在:', DB_PATH); process.exit(1); }
if (!fs.existsSync(ROMS_DIR)) { console.error('✗ 本机 data/roms/ 不存在'); process.exit(1); }

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const roms = db.roms || [];
if (!roms.length) { console.error('✗ 本机 db.json 里 roms 为空，没东西可同步'); process.exit(1); }

const missing = roms.filter(r => !fs.existsSync(path.join(ROMS_DIR, r.id + '.bin')));
if (missing.length) {
    console.error('✗ 以下 ROM 在磁盘上找不到文件（先跑 service 启动一次自动修复）:');
    missing.forEach(r => console.error('   -', r.id, r.name));
    process.exit(1);
}

console.log('本机 ROM 数量:', roms.length, '· 磁盘文件:', fs.readdirSync(ROMS_DIR).filter(f => f.endsWith('.bin')).length);

// ---------- 打包 ----------
const zipPath = process.argv[2] || path.join(ROOT, `roms-cloud-pack-${stamp()}.zip`);
const entries = [];

// 1) 元数据（不含敏感字段：users/mails/chat 等）
const metaSafe = roms.map(r => ({
    id: r.id, name: r.name, core: r.core, size: r.size,
    category: r.category || 'normal', sort: r.sort || 0,
    addedAt: r.addedAt, by: r.by || '', hash: r.hash || '',
}));
entries.push({ name: 'roms-meta.json', data: Buffer.from(JSON.stringify({ version: 1, exportedAt: Date.now(), roms: metaSafe }, null, 2), 'utf8'), method: 'deflate' });

// 2) ROM 二进制（用 store 方法，节省 CPU；文件不大）
for (const r of roms) {
    const filePath = path.join(ROMS_DIR, r.id + '.bin');
    const buf = fs.readFileSync(filePath);
    entries.push({ name: `roms/${r.id}.bin`, data: buf, method: 'store' });
}

// 3) 云端导入脚本（嵌进 zip 里方便用户传过去）
const importScript = `#!/usr/bin/env node
/* 云端导入：解压 zip 中的 ROM 二进制到 data/roms/，合并 db.json 的 roms 字段
 * 部署在云端，由 tools/sync-roms-to-cloud.js 打包时一并写入 zip
 *
 * 用法：node tools/sync-roms-from-pack.js data/roms-cloud-pack-<时间>.zip
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ROMS_DIR = path.join(ROOT, 'data', 'roms');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const BAK_DIR = path.join(ROOT, 'data', 'backups');

const zipPath = process.argv[2];
if (!zipPath || !fs.existsSync(zipPath)) {
    console.error('用法: node tools/sync-roms-from-pack.js <zip 路径>');
    process.exit(1);
}

// ---------- zip 读取（仅支持 store/deflate，与打包对称）----------
function readZip(zipBuf) {
    const entries = [];
    let pos = 0;
    while (pos < zipBuf.length) {
        const sig = zipBuf.readUInt32LE(pos);
        if (sig === 0x04034b50) {
            // local file header
            const method = zipBuf.readUInt16LE(pos + 8);
            const compSize = zipBuf.readUInt32LE(pos + 18);
            const nameLen = zipBuf.readUInt16LE(pos + 26);
            const extraLen = zipBuf.readUInt16LE(pos + 28);
            const name = zipBuf.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
            const dataStart = pos + 30 + nameLen + extraLen;
            let data = zipBuf.slice(dataStart, dataStart + compSize);
            if (method === 8) data = zlib.inflateRawSync(data);
            entries.push({ name, data });
            pos = dataStart + compSize;
        } else if (sig === 0x02014b50) {
            break; // 进入 central directory
        } else {
            console.error('✗ zip 格式错误 @ offset', pos);
            process.exit(1);
        }
    }
    return entries;
}

const entries = readZip(fs.readFileSync(zipPath));
const meta = JSON.parse(entries.find(e => e.name === 'roms-meta.json').data.toString('utf8'));
const binEntries = entries.filter(e => e.name.startsWith('roms/'));
console.log('zip 内 ROM 文件:', binEntries.length, '· 元数据条数:', meta.roms.length);

// ---------- 备份现有 db.json ----------
if (!fs.existsSync(BAK_DIR)) fs.mkdirSync(BAK_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
    const bak = path.join(BAK_DIR, 'db-before-roms-sync-' + Date.now() + '.json');
    fs.copyFileSync(DB_PATH, bak);
    console.log('已备份 db.json →', bak);
}

// ---------- 写 bin 到 data/roms/ ----------
if (!fs.existsSync(ROMS_DIR)) fs.mkdirSync(ROMS_DIR, { recursive: true });
let binAdd = 0, binSkip = 0;
for (const e of binEntries) {
    const id = path.basename(e.name, '.bin');
    const out = path.join(ROMS_DIR, id + '.bin');
    if (fs.existsSync(out)) { binSkip++; continue; }
    fs.writeFileSync(out, e.data);
    binAdd++;
}
console.log('bin 写入:', binAdd, '· 跳过(已存在):', binSkip);

// ---------- 合并 db.json 的 roms 字段 ----------
const db = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : { roms: [] };
const oldRoms = db.roms || [];
const byId = new Map(oldRoms.map(r => [r.id, r]));
const byHash = new Map(oldRoms.filter(r => r.hash).map(r => [r.hash, r]));

let add = 0, update = 0, skip = 0;
for (const r of meta.roms) {
    if (byId.has(r.id)) { update++; continue; }            // 同 id 已存在（云端自己的数据）
    if (r.hash && byHash.has(r.hash)) { skip++; continue; } // 内容相同但 id 不同
    oldRoms.push(r);
    byId.set(r.id, r);
    add++;
}

db.roms = oldRoms;
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log('db.roms 合并：新增', add, '· 保留', update, '· 跳过(同 hash)', skip, '· 现共', oldRoms.length, '个');
console.log('✅ 完成。建议重启服务让 hash 缓存刷新：systemctl restart tower-odyssey');
`;
entries.push({ name: 'sync-roms-from-pack.js', data: Buffer.from(importScript, 'utf8'), method: 'deflate' });

writeZip(zipPath, entries);

const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log('');
console.log('✅ 已生成同步包:', zipPath, `(${sizeKb} KB · ${roms.length} 个 ROM)`);
console.log('');
console.log('──── 在云端执行以下两步即可 ────');
console.log('1. 上传 zip 到云端：');
console.log(`   scp "${path.basename(zipPath)}" root@152.136.167.250:/www/wwwroot/tower-odyssey/data/`);
console.log('');
console.log('2. 在云端导入（会自动备份当前 db.json）：');
console.log(`   ssh root@152.136.167.250 'cd /www/wwwroot/tower-odyssey && node tools/sync-roms-from-pack.js data/${path.basename(zipPath)}'`);
console.log('');
console.log('   或分两次：');
console.log(`   scp "${path.basename(zipPath)}" root@152.136.167.250:/www/wwwroot/tower-odyssey/data/`);
console.log(`   ssh root@152.136.167.250`);
console.log(`   cd /www/wwwroot/tower-odyssey`);
console.log(`   node tools/sync-roms-from-pack.js data/${path.basename(zipPath)}`);