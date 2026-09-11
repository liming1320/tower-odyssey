// ROM 图鉴解析器（街机 ROM 的身份识别）
//
// 背景：街机 ZIP 里的文件名是 223-p1.bin、223-c1.bin 这种「板卡芯片编号」，
//   完全不含游戏标题；而 ZIP 文件名 rbffspec.zip 里的 rbffspec 是模拟器驱动的短名，
//   才是 ROM 的唯一稳定身份（父子 ROM / BIOS 依赖都挂在这上面）。
// 所以识别链路是：
//   1) ZIP 短名（不改名、不靠内部文件名）
//   2) 用与核心版本匹配的 DAT 查短名 → 英文原名 / 厂商 / 年份 / 平台 / 父 ROM / BIOS
//   3) 独立维护中文覆盖表（不混进 DAT，DAT 可随时换版本）
//   4) 用 ZIP 中央目录里的 CRC32 与 DAT 清单比对 → 识别改名 ROM / 残缺 ROM / 错版 ROM
// 这里全是零依赖实现：ZIP 只读尾部中央目录（不解压、不读全文件），DAT 用正则解析。
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- ZIP 中央目录
// 只读取「尾部 EOCD + 中央目录」，对几十 MB 的街机 ROM 也是毫秒级，且不需要 zlib。
function readZipEntries(file) {
    let fd = null;
    try {
        const size = fs.statSync(file).size;
        if (size < 22) return { ok: false, error: '文件太小，不是有效 ZIP' };
        fd = fs.openSync(file, 'r');
        const tailLen = Math.min(size, 66000);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, size - tailLen);

        let eocd = -1;
        for (let i = tail.length - 22; i >= 0; i--) {
            if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) return { ok: false, error: '找不到 ZIP 结尾标记（可能不是 ZIP 或已损坏）' };

        let total = tail.readUInt16LE(eocd + 10);
        let cdSize = tail.readUInt32LE(eocd + 12);
        let cdOff = tail.readUInt32LE(eocd + 16);
        // ZIP64：4GB 以上 ROM 会走这里（街机少见，但 PS1/DOS 整包可能遇到）
        if (cdOff === 0xffffffff || total === 0xffff) {
            const loc = eocd - 20;
            if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
                const z64 = Number(tail.readBigUInt64LE(loc + 8));
                const z = Buffer.alloc(56);
                fs.readSync(fd, z, 0, 56, z64);
                if (z.readUInt32LE(0) === 0x06064b50) {
                    total = Number(z.readBigUInt64LE(32));
                    cdSize = Number(z.readBigUInt64LE(40));
                    cdOff = Number(z.readBigUInt64LE(48));
                }
            }
        }
        if (!cdSize || cdOff < 0 || cdOff + cdSize > size) {
            return { ok: false, error: 'ZIP 目录损坏（偏移越界）' };
        }
        const buf = Buffer.alloc(cdSize);
        fs.readSync(fd, buf, 0, cdSize, cdOff);

        const entries = [];
        let p = 0;
        for (let i = 0; i < total && p + 46 <= buf.length; i++) {
            if (buf.readUInt32LE(p) !== 0x02014b50) break;
            const crc = buf.readUInt32LE(p + 16).toString(16).padStart(8, '0');
            const csize = buf.readUInt32LE(p + 20);
            const usize = buf.readUInt32LE(p + 24);
            const nameLen = buf.readUInt16LE(p + 28);
            const extraLen = buf.readUInt16LE(p + 30);
            const cmtLen = buf.readUInt16LE(p + 32);
            if (p + 46 + nameLen > buf.length) break;
            const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
            entries.push({ name, crc, size: usize, compSize: csize });
            p += 46 + nameLen + extraLen + cmtLen;
        }
        return { ok: true, entries, count: entries.length };
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        if (fd != null) { try { fs.closeSync(fd); } catch (e) { } }
    }
}

// ---------------------------------------------------------------- DAT 解析
const unesc = s => String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&').trim();
const attrsOf = s => {
    const o = {};
    const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(s))) o[m[1].toLowerCase()] = m[2];
    return o;
};
const tagText = (block, tag) => {
    const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i').exec(block);
    return m ? unesc(m[1]) : '';
};

// 支持两种主流 DAT：MAME / FBNeo 的 XML（<game>/<machine>），以及 ClrMamePro 的文本格式
function parseDat(text) {
    const t = String(text || '');
    if (!t.trim()) return { kind: 'empty', version: '', count: 0, entries: {} };
    const isXml = /<(game|machine)\b/i.test(t) && /<\/(mame|datafile)>/i.test(t);
    const isCmp = !isXml && /game\s*\(/i.test(t);
    if (!isXml && !isCmp) return { kind: 'unknown', version: '', count: 0, entries: {} };

    const entries = {};
    let version = '';
    if (isXml) {
        const v = /<mame\b[^>]*build\s*=\s*"([^"]*)"/i.exec(t)
            || /<header>[\s\S]*?<version>([\s\S]*?)<\/version>/i.exec(t.slice(0, 40000));
        version = v ? unesc(v[1]) : '';
        const re = /<(game|machine)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
        let m;
        while ((m = re.exec(t))) {
            const a = attrsOf('<x ' + m[2]);
            const name = (a.name || '').trim();
            if (!name) continue;
            const block = m[3] || '';
            const roms = [];
            const rre = /<rom\b([^>]*?)\/?>/gi;
            let rm;
            while ((rm = rre.exec(block))) {
                const ra = attrsOf('<x ' + rm[1]);
                if (!ra.name) continue;
                roms.push({
                    name: ra.name,
                    crc: String(ra.crc || '').toLowerCase(),
                    size: parseInt(ra.size || '0', 10) || 0,
                    status: (ra.status || 'good').toLowerCase(),
                    merge: ra.merge || '',
                });
            }
            const devices = [];
            const dre = /<device_ref\b([^>]*?)\/?>/gi;
            let dm;
            while ((dm = dre.exec(block))) {
                const da = attrsOf('<x ' + dm[1]);
                if (da.name) devices.push(da.name.toLowerCase());
            }
            entries[name] = {
                name,
                desc: tagText(block, 'description'),
                year: tagText(block, 'year'),
                maker: tagText(block, 'manufacturer'),
                romof: a.romof || '', cloneof: a.cloneof || '',
                sourcefile: a.sourcefile || '',
                roms, devices,
            };
        }
        return { kind: 'xml', version, count: Object.keys(entries).length, entries };
    }

    // ClrMamePro：game ( name "x" description "y" ... rom ( name a size n crc 1234 ) )
    const hm = /clrmamepro\s*\(([\s\S]*?)\)/i.exec(t.slice(0, 4000));
    if (hm) { const vn = /\bversion\s+"?([^"\n\)]+)"?/i.exec(hm[1]); version = vn ? unesc(vn[1]) : ''; }
    const gre = /game\s*\(([\s\S]*?)\n\s*\)/gi;
    let g;
    while ((g = gre.exec(t))) {
        const block = g[1];
        const name = (/\bname\s+"?([^"\n\)]+)"?/i.exec(block) || [])[1] || '';
        if (!name) continue;
        const desc = (/\bdescription\s+"([^"]*)"/i.exec(block) || /\bdescription\s+"?([^\n\)]+)"?/i.exec(block) || [])[1] || '';
        const year = (/\byear\s+"?([^"\n\)]+)"?/i.exec(block) || [])[1] || '';
        const maker = (/\bmanufacturer\s+"?([^"\n\)]+)"?/i.exec(block) || [])[1] || '';
        const roms = [];
        const rre = /rom\s*\(([\s\S]*?)\)/gi;
        let rm;
        while ((rm = rre.exec(block))) {
            const rb = rm[1];
            const rn = (/\bname\s+"?([^"\n\)]+)"?/i.exec(rb) || [])[1];
            if (!rn) continue;
            roms.push({
                name: rn,
                crc: String((/\bcrc\s+"?([0-9a-f]{8})"?/i.exec(rb) || [])[1] || '').toLowerCase(),
                size: parseInt((/\bsize\s+"?(\d+)"?/i.exec(rb) || [])[1] || '0', 10) || 0,
                status: ((/\bstatus\s+"?([^"\n\)]+)"?/i.exec(rb) || [])[1] || 'good').toLowerCase(),
                merge: (/\bmerge\s+"?([^"\n\)]+)"?/i.exec(rb) || [])[1] || '',
            });
        }
        entries[name.trim()] = {
            name: name.trim(), desc: unesc(desc), year: unesc(year), maker: unesc(maker),
            romof: (/\bromof\s+"?([^"\n\)]+)"?/i.exec(block) || [])[1] || '',
            cloneof: (/\bcloneof\s+"?([^"\n\)]+)"?/i.exec(block) || [])[1] || '',
            sourcefile: '', roms, devices: [],
        };
    }
    return { kind: 'clrmamepro', version, count: Object.keys(entries).length, entries };
}

// ---------------------------------------------------------------- 平台 / BIOS / 核心
const PLATFORMS = ['neogeo', 'cps1', 'cps2', 'cps3', 'igs', 'other'];
const BIOS_HINT = { neogeo: 'neogeo.zip', igs: 'pgm.zip', cps3: 'cps3.zip' };
// 常见基板 BIOS 的短名。它们跟游戏 ROM 放在同一个目录里，扫描时会被一起捞出来，
// 但**不是游戏**：当游戏导入会变成玩家列表里一个点开就报错的条目。
// 正确做法是走后台「BIOS 管家」上传，而不是混进游戏库。
const BIOS_SHORTNAMES = new Set(['neogeo', 'neogeo.zip', 'uni-bios', 'unibios', 'cps3', 'pgm', 'pgmbios', 'neocdz']);
const isBiosShortName = s => BIOS_SHORTNAMES.has(String(s || '').toLowerCase().replace(/\.zip$/i, ''));
function guessPlatform(entry, zh) {
    if (zh && zh.platform) return zh.platform;
    if (entry) {
        const dev = (entry.devices || []).join(' ');
        const src = (entry.sourcefile || '') + ' ' + dev + ' ' + (entry.name || '');
        if (/neogeo/.test(src)) return 'neogeo';
        if (/cps3/.test(src)) return 'cps3';
        if (/cps2/.test(src)) return 'cps2';
        if (/cps1/.test(src)) return 'cps1';
        if (/pgm|igs/.test(src)) return 'igs';
        // NeoGeo 的视觉特征：主程序 p1 / 图形 c1 c2 / 音效 m1 / 采样 v1 v2
        if ((entry.roms || []).some(r => /-m1\.bin$/i.test(r.name))) return 'neogeo';
    }
    return 'other';
}
// 目录名兜底：ROM 包普遍按基板分目录（roms/neogeo、roms/cps1、roms/cps2/cps2），
// 没有 DAT 时这是最可靠的平台来源 —— 目录结构本身就是上传者给的分类。
function guessPlatformByDir(dirHint) {
    const d = String(dirHint || '').toLowerCase();
    if (!d) return '';
    if (/neogeo|mvs|neo-?geo/.test(d)) return 'neogeo';
    if (/cps[-_]?3/.test(d)) return 'cps3';
    if (/cps[-_]?2/.test(d)) return 'cps2';
    if (/cps[-_]?1|cps/.test(d)) return 'cps1';
    if (/pgm|igs/.test(d)) return 'igs';
    return '';
}
const coreForPlatform = p => (p === 'cps1' ? 'fbalpha2012_cps1'
    : p === 'cps2' ? 'fbalpha2012_cps2'
        : p === 'neogeo' ? 'fbalpha2012_neogeo' : 'fbneo');

// ---------------------------------------------------------------- 图鉴工厂
module.exports = function createCatalog(opt) {
    opt = opt || {};
    const catalogDir = opt.catalogDir;
    const zhFile = opt.zhFile;
    let DAT = { kind: 'empty', version: '', count: 0, entries: {} };
    let DAT_FILE = '';
    let ZH = {};

    function loadDat() {
        DAT = { kind: 'empty', version: '', count: 0, entries: {} };
        DAT_FILE = '';
        if (!catalogDir) return DAT;
        try { fs.mkdirSync(catalogDir, { recursive: true }); } catch (e) { }
        let files = [];
        try { files = fs.readdirSync(catalogDir).filter(f => /\.(dat|xml)$/i.test(f)); } catch (e) { return DAT; }
        for (const f of files) {
            try {
                const p = parseDat(fs.readFileSync(path.join(catalogDir, f), 'utf8'));
                if (p.count > DAT.count) { DAT = p; DAT_FILE = f; }
            } catch (e) { }
        }
        return DAT;
    }
    function saveDat(filename, text) {
        const parsed = parseDat(text);
        if (parsed.kind === 'unknown' || !parsed.count) return { ok: false, error: '无法识别的 DAT（需要 MAME/FBNeo 的 XML 或 ClrMamePro 格式）' };
        fs.mkdirSync(catalogDir, { recursive: true });
        const safe = String(filename || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || ('dat_' + Date.now() + '.dat');
        fs.writeFileSync(path.join(catalogDir, safe), text);
        loadDat();
        return { ok: true, file: safe, ...status() };
    }
    function listDat() {
        let files = [];
        try { files = fs.readdirSync(catalogDir).filter(f => /\.(dat|xml)$/i.test(f)); } catch (e) { }
        return files;
    }
    function deleteDat(filename) {
        const p = path.join(catalogDir, path.basename(String(filename || '')));
        if (!p.startsWith(catalogDir) || !fs.existsSync(p)) return { ok: false, error: '文件不存在' };
        fs.unlinkSync(p);
        loadDat();
        return { ok: true };
    }
    // 首次运行：用内置种子（server/rom-zh-seed.json）生成可编辑的中文表
    // 种子表（仓库里维护的通用词典）与本地表（后台在线编辑的）是**叠加**关系，不是二选一：
    // 只要 data/rom-zh.json 一存在就只用本地表的话，以后往种子里加的新译名将永远加载不到
    // （老用户尤其如此 —— 他们早在第一次启动时就生成了本地表）。
    // 规则：本地已改的优先；本地没有、或本地留了空标题的，用种子补齐。
    function mergeSeed(ZH) {
        if (!opt.seedFile || !fs.existsSync(opt.seedFile)) return ZH;
        let seed = {};
        try { seed = JSON.parse(fs.readFileSync(opt.seedFile, 'utf8')) || {}; } catch (e) { return ZH; }
        let added = 0;
        for (const k of Object.keys(seed)) {
            if (k.charAt(0) === '_') continue;             // _note 之类的说明键不是数据
            const s = seed[k];
            if (!s || typeof s !== 'object') continue;
            if (!s.titleZh) continue;
            const cur = ZH[k];
            if (cur && typeof cur === 'object' && String(cur.titleZh || '').trim()) continue;  // 本地已改，尊重本地
            // 别名做并集：种子里的英文名 + 本地已有的别名都保留，两种叫法都能搜到
            const al = [];
            const push = a => { a = String(a || '').trim(); if (a && !al.includes(a)) al.push(a); };
            if (cur && Array.isArray(cur.aliases)) cur.aliases.forEach(push);
            (Array.isArray(s.aliases) ? s.aliases : []).forEach(push);
            ZH[k] = {
                titleZh: String(s.titleZh),
                aliases: al.slice(0, 8),
                platform: (cur && cur.platform) || s.platform || '',
                fromSeed: true,
            };
            added++;
        }
        if (added) {
            try { fs.mkdirSync(path.dirname(zhFile), { recursive: true }); fs.writeFileSync(zhFile, JSON.stringify(ZH, null, 2)); } catch (e) { }
        }
        return ZH;
    }

    function loadZh() {
        try {
            if (fs.existsSync(zhFile)) ZH = JSON.parse(fs.readFileSync(zhFile, 'utf8')) || {};
            else if (opt.seedFile && fs.existsSync(opt.seedFile)) {
                ZH = JSON.parse(fs.readFileSync(opt.seedFile, 'utf8')) || {};
                try {
                    fs.mkdirSync(path.dirname(zhFile), { recursive: true });
                    fs.writeFileSync(zhFile, JSON.stringify(ZH, null, 2));
                } catch (e) { }
            } else ZH = {};
        } catch (e) { ZH = {}; }
        return mergeSeed(ZH);
    }
    function saveZh(obj) {
        const out = {};
        for (const k of Object.keys(obj || {})) {
            const v = obj[k];
            if (!v || typeof v !== 'object') continue;
            out[String(k).toLowerCase().slice(0, 64)] = {
                titleZh: String(v.titleZh || '').slice(0, 60),
                aliases: Array.isArray(v.aliases) ? v.aliases.slice(0, 8).map(x => String(x).slice(0, 40)) : [],
                platform: PLATFORMS.includes(String(v.platform || '')) ? String(v.platform) : '',
            };
        }
        fs.mkdirSync(path.dirname(zhFile), { recursive: true });
        fs.writeFileSync(zhFile, JSON.stringify(out, null, 2));
        ZH = out;
        return ZH;
    }

    // 核心：给一个 ROM（短名 + ZIP 内文件 CRC 列表）定身份
    function resolve(info) {
        info = info || {};
        const shortName = String(info.shortName || '').toLowerCase().replace(/\.zip$/i, '');
        const zipEntries = Array.isArray(info.entries) ? info.entries : [];
        const dat = DAT.entries[shortName] || null;
        const zh = ZH[shortName] || null;

        // CRC 比对：DAT 里 status != nodump 的 ROM 都能在 ZIP 里找到同 CRC 的文件 → ok
        let crcStatus = 'nodat', crcDetail = null;
        if (dat && dat.roms && dat.roms.length) {
            const zipCrc = new Set(zipEntries.map(e => String(e.crc || '').toLowerCase()));
            const zipName = new Set(zipEntries.map(e => String(e.name || '').toLowerCase()));
            const need = dat.roms.filter(r => r.status !== 'nodump');
            // CRC 才是身份：CRC 命中 = 版本正确；只剩文件名相同 = 文件在但版本不对（错版/改版）
            let crcHit = 0, nameOnly = 0, missing = 0;
            for (const r of need) {
                if (r.crc && zipCrc.has(r.crc)) crcHit++;
                else if (zipName.has(String(r.name).toLowerCase())) nameOnly++;
                else missing++;
            }
            crcDetail = { crcHit, nameOnly, missing, total: need.length };
            if (!zipEntries.length) crcStatus = 'nodat';
            else if (crcHit === need.length && need.length) crcStatus = 'ok';
            else if (crcHit > 0) crcStatus = 'partial';     // 部分文件版本不对 / 缺件
            else crcStatus = 'mismatch';                     // CRC 全不对：错版 ROM
        } else if (zipEntries.length) {
            crcStatus = 'nodat';
        }

        // 平台判定：中文表 > DAT 的 sourcefile/romof > 所在目录名（roms/neogeo/、roms/cps2/…）
        // 注意 guessPlatform 判不出来时返回 'other'（truthy），会短路掉后面的 `||`，
        // 所以必须显式判断，不能写成 a() || b() || 'other'。
        const byMeta = guessPlatform(dat, zh);
        const platform = (byMeta && byMeta !== 'other')
            ? byMeta
            : (guessPlatformByDir(info.dirHint) || 'other');
        const titleEn = dat ? (dat.desc || '') : '';
        const res = {
            shortName,
            titleEn,
            titleZh: (zh && zh.titleZh) || titleEn || shortName,
            aliases: (zh && zh.aliases) || [],
            year: (dat && dat.year) || (zh && zh.year) || '',
            maker: (dat && dat.maker) || '',
            platform,
            bios: BIOS_HINT[platform] || '',
            core: coreForPlatform(platform),
            parentShortName: (dat && (dat.romof || dat.cloneof)) || '',
            crcStatus, crcDetail,
            catalogVersion: DAT.version || '',
            source: dat ? (zh ? 'dat+zh' : 'dat') : (zh ? 'zh' : 'none'),
        };
        // 显示名优先级：中文覆盖 > DAT 英文原名 > 短名
        res.displayName = res.titleZh || res.titleEn || res.shortName;
        return res;
    }

    // 扫描目录里的 ZIP（只解析每个文件的中央目录，不解压）
    // 递归：ROM 常按基板分目录，甚至套两层（roms/cps2/cps2/xxx.zip）。
    // 不递归的话管理员填 roms 会一个都扫不到，还以为路径填错了。
    function scanDir(dir, opt2) {
        opt2 = opt2 || {};
        const limit = Math.max(1, Math.min(2000, parseInt(opt2.limit, 10) || 500));
        const depth = Math.max(0, Math.min(6, parseInt(opt2.depth, 10) || 4));
        const items = [];
        let truncated = false;
        // 根目录单独校验：递归里 readdirSync 失败是「某个子目录没权限」，
        // 不能因此让整次扫描静默返回空 —— 管理员会以为目录里没有 ROM。
        try {
            if (!fs.statSync(dir).isDirectory()) return { ok: false, error: '不是目录：' + dir, items: [] };
        } catch (e) {
            return { ok: false, error: '目录不存在：' + dir, items: [] };
        }
        let readErr = '';

        function walk(cur, d) {
            if (items.length >= limit || truncated) return;
            let names = [];
            try { names = fs.readdirSync(cur); } catch (e) { if (!readErr) readErr = cur; return; }
            // 目录先走：同一层里 ZIP 的结果顺序更稳定
            for (const n of names) {
                if (items.length >= limit) { truncated = true; return; }
                if (n.startsWith('.')) continue;
                const full = path.join(cur, n);
                let st = null;
                try { st = fs.statSync(full); } catch (e) { continue; }
                if (st.isDirectory()) {
                    if (d < depth) walk(full, d + 1);
                    continue;
                }
                if (!/\.zip$/i.test(n)) continue;
                const shortName = n.replace(/\.zip$/i, '').toLowerCase();
                const z = readZipEntries(full);
                const dirHint = path.basename(path.dirname(full)).toLowerCase();
                const info = resolve({ shortName, entries: z.ok ? z.entries : [], dirHint });
                items.push({
                    file: n, path: full, size: st.size, shortName,
                    // 相对路径 + 所在子目录名：预览里能看出是哪个基板的，
                    // 也便于按目录名兜底判定平台（见 resolve 的 dirHint）
                    isBios: isBiosShortName(shortName),
                    rel: path.relative(dir, full).replace(/\\/g, '/'),
                    dirHint,
                    entries: z.ok ? z.entries.length : 0,
                    zipError: z.ok ? '' : z.error,
                    ...info,
                });
            }
        }
        walk(dir, 0);
        if (!items.length) return { ok: true, dir, items: [], catalog: status(), truncated: false, readError: readErr };
        items.sort((a, b) => String(a.shortName).localeCompare(String(b.shortName)));
        return { ok: true, dir, items, catalog: status(), truncated, readError: readErr };
    }

    function status() {
        return {
            datLoaded: DAT.count > 0,
            datFile: DAT_FILE,
            datKind: DAT.kind,
            datVersion: DAT.version || '',
            datCount: DAT.count,
            datFiles: listDat(),
            zhCount: Object.keys(ZH).length,
        };
    }

    loadDat();
    loadZh();
    return {
        readZipEntries, parseDat, resolve, scanDir, saveDat, deleteDat, listDat, saveZh,
        get zh() { return ZH; },
        get dat() { return DAT; },
        status,
        reload() { loadDat(); loadZh(); return status(); },
        PLATFORMS, BIOS_HINT, BIOS_SHORTNAMES, isBiosShortName,
    };
};
module.exports.readZipEntries = readZipEntries;
module.exports.parseDat = parseDat;
