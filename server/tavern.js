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

const UPSTREAM = String(process.env.TAVERN_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const PREFIX = '/tavern';
const ENABLED = process.env.TAVERN_ENABLED !== '0';
// Authelia 通道的标准请求头；不同版本可能读 Remote-User / X-Forwarded-User，两个都发更稳
const SSO_HEADERS = ['remote-user', 'x-remote-user', 'x-forwarded-user'];
const ADMIN_HANDLE = process.env.TAVERN_ADMIN_HANDLE || 'admin';
const ADMIN_PASSWORD = process.env.TAVERN_ADMIN_PASSWORD || '';
// 是否透传真实客户端 IP。默认不透传：ST 默认开白名单且只信任 127.0.0.1，
// 透传 LAN 真实 IP 会让它直接拒绝；又因为 ST 只能经本网关访问，视为 localhost 更安全。
const FORWARD_REAL_IP = process.env.TAVERN_FORWARD_REAL_IP === '1';

const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-length',
]);

// ------------------------------------------------------------------ 工具
function pickUrl() {
    const u = new URL(UPSTREAM);
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
    const visIp = FORWARD_REAL_IP && clientIp ? clientIp : '127.0.0.1';
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

// ------------------------------------------------------------------ 管理员会话（自动开通账号用）
let _admin = { cookie: '', at: 0, ok: false, msg: '' };
let _adminBusy = null;
const ADMIN_TTL = 20 * 60 * 1000;

async function adminSession(force) {
    if (!ENABLED) { _admin.ok = false; _admin.msg = '未启用'; return _admin; }
    if (!ADMIN_PASSWORD) {
        _admin.ok = false;
        _admin.msg = '未配置 TAVERN_ADMIN_PASSWORD，无法自动开通账号';
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
                bodyBuf: Buffer.from(JSON.stringify({ username: ADMIN_HANDLE, password: ADMIN_PASSWORD })),
            });
            // 会话 cookie 含 .sig 签名，必须整段原样回传，丢了就是 403
            if (login.setCookie.length) cookie = cookie + '; ' + cookiesToString(login.setCookie);
            if (login.status !== 200) {
                _admin.ok = false;
                _admin.msg = 'ST 管理员登录失败（' + login.status + '）';
                return _admin;
            }
            const me = await rawRequest('GET', base + '/api/users/me', { headers: { Cookie: cookie } });
            let isAdmin = false;
            try { isAdmin = !!JSON.parse(me.buffer.toString('utf8')).admin; } catch (e) { }
            if (!isAdmin) {
                _admin.ok = false;
                _admin.msg = 'ST 账号 ' + ADMIN_HANDLE + ' 不是管理员，无法通过官方接口建号';
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

async function userExists(handle) {
    const s = await adminSession();
    if (!s.ok) return { ok: false, msg: s.msg };
    const base = pickUrl().base;
    const r = await rawRequest('GET', base + '/api/users/get', { headers: { Cookie: s.cookie, 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' } });
    let list = [];
    try { list = JSON.parse(r.buffer.toString('utf8')) || []; } catch (e) { }
    return { ok: true, exists: list.some(u => u && u.handle === handle) };
}

async function ensureUser(username, displayName) {
    const handle = slugifyHandle(username);
    if (!handle) return { ok: false, msg: '用户名无法转成合法 ST handle' };
    const s = await adminSession();
    if (!s.ok) return { ok: false, msg: s.msg };
    const ex = await userExists(handle);
    if (ex.ok && ex.exists) return { ok: true, handle, created: false };
    if (!ex.ok) return { ok: false, msg: ex.msg };

    const base = pickUrl().base;
    // 必须先拿最新 CSRF token，用旧的一律 403
    const t = await rawRequest('GET', base + '/csrf-token', { headers: { Cookie: s.cookie } });
    let csrf = '';
    try { csrf = JSON.parse(t.buffer.toString('utf8')).token; } catch (e) { }
    const created = await rawRequest('POST', base + '/api/users/create', {
        headers: {
            'Content-Type': 'application/json', Cookie: s.cookie,
            'X-CSRF-Token': csrf, 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1',
        },
        // 不设 password：账号只能经由本网关的 SSO 头登录，堵住「直接拿密码进 ST」这条路
        bodyBuf: Buffer.from(JSON.stringify({ handle, name: displayName || handle })),
    });
    if (created.status === 409) return { ok: true, handle, created: false };
    if (created.status !== 200) {
        let em = '';
        try { em = JSON.parse(created.buffer.toString('utf8')).error || ''; } catch (e) { }
        return { ok: false, msg: 'ST 建号失败（' + created.status + '）' + (em ? '：' + em : '') };
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
        enabled: ENABLED, upstream: UPSTREAM, prefix: PREFIX, online: false,
        checkedAt: Date.now(), note: '', ssoHandles: [], user: null, admin: null, provisioned: false,
    };
    try {
        const base = pickUrl().base;
        const r = await rawRequest('GET', base + '/csrf-token', { timeoutMs: 4000 });
        out.online = r.status < 500;
        out.note = out.online ? '' : 'SillyTavern 返回 ' + r.status;
    } catch (e) {
        out.online = false;
        out.note = '连不上 SillyTavern（' + e.message + '）—— 请先启动它：node server.js --listen false';
    }
    if (out.online && ADMIN_PASSWORD) {
        const s = await adminSession();
        out.admin = { ok: s.ok, msg: s.msg };
    }
    _status = out;
    return Object.assign({}, out);
}

// ------------------------------------------------------------------ 代理主体
// deps: { getUserByToken, DB } —— 复用主服务的鉴权，避免出现两套登录态
async function proxyRequest(req, res, deps) {
    const user = deps.getUserByToken(req);
    if (!user) {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('请先登录塔界远征，再进入 AI 酒馆');
    }
    if (!ENABLED) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('SillyTavern 网关未启用');
    }
    const st = await status(deps.DB);
    if (!st.online) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<meta charset="utf-8"><div style="font:14px/1.9 system-ui;padding:30px;color:#c9d4e3;background:#141a24">' +
            '<h3 style="color:#ffd56b;margin:0 0 12px">🍺 AI 酒馆暂未启动</h3>' +
            '<div>' + st.note + '</div>' +
            '<div style="margin-top:12px;color:#7f8da3">在 SillyTavern 目录执行 <code style="background:#0d1218;padding:2px 6px;border-radius:4px">node server.js --listen false</code> 后刷新本页。</div>' +
            '</div>');
    }

    // SSO：确保 ST 侧存在同名账号；失败不阻断访问（ST 会退回它自己的登录页）
    const prov = await ensureUser(user.username, user.username);
    if (!prov.ok) console.error('[tavern] 自动开通 ST 账号失败：' + prov.msg);

    const rest = req.url.slice(PREFIX.length) || '/';
    const target = pickUrl().base + (rest.startsWith('/') ? rest : '/' + rest);
    const headers = cleanReqHeaders(req.headers, clientIpOf(req));
    if (prov.ok) {
        // Authelia 通道：只要网关在 sso.trustedProxies 里，ST 就会自动以该 handle 登录
        for (const h of SSO_HEADERS) headers[h] = prov.handle;
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
            if (prov.ok) {
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
    if (!ENABLED) return;
    server.on('upgrade', (req, socket, head) => {
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

module.exports = {
    PREFIX, ENABLED, UPSTREAM,
    proxyRequest, attachUpgrade, status, ensureUser, adminSession,
    signTicket, verifyTicket, slugifyHandle,
};
