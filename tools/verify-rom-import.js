// ROM 图鉴端到端验证（后台扫描 → 导入 → 玩家端中文搜索）
// 会真实启动一个服务实例（端口 5199，独立端口不影响 5180），跑完全部清理：
//   ① 备份 data/db.json，结束后原样恢复  ② 删除测试导入的 ROM 与 DAT
// 用法：node tools/verify-rom-import.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { crc32, makeZip } = require('./rom-zip-fixture');

const ROOT = path.join(__dirname, '..');
const PORT = 5199;
const BASE = 'http://127.0.0.1:' + PORT;
const DB = path.join(ROOT, 'data', 'db.json');

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(method, urlPath, body, headers) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
        const r = http.request(BASE + urlPath, {
            method,
            headers: Object.assign({
                'Content-Type': data && !Buffer.isBuffer(body) && typeof body !== 'string' ? 'application/json' : 'text/plain;charset=utf-8',
            }, data ? { 'Content-Length': data.length } : {}, headers || {}),
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(raw); } catch (e) { }
                resolve({ status: res.statusCode, json, raw });
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

(async () => {
    // ---------- 0) 准备 ----------
    const backup = DB + '.bak-romtest';
    const hadDb = fs.existsSync(DB);
    if (hadDb) fs.copyFileSync(DB, backup);
    console.log('已备份 data/db.json → 测试结束自动恢复');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'romimp-'));
    const romDir = path.join(tmp, 'roms');
    fs.mkdirSync(romDir, { recursive: true });
    const p1 = crc32(Buffer.from('223-P1-PROGRAM')), m1 = crc32(Buffer.from('223-M1-AUDIO')), c1 = crc32(Buffer.from('223-C1-GFX'));
    fs.writeFileSync(path.join(romDir, 'rbffspec.zip'), makeZip([
        { name: '223-p1.bin', data: '223-P1-PROGRAM' },
        { name: '223-m1.bin', data: '223-M1-AUDIO' },
        { name: '223-c1.bin', data: '223-C1-GFX' },
    ]));
    fs.writeFileSync(path.join(romDir, 'kof98.zip'), makeZip([{ name: '242-p1.bin', data: 'KOF98-PROGRAM' }]));
    fs.writeFileSync(path.join(romDir, 'readme.txt'), 'ignore');
    const datXml = `<?xml version="1.0"?><mame build="FBNeo test 1.0">
      <game name="rbffspec" sourcefile="neogeo.cpp" romof="rbff2">
        <description>Real Bout Fatal Fury Special</description><year>1997</year><manufacturer>SNK</manufacturer>
        <rom name="223-p1.bin" size="14" crc="${p1.toString(16).padStart(8, '0')}"/>
        <rom name="223-m1.bin" size="12" crc="${m1.toString(16).padStart(8, '0')}"/>
        <rom name="223-c1.bin" size="11" crc="${c1.toString(16).padStart(8, '0')}"/>
        <device_ref name="neogeo"/></game>
      <game name="kof98" sourcefile="neogeo.cpp"><description>The King of Fighters '98</description>
        <year>1998</year><manufacturer>SNK</manufacturer><device_ref name="neogeo"/></game></mame>`;

    const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
    const cleanup = async () => {
        try { srv.kill('SIGKILL'); } catch (e) { }
        await sleep(300);
        // 恢复存档后回收孤儿文件：导入是「复制」进 data/roms 的，只回滚 db.json 会留下
            // 永远访问不到的 .bin（DB 里没这条记录，玩家端看不到，删也删不掉）。
            try {
                const rdir = path.join(ROOT, 'data', 'roms');
                const db2 = JSON.parse(fs.readFileSync(DB, 'utf8'));
                const keep = new Set((db2.roms || []).map(r => r.id + '.bin'));
                let gc = 0;
                for (const f of fs.readdirSync(rdir)) {
                    if (!f.endsWith('.bin') || keep.has(f)) continue;
                    try { fs.unlinkSync(path.join(rdir, f)); gc++; } catch (e) { }
                }
                if (gc) console.log('  \u2713 回收孤儿文件 ' + gc + ' 个');
            } catch (e) { }
            if (hadDb) { try { fs.copyFileSync(backup, DB); fs.unlinkSync(backup); } catch (e) { } }
        // 清理测试 DAT（真实 DAT 目录不动）
        try {
            const cd = path.join(ROOT, 'data', 'roms', 'catalog');
            for (const f of fs.readdirSync(cd)) if (/^test-fbneo/.test(f)) fs.unlinkSync(path.join(cd, f));
        } catch (e) { }
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
    };
    process.on('exit', () => { try { if (hadDb && fs.existsSync(backup)) fs.copyFileSync(backup, DB); } catch (e) { } });

    // 等待启动
    let up = false;
    for (let i = 0; i < 40; i++) {
        try { const r = await req('GET', '/api/health'); if (r.status === 200) { up = true; break; } } catch (e) { }
        await sleep(250);
    }
    if (!up) { console.error('服务启动失败'); await cleanup(); process.exit(1); }

    let token = '';
    try {
        // ---------- 1) 管理员登录 ----------
        console.log('【1】管理员登录 + 图鉴初始状态');
        const login = await req('POST', '/api/admin/login', { username: 'admin', password: 'workbuddy' });
        token = (login.json && login.json.token) || '';
        check('管理员登录成功', !!token, JSON.stringify(login.json).slice(0, 100));
        const H = { Authorization: 'Bearer ' + token };
        const guest = await req('GET', '/api/admin/roms/catalog');
        check('未登录访问图鉴接口被拒', guest.status === 403, 'status=' + guest.status);
        const st0 = await req('GET', '/api/admin/roms/catalog', null, H);
        check('图鉴状态可读，中文表已由种子初始化', st0.status === 200 && st0.json.catalog.zhCount > 0,
            JSON.stringify(st0.json && st0.json.catalog).slice(0, 120));

        // ---------- 2) 上传 DAT ----------
        console.log('\n【2】上传 DAT（原始文本流，不走 JSON）');
        const d1 = await req('POST', '/api/admin/roms/dat?file=test-fbneo.dat', datXml, H);
        check('DAT 上传并解析成功', d1.status === 200 && d1.json.datCount === 2, JSON.stringify(d1.json).slice(0, 160));
        const bad = await req('POST', '/api/admin/roms/dat?file=x.dat', 'hello world', H);
        check('乱码 DAT 被拒绝（不污染图鉴）', bad.status === 400, 'status=' + bad.status);

        // ---------- 3) 扫描目录 ----------
        console.log('\n【3】扫描服务器目录（待确认预览）');
        const scan = await req('POST', '/api/admin/roms/scan', { dir: romDir }, H);
        check('扫描到 2 个 ZIP（忽略 txt）', scan.status === 200 && scan.json.items.length === 2, JSON.stringify(scan.json.items && scan.json.items.map(i => i.shortName)));
        const it = (scan.json.items || []).find(x => x.shortName === 'rbffspec') || {};
        check('预览含中文名', it.titleZh === '真饿狼传说特别版', it.titleZh);
        check('预览含英文原名 / 厂商 / 年份', it.titleEn === 'Real Bout Fatal Fury Special' && it.maker === 'SNK' && it.year === '1997');
        check('预览含平台 / BIOS 需求', it.platform === 'neogeo' && it.bios === 'neogeo.zip', it.platform + ' ' + it.bios);
        check('CRC 校验为 ok（与 DAT 完全匹配）', it.crcStatus === 'ok', it.crcStatus);
        check('父 ROM 短名（romof）已带出', it.parentShortName === 'rbff2', it.parentShortName);
        const nodir = await req('POST', '/api/admin/roms/scan', { dir: path.join(tmp, 'nope') }, H);
        check('目录不存在 → 400 友好报错', nodir.status === 400, 'status=' + nodir.status);

        // ---------- 4) 导入 ----------
        console.log('\n【4】导入（可改中文名 / 平台，重复自动跳过）');
        const imp = await req('POST', '/api/admin/roms/import', {
            items: [
                { path: path.join(romDir, 'rbffspec.zip'), shortName: 'rbffspec', titleZh: '真饿狼传说特别版', platform: 'neogeo', year: '1997' },
                { path: path.join(romDir, 'kof98.zip'), shortName: 'kof98' },
            ],
        }, H);
        check('导入 2 个成功', imp.status === 200 && (imp.json.added || []).length === 2, JSON.stringify(imp.json).slice(0, 200));
        const imp2 = await req('POST', '/api/admin/roms/import', {
            items: [{ path: path.join(romDir, 'rbffspec.zip'), shortName: 'rbffspec' }],
        }, H);
        check('重复导入被跳过（同短名已存在）', imp2.status === 200 && (imp2.json.added || []).length === 0
            && (imp2.json.skipped || []).length === 1, JSON.stringify(imp2.json.skipped));
        const badPath = await req('POST', '/api/admin/roms/import', { items: [{ path: 'relative/nope.zip' }] }, H);
        check('相对路径 / 不存在的文件被拒（防目录穿越）', badPath.status === 200
            && (badPath.json.skipped || []).length === 1, JSON.stringify(badPath.json));

        // ---------- 5) 玩家端搜索 ----------
        console.log('\n【5】玩家端：中文名 / 短名 / 英文名都能搜到');
        const all = await req('GET', '/api/roms', null, { Authorization: 'Bearer ' + (await playerToken()) });
        const list = (all.json && all.json.roms) || [];
        const rb = list.find(r => r.shortName === 'rbffspec') || {};
        check('入库字段齐全（shortName/titleZh/titleEn/aliases/platform/crcStatus）',
            rb.shortName === 'rbffspec' && rb.titleZh === '真饿狼传说特别版' && rb.titleEn === 'Real Bout Fatal Fury Special'
            && rb.platform === 'neogeo' && rb.crcStatus === 'ok' && Array.isArray(rb.aliases),
            JSON.stringify(rb).slice(0, 200));
        check('显示名用中文名（name 字段）', rb.name === '真饿狼传说特别版', rb.name);
        const q1 = await req('GET', '/api/roms?q=' + encodeURIComponent('饿狼'), null, { Authorization: 'Bearer ' + (await playerToken()) });
        check('搜「饿狼」命中', ((q1.json || {}).roms || []).some(r => r.shortName === 'rbffspec'));
        const q2 = await req('GET', '/api/roms?q=kof98', null, { Authorization: 'Bearer ' + (await playerToken()) });
        check('搜短名「kof98」命中', ((q2.json || {}).roms || []).some(r => r.shortName === 'kof98'));
        const q3 = await req('GET', '/api/roms?q=' + encodeURIComponent('Fatal Fury'), null, { Authorization: 'Bearer ' + (await playerToken()) });
        check('搜英文原名「Fatal Fury」命中', ((q3.json || {}).roms || []).some(r => r.shortName === 'rbffspec'));
        const q4 = await req('GET', '/api/roms?q=' + encodeURIComponent('拳皇'), null, { Authorization: 'Bearer ' + (await playerToken()) });
        check('搜「拳皇」命中 kof98（中文表生效）', ((q4.json || {}).roms || []).some(r => r.shortName === 'kof98'));

        // ---------- 6) 清理：删除导入的 ROM 与 DAT ----------
        console.log('\n【6】清理测试数据');
        for (const r of list.filter(x => x.shortName === 'rbffspec' || x.shortName === 'kof98')) {
            await req('POST', '/api/roms/delete', { id: r.id }, H);
        }
        const after = await req('GET', '/api/roms', null, H);
        check('测试 ROM 已删除', !((after.json || {}).roms || []).some(r => r.shortName === 'rbffspec'));
        await req('POST', '/api/admin/roms/dat/delete', { file: 'test-fbneo.dat' }, H);
        const st1 = await req('GET', '/api/admin/roms/catalog', null, H);
        check('测试 DAT 已删除', st1.json.catalog.datLoaded === false);
    } catch (e) {
        fail++;
        console.log('  ✗ 异常：' + e.message);
    } finally {
        await cleanup();
    }

    async function playerToken() {
        if (playerToken._t) return playerToken._t;
        const u = 'romtest' + (Date.now() % 100000);
        await req('POST', '/api/register', { username: u, password: 'test1234' });
        const r = await req('POST', '/api/login', { username: u, password: 'test1234' });
        playerToken._t = (r.json && r.json.token) || '';
        if (!playerToken._t) console.log('  ⚠ 玩家登录失败：' + JSON.stringify(r.json));
        playerToken._u = u;
        return playerToken._t;
    }

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
