// 验证塔界远征网关 → SillyTavern 登录/建号链路的字段契约
//
// 为什么需要它：ST 的 /api/users/login 只认 request.body.handle，传 username 会返回
// 400 Missing required fields；而真正的「账号/密码错」返回的是 403。这两个码长得不像，
// 一旦字段名写错，后台提示会指向完全错误的排查方向（让人去改密码，其实密码没问题）。
// 这里起一个**按 ST 真实语义**实现的假服务端，把每种情况都跑一遍，锁死契约。
//
// 假服务端刻意实现了三件真实 ST 会做的事，用来反向验证网关：
//   ① 所有 POST 都要 CSRF token，且 token 一次性（复用旧的一律 403 HTML）
//   ② 登录会下发**同名的新会话 cookie**（sid 覆盖）；网关若把新 cookie 拼在旧的后头，
//      服务端取到的是排在前面的旧值 → /api/users/me 403（曾误报成「不是管理员」）
//   ③ /api/users/get 是 POST，GET 会 404
//
// 运行：node tools/verify-tavern-login.js
const http = require('http');
const tavern = require('../server/tavern.js');

const ADMIN_HANDLE = 'default-user';
const ADMIN_PASSWORD = 's3cret-pass';

// ---------------------------------------------------------------- 假 ST
function fakeST() {
    const state = {
        users: { [ADMIN_HANDLE]: { handle: ADMIN_HANDLE, password: ADMIN_PASSWORD, admin: true, enabled: true } },
        csrf: null,
        noList: false,          // 置 true 模拟「老 ST 没有 /api/users/list」
        listCalls: 0,
        getCalls: 0,
    };
    const server = http.createServer((req, res) => {
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
            // 真实 ST 返回的是 HTML 错误页，不是 JSON —— 网关必须能处理这种响应
            const html403 = (msg) => {
                res.writeHead(403, { 'Content-Type': 'text/html' });
                res.end('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head>'
                    + '<body><pre>ForbiddenError: ' + msg + '</pre></body></html>');
            };

            if (req.url === '/csrf-token') {
                // 每次都发新 token（一次性）。首次访问顺带建立会话 cookie。
                state.csrf = 'csrf-' + Math.random().toString(16).slice(2);
                const hasSid = /sillytavern=/.test(String(req.headers.cookie || ''));
                const cookies = hasSid
                    ? ['st-csrf=' + state.csrf + '; Path=/']
                    : ['sillytavern=fake; Path=/', 'st-csrf=' + state.csrf + '; Path=/'];
                return send(200, { token: state.csrf }, cookies);
            }

            // 写接口一律校验 CSRF，且必须是最后一次下发的 token
            if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
                const got = String(req.headers['x-csrf-token'] || '');
                if (!got || got !== state.csrf) return html403('Invalid CSRF token. Please refresh the page and try again.');
                state.csrf = null;   // 一次性：用掉即失效，下次必须重新取
            }

            if (req.url === '/api/users/login') {
                let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) { }
                // ↓ 与 ST 源码 src/endpoints/users-public.js 完全一致的行为
                if (!b.handle) return send(400, { error: 'Missing required fields' });
                const u = state.users[b.handle];
                if (!u) return send(403, { error: 'Incorrect credentials' });
                if (!u.enabled) return send(403, { error: 'User is disabled' });
                if (u.password && u.password !== b.password) return send(403, { error: 'Incorrect credentials' });
                // 登录后下发**同名**的新 sid：网关必须按名覆盖，不能往后拼
                return send(200, { handle: b.handle }, ['sillytavern=sid-after-login; Path=/']);
            }
            if (req.url === '/api/users/me') {
                // 取 cookie 里**第一个** sillytavern 的值（重复同名时服务端取第一个）
                const part = String(req.headers.cookie || '').split(';').map(s => s.trim())
                    .find(s => s.startsWith('sillytavern='));
                const sid = part ? part.slice('sillytavern='.length) : '';
                // 会话没生效 = 没有 request.user → 真实 ST 返回 403
                if (sid !== 'sid-after-login') return html403('Session not available');
                const u = state.users[ADMIN_HANDLE];
                return send(200, { handle: ADMIN_HANDLE, admin: !!(u && u.admin) });
            }
            if (req.url === '/api/users/list') {
                state.listCalls++;
                if (req.method !== 'POST') return send(404, { error: 'Not Found' });
                if (state.noList) return send(404, { error: 'Not Found' });
                return send(200, Object.keys(state.users).map(h => ({ handle: h })));
            }
            if (req.url === '/api/users/get') {
                state.getCalls++;
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
    return { server, state };
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

function rawPost(port, path, payload, headers) {
    return new Promise(r => {
        const req = http.request({
            host: '127.0.0.1', port, path, method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
        }, res => {
            let b = ''; res.on('data', c => b += c);
            res.on('end', () => r({ status: res.statusCode, body: b }));
        });
        req.end(JSON.stringify(payload));
    });
}

(async () => {
    const { server, state } = fakeST();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const base = 'http://127.0.0.1:' + port;

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

    console.log('\n[4] 用户列表查询走 POST（GET 会 404），且已存在账号不重复建号');
    use(base, ADMIN_HANDLE, ADMIN_PASSWORD);
    const ex = await tavern.ensureUser(ADMIN_HANDLE, ADMIN_HANDLE);
    check('已存在账号被正确识别（未重复建号）', ex.ok === true && ex.created === false, JSON.stringify(ex));

    console.log('\n[5] 自动给玩家开号（每个 POST 都要重新取一次性 CSRF token）');
    use(base, ADMIN_HANDLE, ADMIN_PASSWORD);
    const created = await tavern.ensureUser('player007', 'player007');
    check('新账号创建成功', created.ok === true && created.created === true, JSON.stringify(created));
    const again = await tavern.ensureUser('player007', 'player007');
    check('再次开号不再重复创建', again.ok === true && again.created === false, JSON.stringify(again));

    console.log('\n[6] 未配置密码时不应去撞 ST');
    use(base, ADMIN_HANDLE, '');
    s = await tavern.adminSession(true);
    check('给出「未配置密码」提示', s.ok === false && /密码/.test(s.msg), s.msg);

    console.log('\n[7] 反向验证：不带 CSRF token 的 POST 一定被拒（假 ST 确实在强制 CSRF）');
    const bare = await rawPost(port, '/api/users/create', { handle: 'hacker', name: 'hacker' });
    check('裸 POST /api/users/create → 403', bare.status === 403, 'HTTP ' + bare.status);
    check('返回的是 HTML 错误页（不是 JSON）', /ForbiddenError/.test(bare.body), bare.body.slice(0, 80));

    console.log('\n[8] 反向验证：复用旧 token 也一定被拒（token 一次性）');
    const fresh = await new Promise(r => {
        http.get(base + '/csrf-token', res => {
            let b = ''; res.on('data', c => b += c); res.on('end', () => r(JSON.parse(b).token));
        });
    });
    const ok1 = await rawPost(port, '/api/users/create', { handle: 'one', name: 'one' }, { 'X-CSRF-Token': fresh });
    check('第一次带 token 成功（200）', ok1.status === 200, 'HTTP ' + ok1.status);
    const ok2 = await rawPost(port, '/api/users/create', { handle: 'two', name: 'two' }, { 'X-CSRF-Token': fresh });
    check('同一个 token 再用一次 → 403', ok2.status === 403, 'HTTP ' + ok2.status);

    console.log('\n[9] 老 ST 没有 /api/users/list 时回退到 /api/users/get');
    use(base, ADMIN_HANDLE, ADMIN_PASSWORD);
    state.noList = true;
    const before = state.getCalls;
    const r9 = await tavern.ensureUser('player008', 'player008');
    check('仍然开号成功', r9.ok === true && r9.created === true, JSON.stringify(r9));
    check('确实回退调用了 /api/users/get', state.getCalls > before, 'getCalls=' + state.getCalls);
    state.noList = false;

    server.close();
    console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项\n');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
