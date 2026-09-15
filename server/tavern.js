// SillyTavern 网关（反向代理 + 账号打通）
//
// 设计前提：SillyTavern 是一个**完整的独立 Node 应用**（默认监听 127.0.0.1:8000），
// 不能被当库引用，所以接入的唯一正确姿势是「进程并列 + 同域反向代理」。
//
// 这样做同时解决三件事：
//   ① 端口收敛：玩家只面对 :5180 一个端口
//   ② 同域：cookie / CSRF / iframe 跨域三个问题一次性消失
//   ③ 鉴权前移：我们在网关层用 game-token 把关，ST 本身保持 listen:false 不裸奔公网
//
// 账号打通（SSO）用的是 ST 官方的 Authelia 自动登录通道：
//   网关在转发请求时带上 sso 用户名请求头，ST 侧通过 sso.trustedProxies 信任 127.0.0.1，
//   即可实现「登录塔界 = 登录酒馆」。不读写 ST 的 data/users/，升级不会炸。
//   网关用 ST 官方接口（/csrf-token → /api/users/login → /api/users/create）
//   自动开通同名账号，同样不碰它的数据文件。
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PREFIX = '/tavern';
// Authelia 通道的标准请求头；不同版本可能读 Remote-User / X-Forwarded-User，两个都发更稳
const SSO_HEADERS = ['remote-user', 'x-remote-user', 'x-forwarded-user'];

// ==================================================================
// 配置（支持热更新：管理后台改完立即生效，不需要重启服务）
//
// 优先级：环境变量 > data/tavern-env.json > 内置默认
//   环境变量仍然是最高优先级，这是为了兼容已经在宝塔/PM2/systemd 里配好的部署。
//   但后台保存时会**同时写进 process.env**，所以后台改的一定生效，不会被环境变量盖掉。
//   data/tavern-env.json 只是「下次开机还记得」的持久化介质，已在 .gitignore 中（含口令）。
// ==================================================================
const DEFAULTS = {
    TAVERN_URL: 'http://127.0.0.1:8000',
    TAVERN_ENABLED: '1',
    TAVERN_ADMIN_HANDLE: 'admin',
    TAVERN_ADMIN_PASSWORD: '',
    // 是否透传真实客户端 IP。默认不透传：ST 默认开白名单且只信任 127.0.0.1，
    // 透传 LAN 真实 IP 会让它直接拒绝；又因为 ST 只能经本网关访问，视为 localhost 更安全。
    TAVERN_FORWARD_REAL_IP: '0',
};
const DATA_FILE = path.join(__dirname, '..', 'data', 'tavern-env.json');

function readFileCfg() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {}; } catch (e) { return {}; }
}
function resolve() {
    const file = readFileCfg();
    const out = {};
    for (const k of Object.keys(DEFAULTS)) {
        out[k] = process.env[k] !== undefined ? String(process.env[k])
            : (file[k] !== undefined ? String(file[k]) : DEFAULTS[k]);
    }
    return out;
}
let CFG = resolve();
const upstreamOf = () => String(CFG.TAVERN_URL || DEFAULTS.TAVERN_URL).replace(/\/+$/, '') || DEFAULTS.TAVERN_URL;
const enabledNow = () => CFG.TAVERN_ENABLED !== '0';
const adminHandle = () => (CFG.TAVERN_ADMIN_HANDLE || DEFAULTS.TAVERN_ADMIN_HANDLE).trim() || DEFAULTS.TAVERN_ADMIN_HANDLE;
const adminPassword = () => CFG.TAVERN_ADMIN_PASSWORD || '';
const forwardRealIp = () => CFG.TAVERN_FORWARD_REAL_IP === '1';

// 改配置后必须把缓存的管理员会话和状态探测作废，否则会用旧的密码/地址
function invalidate() {
    _admin = { cookie: '', at: 0, ok: false, msg: '' };
    _status = { online: false, checkedAt: 0, note: '' };
}
function reload() { CFG = resolve(); invalidate(); return publicConfig(); }
function configure(patch) {
    const file = readFileCfg();
    for (const k of Object.keys(DEFAULTS)) {
        if (patch[k] === undefined) continue;
        const v = String(patch[k]);
        file[k] = v;
        process.env[k] = v;   // 同步进环境变量，保证后台的修改优先级最高
    }
    try {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(file, null, 2), 'utf8');
    } catch (e) {
        return { ok: false, msg: '写入 ' + DATA_FILE + ' 失败：' + e.message };
    }
    return { ok: true, config: reload() };
}
function publicConfig() {
    return {
        TAVERN_URL: upstreamOf(),
        TAVERN_ENABLED: CFG.TAVERN_ENABLED,
        TAVERN_ADMIN_HANDLE: adminHandle(),
        TAVERN_ADMIN_PASSWORD: adminPassword(),
        TAVERN_FORWARD_REAL_IP: CFG.TAVERN_FORWARD_REAL_IP,
        hasPassword: !!adminPassword(),
        file: DATA_FILE,
    };
}

const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-length',
]);

// ------------------------------------------------------------------ 工具
function pickUrl() {
    const u = new URL(upstreamOf());
    return { proto: u.protocol === 'https:' ? https : http, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), base: u.protocol + '//' + u.host };
}
function cleanReqHeaders(headers, clientIp) {
    const out = {};
    for (const k of Object.keys(headers)) {
        const lk = k.toLowerCase();
        if (HOP_BY_HOP.has(lk)) continue;
        // 防伪造：外部客户端不许自带任何 SSO / 真实 IP 头
        if (SSO_HEADERS.includes(lk)) continue;
        if (lk === 'host' || lk === 'referer' || lk === 'origin') continue;
        if (lk === 'x-forwarded-for' || lk === 'x-real-ip' || lk === 'cf-connecting-ip') continue;
        if (lk === 'x-forwarded-host' || lk === 'x-forwarded-proto') continue;
        out[k] = headers[k];
    }
    out['host'] = pickUrl().base.replace(/^https?:\/\//, '');
    // ST 的默认白名单里只有 ::1 / 127.0.0.1；网关同机部署，一律按 localhost 放行
    const visIp = forwardRealIp() && clientIp ? clientIp : '127.0.0.1';
    out['x-forwarded-for'] = visIp;
    out['x-real-ip'] = visIp;
    out['x-forwarded-proto'] = 'http';
    return out;
}
function clientIpOf(req) {
    return (req.socket && req.socket.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');
}

// ------------------------------------------------------------------ 后端到 ST 的管理员请求（低层）
function rawRequest(method, urlStr, { headers, bodyBuf, timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.request({
            method, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search, headers: headers || {}, timeout: timeoutMs,
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode, headers: res.headers, rawHeaders: res.rawHeaders,
                buffer: Buffer.concat(chunks), setCookie: res.headers['set-cookie'] || [],
            }));
        });
        req.on('timeout', () => req.destroy(new Error('ST 请求超时')));
        req.on('error', reject);
        if (bodyBuf) req.write(bodyBuf);
        req.end();
    });
}
function cookiesToString(arr) {
    return (arr || []).map(c => String(c).split(';')[0]).join('; ');
}

// 把新的 Set-Cookie 合并进已有 cookie 串，按 name 去重（新的覆盖旧的）。
// 不能简单 `old + '; ' + new`：登录后 ST 会下发同名的新 sid，两个同名 cookie 一起发出去时
// 服务端取到的是**排在前面的旧值**，会话其实没生效 —— /api/users/me 直接 403，
// 表现为「登录成功但说你不是管理员」，极难排查。
function mergeCookies(baseStr, newArr) {
    const map = new Map();
    const eat = (s) => String(s || '').split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i <= 0) return;
        map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    });
    eat(baseStr);
    (newArr || []).forEach(c => eat(String(c).split(';')[0]));
    let out = '';
    map.forEach((v, k) => { out += (out ? '; ' : '') + k + '=' + v; });
    return out;
}

// 把 ST 登录失败的 HTTP 状态码翻成「下一步该干什么」。
// 只报「登录失败（401）」等于没说：管理员不知道是账号不存在、密码错、还是 ST 没开用户系统。
// 状态码含义按 ST 官方 src/endpoints/users-public.js 对齐（只看数字会完全误判）：
//   404 路由不存在  → 没开 enableUserAccounts
//   403 凭据错误    → 账号不存在 / 密码错 / 账号被禁用（三合一，ST 不区分）
//   400 缺字段      → 请求体里没有 handle（典型：字段名写成 username）
//   429 限流        → 同 IP 一分钟内失败 5 次，等一会儿或改 rateLimiting 配置
function tavernLoginErrorMsg(status, handle, detail) {
    const h = handle || 'admin';
    const extra = detail ? '（ST 返回：' + detail + '）' : '';
    if (status === 404) {
        return 'ST 没有 /api/users/login（404）——多半是 SillyTavern 没开多用户模式。'
            + '在 ST 的 config.yaml 里设 enableUserAccounts: true 并重启 ST。';
    }
    if (status === 403) {
        return 'ST 账号「' + h + '」登录失败（403）：账号不存在、密码错，或账号被禁用。' + extra
            + ' 处理：① 在 SillyTavern 里确认存在这个账号且是管理员（全新安装的 ST 会自动建一个管理员账号 '
            + 'default-user，初始无密码）；② 把它的密码设成和后台一致；'
            + '③ 后台密码存在 data/tavern-env.json 的 TAVERN_ADMIN_PASSWORD。';
    }
    if (status === 429) {
        return 'ST 登录被限流（429）：同一 IP 失败太多次，请 1 分钟后再试，'
            + '或在 config.yaml 调大 rateLimiting.accountsLoginMaxAttempts。';
    }
    if (status === 400) {
        return 'ST 登录请求被拒（400 Missing required fields）' + extra
            + ' —— 请求体缺少 handle 字段。通常是 ST 版本与网关不兼容，或后台「管理员句柄」填了空值。';
    }
    return 'ST 管理员登录失败（' + status + '）' + extra;
}

// 列出 SillyTavern 里已经存在的账号。
// multi-user 模式下 ST 给每个账号在 data/ 下建一个同名目录，目录名就是登录用的 handle。
// 之所以需要这个：管理员常不知道 ST 里的管理员叫什么（默认 admin 未必存在），
// 只能靠猜，于是登录一直 401。把目录列出来，句柄是什么一眼可见。
function listHandles(dir) {
    const root = String(dir || '').trim();
    if (!root) return { ok: false, error: '请填写 SillyTavern 的安装目录' };
    if (!path.isAbsolute(root) && !/^[a-zA-Z]:[\\/]/.test(root)) {
        return { ok: false, error: '请填写绝对路径' };
    }
    // 允许填「安装目录」或「安装目录/data」
    let dataRoot = null;
    for (const c of [path.join(root, 'data'), root]) {
        try { if (fs.existsSync(c) && fs.statSync(c).isDirectory()) { dataRoot = c; break; } } catch (e) { }
    }
    if (!dataRoot) return { ok: false, error: '目录不存在：' + root };
    let names = [];
    try { names = fs.readdirSync(dataRoot); } catch (e) {
        return { ok: false, error: '无法读取 ' + dataRoot + '：' + e.message };
    }
    // 这些是 ST 的功能目录，不是账号（账号目录里一定有 settings.json）
    const NON_USER = new Set(['backups', 'assets', 'extensions', 'logs', 'node_modules', 'src', 'public', 'default-content', '_headers']);
    const handles = [];
    for (const n of names) {
        if (NON_USER.has(String(n).toLowerCase())) continue;
        const p = path.join(dataRoot, n);
        let isDir = false;
        try { isDir = fs.statSync(p).isDirectory(); } catch (e) { }
        if (!isDir) continue;
        // 判定「像不像账号」：ST 会在账号目录里放 settings.json（用户设置）
        let looksUser = false, mtime = 0;
        try {
            looksUser = fs.existsSync(path.join(p, 'settings.json')) || fs.existsSync(path.join(p, 'user.json'));
            const st = fs.statSync(p); mtime = st.mtimeMs || 0;
        } catch (e) { }
        handles.push({ handle: n, looksUser, mtime });
    }
    handles.sort((a, b) => (b.looksUser - a.looksUser) || String(a.handle).localeCompare(String(b.handle)));
    return {
        ok: true, dataRoot, handles,
        // 直接告诉管理员：当前配的句柄在不在 ST 里
        current: adminHandle(),
        currentExists: handles.some(h => String(h.handle).toLowerCase() === String(adminHandle()).toLowerCase()),
    };
}

// ------------------------------------------------------------------ 管理员会话（自动开通账号用）
let _admin = { cookie: '', at: 0, ok: false, msg: '' };
let _adminBusy = null;
const ADMIN_TTL = 20 * 60 * 1000;

async function adminSession(force) {
    if (!enabledNow()) { _admin.ok = false; _admin.msg = '未启用'; return _admin; }
    if (!adminPassword()) {
        _admin.ok = false;
        _admin.msg = '未配置酒馆管理员密码，无法自动给玩家开号（可在管理后台「AI 酒馆」页填写）';
        return _admin;
    }
    if (!force && _admin.ok && Date.now() - _admin.at < ADMIN_TTL) return _admin;
    if (_adminBusy) return _adminBusy;

    _adminBusy = (async () => {
        try {
            const base = pickUrl().base;
            // ST 有 CSRF 保护：先取 token（顺带拿到未签名会话 cookie），登录时必须带上
            const t = await rawRequest('GET', base + '/csrf-token');
            let cookie = cookiesToString(t.setCookie);
            let csrf = '';
            try { csrf = JSON.parse(t.buffer.toString('utf8')).token; } catch (e) { }
            if (!csrf) { _admin.ok = false; _admin.msg = '取不到 CSRF token（ST 未启动？）'; return _admin; }

            const login = await rawRequest('POST', base + '/api/users/login', {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie,
                    'X-CSRF-Token': csrf,
                    'X-Forwarded-For': '127.0.0.1',
                    'X-Real-IP': '127.0.0.1',
                },
                // ST 的 /api/users/login 只读 request.body.handle，传 username 会被判
                // 「Missing required fields」直接 400 —— 这是最容易踩的坑，改动前务必保持 handle
                bodyBuf: Buffer.from(JSON.stringify({ handle: adminHandle(), password: adminPassword() })),
            });
            // 会话 cookie 含 .sig 签名，必须整段原样回传，丢了就是 403；
            // 且要用 mergeCookies 按名覆盖，别直接往后拼（同名旧 sid 会顶掉新的）
            if (login.setCookie.length) cookie = mergeCookies(cookie, login.setCookie);
            if (login.status !== 200) {
                _admin.ok = false;
                // 把 ST 返回的 error 原文带上：「Incorrect credentials」是账号/密码问题，
                // 「Missing required fields」是字段名问题 —— 不看原文就只能瞎猜
                let detail = '';
                try { detail = JSON.parse(login.buffer.toString('utf8')).error || ''; } catch (e) { }
                _admin.msg = tavernLoginErrorMsg(login.status, adminHandle(), detail);
                return _admin;
            }
            const me = await rawRequest('GET', base + '/api/users/me', { headers: { Cookie: cookie } });
            let meJson = null;
            try { meJson = JSON.parse(me.buffer.toString('utf8')); } catch (e) { }
            // /me 返回 403 = 会话没生效（request.user 为空）：不是账号的问题，是 cookie 没传对。
            // 这两者表现完全一样（都是 admin 取不到 true），必须分开报，否则会误导管理员去改账号。
            if (me.status !== 200 || !meJson) {
                _admin.ok = false;
                _admin.msg = 'ST 已登录，但 /api/users/me 返回 ' + me.status
                    + '（取不到登录态）。这是网关侧的会话 cookie 问题，不是账号问题。'
                    + '先确认 ST 的 config.yaml 里 session/cookie 没被改成 https-only，再重试一次；'
                    + '仍不行就重启 SillyTavern 让会话存储重置。';
                return _admin;
            }
            if (!meJson.admin) {
                _admin.ok = false;
                _admin.msg = 'ST 账号「' + adminHandle() + '」不是管理员（/api/users/me 的 admin=false），'
                    + '无法通过官方接口给玩家建号。'
                    + '处理：在服务器上跑 `bash tools/tavern-admin.sh promote ' + adminHandle() + ' <ST目录>` '
                    + '把它提升为管理员（会改 data/_storage 里的账号记录并重启 ST）；'
                    + '或改用 ST 里第一个注册的账号当管理员句柄。';
                return _admin;
            }
            _admin = { cookie, at: Date.now(), ok: true, msg: '' };
        } catch (e) {
            _admin.ok = false;
            _admin.msg = '连接 SillyTavern 失败：' + e.message;
        } finally {
            _adminBusy = null;
        }
        return _admin;
    })();
    return _adminBusy;
}

// ST 的 handle 会被 slugify（小写 + 非字母数字转 '-'），这里事先按同样规则归一，
// 否则「Alice / alice!」这类会撞车 → 409，且大小写不同的账号对不上 SSO
function slugifyHandle(s) {
    return String(s || '').toLowerCase().trim()
        .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '')
        .replace(/[^a-z0-9-]/g, '');
}

// ST 的**所有**写接口（POST/PUT/DELETE）都受 CSRF 保护，而且 token 一次性：
// 每个 POST 之前都必须重新 GET /csrf-token，否则一律 403（返回的是 HTML 不是 JSON，
// 所以光看「解析失败」根本不知道是 CSRF 的问题）。顺带把响应里的 Set-Cookie 合并回会话。
async function stPost(sess, path, bodyObj) {
    const base = pickUrl().base;
    const t = await rawRequest('GET', base + '/csrf-token', { headers: { Cookie: sess.cookie } });
    if (t.setCookie.length) sess.cookie = mergeCookies(sess.cookie, t.setCookie);
    let csrf = '';
    try { csrf = JSON.parse(t.buffer.toString('utf8')).token; } catch (e) { }
    if (!csrf) return { status: 0, json: null, raw: '', err: '取不到 CSRF token' };

    const r = await rawRequest('POST', base + path, {
        headers: {
            'Content-Type': 'application/json', Cookie: sess.cookie,
            'X-CSRF-Token': csrf, 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1',
        },
        bodyBuf: Buffer.from(JSON.stringify(bodyObj || {})),
    });
    if (r.setCookie.length) sess.cookie = mergeCookies(sess.cookie, r.setCookie);
    const raw = r.buffer.toString('utf8');
    let json = null;
    try { json = JSON.parse(raw); } catch (e) { }
    return { status: r.status, json, raw };
}

// 错误信息别把整页 HTML 甩给用户，取前 120 字符纯文本就够定位
function stErrText(r) {
    if (r.json && r.json.error) return String(r.json.error);
    return String(r.raw || r.err || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// 查账号存不存在。优先用公开的 /list（返回数组），不行再退回管理员接口 /get。
async function stUserList(sess) {
    let r = await stPost(sess, '/api/users/list', {});
    if (r.status === 200 && Array.isArray(r.json)) return { ok: true, list: r.json };
    const first = r;
    r = await stPost(sess, '/api/users/get', {});
    if (r.status === 200) {
        const j = r.json;
        return { ok: true, list: Array.isArray(j) ? j : (j ? [j] : []) };
    }
    return { ok: false, status: r.status, detail: stErrText(r.status === 0 ? r : (r.status === 404 ? r : first.status === 200 ? r : first)) };
}

async function userExists(handle) {
    const s = await adminSession();
    if (!s.ok) return { ok: false, msg: s.msg };
    const got = await stUserList(s);
    if (!got.ok) {
        // 拿不到列表就不要硬说「不存在」，否则每次进酒馆都会重复建号
        return { ok: false, msg: '查询 ST 用户列表失败（' + got.status + '）：' + (got.detail || '需要管理员权限') };
    }
    return { ok: true, exists: got.list.some(u => u && u.handle === handle) };
}

async function ensureUser(username, displayName) {
    const handle = slugifyHandle(username);
    if (!handle) return { ok: false, msg: '用户名无法转成合法 ST handle' };
    const s = await adminSession();
    if (!s.ok) return { ok: false, msg: s.msg };
    const ex = await userExists(handle);
    if (ex.ok && ex.exists) return { ok: true, handle, created: false };
    if (!ex.ok) return { ok: false, msg: ex.msg };

    // stPost 内部会先取一次性 CSRF token 再 POST（不设 password：账号只能经由本网关的
    // SSO 头登录，堵住「直接拿密码进 ST」这条路）
    const created = await stPost(s, '/api/users/create', { handle, name: displayName || handle });
    if (created.status === 409) return { ok: true, handle, created: false };
    if (created.status !== 200 && created.status !== 201) {
        return { ok: false, msg: 'ST 建号失败（' + created.status + '）' + (created.json && created.json.error ? '：' + created.json.error : '') };
    }
    return { ok: true, handle, created: true };
}

// ------------------------------------------------------------------ 网关访问票（给 WebSocket 用）
// 背景：浏览器发起 WS 时无法带自定义 Authorization 头，网关没法用 game-token 鉴权。
// 做法：玩家经过被鉴权的 HTTP 代理时，我们下一张带签名的短票 Cookie，WS 阶段验票。
let _secret = null;
function secretOf(db) {
    if (_secret) return _secret;
    db._meta = db._meta || {};
    if (!db._meta.tavernSecret) {
        db._meta.tavernSecret = crypto.randomBytes(24).toString('hex');
    }
    _secret = db._meta.tavernSecret;
    return _secret;
}
function signTicket(db, userId) {
    const exp = Date.now() + 12 * 3600 * 1000;
    const mac = crypto.createHmac('sha256', secretOf(db)).update(userId + '.' + exp).digest('hex').slice(0, 32);
    return userId + '.' + exp + '.' + mac;
}
function verifyTicket(db, ticket) {
    const parts = String(ticket || '').split('.');
    if (parts.length !== 3) return null;
    const [uid, exp, mac] = parts;
    if (!uid || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
    const want = crypto.createHmac('sha256', secretOf(db)).update(uid + '.' + exp).digest('hex').slice(0, 32);
    if (want !== mac) return null;
    return uid;
}
function parseCookies(str) {
    const out = {};
    String(str || '').split(';').forEach(p => {
        const i = p.indexOf('=');
        if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
}

// ------------------------------------------------------------------ 健康检查
let _status = { online: false, checkedAt: 0, note: '' };
async function status(db, force) {
    if (!force && Date.now() - _status.checkedAt < 8000) return Object.assign({}, _status);
    const out = {
        enabled: enabledNow(), upstream: upstreamOf(), prefix: PREFIX, online: false,
        checkedAt: Date.now(), note: '', ssoHandles: [], user: null, admin: null, provisioned: false,
        hasPassword: !!adminPassword(), handle: adminHandle(),
    };
    try {
        const base = pickUrl().base;
        const r = await rawRequest('GET', base + '/csrf-token', { timeoutMs: 4000 });
        out.online = r.status < 500;
        out.note = out.online ? '' : 'SillyTavern 返回 ' + r.status;
    } catch (e) {
        out.online = false;
        // ⚠️ 别提示 --listen：它是布尔开关，一旦带上就是「监听所有网卡」，
        // 等于把酒馆暴露到公网（面板能改 API Key）。config.yaml 默认 listen:false 就是只听本地，最安全。
        out.note = '连不上 SillyTavern（' + e.message + '）—— 请在它的目录直接执行 node server.js（不要加 --listen）';
    }
    if (out.online && adminPassword()) {
        const s = await adminSession();
        out.admin = { ok: s.ok, msg: s.msg };
    }
    _status = out;
    return Object.assign({}, out);
}

// ------------------------------------------------------------------ 代理主体
// deps: { getUserByToken, DB } —— 复用主服务的鉴权，避免出现两套登录态
// 识别当前是谁。两条路：
//   ① 常规：Authorization 头 / ?token= （主服务鉴权）
//   ② 网关票 cookie `to_tavern`：iframe 加载 /tavern/ 时带不了自定义头，
//      所以前端先调 /api/tavern/ticket 换一张 HttpOnly 票，之后同源请求自动携带。
function resolveUser(req, deps) {
    const u = deps.getUserByToken(req);
    if (u) return u;
    const ck = parseCookies(req.headers.cookie);
    const uid = verifyTicket(deps.DB, ck.to_tavern);
    if (!uid) return null;
    if (uid === 'admin') return { id: 'admin', username: 'admin', isAdmin: true };
    return deps.DB.users[uid] || null;
}

async function proxyRequest(req, res, deps) {
    const user = resolveUser(req, deps);
    if (!user) {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<meta charset="utf-8"><div style="font:14px/1.9 system-ui;padding:30px;color:#c9d4e3;background:#141a24">'
            + '<h3 style="color:#ffd56b;margin:0 0 12px">🍺 需要重新进入</h3>'
            + '<div>登录态没带过来（iframe 请求不会携带前端保存的令牌）。</div>'
            + '<div style="margin-top:10px;color:#7f8da3">请返回游戏重新点一次「AI 酒馆」；若反复出现，退出登录再重新登录一次。</div>'
            + '</div>');
    }
    if (!enabledNow()) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('SillyTavern 网关未启用');
    }
    const st = await status(deps.DB);
    if (!st.online) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<meta charset="utf-8"><div style="font:14px/1.9 system-ui;padding:30px;color:#c9d4e3;background:#141a24">' +
            '<h3 style="color:#ffd56b;margin:0 0 12px">🍺 AI 酒馆暂未启动</h3>' +
            '<div>' + st.note + '</div>' +
            '<div style="margin-top:12px;color:#7f8da3">在 SillyTavern 目录执行 <code style="background:#0d1218;padding:2px 6px;border-radius:4px">node server.js</code>（<b>不要</b>加 --listen，加了会监听公网）后刷新本页。</div>' +
            '</div>');
    }

    // SSO：确保 ST 侧存在同名账号；失败不阻断访问（ST 会退回它自己的登录页）
    const prov = await ensureUser(user.username, user.username);
    if (!prov.ok) console.error('[tavern] 自动开通 ST 账号失败：' + prov.msg);

    const rest = req.url.slice(PREFIX.length) || '/';
    const target = pickUrl().base + (rest.startsWith('/') ? rest : '/' + rest);
    const headers = cleanReqHeaders(req.headers, clientIpOf(req));
    // 即使没能开号也照样带 SSO 头：ST 若开了 Authelia 通道且能自行建号，这样仍可登录；
    // 最差情况是退回 ST 自己的登录页，不会白屏。头永远由网关生成，客户端伪造的已在上面剥离。
    const ssoHandle = (prov.ok && prov.handle) || slugifyHandle(user.username);
    if (ssoHandle) {
        // Authelia 通道：只要网关在 sso.trustedProxies 里，ST 就会自动以该 handle 登录
        for (const h of SSO_HEADERS) headers[h] = ssoHandle;
    }

    try {
        let sent = false;
        const up = new URL(target);
        const mod = up.protocol === 'https:' ? https : http;
        const preq = mod.request({
            method: req.method, hostname: up.hostname,
            port: up.port || (up.protocol === 'https:' ? 443 : 80),
            path: up.pathname + up.search, headers,
        }, ures => {
            const outHeaders = {};
            for (const k of Object.keys(ures.headers)) {
                const lk = k.toLowerCase();
                if (HOP_BY_HOP.has(lk)) continue;
                if (lk === 'set-cookie') continue;
                outHeaders[k] = ures.headers[k];
            }
            // 重写 Location：ST 返回的是它自己的路径，得补回 /tavern 前缀
            const loc = ures.headers['location'];
            if (loc) {
                outHeaders['location'] = loc.startsWith('/') ? PREFIX + loc
                    : (loc.indexOf(pickUrl().base) === 0 ? PREFIX + loc.slice(pickUrl().base.length) : loc);
            }
            // Set-Cookie：把 Path 统一改成 /，并去掉 Domain/Secure
            // （否则 ST 的会话 cookie 挂到其他路径上，/tavern 的请求带不过去 → 反复跳登录）
            const cookies = (ures.headers['set-cookie'] || []).map(c => String(c)
                .replace(/;\s*Path=[^;]*/i, '')
                .replace(/;\s*Domain=[^;]*/i, '')
                .replace(/;\s*Secure/i, '')
                .replace(/;\s*SameSite=[^;]*/i, '') + '; Path=/; SameSite=Lax');
            // WS 握手带不了 Authorization，这里顺手下发网关访问票（HttpOnly，12 小时）
            if (ssoHandle) {
                cookies.push('to_tavern=' + signTicket(deps.DB, user.id) + '; Path=/; HttpOnly; SameSite=Lax');
            }
            res.writeHead(ures.statusCode, Object.assign(outHeaders, { 'Set-Cookie': cookies }));
            ures.pipe(res);
            sent = true;
        });
        preq.on('timeout', () => preq.destroy(new Error('ST 响应超时')));
        preq.on('error', e => {
            if (sent) return;
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('AI 酒馆网关错误：' + e.message);
        });
        req.pipe(preq);
    } catch (e) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('AI 酒馆网关错误：' + e.message);
    }
}

// WebSocket 透传（ST 的 socket.io 走长连接，缺了它页面能开但收发消息卡死）
function attachUpgrade(server, deps) {
    server.on('upgrade', (req, socket, head) => {
        if (!enabledNow()) return;
        if (!String(req.url || '').startsWith(PREFIX)) return;
        const ck = parseCookies(req.headers.cookie);
        const uid = verifyTicket(deps.DB, ck.to_tavern);
        const stCk = Object.keys(ck).some(k => /^connect\.sid$|^sillytavern/i.test(k));
        // 两条放行路径：网关访问票有效，或已持有 ST 会话 cookie
        if (!uid && !stCk) {
            socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
            return socket.destroy();
        }
        const rest = req.url.slice(PREFIX.length) || '/';
        const base = pickUrl();
        try {
            const up = new URL(base.base + rest);
            const proxyReq = (up.protocol === 'https:' ? https : http).request({
                method: 'GET', hostname: up.hostname,
                port: up.port || (up.protocol === 'https:' ? 443 : 80),
                path: up.pathname + up.search,
                headers: Object.assign(cleanReqHeaders(req.headers, clientIpOf(req)), {
                    'Connection': 'Upgrade', 'Upgrade': 'websocket',
                    'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
                    'Sec-WebSocket-Version': req.headers['sec-websocket-version'],
                    'Sec-WebSocket-Extensions': req.headers['sec-websocket-extensions'] || '',
                }),
            });
            proxyReq.on('upgrade', (pres, psock, phead) => {
                const lines = ['HTTP/1.1 101 Switching Protocols'];
                for (const k of ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
                    if (pres.headers[k]) lines.push(k + ': ' + pres.headers[k]);
                }
                socket.write(lines.join('\r\n') + '\r\n\r\n');
                if (phead && phead.length) socket.write(phead);
                psock.pipe(socket); socket.pipe(psock);
            });
            proxyReq.on('error', () => { try { socket.destroy(); } catch (e) { } });
            proxyReq.end();
        } catch (e) { try { socket.destroy(); } catch (_) { } }
    });
}

// ------------------------------------------------------------------ 连通性自检 / 端口扫描
// 目的：管理后台点一下就能知道「ST 起没起、在哪、密码对不对、能不能开号」，
// 不用去服务器上敲命令。
async function testConnection(patch) {
    const keep = CFG;
    try {
        if (patch && Object.keys(patch).length) {
            for (const k of Object.keys(DEFAULTS)) {
                if (patch[k] !== undefined) CFG[k] = String(patch[k]);
            }
            invalidate();
        }
        const st = await status(null, true);
        let provision = null;
        if (st.online && adminPassword() && st.admin && st.admin.ok) {
            // 用一次真实建号来验证「能不能给玩家自动开号」，跑完不留垃圾账号
            const probe = '__probe_' + Date.now();
            const r = await ensureUser(probe, probe);
            provision = { ok: r.ok, msg: r.msg || '', created: !!r.created };
        }
        return {
            ok: !!st.online, online: !!st.online, note: st.note || '',
            upstream: st.upstream, enabled: st.enabled, handle: st.handle,
            admin: st.admin, provision,
        };
    } finally {
        CFG = keep;   // 测试用的临时配置不要留在运行时
        invalidate();
    }
}

// 扫本机常见端口找 SillyTavern（默认 8000，改过端口或多人共用时很有用）
async function scanPorts(from, to) {
    const a = Number(from) || 8000, b = Number(to) || 8010;
    const found = [];
    const jobs = [];
    for (let p = a; p <= b && p < 65536; p++) {
        const port = p;
        jobs.push((async () => {
            try {
                const r = await rawRequest('GET', 'http://127.0.0.1:' + port + '/csrf-token', { timeoutMs: 1200 });
                if (r.status < 500) found.push(port);
            } catch (e) { /* 端口没开 */ }
        })());
    }
    await Promise.all(jobs);
    return found.sort((x, y) => x - y);
}

module.exports = {
    PREFIX,
    proxyRequest, attachUpgrade, status, ensureUser, adminSession,
    signTicket, verifyTicket, slugifyHandle,
    // 配置热更新（管理后台用）
    getConfig: publicConfig, configure, reload, testConnection, scanPorts, listHandles,
};
