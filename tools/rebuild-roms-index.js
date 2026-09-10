#!/usr/bin/env node
/* ROM 索引重建：从磁盘 data/roms/*.bin 找回丢失的元数据
 *
 * 背景：MySQL 模式下 roms 曾不在 META_KEYS，元数据只活在内存，重启即丢。
 * bin 文件（不被 git 跟踪）留存完好 —— 本工具扫描它们重建 db.json / game_meta 里的记录。
 *
 * 用法（云端或本机均可跑，自动识别 json/mysql 模式）：
 *   node tools/rebuild-roms-index.js [--meta <roms-meta.json>] [--dry]
 *
 *   --meta   可选：本机导出的元数据包（tools/sync-roms-to-cloud.js 产出的 zip 里的
 *            roms-meta.json，或解压后的文件）。按 SHA-256 hash 匹配，命中则恢复
 *            原始游戏名/平台/分类，未命中才走「嗅探 + 未命名」兜底。
 *   --dry    只报告，不写入。
 *
 * 平台嗅探（文件头魔数）：
 *   NES  "NES\x1a"          → nes
 *   GBA  Nintendo logo@0x04 → gba
 *   GB   Nintendo logo@0x104→ gb（GBC 同头，EmulatorJS 用 gb 核兼容）
 *   MD   "SEGA"@0x100       → segaMD
 *   N64  80 37 12 40        → n64
 *   SMC/SFC 无固定魔数      → 需人工确认，默认标 nes 并列入报告
 *   zip  50 4B 03 04        → 需人工确认（DOS/街机整包），默认 dosbox
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ROMS_DIR = path.join(ROOT, 'data', 'roms');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const BAK_DIR = path.join(ROOT, 'data', 'backups');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const metaIdx = args.indexOf('--meta');
const META_PATH = metaIdx >= 0 ? args[metaIdx + 1] : null;

// ---------- 参数 ----------
if (!fs.existsSync(ROMS_DIR)) { console.error('✗ data/roms/ 不存在:', ROMS_DIR); process.exit(1); }
let meta = null;
if (META_PATH) {
    if (!fs.existsSync(META_PATH)) { console.error('✗ --meta 文件不存在:', META_PATH); process.exit(1); }
    const j = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    meta = new Map((j.roms || []).filter(r => r.hash).map(r => [r.hash, r]));
    console.log('ℹ 已载入元数据包：', meta.size, '条（按 hash 匹配恢复名字）');
}

// ---------- 嗅探 ----------
function sniffCore(buf) {
    // NES
    if (buf.length > 4 && buf[0] === 0x4E && buf[1] === 0x45 && buf[2] === 0x53 && buf[3] === 0x1A) return 'nes';
    // GBA: Nintendo logo @ 0x04
    const GBA = [0x24,0xFF,0xAE,0x51,0x69,0x9A,0xA2,0x21,0x3D,0x84,0x82,0x0A];
    if (buf.length > 16 && GBA.every((b, i) => buf[4 + i] === b)) return 'gba';
    // GB/GBC: Nintendo logo @ 0x104
    const GB = [0xCE,0xED,0x66,0x66,0xCC,0x0D,0x00,0x0B];
    if (buf.length > 0x120 && GB.every((b, i) => buf[0x104 + i] === b)) return 'gb';
    // MD: "SEGA" @ 0x100
    if (buf.length > 0x104 && buf[0x100] === 0x53 && buf[0x101] === 0x45 && buf[0x102] === 0x47 && buf[0x103] === 0x41) return 'segaMD';
    // N64 (z64 big endian)
    if (buf.length > 4 && buf[0] === 0x80 && buf[1] === 0x37 && buf[2] === 0x12 && buf[3] === 0x40) return 'n64';
    // zip
    if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B) return 'dosbox';
    return null; // 嗅探不出（SMC/SFC 等）
}

// ---------- 扫描 ----------
const files = fs.readdirSync(ROMS_DIR).filter(f => f.endsWith('.bin'));
console.log('磁盘 bin 文件:', files.length);

const db = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : { roms: [] };
db.roms = db.roms || [];
const byId = new Set(db.roms.map(r => r.id));
const byHash = new Map(db.roms.filter(r => r.hash).map(r => [r.hash, r]));

const recovered = [], named = 0, needName = [], needCore = [];
for (const f of files) {
    const id = path.basename(f, '.bin');
    if (byId.has(id)) continue;                        // 记录还在，跳过
    const full = path.join(ROMS_DIR, f);
    const buf = fs.readFileSync(full);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (byHash.has(hash)) continue;                    // 同内容已有记录

    const m = meta && meta.get(hash);
    const core = (m && m.core) || sniffCore(buf) || 'nes';
    const name = (m && m.name) || ('未命名_' + id.slice(-6));
    const rec = {
        id, name, core, size: buf.length,
        addedAt: (m && m.addedAt) || Date.now(),
        by: (m && m.by) || 'rebuild',
        hash,
        category: (m && m.category) || 'normal',
        sort: (m && m.sort) || 0,
    };
    if (m) named++; else needName.push(name);
    if (!m && !sniffCore(buf)) needCore.push(name);
    recovered.push(rec);
    byId.add(id); byHash.set(hash, rec);
}

// ---------- 报告 ----------
console.log('');
console.log('═══ 重建报告 ═══');
console.log('db.json 现有记录:', db.roms.length);
console.log('本次找回:', recovered.length);
if (META_PATH) console.log('  其中按 hash 恢复原名:', named, '· 未匹配需改名:', recovered.length - named);
if (needCore.length) {
    console.log('  ⚠ 以下嗅探不出平台（默认标 FC，请在后台确认）:');
    needCore.forEach(n => console.log('     -', n));
}
if (!recovered.length) { console.log('✓ 没有需要恢复的（索引已完整）'); process.exit(0); }
if (DRY) { console.log('（--dry 模式，未写入。去掉 --dry 执行恢复）'); process.exit(0); }

// ---------- 写入 ----------
// 备份
if (!fs.existsSync(BAK_DIR)) fs.mkdirSync(BAK_DIR, { recursive: true });
const bak = path.join(BAK_DIR, 'db-before-roms-rebuild-' + Date.now() + '.json');
fs.copyFileSync(DB_PATH, bak);
console.log('已备份 db.json →', path.basename(bak));

db.roms.push(...recovered);
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log('✅ 已写入', recovered.length, '条 → db.json（现共', db.roms.length, '个 ROM）');
console.log('');
console.log('后续步骤：');
console.log('  1. 重启服务（json 模式读 db.json；MySQL 模式启动会把 roms 同步进 game_meta 表）');
console.log('  2. /admin → 模拟器ROM：给「未命名_xxx」改名（改名框在每行控件里）');
console.log('  3. 若名字多、且你本机有同一批 ROM：');
console.log('     node tools/sync-roms-to-cloud.js 出包 → 解压取 roms-meta.json →');
console.log('     重新跑: node tools/rebuild-roms-index.js --meta roms-meta.json');