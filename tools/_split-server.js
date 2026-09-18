'use strict';
// 一次性拆分脚本：把 server.js 中的 ROM/BIOS/云存档 路由块 + normalizeSkills 拆到独立模块。
// 用基于原始行号的切片，保证 server.js 其余内容逐字不变。
const fs = require('fs');
const SRC = 'server.js';
fs.mkdirSync('server/routes', { recursive: true });
fs.mkdirSync('server/core', { recursive: true });
const lines = fs.readFileSync(SRC, 'utf8').split('\n');

// 1-based → 0-based
const ROM_A = 2813, ROM_B = 3514;          // 含端点 + 私有辅助函数
const SK_A = 3825, SK_B = 3838;            // normalizeSkills 定义

const romBlock = lines.slice(ROM_A - 1, ROM_B).join('\n');
const skBlock = lines.slice(SK_A - 1, SK_B).join('\n');

const romHeader = [
    "'use strict';",
    '// 经典/街机模拟器：ROM 库 + BIOS 管家 + 模拟器云存档（从 server.js 拆出的独立路由模块）',
    '// 通过 ctx 注入共享依赖（api 路由表、DB、鉴权函数、romCatalog、磁盘目录常量），保持行为不变。',
    'module.exports = function registerRomRoutes(ctx) {',
    '  const { api, DB, sendJson, getUserByToken, isAdminToken, romCatalog, save, newId,',
    '          ROMS_DIR, ROM_INBOX_DIR, DATA_DIR, ROM_MAX_BYTES, ROM_CORES, ROM_CORE_LABELS, ARCADE_CORES } = ctx;',
    "  const url = require('url'), path = require('path'), fs = require('fs'), crypto = require('crypto');",
    '',
    '  // ---- 以下为原 server.js 2813–3514 的内容（端点 + 私有辅助函数），逐字迁移 ----',
    '',
].join('\n');

const romFooter = [
    '',
    '  // ---- 原内容结束 ----',
    '  return { romsBackfillHash };',
    '};',
    '',
].join('\n');

fs.writeFileSync('server/routes/rom.js', romHeader + '\n' + romBlock + '\n' + romFooter);

const skHeader = [
    "'use strict';",
    '// 英雄技能规范化（从 server.js 拆出，admin 英雄编辑复用）。纯函数，无副作用。',
    '',
].join('\n');
const skFooter = [
    '',
    'module.exports = { normalizeSkills };',
    '',
].join('\n');
fs.writeFileSync('server/core/skills.js', skHeader + skBlock + '\n' + skFooter);

// 重建 server.js：去掉两段，在 ROM 块原位置注入两个 require（所引用的符号均在模块作用域内已定义）
const head = lines.slice(0, ROM_A - 1);            // 1..2812
const mid = lines.slice(ROM_B, SK_A - 1);          // 3515..3824（admin/mail、gift、account/delete 等）
const tail = lines.slice(SK_B);                    // 3839..末尾

const injection = [
    '',
    '// ---- 模块拆分：ROM/BIOS/云存档路由 + 技能规范化（见 server/routes/rom.js、server/core/skills.js）----',
    'const romRoutes = require("./server/routes/rom")({',
    '  api, DB, sendJson, getUserByToken, isAdminToken, romCatalog, save, newId,',
    '  ROMS_DIR, ROM_INBOX_DIR, DATA_DIR, ROM_MAX_BYTES, ROM_CORES, ROM_CORE_LABELS, ARCADE_CORES,',
    '});',
    "const { normalizeSkills } = require('./server/core/skills');",
    '',
].join('\n');

let out = [...head, injection, ...mid, ...tail].join('\n');
// romsBackfillHash 现已由 romRoutes 暴露
out = out.replace('romsBackfillHash().catch', 'romRoutes.romsBackfillHash().catch');

fs.writeFileSync(SRC, out);
console.log('OK: rom.js lines=', romBlock.split('\n').length, ' skills.js lines=', skBlock.split('\n').length);
console.log('server.js total lines now=', out.split('\n').length);
