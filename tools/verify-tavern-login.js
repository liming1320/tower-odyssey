// 验证塔界远征网关 → SillyTavern 登录链路的字段契约
//
// 为什么需要它：ST 的 /api/users/login 只认 request.body.handle，传 username 会返回
// 400 Missing required fields；而真正的「账号/密码错」返回的是 403。这两个码长得不像，
// 一旦字段名写错，后台提示会指向完全错误的排查方向（让人去改密码，其实密码没问题）。
// 这里起一个**按 ST 真实语义**实现的假服务端，把每种情况都跑一遍，锁死契约。
//
// 运行：node tools/verify-tavern-login.js
const http = require('http');
const tavern = require('../server/tavern.js');

const ADMIN_HANDLE = 'default-user';
const ADMIN_PASSWORD = 's3cret-pass';

// ---------------------------------------------------------------- 假 ST
function fakeST() {
    const state = { users: { [ADMIN_HANDLE]: { handle: ADMIN_HANDLE, password: ADMIN_PASSWORD, admin: true, enabled: true } } };
    return http.createServer((req, res) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const send = (code, obj, cookies) => {
                const h = { 'Content-Type': 'application/json' };
                if (cookies) h['Set-Cookie'] = cookies;
                res.writeHead(code, h);
                res.end(JSON.stringify(obj));
            };
            if (req.url === '/csrf-token') return send(200, { token: 'fake-csrf' }, ['sillytavern=fake; Path=/']);

            if (req.url === '/api/users/login') {
                let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) { }
                // ↓ 与 ST 源码 src/endpoints/users-public.js 完全一致的行为
                if (!b.handle) return send(400, { error: 'Missing required fields' });
                const u = state.users[b.handle];
                if (!u) return send(403, { error: 'Incorrect credentials' });
                if (!u.enabled) return send(403, { error: 'User is disabled' });
                if (u.password && u.password !== b.password) return send(403, { error: 'Incorrect credentials' });
                return send(200, { handle: b.handle });
            }
            if (req.url === '/api/users/me') {
                const u = state.users[ADMIN_HANDLE];
                return send(200, { handle: ADMIN_HANDLE, admin: !!(u && u.admin) });
            }
            if (req.url === '/api/users/get') {
                // 真实 ST 这里是 POST；用 GET 访问会得到 404
                if (req.method !== 'POST') return send(404, { error: 'Not Found' });
                return send(200, Object.keys(state.users).map(h => ({ handle: h })));
            }
            if (req.url === '/api/users/create') {
                let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) { }
                if (!b.handle || !b.name) return send(400, { error: 'Missing required fields' });
                if (state.users[b.handle]) return send(409, { error: 'User already exists' });
                state.users[b.handle] = { handle: b.handle, password: b.password || '', admin: !!b.admin, enabled: true };
                return send(200, { handle: b.handle });
            }
            return send(404, { error: 'Not Found' });
        });
    });
}

// ---------------------------------------------------------------- 断言
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

// 用环境变量注入配置：绝不能走 configure()，那会改写用户真实的 data/tavern-env.json
function use(url, handle, password) {
    process.env.TAVERN_URL = url;
    process.env.TAVERN_ENABLED = '1';
    process.env.TAVERN_ADMIN_HANDLE = handle;
    process.env.TAVERN_ADMIN_PASSWORD = password;
    tavern.reload();
}

(async () => {
    const server = fakeST();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;

    console.log('\n[1] 正常路径：handle + 正确密码');
    use(base, ADMIN_HANDLE, ADMIN_PASSWORD);
    let s = await tavern.adminSession(true);
    check('管理员登录成功', s.ok === true, s.msg);
    check('确实拿到了管理员身份', !s.msg, s.msg);

    console.log('\n[2] 错误路径：密码不对 → 必须是 403 而非 400');
    use(base, ADMIN_HANDLE, 'wrong-password');
    s = await tavern.adminSession(true);
    check('登录失败', s.ok === false);
    check('提示里带 403（不是 400）', /403/.test(s.msg), s.msg);

    console.log('\n[3] 错误路径：账号不存在 → 403');
    use(base, 'no-such-user', ADMIN_PASSWORD);
    s = await tavern.adminSession(true);
    check('登录失败', s.ok === false);
    check('提示里带 403', /403/.test(s.msg), s.msg);

    console.log('\n[4] 用户列表查询必须走 POST /api/users/get（GET 会 404）');
    use(base, ADMIN_HANDLE, ADMIN_PASSWORD);
    const ex = await (async () => {
        // userExists 是内部函数，通过 ensureUser 的成功路径间接验证
        const r = await tavern.ensureUser(ADMIN_HANDLE, ADMIN_HANDLE);
        return r;
    })();
    check('已存在账号被正确识别（未重复建号）', ex.ok === true && ex.created === false, JSON.stringify(ex));

    console.log('\n[5] 自动给玩家开号');
    use(base, ADMIN_HANDLE, ADMIN_PASSWORD);
    const created = await tavern.ensureUser('player007', 'player007');
    check('新账号创建成功', created.ok === true && created.created === true, JSON.stringify(created));
    const again = await tavern.ensureUser('player007', 'player007');
    check('再次开号不再重复创建', again.ok === true && again.created === false, JSON.stringify(again));

    console.log('\n[6] 未配置密码时不应去撞 ST');
    use(base, ADMIN_HANDLE, '');
    s = await tavern.adminSession(true);
    check('给出「未配置密码」提示', s.ok === false && /密码/.test(s.msg), s.msg);

    server.close();
    console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项\n');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
