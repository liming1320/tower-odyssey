'use strict';
// 经典/街机模拟器：ROM 库 + BIOS 管家 + 模拟器云存档（从 server.js 拆出的独立路由模块）
// 通过 ctx 注入共享依赖（api 路由表、DB、鉴权函数、romCatalog、磁盘目录常量），保持行为不变。
module.exports = function registerRomRoutes(ctx) {
  const { api, DB, sendJson, getUserByToken, isAdminToken, romCatalog, save, newId,
          ROMS_DIR, ROM_INBOX_DIR, DATA_DIR, ROM_MAX_BYTES, ROM_CORES, ROM_CORE_LABELS, ARCADE_CORES } = ctx;
  const url = require('url'), path = require('path'), fs = require('fs'), crypto = require('crypto');

  // ---- 以下为原 server.js 2813–3514 的内容（端点 + 私有辅助函数），逐字迁移 ----

const isArcadeCore = c => ARCADE_CORES.has(c);
// 平台标签（给前端做筛选/展示，fbneo 按 core 猜不出来，只能由管理员在 platform 里指定）
const ROM_PLATFORMS = {
    neogeo: 'NeoGeo', cps1: 'CPS1', cps2: 'CPS2', cps3: 'CPS3', igs: 'IGS', other: '其他街机',
};
// BIOS：NeoGeo 必须 neogeo.zip、IGS(PGM) 必须 pgm.zip、CPS3 必须 cps3.zip，缺了就是黑屏（无任何报错提示）。
// 判定分两套 key：platform（导入时写入，优先）和 core（老数据只有 core）——之前混在一个表里，
// 导致 neogeo.zip 因为 neogeo / fbalpha2012_neogeo 两个 key 被算成"缺 2 个"。
const ROM_BIOS_BY_PLATFORM = { neogeo: 'neogeo.zip', igs: 'pgm.zip', cps3: 'cps3.zip' };
const ROM_BIOS_BY_CORE = { fbalpha2012_neogeo: 'neogeo.zip' };
const ROM_BIOS_FILES = ['neogeo.zip', 'pgm.zip', 'cps3.zip'];
const biosKeyLabel = k => ROM_PLATFORMS[k] || ROM_CORE_LABELS[k] || k;
// 扫一遍库，只统计"真有人要玩"的 BIOS：库里没有 PGM/CPS3 游戏时，pgm.zip/cps3.zip 就完全不需要，
// 不该报红吓人 —— 这两个固件厂商不随游戏分发，普通 ROM 合集里本来就没有。
function romBiosDemand() {
    const need = new Map();   // file -> Set<platform|core>
    for (const r of DB.roms || []) {
        const file = ROM_BIOS_BY_PLATFORM[r.platform] || ROM_BIOS_BY_CORE[r.core];
        if (!file) continue;
        if (!need.has(file)) need.set(file, new Set());
        need.get(file).add(r.platform || r.core);
    }
    return need;
}
function romAdminOk(req) {
    // 双通道：后台独立管理员令牌（admin/workbuddy）或玩家端 isAdmin 账号（第一个注册的玩家）
    if (isAdminToken(req)) return true;
    const u = getUserByToken(req);
    return !!(u && (u.isAdmin || u.id === 'admin'));
}
const romMeta = r => ({
    id: r.id, name: r.name, core: r.core, size: r.size, addedAt: r.addedAt,
    by: r.by || '', category: r.category || 'normal', sort: r.sort || 0,
    platform: r.platform || '', year: r.year || '', maker: r.maker || '',
    genre: r.genre || '', cover: r.cover || '',
    biosId: r.biosId || '', parentId: r.parentId || '',
    // 图鉴身份（街机专用）：短名 = zip 文件名，是 ROM 的唯一稳定 ID；中文名/别名用于搜索
    shortName: r.shortName || '', titleZh: r.titleZh || '', titleEn: r.titleEn || '',
    aliases: r.aliases || [], crcStatus: r.crcStatus || '',
    catalogVersion: r.catalogVersion || '', fileName: r.fileName || '',
});
// 搜索命中范围：显示名 + 中文名 + 英文原名 + 短名 + 别名 + 厂商（玩家可能只记得「饿狼」或 kof98）
function romMatchQ(r, q) {
    if (!q) return true;
    const hay = [r.name, r.titleZh, r.titleEn, r.shortName, r.maker, r.genre]
        .concat(Array.isArray(r.aliases) ? r.aliases : [])
        .filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
}

// ---------- ROM 内容 hash：上传去重 + 存量补算 ----------
function romFileHash(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = fs.createReadStream(file);
        s.on('data', c => h.update(c));
        s.on('end', () => resolve(h.digest('hex')));
        s.on('error', reject);
    });
}
// 启动时给历史 ROM 懒补 hash（首次升级到「去重版」后跑一次，之后秒退）
async function romsBackfillHash() {
    DB.roms = DB.roms || [];
    const need = DB.roms.filter(r => !r.hash);
    if (!need.length) return;
    let n = 0;
    for (const r of need) {
        try {
            r.hash = await romFileHash(path.join(ROMS_DIR, r.id + '.bin'));
            n++;
        } catch (e) { /* 文件缺失：留着，删除接口自会清理 */ }
    }
    if (n) { save(); console.log(`[game] 已为 ${n} 个存量 ROM 补算内容指纹（去重用）`); }
}

// 玩家：拉取 ROM 列表（含当前账号是否管理员，前端据此决定是否显示导入区）
api['GET /api/roms'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    // q：按中文名 / 英文原名 / 短名 / 别名 / 厂商 搜索（街机玩家常只记得「饿狼」「kof98」）
    const q = String(url.parse(req.url, true).query.q || '').trim().toLowerCase().slice(0, 60);
    const list = (DB.roms || []).filter(r => romMatchQ(r, q));
    sendJson(res, 200, { roms: list.map(romMeta), admin: romAdminOk(req), q });
};
// 玩家：下载 ROM（鉴权后流式回传，前端转 blob 喂给模拟器）
api['GET /api/roms/download'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const id = String(url.parse(req.url, true).query.id || '');
    const rom = (DB.roms || []).find(r => r.id === id);
    if (!rom || !/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 404, { error: 'ROM 不存在' });
    const file = path.join(ROMS_DIR, id + '.bin');
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'ROM 文件缺失' });
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
        'Cache-Control': 'private, max-age=86400',
    });
    fs.createReadStream(file).pipe(res);
};
// 管理员：上传 ROM（原始二进制流式落盘，不走 readBody 的 JSON 解析）
api['POST /api/roms/upload'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可上传 ROM' });
    const q = url.parse(req.url, true).query;
    const name = String(q.name || '').slice(0, 120).replace(/[<>&"'/\\]/g, '');
    // 原始文件名：街机 ROM 的身份就在它身上（rbffspec.zip → 短名 rbffspec），必须保留
    const fileName = String(q.fileName || name || '').slice(0, 180).replace(/[<>&"'/\\]/g, '');
    const core = String(q.core || '');
    if (!name || !ROM_CORES.has(core)) return sendJson(res, 400, { error: '参数不完整（name/core）' });
    // 扩展元数据（可选）：platform/year/maker/genre/cover/biosId/parentId
    const platform = ROM_PLATFORMS[q.platform] ? String(q.platform) : '';
    const biosId = /^[A-Za-z0-9_-]+$/.test(String(q.biosId || '')) ? String(q.biosId) : '';
    const parentId = /^[A-Za-z0-9_-]+$/.test(String(q.parentId || '')) ? String(q.parentId) : '';
    const year = /^\d{4}$/.test(String(q.year || '')) ? String(q.year) : '';
    const maker = String(q.maker || '').slice(0, 40).replace(/[<>&"'/\\]/g, '');
    const genre = String(q.genre || '').slice(0, 20).replace(/[<>&"'/\\]/g, '');
    const cover = String(q.cover || '').slice(0, 8);
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > ROM_MAX_BYTES) return sendJson(res, 413, { error: '文件过大（上限 512MB）' });
    fs.mkdirSync(ROMS_DIR, { recursive: true });
    const id = 'rom_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const file = path.join(ROMS_DIR, id + '.bin');
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const cleanup = () => { try { fs.unlinkSync(file); } catch (e) {} };
    const out = fs.createWriteStream(file);
    out.on('error', e => { cleanup(); finish(500, { error: '写入失败：' + e.message }); });
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > ROM_MAX_BYTES) {
            over = true;
            out.destroy();
            cleanup();
            finish(413, { error: '文件过大（上限 512MB）' });
            return;
        }
        if (!out.write(c)) {          // 写入背压：磁盘忙时暂停接收，drain 后恢复
            req.pause();
            out.once('drain', () => req.resume());
        }
    });
    req.on('end', () => {
        if (over) return;
        if (done) { cleanup(); return; }
        if (received === 0) { cleanup(); return finish(400, { error: '空文件' }); }
        out.end(async () => {
            // 内容指纹去重：与库内任一 ROM 内容一致 → 拒收并提示已存在的名字
            try {
                const hash = await romFileHash(file);
                const dup = (DB.roms || []).find(r => r.hash && r.hash === hash);
                if (dup) {
                    cleanup();
                    return finish(409, { error: `重复上传：与「${dup.name}」（${ROM_CORE_LABELS[dup.core] || dup.core}）内容完全相同，已跳过` });
                }
                const u = getUserByToken(req);
                // 图鉴识别：ZIP 短名 + 内部 CRC → 中文名 / 英文原名 / 厂商年份 / 平台 / BIOS / CRC 校验
                let cat = null;
                try {
                    const short = String(fileName || name).replace(/\.(zip|7z|bin)$/i, '').toLowerCase();
                    if (short) {
                        const z = /\.zip$/i.test(fileName) ? romCatalog.readZipEntries(file) : { ok: false, entries: [] };
                        cat = romCatalog.resolve({ shortName: short, entries: z.ok ? z.entries : [] });
                    }
                } catch (e) { /* 图鉴识别失败不影响上传 */ }
                let dispName = name, plat = platform, yr = year, mk = maker, biosAuto = biosId;
                if (cat && cat.shortName) {
                    if (cat.displayName) dispName = cat.displayName;
                    if (!plat && cat.platform) plat = cat.platform;
                    if (!yr && cat.year) yr = cat.year;
                    if (!mk && cat.maker) mk = cat.maker;
                    // BIOS 自动挂载：NeoGeo→neogeo.zip、IGS→pgm.zip，库里已上传就自动绑
                    if (!biosAuto && cat.bios) {
                        const key = cat.bios.replace(/\.zip$/i, '').toLowerCase();
                        const b = (DB.romBios || []).find(x =>
                            String(x.name || '').toLowerCase().replace(/\.zip$/i, '') === key);
                        if (b) biosAuto = b.id;
                    }
                }
                // 显示名剥掉常见 ROM 扩展名（「坦克大战.nes」→「坦克大战」），玩家端更干净；
                // 街机 zip 的短名身份在 fileName/shortName 里，不受影响。图鉴给了名字则用图鉴的。
                if (dispName === name) {
                    const stripped = name.replace(
                        /\.(zip|7z|bin|rom|nes|fds|unf|unif|smc|sfc|swc|gb|gbc|gba|agb|md|gen|smd|sms|gg|pce|ngp|ngc|ws|wsc|d88|dsk|img|cue|ccd|chd|m3u|uae|adf|d64|t64|prg)$/i,
                        '').trim();
                    if (stripped) dispName = stripped;
                }
                DB.roms = DB.roms || [];
                DB.roms.push({
                    id, name: dispName, core, size: received, addedAt: Date.now(),
                    by: (u && u.username) || 'admin', hash, category: 'normal', sort: 0,
                    platform: plat, year: yr, maker: mk, genre, cover, biosId: biosAuto, parentId,
                    fileName: fileName || name,
                    shortName: (cat && cat.shortName) || '',
                    titleZh: (cat && cat.titleZh) || '',
                    titleEn: (cat && cat.titleEn) || '',
                    aliases: (cat && cat.aliases) || [],
                    crcStatus: (cat && cat.crcStatus) || '',
                    catalogVersion: (cat && cat.catalogVersion) || '',
                });
                save();
                finish(200, { ok: true, id, size: received, name: dispName, matched: cat });
            } catch (e) {
                cleanup();
                finish(500, { error: '保存失败：' + e.message });
            }
        });
    });
    req.on('error', () => { out.destroy(); cleanup(); finish(500, { error: '上传中断' }); });
};
// 管理员：修改 ROM 元数据（分类 / 排序 / 改名）
api['POST /api/roms/update'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可修改 ROM' });
    const id = String((body || {}).id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 400, { error: 'id 不合法' });
    DB.roms = DB.roms || [];
    const rom = DB.roms.find(r => r.id === id);
    if (!rom) return sendJson(res, 404, { error: 'ROM 不存在' });
    let changed = false;
    if (body.category != null) {
        const c = String(body.category);
        if (!['normal', 'invincible'].includes(c)) return sendJson(res, 400, { error: 'category 只能是 normal / invincible' });
        rom.category = c; changed = true;
    }
    if (body.sort != null) {
        const s = parseInt(body.sort, 10);
        if (isNaN(s) || s < 0 || s > 9999) return sendJson(res, 400, { error: 'sort 需为 0-9999 的数字（越小越靠前）' });
        rom.sort = s; changed = true;
    }
    if (body.name != null) {
        const nm = String(body.name).slice(0, 120).replace(/[<>&"'/\\]/g, '').trim();
        if (!nm) return sendJson(res, 400, { error: '名称不能为空' });
        rom.name = nm; changed = true;
    }
    // 街机扩展元数据
    if (body.platform != null) {
        const p = String(body.platform);
        if (p && !ROM_PLATFORMS[p]) return sendJson(res, 400, { error: 'platform 只能是 ' + Object.keys(ROM_PLATFORMS).join('/') + ' 或空' });
        rom.platform = p; changed = true;
    }
    if (body.year != null) {
        const y = String(body.year);
        if (y && !/^\d{4}$/.test(y)) return sendJson(res, 400, { error: 'year 需为 4 位年份或空' });
        rom.year = y; changed = true;
    }
    if (body.maker != null) {
        rom.maker = String(body.maker).slice(0, 40).replace(/[<>&"'/\\]/g, ''); changed = true;
    }
    if (body.genre != null) {
        rom.genre = String(body.genre).slice(0, 20).replace(/[<>&"'/\\]/g, ''); changed = true;
    }
    if (body.cover != null) {
        rom.cover = String(body.cover).slice(0, 8); changed = true;
    }
    if (body.biosId != null) {
        const b = String(body.biosId);
        if (b && !/^[A-Za-z0-9_-]+$/.test(b)) return sendJson(res, 400, { error: 'biosId 不合法' });
        if (b && !(DB.romBios || []).some(x => x.id === b)) return sendJson(res, 404, { error: 'BIOS 不存在，请先在「BIOS 管理」上传' });
        rom.biosId = b; changed = true;
    }
    if (body.parentId != null) {
        const pid = String(body.parentId);
        if (pid && !/^[A-Za-z0-9_-]+$/.test(pid)) return sendJson(res, 400, { error: 'parentId 不合法' });
        // 基板 ROM（clone）：必须同时加载父 ROM 才能跑，前端据此传 EJS_gameParentUrl
        if (pid && !(DB.roms || []).some(x => x.id === pid)) return sendJson(res, 404, { error: '父 ROM 不存在' });
        rom.parentId = pid; changed = true;
    }
    if (!changed) return sendJson(res, 400, { error: '没有要修改的字段' });
    save();
    sendJson(res, 200, { ok: true, rom: romMeta(rom) });
};
// 管理员：删除 ROM（元数据 + 磁盘文件一起清）
api['POST /api/roms/delete'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可删除 ROM' });
    const id = String((body || {}).id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 400, { error: 'id 不合法' });
    DB.roms = DB.roms || [];
    const i = DB.roms.findIndex(r => r.id === id);
    if (i < 0) return sendJson(res, 404, { error: 'ROM 不存在' });
    DB.roms.splice(i, 1);
    try { fs.unlinkSync(path.join(ROMS_DIR, id + '.bin')); } catch (e) {}
    save();
    sendJson(res, 200, { ok: true });
};

// ---------------- ROM 图鉴（街机短名 → 中文名 / CRC 校验 / 批量导入）----------------
// 背景：街机 ZIP 内文件名是板卡芯片编号（223-p1.bin），不含标题；唯一稳定身份是 ZIP 短名。
// 流程：上传 DAT（与核心版本匹配）→ 扫描 ROM 目录 → 预览确认（中文名/厂商年份/平台/BIOS/CRC）→ 导入。
// 中文名单独维护在 data/rom-zh.json，不混进 DAT，换 DAT 版本不影响翻译。
api['GET /api/admin/roms/catalog'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const st = romCatalog.status();
    sendJson(res, 200, {
        catalog: st, zh: romCatalog.zh, platforms: romCatalog.PLATFORMS,
        // 服务器部署时管理员需要知道「往哪儿传、填什么路径」，这里直接把绝对路径给前端
        server: {
            platform: process.platform,
            inboxDir: ROM_INBOX_DIR,
            romsDir: ROMS_DIR,
            cwd: ROOT,
        },
        inbox: romInboxList(),
    });
};
// 收件箱：列出已上传到服务器的 ZIP（图鉴扫描的默认目标）
function romInboxList() {
    let files = [];
    try {
        files = fs.readdirSync(ROM_INBOX_DIR).filter(n => /\.zip$/i.test(n)).map(n => {
            let size = 0, mtime = 0;
            try { const st = fs.statSync(path.join(ROM_INBOX_DIR, n)); size = st.size; mtime = st.mtimeMs; } catch (e) { }
            return { file: n, shortName: n.replace(/\.zip$/i, '').toLowerCase(), size, mtime };
        });
    } catch (e) { files = []; }
    files.sort((a, b) => String(a.file).localeCompare(String(b.file)));
    let total = 0; for (const f of files) total += f.size;
    return { dir: ROM_INBOX_DIR, files, count: files.length, total };
}
// 收件箱上传：原始字节流（同 ROM 上传），文件名通过 query 传（短名必须保持原样）
api['POST /api/admin/roms/inbox/upload'] = (req, res) => {
    if (!romAdminOk(req)) { sendJson(res, 403, { error: '仅管理员' }); req.resume(); return; }
    const q = url.parse(req.url, true).query;
    const raw = String(q.fileName || q.name || '').slice(0, 180);
    // 只保留安全字符；非 ZIP 一律拒收（图鉴只认 ZIP）
    const safe = raw.replace(/[<>&"'\/\\:*?|]/g, '_').replace(/^\.+/, '');
    // 宁可拒绝也不要「静默改名」：把 ../../evil.zip 洗成 _.._evil.zip 虽然当下安全，
    // 但管理员会以为传成功了、文件名却被改了，短名一变街机就认不出这是哪个游戏。
    // 而且一旦以后放宽替换规则，这种写法会直接退化成目录穿越。
    if (raw.indexOf('..') >= 0) return sendJson(res, 400, { error: '文件名不合法（含 ..）：' + raw });
    if (!/\.zip$/i.test(safe)) return sendJson(res, 400, { error: '只接受 .zip 文件：' + (raw || '(未给文件名)') });
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > ROM_MAX_BYTES) { req.resume(); return sendJson(res, 413, { error: '文件过大（上限 512MB）' }); }
    try { fs.mkdirSync(ROM_INBOX_DIR, { recursive: true }); } catch (e) {
        return sendJson(res, 500, { error: '无法创建收件箱目录：' + e.message });
    }
    const file = path.join(ROM_INBOX_DIR, safe);
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const cleanup = () => { try { fs.unlinkSync(file); } catch (e) { } };
    let out = null;
    try { out = fs.createWriteStream(file); } catch (e) { return finish(500, { error: '写入失败：' + e.message }); }
    out.on('error', e => { cleanup(); finish(500, { error: '写入失败：' + e.message }); });
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > ROM_MAX_BYTES) {
            over = true; out.destroy(); cleanup();
            finish(413, { error: '文件过大（上限 512MB）' });
            return;
        }
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
        if (over) return;
        if (received === 0) { cleanup(); return finish(400, { error: '空文件：' + safe }); }
        out.end(() => finish(200, { ok: true, file: safe, size: received, inbox: romInboxList() }));
    });
    req.on('error', () => { cleanup(); finish(500, { error: '上传中断' }); });
};
api['POST /api/admin/roms/inbox/clear'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const only = Array.isArray((body || {}).files) ? (body || {}).files.map(String) : null;
    let removed = 0;
    try {
        for (const n of fs.readdirSync(ROM_INBOX_DIR)) {
            if (!/\.zip$/i.test(n)) continue;
            if (only && only.indexOf(n) < 0) continue;
            // 文件名来自 readdirSync，天然不含路径分隔符，不可能穿越出去
            if (/[<>:*?|]/.test(n)) continue;
            try { fs.unlinkSync(path.join(ROM_INBOX_DIR, n)); removed++; } catch (e) { }
        }
    } catch (e) { }
    sendJson(res, 200, { ok: true, removed, inbox: romInboxList() });
};
// DAT 走原始文本流（同 ROM 上传，需加进 RAW_BODY_API），避免 JSON 转义撑大内存
api['POST /api/admin/roms/dat'] = (req, res) => {
    // 注意：这里不能 res.destroy() —— 连接被掐断时浏览器只会报 ECONNRESET，
    // 看不出是「没权限」还是「网络断了」。照常回 403，再把请求体排空即可。
    if (!romAdminOk(req)) { sendJson(res, 403, { error: '仅管理员' }); req.resume(); return; }
    const q = url.parse(req.url, true).query;
    const file = String(q.file || '').slice(0, 60);
    const chunks = [];
    let received = 0, done = false;
    const DAT_MAX = 128 * 1024 * 1024;
    // 超限后不能只标记 done：必须继续排空请求体，否则客户端会卡在「上传中」
    let overLimit = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    req.on('data', c => {
        if (overLimit) return;                      // 已判定超限：丢弃后续分片
        received += c.length;
        if (received > DAT_MAX) { overLimit = true; chunks.length = 0; return; }
        chunks.push(c);
    });
    req.on('end', () => {
        if (done) return;
        if (overLimit) return finish(413, { error: 'DAT 过大（上限 128MB）' });
        const text = Buffer.concat(chunks).toString('utf8');
        const r = romCatalog.saveDat(file, text);
        if (!r.ok) return finish(400, { error: r.error });
        finish(200, { ok: true, ...r });
    });
    req.on('error', () => finish(500, { error: '上传中断' }));
};
api['POST /api/admin/roms/dat/delete'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const r = romCatalog.deleteDat(String((body || {}).file || ''));
    if (!r.ok) return sendJson(res, 404, { error: r.error });
    sendJson(res, 200, { ok: true, ...romCatalog.status() });
};
api['POST /api/admin/roms/zh'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const raw = (body || {}).zh;
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: 'JSON 格式错误：' + e.message }); }
    }
    if (!obj || typeof obj !== 'object') return sendJson(res, 400, { error: '参数不完整（zh 为对象或 JSON 字符串）' });
    const zh = romCatalog.saveZh(obj);
    sendJson(res, 200, { ok: true, count: Object.keys(zh).length, zh });
};
// 扫描服务器目录：只读每个 ZIP 的中央目录（不解压），给出「待确认」预览
api['POST /api/admin/roms/scan'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const dir = String((body || {}).dir || '').trim() || ROM_INBOX_DIR;   // 留空 = 扫收件箱
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        // 报错里直接把「服务器路径 vs 本地路径」讲清楚：这是部署到服务器后最高频的误解
        return sendJson(res, 400, {
            error: '目录不存在：' + dir + '。注意这是**服务器**上的路径，不是你电脑上的；'
                + '请先用上面的「上传到服务器」把 ROM 传进 ' + ROM_INBOX_DIR + '，再留空扫描。',
            hint: '收件箱当前 ' + romInboxList().count + ' 个 ZIP',
            inbox: romInboxList(),
        });
    }
    const r = romCatalog.scanDir(dir, { limit: (body || {}).limit });
    if (!r.ok) return sendJson(res, 400, { error: r.error });
    // 已导入标记：同 shortName 或同文件已入库 → 前端默认不勾选
    const have = new Set((DB.roms || []).map(x => String(x.shortName || '').toLowerCase()).filter(Boolean));
    for (const it of r.items) it.imported = have.has(it.shortName);
    sendJson(res, 200, r);
};
// 批量导入：把选中的 ROM 复制（或移动）进库，自动挂 BIOS / 回填父 ROM
api['POST /api/admin/roms/import'] = async (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const items = Array.isArray((body || {}).items) ? (body || {}).items : [];
    if (!items.length) return sendJson(res, 400, { error: '没有选中任何 ROM' });
    const move = !!(body || {}).move;
    const u = getUserByToken(req);
    DB.roms = DB.roms || [];
    fs.mkdirSync(ROMS_DIR, { recursive: true });
    const added = [], skipped = [];
    for (const it of items.slice(0, 200)) {
        const src = String(it.path || '');
        if (!src || !src.toLowerCase().endsWith('.zip') || !fs.existsSync(src)) { skipped.push({ file: src, reason: '文件不存在或非 ZIP' }); continue; }
        if (!path.isAbsolute(src)) { skipped.push({ file: src, reason: '路径必须是绝对路径' }); continue; }
        const shortName = String(it.shortName || path.basename(src).replace(/\.zip$/i, '')).toLowerCase();
        // 基板 BIOS（neogeo.zip 等）跟游戏 ROM 在同一个目录里，但它是「零件」不是游戏：
        // 当成游戏导入会在玩家列表里多点一个永远打不开的条目。请走「BIOS 管家」上传。
        if (romCatalog.isBiosShortName(shortName)) {
            skipped.push({ file: src, reason: '这是基板 BIOS，不是游戏（请在「BIOS 管家」里上传）' });
            continue;
        }
        if ((DB.roms || []).some(r => r.shortName === shortName)) { skipped.push({ file: src, reason: '已导入过同短名 ROM' }); continue; }
        // 允许管理员在预览表里改中文名 / 平台 / 年份
        let info;
        try {
            const z = romCatalog.readZipEntries(src);
            info = romCatalog.resolve({ shortName, entries: z.ok ? z.entries : [] });
        } catch (e) { info = romCatalog.resolve({ shortName, entries: [] }); }
        if (it.titleZh) info.titleZh = String(it.titleZh).slice(0, 60);
        if (it.platform && romCatalog.PLATFORMS.includes(String(it.platform))) { info.platform = String(it.platform); info.bios = romCatalog.BIOS_HINT[info.platform] || ''; }
        if (it.year) info.year = String(it.year).slice(0, 4);
        const id = 'rom_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        const dest = path.join(ROMS_DIR, id + '.bin');
        try {
            if (move) fs.renameSync(src, dest); else fs.copyFileSync(src, dest);
        } catch (e) { skipped.push({ file: src, reason: '写入失败：' + e.message }); continue; }
        let hash = '';
        try { hash = await romFileHash(dest); } catch (e) { }
        if (hash) {
            const dup = (DB.roms || []).find(r => r.hash && r.hash === hash);
            if (dup) {
                try { fs.unlinkSync(dest); } catch (e) { }
                skipped.push({ file: src, reason: `内容与「${dup.name}」完全相同` });
                continue;
            }
        }
        let biosId = '';
        if (info.bios) {
            const key = info.bios.replace(/\.zip$/i, '').toLowerCase();
            const b = (DB.romBios || []).find(x => String(x.name || '').toLowerCase().replace(/\.zip$/i, '') === key);
            if (b) biosId = b.id;
        }
        DB.roms.push({
            id, name: info.titleZh || info.titleEn || shortName,
            core: String(it.core || info.core || 'fbneo'),
            size: fs.existsSync(dest) ? fs.statSync(dest).size : 0,
            addedAt: Date.now(), by: (u && u.username) || 'admin', hash,
            category: 'normal', sort: 0,
            platform: info.platform || 'other', year: info.year || '', maker: info.maker || '',
            genre: '', cover: '', biosId, parentId: '',
            fileName: path.basename(src), shortName,
            titleZh: info.titleZh || '', titleEn: info.titleEn || '',
            aliases: info.aliases || [], crcStatus: info.crcStatus || '',
            catalogVersion: info.catalogVersion || '',
        });
        added.push({ id, shortName, name: info.titleZh || info.titleEn || shortName, crcStatus: info.crcStatus, parentShortName: info.parentShortName });
    }
    // 父子 ROM 回填：克隆基板必须挂到母 ROM 上才能跑（前端据此传 EJS_gameParentUrl）
    let linked = 0;
    for (const a of added) {
        if (!a.parentShortName) continue;
        const p = (DB.roms || []).find(r => r.shortName === a.parentShortName);
        if (!p) continue;
        const self = (DB.roms || []).find(r => r.id === a.id);
        if (self) { self.parentId = p.id; linked++; }
    }
    save();
    sendJson(res, 200, { ok: true, added, skipped, linked, total: (DB.roms || []).length });
};

// ---------------- BIOS 管家（街机刚需） ----------------
// NeoGeo 必须 neogeo.zip、IGS(PGM) 必须 pgm.zip，缺了就是纯黑屏且无任何报错。
// 管理员只需各上传一次，之后所有街机 ROM 共用；EJS_biosUrl 支持 zip，自动解压。
const BIOS_DIR = path.join(ROMS_DIR, 'bios');
const BIOS_MAX_BYTES = 128 * 1024 * 1024;
const biosMeta = b => ({ id: b.id, name: b.name, size: b.size, addedAt: b.addedAt, hint: b.hint || '' });

api['GET /api/roms/bios'] = (req, res) => {
    if (!getUserByToken(req)) return sendJson(res, 401, { error: '未登录' });
    // 同时回传"每种街机平台缺哪个 BIOS"，前端据此在列表上标红警告。
    // 只有库里真有该平台的游戏才算 missing（缺了必然黑屏）；库里没有的进 notNeeded（暂不需要）。
    const have = (DB.romBios || []).map(b => (b.name || '').toLowerCase());
    const has = file => {
        const bare = file.replace(/\.zip$/i, '').toLowerCase();
        return have.some(n => n === file.toLowerCase() || n === bare);
    };
    const demand = romBiosDemand();
    const missing = [], notNeeded = [], used = [];
    for (const file of ROM_BIOS_FILES) {
        const src = demand.get(file);
        if (has(file)) { if (src && src.size) used.push({ file, platforms: [...src].map(biosKeyLabel) }); continue; }
        if (src && src.size) missing.push({ file, platforms: [...src].map(biosKeyLabel) });
        else notNeeded.push({ file });
    }
    sendJson(res, 200, { bios: (DB.romBios || []).map(biosMeta), missing, notNeeded, used, admin: romAdminOk(req) });
};
api['GET /api/roms/bios/download'] = (req, res) => {
    if (!getUserByToken(req)) return sendJson(res, 401, { error: '未登录' });
    const id = String(url.parse(req.url, true).query.id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 404, { error: 'BIOS 不存在' });
    const b = (DB.romBios || []).find(x => x.id === id);
    if (!b) return sendJson(res, 404, { error: 'BIOS 不存在' });
    const file = path.join(BIOS_DIR, b.id + '.bin');
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'BIOS 文件缺失' });
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
        'Cache-Control': 'private, max-age=86400',
    });
    fs.createReadStream(file).pipe(res);
};
api['POST /api/roms/bios/upload'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可上传 BIOS' });
    const q = url.parse(req.url, true).query;
    const name = String(q.name || '').slice(0, 60).replace(/[^A-Za-z0-9._-]/g, '');
    if (!name) return sendJson(res, 400, { error: '请填 BIOS 名称，如 neogeo / pgm' });
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > BIOS_MAX_BYTES) return sendJson(res, 413, { error: '文件过大（上限 128MB）' });
    // 同名覆盖：BIOS 就那几个，重复上传多半是补文件，直接替换更省事
    const exist = (DB.romBios || []).find(x => x.name.toLowerCase() === name.toLowerCase());
    const id = exist ? exist.id : 'bios_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    fs.mkdirSync(BIOS_DIR, { recursive: true });
    const file = path.join(BIOS_DIR, id + '.bin');
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const out = fs.createWriteStream(file);
    out.on('error', e => { try { fs.unlinkSync(file); } catch (_) {} finish(500, { error: '写入失败：' + e.message }); });
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > BIOS_MAX_BYTES) {
            over = true; out.destroy();
            try { fs.unlinkSync(file); } catch (_) {}
            return finish(413, { error: '文件过大（上限 128MB）' });
        }
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
        if (over || done) return;
        if (!received) { try { fs.unlinkSync(file); } catch (_) {} return finish(400, { error: '空文件' }); }
        out.end(() => {
            DB.romBios = DB.romBios || [];
            if (exist) { exist.size = received; exist.addedAt = Date.now(); }
            else DB.romBios.push({ id, name, size: received, addedAt: Date.now() });
            save();
            finish(200, { ok: true, id, size: received, replaced: !!exist });
        });
    });
    req.on('error', () => { out.destroy(); try { fs.unlinkSync(file); } catch (_) {} finish(500, { error: '上传中断' }); });
};
api['POST /api/roms/bios/delete'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可删除 BIOS' });
    const id = String((body || {}).id || '');
    DB.romBios = DB.romBios || [];
    const i = DB.romBios.findIndex(x => x.id === id);
    if (i < 0) return sendJson(res, 404, { error: 'BIOS 不存在' });
    DB.romBios.splice(i, 1);
    try { fs.unlinkSync(path.join(BIOS_DIR, id + '.bin')); } catch (e) {}
    // 解绑引用，避免前端拿着失效 id 去拼 URL
    (DB.roms || []).forEach(r => { if (r.biosId === id) r.biosId = ''; });
    save();
    sendJson(res, 200, { ok: true });
};

// ---------------- 云存档（模拟器进度不丢的关键） ----------------
// 存档是二进制且单份可达数十 MB，和 ROM 一样走「磁盘文件 + 登录鉴权」，
// 绝不写进 db.json / MySQL（会把存档文件拖垮、还会把玩家的ROM搞串行）。
// 目录：data/emu-saves/<userId>/<romId>.state（即时存档）/ .sram（游戏内存档）
const EMU_SAVES_DIR = path.join(DATA_DIR, 'emu-saves');
const SAVE_MAX = { state: 64 * 1024 * 1024, sram: 16 * 1024 * 1024 };
const safeId = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

function saveFilePath(userId, romId, kind) {
    if (!/^(state|sram)$/.test(kind)) return null;
    const raw = String(romId || '');
    const u = safeId(userId), r = safeId(romId);
    if (!u || !r) return null;
    // 关键：光把 ../ 剥掉是不够的 —— '../../server.js' 会被洗成 'serverjs'，
    // 既没穿出去、又变成一句含义不清的 404。这里直接判定为非法参数（400），
    // 让调用方一眼看出是 id 不合法，而不是误以为「存档不存在」。
    if (r !== raw) return null;
    const dir = path.join(EMU_SAVES_DIR, u);
    const rel = path.join(u, r + '.' + kind);
    const full = path.join(EMU_SAVES_DIR, rel);
    // 防目录穿越：拼好的绝对路径必须还在 EMU_SAVES_DIR 内
    if (!full.startsWith(EMU_SAVES_DIR + path.sep)) return null;
    return { full, dir, rel };
}

api['GET /api/emu/save/meta'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const romId = String(url.parse(req.url, true).query.romId || '');
    const out = {};
    for (const kind of ['state', 'sram']) {
        const p = saveFilePath(u.id, romId, kind);
        if (!p) { out[kind] = null; continue; }
        try {
            const st = fs.statSync(p.full);
            out[kind] = { size: st.size, at: Math.floor(st.mtimeMs) };
        } catch (e) { out[kind] = null; }
    }
    sendJson(res, 200, { romId, saves: out });
};
api['GET /api/emu/save'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const p = saveFilePath(u.id, q.romId, q.kind);
    if (!p) return sendJson(res, 400, { error: '参数不合法（romId/kind）' });
    if (!fs.existsSync(p.full)) return sendJson(res, 404, { error: '尚无云存档' });
    const st = fs.statSync(p.full);
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-store',
    });
    fs.createReadStream(p.full).pipe(res);
};
api['POST /api/emu/save'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const kind = String(q.kind || '');
    const p = saveFilePath(u.id, q.romId, kind);
    if (!p) return sendJson(res, 400, { error: '参数不合法（romId/kind）' });
    const limit = SAVE_MAX[kind] || SAVE_MAX.sram;
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > limit) return sendJson(res, 413, { error: '存档过大（上限 ' + Math.round(limit / 1048576) + 'MB）' });
    fs.mkdirSync(p.dir, { recursive: true });
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const out = fs.createWriteStream(p.full);
    out.on('error', e => finish(500, { error: '写入失败：' + e.message }));
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > limit) {
            over = true; out.destroy();
            try { fs.unlinkSync(p.full); } catch (_) {}
            return finish(413, { error: '存档过大（上限 ' + Math.round(limit / 1048576) + 'MB）' });
        }
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
        if (over || done) return;
        if (!received) return finish(400, { error: '空存档，忽略' });
        out.end(() => finish(200, { ok: true, size: received, at: Date.now() }));
    });
    req.on('error', () => { out.destroy(); try { fs.unlinkSync(p.full); } catch (_) {} finish(500, { error: '上传中断' }); });
};
api['DELETE /api/emu/save'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const p = saveFilePath(u.id, q.romId, q.kind);
    if (!p) return sendJson(res, 400, { error: '参数不合法（romId/kind）' });
    try { fs.unlinkSync(p.full); } catch (e) {}
    sendJson(res, 200, { ok: true });
};

  // ---- 原内容结束 ----
  return { romsBackfillHash };
};
