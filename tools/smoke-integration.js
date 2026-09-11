// 集成冒烟：街机模拟器（BIOS / 云存档）+ AI 酒馆网关（SillyTavern 反向代理）
// 用法： node tools/smoke-integration.js [port]
//   会自己起一份 server.js（默认端口 5199，避免踩到正在跑的 5180）。
//   自带账号（smoke 前缀随机名），跑完不清理任何玩家数据，只复用公开只读接口。
const path = require('path');
const { spawn } = require('child_process');

const PORT = parseInt(process.argv[2] || '5199', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('   ✓ ' + name); }
    else { fail++; console.log('   ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

async function waitPort(ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        try {
            const r = await fetch(BASE + '/api/health');
            if (r.ok) return true;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
    }
    return false;
}

(async () => {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), DB_DRIVER: 'json' }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', d => process.stderr.write('[srv] ' + d));
    child.on('exit', c => { if (c && c !== 0 && c !== null) console.error('服务进程退出码 ' + c); });

    try {
        if (!await waitPort()) { console.error('服务未起来，放弃'); process.exit(1); }
        console.log(`服务已就绪 ${BASE}\n`);

        // ---- 建号拿令牌 ----
        const uname = 'smoke' + Date.now().toString(36).slice(-6);
        let res = await fetch(BASE + '/api/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: uname, password: 'smoke1234' }),
        });
        let js = await res.json().catch(() => ({}));
        let token = js.token;
        if (!token) {
            res = await fetch(BASE + '/api/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: uname, password: 'smoke1234' }),
            });
            js = await res.json().catch(() => ({}));
            token = js.token;
        }
        check('注册/登录拿到令牌', !!token, JSON.stringify(js));
        if (!token) throw new Error('无令牌，无法继续');
        const H = { Authorization: 'Bearer ' + token };

        // ---- BIOS 管家 ----
        console.log('\n【BIOS 管家】');
        res = await fetch(BASE + '/api/roms/bios', { headers: H });
        const bios = await res.json().catch(() => ({}));
        check('GET /api/roms/bios 返回 200', res.status === 200, 'status=' + res.status);
        check('BIOS 列表字段齐全', Array.isArray(bios.bios) && Array.isArray(bios.missing));
        check('缺失清单提示了 neogeo.zip',
            (bios.missing || []).some(m => m.file === 'neogeo.zip'),
            JSON.stringify(bios.missing));
        const r401 = await fetch(BASE + '/api/roms/bios');
        check('未登录访问 BIOS 列表被拒（401）', r401.status === 401, 'status=' + r401.status);
        const r403 = await fetch(BASE + '/api/roms/bios/upload?name=neogeo', {
            method: 'POST', headers: H, body: 'x',
        });
        check('普通玩家上传 BIOS 被拒（403）', r403.status === 403, 'status=' + r403.status);

        // ---- 云存档 ----
        console.log('\n【云存档】');
        const ROM = 'rom_test_123';
        res = await fetch(BASE + `/api/emu/save/meta?romId=${ROM}`, { headers: H });
        const meta0 = await res.json().catch(() => ({}));
        check('初始云端无存档', meta0.saves && !meta0.saves.state && !meta0.saves.sram, JSON.stringify(meta0));

        const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef, 1, 2, 3]);
        res = await fetch(BASE + `/api/emu/save?romId=${ROM}&kind=sram`, {
            method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, H), body: payload,
        });
        const up = await res.json().catch(() => ({}));
        check('上传 sram 成功且大小一致', res.status === 200 && up.size === payload.length, JSON.stringify(up));

        res = await fetch(BASE + `/api/emu/save?romId=${ROM}&kind=sram`, { headers: H });
        const back = Buffer.from(await res.arrayBuffer());
        check('下载 sram 字节完全一致', back.equals(payload), back.toString('hex'));

        await fetch(BASE + `/api/emu/save?romId=${ROM}&kind=state`, {
            method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, H), body: payload,
        });
        res = await fetch(BASE + `/api/emu/save/meta?romId=${ROM}`, { headers: H });
        const meta1 = await res.json().catch(() => ({}));
        check('meta 同时反映 state/sram', !!(meta1.saves && meta1.saves.state && meta1.saves.sram), JSON.stringify(meta1));

        res = await fetch(BASE + `/api/emu/save?romId=${ROM}&kind=state`, { method: 'DELETE', headers: H });
        res = await fetch(BASE + `/api/emu/save?romId=${ROM}&kind=state`, { headers: H });
        check('删除 state 后再取为 404', res.status === 404, 'status=' + res.status);

        const other = 'smoke2' + Date.now().toString(36).slice(-4);
        await fetch(BASE + '/api/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: other, password: 'smoke1234' }),
        });
        const lg = await fetch(BASE + '/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: other, password: 'smoke1234' }),
        }).then(r => r.json()).catch(() => ({}));
        if (lg.token) {
            res = await fetch(BASE + `/api/emu/save?romId=${ROM}&kind=sram`, { headers: { Authorization: 'Bearer ' + lg.token } });
            check('他人账号读不到我的存档（隔离有效）', res.status === 404, 'status=' + res.status);
        } else {
            console.log('   - 跳过存档隔离检查（第二个账号登录失败）');
        }
        const rDir = await fetch(BASE + `/api/emu/save?romId=..%2F..%2Fetc&kind=sram`, { headers: H });
        check('路径穿越 id 被拒绝', rDir.status === 400, 'status=' + rDir.status);

        // ---- AI 酒馆 ----
        console.log('\n【AI 酒馆网关】');
        res = await fetch(BASE + '/api/tavern/status', { headers: H });
        const st = await res.json().catch(() => ({}));
        check('GET /api/tavern/status 返回 200', res.status === 200, 'status=' + res.status);
        check('返回 ST 句柄名（用于 SSO）', typeof st.stHandle === 'string' && st.stHandle.length > 0, JSON.stringify(st));
        check('未启动 ST 时标记 offline（降级友好）', st.online === false && !!st.note, JSON.stringify(st));

        res = await fetch(BASE + '/tavern/', { redirect: 'manual' });
        check('未登录访问 /tavern/ 被网关拦下（401）', res.status === 401, 'status=' + res.status);

        res = await fetch(BASE + '/tavern/', { headers: H, redirect: 'manual' });
        const body = await res.text();
        check('已登录但 ST 未起时返回可读的 503 提示', res.status === 503 && body.indexOf('AI 酒馆暂未启动') >= 0,
            'status=' + res.status);

        console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    } catch (e) {
        fail++;
        console.error('\n冒烟异常：' + (e && e.stack || e));
    } finally {
        try { child.kill(); } catch (e) {}
    }
    process.exit(fail ? 1 : 0);
})();
