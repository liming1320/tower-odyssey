// 验证「AI 酒馆后台可视化配置」链路：
//   读配置 → 保存 → 热更新立即生效 → 落盘持久化 → 测试连接 → 端口扫描 → 越权拦截
// 用法：node tools/verify-tavern-config.js [端口]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 5240;
const BASE = 'http://127.0.0.1:' + PORT;
const ENV_FILE = path.join(__dirname, '..', 'data', 'tavern-env.json');

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(p, { method, body, token } = {}) {
    const opt = { method: method || 'GET', headers: {} };
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    if (token) opt.headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch(BASE + p, opt);
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, body: j };
}

(async () => {
    // 备份并清掉配置文件，从干净状态开始
    let backup = null;
    if (fs.existsSync(ENV_FILE)) backup = fs.readFileSync(ENV_FILE, 'utf8');
    try { fs.unlinkSync(ENV_FILE); } catch (e) { }

    const p = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: Object.assign({}, process.env, { PORT: String(PORT) }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout.on('data', () => { });
    p.stderr.on('data', () => { });

    const cleanup = () => {
        try { p.kill(); } catch (e) { }
        if (backup != null) { try { fs.writeFileSync(ENV_FILE, backup, 'utf8'); } catch (e) { } }
    };

    try {
        await sleep(3000);

        console.log('\n[1] 越权拦截');
        const noTok = await call('/api/admin/tavern/config');
        check('未登录读取配置被拒 401/403', noTok.status === 401 || noTok.status === 403, 'got ' + noTok.status);

        const r0 = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'workbuddy' } });
        const token = r0.body && r0.body.token;
        check('管理员登录成功', !!token);

        console.log('\n[2] 读取默认配置');
        const g1 = await call('/api/admin/tavern/config', { token });
        check('GET 返回 200', g1.status === 200, JSON.stringify(g1.body).slice(0, 120));
        check('默认上游为 127.0.0.1:8000', g1.body && g1.body.config && /8000/.test(g1.body.config.url),
            g1.body && g1.body.config && g1.body.config.url);
        check('默认未配置密码 hasPassword=false', g1.body && g1.body.hasPassword === false);

        console.log('\n[3] 保存 → 热更新立即生效');
        const s1 = await call('/api/admin/tavern/config', {
            method: 'POST', token,
            body: { url: 'http://127.0.0.1:7999/', handle: 'tower-admin', password: 's3cret', enabled: true },
        });
        check('POST 保存返回 200', s1.status === 200, JSON.stringify(s1.body).slice(0, 160));
        check('地址尾斜杠被归一化', s1.body && s1.body.config && s1.body.config.TAVERN_URL === 'http://127.0.0.1:7999',
            s1.body && s1.body.config && s1.body.config.TAVERN_URL);

        const g2 = await call('/api/admin/tavern/config', { token });
        check('重新读取已是新值（热更新）',
            g2.body && g2.body.config.url === 'http://127.0.0.1:7999'
            && g2.body.config.handle === 'tower-admin'
            && g2.body.config.password === 's3cret',
            JSON.stringify(g2.body && g2.body.config));

        console.log('\n[4] 落盘持久化（重启后仍在）');
        let disk = null;
        try { disk = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8')); } catch (e) { }
        check('data/tavern-env.json 已写入', !!disk, 'unreadable');
        check('文件中含新密码', disk && disk.TAVERN_ADMIN_PASSWORD === 's3cret');
        check('文件中含新句柄', disk && disk.TAVERN_ADMIN_HANDLE === 'tower-admin');

        console.log('\n[5] 测试连接（上游不存在 → 应优雅失败，不 500）');
        const t1 = await call('/api/admin/tavern/test', {
            method: 'POST', token, body: { url: 'http://127.0.0.1:7999', handle: 'tower-admin', password: 's3cret' },
        });
        check('test 返回 200', t1.status === 200, 'got ' + t1.status);
        check('返回 online=false 且带说明', t1.body && t1.body.online === false && !!t1.body.note,
            JSON.stringify(t1.body).slice(0, 160));
        // 提示里出现「不要加 --listen」是警告，是有益的；有害的是教用户「node server.js --listen」
        check('说明里没有教用户加 --listen（那会监听公网）',
            t1.body && !/node server\.js\s+--listen/.test(t1.body.note || ''), t1.body && t1.body.note);

        console.log('\n[6] 端口扫描');
        const sc = await call('/api/admin/tavern/scan', { method: 'POST', token, body: { from: 8000, to: 8003 } });
        check('scan 返回 200 且 ports 是数组', sc.status === 200 && Array.isArray(sc.body && sc.body.ports),
            JSON.stringify(sc.body).slice(0, 120));

        console.log('\n[7] 非法参数');
        const bad = await call('/api/admin/tavern/config', {
            method: 'POST', token, body: { url: '127.0.0.1:8000' },
        });
        check('非法地址被拒 400', bad.status === 400, 'got ' + bad.status);
        const big = await call('/api/admin/tavern/scan', { method: 'POST', token, body: { from: 1, to: 9999 } });
        check('扫描范围过大被拒 400', big.status === 400, 'got ' + big.status);

        console.log('\n[8] 列出 ST 已有账号（句柄诊断）');
        // 造一个假的 SillyTavern 目录：多用户模式下每个账号是 data/ 下的一个目录
        const fakeST = path.join(__dirname, '..', 'data', '.tv-fake-st');
        try { fs.rmSync(fakeST, { recursive: true, force: true }); } catch (e) { }
        for (const h of ['default-user', 'admin', 'alice']) {
            fs.mkdirSync(path.join(fakeST, 'data', h), { recursive: true });
            fs.writeFileSync(path.join(fakeST, 'data', h, 'settings.json'), '{}');
        }
        fs.mkdirSync(path.join(fakeST, 'data', 'backups'), { recursive: true });   // 非账号目录
        const hs = await call('/api/admin/tavern/handles', { method: 'POST', token, body: { dir: fakeST } });
        check('handles 返回 200', hs.status === 200, 'got ' + hs.status + ' ' + JSON.stringify(hs.body));
        const names = ((hs.body && hs.body.handles) || []).map(x => x.handle).sort();
        check('列出 3 个账号', names.length === 3, names.join(','));
        check('识别出 admin', names.includes('admin'), names.join(','));
        check('功能目录 backups 不算账号', !names.includes('backups'), names.join(','));
        check('账号目录标记 looksUser', ((hs.body && hs.body.handles) || []).every(x => x.looksUser));
        check('回显当前配置句柄', !!(hs.body && hs.body.current));
        check('当前句柄存在性判定正确', hs.body && hs.body.currentExists === (names.includes(String(hs.body.current).toLowerCase())));
        const hsNoAuth = await call('/api/admin/tavern/handles', { method: 'POST', body: { dir: fakeST } });
        check('越权被拒 403', hsNoAuth.status === 403, 'got ' + hsNoAuth.status);
        const hsBad = await call('/api/admin/tavern/handles', { method: 'POST', token, body: { dir: path.join(fakeST, 'nope', 'deep') } });
        check('目录不存在返回 400', hsBad.status === 400, 'got ' + hsBad.status);
        const hsEmpty = await call('/api/admin/tavern/handles', { method: 'POST', token, body: { dir: '' } });
        check('空目录参数返回 400', hsEmpty.status === 400, 'got ' + hsEmpty.status);
        // 也允许直接填 .../data 这一层
        const hsData = await call('/api/admin/tavern/handles', { method: 'POST', token, body: { dir: path.join(fakeST, 'data') } });
        check('填 data 目录也能识别', hsData.status === 200 && ((hsData.body && hsData.body.handles) || []).length === 3);
        try { fs.rmSync(fakeST, { recursive: true, force: true }); } catch (e) { }

        console.log('\n[9] 还原为未配置状态');
        const s2 = await call('/api/admin/tavern/config', {
            method: 'POST', token, body: { url: 'http://127.0.0.1:8000', handle: 'admin', password: '', enabled: true },
        });
        check('清空密码成功', s2.status === 200 && s2.body.config.TAVERN_ADMIN_PASSWORD === '');
    } catch (e) {
        fail++;
        console.log('  ✗ 异常：' + e.message);
    } finally {
        cleanup();
    }

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
