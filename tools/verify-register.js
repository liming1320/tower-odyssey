/* 注册流程专项验证（临时服务器）
 * 起因：server.js 里 nickname: finalNickname 引用了未定义变量（提交 d4b2d07 引入），
 *       导致 POST /api/register 直接 ReferenceError —— 注册功能全线挂掉，
 *       而且因为是 async handler，异常变成未捕获的 Promise 拒绝，HTTP 请求永远不返回（挂死）。
 * 本脚本验证：修好后能正常注册（含自定义昵称 / 昵称校验），且 POST /api/tavern/status 正常。
 */
const { spawn } = require('child_process');

const PORT = process.argv[2] || '5210';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, body, token) {
    const opt = { method: body ? 'POST' : 'GET' };
    const headers = {};
    if (body) { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    // 服务端 getUserByToken 认 Authorization: Bearer <token>
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (Object.keys(headers).length) opt.headers = headers;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
        const r = await fetch('http://127.0.0.1:' + PORT + path, Object.assign({ signal: ctl.signal }, opt));
        let t; try { t = await r.json(); } catch (e) { t = await r.text(); }
        return { status: r.status, body: t };
    } catch (e) {
        return { status: 0, body: 'FETCH_FAIL: ' + e.message };
    } finally { clearTimeout(timer); }
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (detail ? '  -> ' + detail : '')); }
}

(async () => {
    const env = Object.assign({}, process.env, { PORT });
    const p = spawn(process.execPath, ['server.js'], { env, cwd: __dirname + '/..', stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', () => { });
    p.stderr.on('data', () => { });
    await sleep(2500);

    try {
        const zk = 'zz' + Date.now().toString(36).slice(-6);

        // 1. 基础注册（不传昵称 -> 自动勇者XXXX），关键是「必须真的返回」
        const a = await call('/api/register', { username: zk, password: 'test1234' });
        console.log('  [响应] register =', JSON.stringify(a).slice(0, 200));
        check('注册返回 HTTP 200（未挂死）', a.status === 200, JSON.stringify(a.body).slice(0, 160));
        check('注册返回 token', !!(a.body && a.body.token));
        check('自动昵称以「勇者」开头', !!(a.body && a.body.user && /^\u52c7\u8005/.test(a.body.user.nickname || '')), a.body && a.body.user && a.body.user.nickname);

        // 2. 自定义昵称
        const b = await call('/api/register', { username: zk + 'b', password: 'test1234', nickname: '\u8001\u738b' });
        check('自定义昵称注册成功', b.status === 200 && b.body.user && b.body.user.nickname === '\u8001\u738b', JSON.stringify(b.body).slice(0, 160));

        // 3. 昵称重复 -> 400（不是 500）
        const c = await call('/api/register', { username: zk + 'c', password: 'test1234', nickname: '\u8001\u738b' });
        check('昵称重复返回 400 且给出提示', c.status === 400 && / nick|昵称/.test(JSON.stringify(c.body)), JSON.stringify(c.body).slice(0, 120));

        // 4. 非法昵称 -> 400
        const d = await call('/api/register', { username: zk + 'd', password: 'test1234', nickname: '<script>' });
        check('非法昵称返回 400', d.status === 400, JSON.stringify(d.body).slice(0, 120));

        // 5. AI 酒馆状态接口：未登录应 401，登录后返回 200 + 结构完整
        const e1 = await call('/api/tavern/status');
        check('/api/tavern/status 未登录返回 401', e1.status === 401, JSON.stringify(e1.body).slice(0, 120));
        const e2 = await call('/api/tavern/status', null, a.body.token);
        console.log('  [响应] /api/tavern/status(已登录) =', JSON.stringify(e2).slice(0, 300));
        check('/api/tavern/status 登录后返回 200 JSON', e2.status === 200 && e2.body && typeof e2.body === 'object', JSON.stringify(e2.body).slice(0, 160));
        check('/api/tavern/status 含 enabled/online/handle 字段',
            !!(e2.body && 'enabled' in e2.body && 'online' in e2.body && 'handle' in e2.body),
            Object.keys(e2.body || {}).join(','));

        // 6. ROM / BIOS 列表接口可达（街机模拟器依赖）
        const f = await call('/api/roms', null, a.body.token);
        check('/api/roms 返回 200 JSON', f.status === 200 && f.body && Array.isArray(f.body.roms), JSON.stringify(f.body).slice(0, 120));
    } finally {
        p.kill();
    }

    console.log('\n' + (fail ? '\u2717 ' : '\u2713 ') + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
})();
