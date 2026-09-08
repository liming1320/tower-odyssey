/* 存档导出 / 导入：换电脑时保证账号与进度不丢失
 *
 *   node tools/db-sync.js export [输出路径]    导出当前存档（默认 game/data-export-<时间>.json）
 *   node tools/db-sync.js import <文件路径>    从快照恢复（会先自动备份现有存档）
 *   node tools/db-sync.js path                 打印当前存档位置
 *
 * 存档内容：所有账号（含密码哈希）、英雄、装备、邮件、活动、推塔进度…
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB = path.join(DATA_DIR, 'db.json');
const BAK_DIR = path.join(DATA_DIR, 'backups');

const cmd = process.argv[2] || 'path';
const arg = process.argv[3];

function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

if (cmd === 'path') {
    console.log('存档文件:', DB);
    console.log('存在:', fs.existsSync(DB), '| 大小:', fs.existsSync(DB) ? (fs.statSync(DB).size / 1024).toFixed(1) + ' KB' : '-');
    console.log('自动备份目录:', BAK_DIR, '| 数量:', fs.existsSync(BAK_DIR) ? fs.readdirSync(BAK_DIR).length : 0);
    process.exit(0);
}

if (cmd === 'export') {
    if (!fs.existsSync(DB)) { console.error('存档不存在:', DB); process.exit(1); }
    const out = arg || path.join(__dirname, '..', `data-export-${stamp()}.json`);
    fs.copyFileSync(DB, out);
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    const users = Object.values(j.users || {});
    console.log('✅ 已导出:', out);
    console.log('   账号数:', users.length, '| 英雄模板:', (j.heroes || []).length, '| 邮件:', (j.mails || []).length);
    console.log('   把这个文件拷到另一台电脑，执行: node tools/db-sync.js import <文件路径>');
    process.exit(0);
}

if (cmd === 'import') {
    if (!arg || !fs.existsSync(arg)) { console.error('请指定要导入的存档文件（不存在）:', arg); process.exit(1); }
    const src = JSON.parse(fs.readFileSync(arg, 'utf8'));
    if (!src.users) { console.error('文件格式不对，缺少 users 字段'); process.exit(1); }
    if (!fs.existsSync(BAK_DIR)) fs.mkdirSync(BAK_DIR, { recursive: true });
    if (fs.existsSync(DB)) {
        const bak = path.join(BAK_DIR, `db-before-import-${stamp()}.json`);
        fs.copyFileSync(DB, bak);
        console.log('已备份现有存档 →', bak);
    }
    fs.writeFileSync(DB, JSON.stringify(src, null, 2), 'utf8');
    const users = Object.values(src.users || {});
    console.log('✅ 已导入:', arg);
    console.log('   账号数:', users.length, '| 英雄模板:', (src.heroes || []).length);
    console.log('   请重启服务: node server.js');
    process.exit(0);
}

console.log('用法: node tools/db-sync.js export|import|path [文件路径]');
