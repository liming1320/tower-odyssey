// 验证：BIOS 缺失提示必须"按库里实际有的街机平台"算，不能无脑把 neogeo/pgm/cps3 全报红。
// 背景：管理员只有 neogeo/cps1/cps2 的 ROM，后台却提示缺 pgm.zip / cps3.zip ——
// 这两个是 PGM、CPS3 基板的固件，库里没该基板游戏时既找不到也不需要，属于误报。
//
// 用法：node tools/verify-bios-demand.js        （独立端口 5197，不影响 5180）
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 5197;
const DB = path.join(ROOT, 'data', 'db.json');
const BIOS_DIR = path.join(ROOT, 'data', 'roms', 'bios');
let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (extra ? '  \u2192 ' + extra : '')); }
}

function req(method, p, { body, raw, token } = {}) {
    return new Promise((resolve, reject) => {
        const h = { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' };
        if (token) h['Authorization'] = 'Bearer ' + token;
        const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = JSON.parse(text); } catch (e) { }
                resolve({ status: res.statusCode, json, text });
            });
        });
        r.on('error', reject);
        if (body != null) r.end(raw ? body : JSON.stringify(body));
        else r.end();
    });
}

// 端口没释放就启新进程会 EADDRINUSE，请求会打到旧进程（读到旧数据）——必须等真断开
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

async function startServer() {
    await waitPortFree();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', d => process.stderr.write('[srv] ' + d));
    await new Promise(r => setTimeout(r, 900));
    return child;
}

// 切场景：先停服务（server 每 10s 会 flush 回写 db.json，服务活着时会覆盖我们的改动）
async function swapDb(mutate) {
    try { if (srv) srv.kill(); } catch (e) {}
    await waitPortFree();
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    mutate(d);
    fs.writeFileSync(DB, JSON.stringify(d));
    srv = await startServer();
}

const filesOf = list => (list || []).map(x => x.file || x).sort();

(async () => {
    const backup = DB + '.bak-biosdemand';
    const hadDb = fs.existsSync(DB);
    if (hadDb) fs.copyFileSync(DB, backup);
    const dbBefore = hadDb
        ? { roms: (JSON.parse(fs.readFileSync(DB, 'utf8')).roms || []).length, romBios: 0 }
        : { roms: 0, romBios: 0 };
    dbBefore.romBios = (JSON.parse(fs.readFileSync(DB, 'utf8')).romBios || []).length;
    const biosBefore = fs.existsSync(BIOS_DIR) ? fs.readdirSync(BIOS_DIR) : [];
    let srv = null;

    // 顺序很关键：必须先等服务真正退出再还原。server 有「退出前强制 flush」的 handler，
    // kill 之后立刻 copyFileSync 的话，服务的最后一写会把刚还原的 db.json 又覆盖成测试态。
    const restore = async () => {
        try { if (srv) srv.kill(); } catch (e) {}
        await waitPortFree();
        await new Promise(r => setTimeout(r, 400));
        if (hadDb) fs.copyFileSync(backup, DB);
        // 回收测试期间写入的 BIOS 文件
        try {
            for (const f of fs.readdirSync(BIOS_DIR)) {
                if (!biosBefore.includes(f)) fs.unlinkSync(path.join(BIOS_DIR, f));
            }
        } catch (e) {}
    };

    // session 只存在内存里，服务一重启旧 token 就 401 —— 每个场景都要重新登录
    async function login() {
        const lg = await req('POST', '/api/admin/login', { body: { username: 'admin', password: 'workbuddy' } });
        return (lg.json && (lg.json.token || (lg.json.user && lg.json.user.token))) || '';
    }

    try {
        // ---------- 场景 A：库里只有 nes/gba，完全没有街机 ----------
        console.log('\n【1】库里没有街机 ROM → 不该报任何缺失');
        await swapDb(d => {
            d.roms = [{ id: 'r_nes1', name: '超级马里奥', core: 'nes', size: 40960, addedAt: Date.now() }];
            d.romBios = [];
        });

        let token = await login();
        check('管理员登录成功', !!token);

        let b = (await req('GET', '/api/roms/bios', { token })).json;
        check('missing 为空（无街机就不缺 BIOS）', (b.missing || []).length === 0, JSON.stringify(b.missing));
        check('notNeeded 列出 3 个固件', filesOf(b.notNeeded).join(',') === 'cps3.zip,neogeo.zip,pgm.zip', JSON.stringify(b.notNeeded));
        check('used 为空', (b.used || []).length === 0);

        // ---------- 场景 B：有 NeoGeo 游戏 + 老数据 core 兜底 ----------
        console.log('\n【2】库里有 NeoGeo 游戏 → 只缺 neogeo.zip，且不重复');
        await swapDb(d => {
            d.roms = [
                { id: 'r1', name: 'kof98', core: 'fbneo', platform: 'neogeo', size: 1024, addedAt: Date.now() },
                { id: 'r2', name: 'mslug', core: 'fbalpha2012_neogeo', size: 1024, addedAt: Date.now() }, // 老数据：只有 core
            ];
            d.romBios = [];
        });
        token = await login();

        b = (await req('GET', '/api/roms/bios', { token })).json;
        check('只缺 neogeo.zip', filesOf(b.missing).join(',') === 'neogeo.zip', JSON.stringify(b.missing));
        check('neogeo 不因 platform/core 双 key 重复计数', (b.missing[0] || {}).platforms &&
            b.missing[0].platforms.length === 2, JSON.stringify(b.missing[0]));
        check('pgm/cps3 归到 notNeeded', filesOf(b.notNeeded).join(',') === 'cps3.zip,pgm.zip', JSON.stringify(b.notNeeded));

        // ---------- 场景 C：上传 neogeo.zip 后 ----------
        console.log('\n【3】上传 neogeo.zip → 转为「服务中」');
        const up = await req('POST', '/api/roms/bios/upload?name=neogeo', { token, raw: true, body: Buffer.from('PK-fake-bios') });
        check('BIOS 上传成功', up.status === 200 && up.json && up.json.ok, up.text);
        // save() 是 200ms debounce，不等它落盘就 kill 进程，这条 BIOS 会丢（测试踩过）
        await new Promise(r => setTimeout(r, 500));
        b = (await req('GET', '/api/roms/bios', { token })).json;
        check('missing 清空', (b.missing || []).length === 0, JSON.stringify(b.missing));
        check('used 标记 neogeo.zip 服务中', (b.used || []).some(u => u.file === 'neogeo.zip' && u.platforms.length === 2),
            JSON.stringify(b.used));

        // ---------- 场景 D：加入 PGM 游戏 ----------
        console.log('\n【4】导入 IGS/PGM 游戏 → pgm.zip 变红');
        await swapDb(d => {
            d.roms.push({ id: 'r3', name: '三国战纪', core: 'fbneo', platform: 'igs', size: 1024, addedAt: Date.now() });
        });
        token = await login();
        b = (await req('GET', '/api/roms/bios', { token })).json;
        check('缺 pgm.zip', filesOf(b.missing).join(',') === 'pgm.zip', JSON.stringify(b.missing));
        check('pgm 归属 IGS', ((b.missing[0] || {}).platforms || []).join() === 'IGS', JSON.stringify(b.missing[0]));
        check('cps3 仍在 notNeeded', filesOf(b.notNeeded).join(',') === 'cps3.zip', JSON.stringify(b.notNeeded));
    } catch (e) {
        fail++;
        console.log('  \u2717 异常：' + e.message);
    } finally {
        await restore();
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        const after = JSON.parse(fs.readFileSync(DB, 'utf8'));
        check('db.json 已还原（未残留测试的假 ROM）',
            (after.roms || []).length === dbBefore.roms && (after.romBios || []).length === dbBefore.romBios,
            `roms=${(after.roms || []).length}/${dbBefore.roms} bios=${(after.romBios || []).length}/${dbBefore.romBios}`);
    }

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
