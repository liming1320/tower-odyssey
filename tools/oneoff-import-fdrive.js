// 一次性脚本：把 F 盘 WinKawaks ROM 包（cps1/cps2/neogeo，188 zip）整包导入服务器 ROM 库。
// 背景：管理员以为"上传了"其实只是文件躺在本地磁盘，街机必须走「ROM 图鉴」扫描→导入链路；
// 本机开发时服务器=本机，可以直接读 F:\ 目录，不用走收件箱。
//
// 用法：node tools/oneoff-import-fdrive.js   （独立端口 5197）
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 5197;
const SRC_DIR = 'F:\\BaiduNetdiskDownload\\街机模拟器WinKawaks1.45中文典藏版\\roms';
const BIOS_FILE = path.join(SRC_DIR, 'neogeo', 'neogeo.zip');
const BATCH = 20;
const DB = path.join(ROOT, 'data', 'db.json');

function req(method, p, { body, raw, token, timeout } = {}) {
    return new Promise((resolve, reject) => {
        const h = { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' };
        if (token) h['Authorization'] = 'Bearer ' + token;
        const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h, timeout: timeout || 120000 }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = JSON.parse(text); } catch (e) { }
                resolve({ status: res.statusCode, json, text });
            });
        });
        r.on('timeout', () => { r.destroy(new Error('请求超时')); });
        r.on('error', reject);
        if (body != null) r.end(raw ? body : JSON.stringify(body));
        else r.end();
    });
}

async function waitPortFree(timeout = 6000) {
    const t = Date.now();
    while (Date.now() - t < timeout) {
        const free = await new Promise(res => {
            const s = net.connect(PORT, '127.0.0.1');
            s.on('connect', () => { s.destroy(); res(false); });
            s.on('error', () => res(true));
        });
        if (free) return true;
        await new Promise(r => setTimeout(r, 200));
    }
    return false;
}

(async () => {
    const backup = DB + '.bak-import';
    fs.copyFileSync(DB, backup);
    let srv = null;
    try {
        srv = spawn(process.execPath, ['server.js'], {
            cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'ignore', 'pipe'],
        });
        srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
        await new Promise(r => setTimeout(r, 1200));

        const lg = await req('POST', '/api/admin/login', { body: { username: 'admin', password: 'workbuddy' } });
        const token = (lg.json && (lg.json.token || (lg.json.user && lg.json.user.token))) || '';
        if (!token) throw new Error('管理员登录失败: ' + lg.text.slice(0, 200));

        // 1) neogeo.zip → BIOS
        const before = (await req('GET', '/api/roms/bios', { token })).json;
        if ((before.bios || []).some(b => String(b.name).toLowerCase() === 'neogeo')) {
            console.log('BIOS neogeo 已存在，跳过');
        } else {
            if (!fs.existsSync(BIOS_FILE)) throw new Error('找不到 ' + BIOS_FILE);
            const zip = fs.readFileSync(BIOS_FILE);
            const up = await req('POST', '/api/roms/bios/upload?name=neogeo', { token, raw: true, body: zip, timeout: 60000 });
            console.log('BIOS neogeo.zip 上传:', up.status, (up.json && (up.json.ok ? Math.round(up.json.size / 1024) + 'KB' : up.json.error)) || up.text.slice(0, 120));
        }

        // 2) 扫描 F 盘目录（递归）
        const sc = await req('POST', '/api/admin/roms/scan', { token, body: { dir: SRC_DIR }, timeout: 180000 });
        if (sc.status !== 200 || !(sc.json && sc.json.items)) throw new Error('扫描失败: ' + sc.text.slice(0, 300));
        const items = sc.json.items.filter(it => !it.isBios && !it.imported);
        const biosN = sc.json.items.filter(it => it.isBios).length;
        console.log(`扫描到 ${sc.json.items.length} 项（含 ${biosN} 个 BIOS），待导入 ${items.length} 个游戏`);

        // 3) 分批导入（2.4GB 全量复制 + 哈希，一批一批来便于报错定位）
        let added = 0; const fail = [];
        for (let i = 0; i < items.length; i += BATCH) {
            const batch = items.slice(i, i + BATCH).map(it => ({ shortName: it.shortName, path: it.path }));
            const im = await req('POST', '/api/admin/roms/import', { token, body: { items: batch }, timeout: 600000 });
            if (im.status !== 200 || !(im.json && im.json.ok)) { fail.push(`批次 ${i / BATCH + 1}: ` + im.text.slice(0, 200)); continue; }
            added += im.json.added.length;
            for (const s of im.json.skipped) fail.push(`${s.file} → ${s.reason}`);
            console.log(`  批次 ${Math.floor(i / BATCH) + 1}/${Math.ceil(items.length / BATCH)}: 累计入库 ${added}`);
        }
        console.log(`\n导入完成：入库 ${added} 个，跳过/失败 ${fail.length}`);
        fail.slice(0, 10).forEach(f => console.log('  · ' + f));

        // 4) 等落盘后核对
        await new Promise(r => setTimeout(r, 600));
        const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
        const byPlat = {};
        (db.roms || []).forEach(r => { if (['neogeo', 'cps1', 'cps2', 'igs', 'cps3', 'other'].includes(r.platform)) byPlat[r.platform] = (byPlat[r.platform] || 0) + 1; });
        console.log('核对：库内 ROM 总数', (db.roms || []).length, '，街机分布', JSON.stringify(byPlat), '，BIOS', (db.romBios || []).map(b => b.name).join(','));
        fs.unlinkSync(backup);
    } catch (e) {
        console.log('失败：' + e.message + '（db.json 备份保留在 ' + backup + '）');
        process.exitCode = 1;
    } finally {
        try { if (srv) srv.kill(); } catch (e) { }
        await waitPortFree();
        await new Promise(r => setTimeout(r, 400));
        if (fs.existsSync(backup)) fs.copyFileSync(backup, DB);   // 失败时还原；成功路径上面已删备份
    }
})();
