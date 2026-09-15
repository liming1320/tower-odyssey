#!/usr/bin/env node
/**
 * 验证 AI 酒馆「入馆票 → 代理」链路（不连真实 SillyTavern）
 *
 * 背景：酒馆是 iframe 加载 /tavern/，浏览器不会给 iframe 请求带 Authorization 头，
 * 玩家令牌在 localStorage 里 —— 必须先换一张 HttpOnly 票 cookie 才能进。
 * 本脚本用一个假 ST 直接驱动 Tavern.proxyRequest，覆盖：
 *   1. 无凭据        → 401 + 自愈引导页
 *   2. 有效票 cookie → 200 且真的代理到上游
 *   3. ?token= 兜底  → 200，且令牌**不会**透传给上游（否则会落进 ST 日志）
 *   4. 伪造/过期票   → 401
 *   5. SSO 头注入    → 上游收到 remote-user
 *
 * 用法：node tools/verify-tavern-proxy.js
 */
'use strict';

const http = require('http');
const { PassThrough } = require('stream');

// ⚠️ 必须在 require 之前用环境变量注入配置：tavern.js 在模块加载时就读了 process.env。
//    绝不调用 configure() —— 那会改写用户真实的 data/tavern-env.json。
let UPSTREAM = '';
let DB = null;   // 模块级：getUserByToken 是顶层函数，取不到 main 里的局部变量

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

// ------------------------------------------------------------------ 假 ST
const seen = [];   // 记录上游收到的请求
function startFakeST() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            seen.push({ url: req.url, headers: req.headers });
            if (req.url === '/csrf-token') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ token: 'faketoken' }));
            }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('ST_SEES:' + req.url);
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

// ------------------------------------------------------------------ 驱动 proxyRequest
function call(Tavern, DB, url, { cookie, auth } = {}) {
    const req = new PassThrough();
    req.method = 'GET';
    req.url = url;
    req.headers = {};
    if (cookie) req.headers.cookie = cookie;
    if (auth) req.headers.authorization = 'Bearer ' + auth;

    const res = new PassThrough();
    let status = 0, headers = {};
    res.writeHead = (c, h) => { status = c; headers = h || {}; return res; };
    const chunks = [];
    res.on('data', d => chunks.push(d));
    const done = new Promise(r => res.on('end', r));

    Tavern.proxyRequest(req, res, { getUserByToken, DB });
    req.end();
    return done.then(() => ({ status, headers, body: Buffer.concat(chunks).toString('utf8') }));
}

// 复刻主服务的鉴权（Authorization 头 / ?token=）
function getUserByToken(req) {
    const raw = String(req.headers['authorization'] || '').replace('Bearer ', '');
    const qs = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
    const token = raw || new URLSearchParams(qs).get('token') || '';
    const uid = DB.tokens[token];
    if (!uid) return null;
    return DB.users[uid] || null;
}

(async function main() {
    const srv = await startFakeST();
    UPSTREAM = 'http://127.0.0.1:' + srv.address().port;
    process.env.TAVERN_URL = UPSTREAM;
    process.env.TAVERN_ENABLED = '1';
    process.env.TAVERN_ADMIN_PASSWORD = '';   // 不配密码 → 跳过管理员登录，纯测代理

    const Tavern = require('../server/tavern');
    DB = {
        users: { u1: { id: 'u1', username: 'liming1320' } },
        tokens: { TOK123: 'u1' },
        _meta: {},
    };

    console.log('\n[1] 无任何凭据 → 必须是 401，且是自愈引导页（不是干巴巴一行字）');
    {
        const r = await call(Tavern, DB, '/tavern/');
        check('返回 401', r.status === 401, 'status=' + r.status);
        check('是自愈页：会自己去换票并刷新', r.body.includes('/api/tavern/ticket') && r.body.includes('localStorage'));
    }

    console.log('\n[2] 带有效入馆票 cookie → 放行并真的代理到上游');
    {
        const ticket = Tavern.signTicket(DB, 'u1');
        const r = await call(Tavern, DB, '/tavern/', { cookie: 'to_tavern=' + ticket });
        check('返回 200', r.status === 200, 'status=' + r.status);
        check('内容来自上游 ST', r.body.includes('ST_SEES:/'), r.body.slice(0, 80));
    }

    console.log('\n[3] 旧服务端兜底：?token= 能进，但令牌不能透传给上游');
    {
        seen.length = 0;
        const r = await call(Tavern, DB, '/tavern/?token=TOK123');
        check('返回 200', r.status === 200, 'status=' + r.status);
        const last = seen[seen.length - 1];
        check('上游收到的查询串里没有 token', last && !String(last.url).includes('token='), last && last.url);
    }

    console.log('\n[4] 伪造票 / 过期票 → 一律 401（不能靠猜就能进酒馆）');
    {
        const good = Tavern.signTicket(DB, 'u1');
        const [uid, exp, mac] = good.split('.');
        const forged = uid + '.' + exp + '.' + mac.replace(/^./, c => (c === 'a' ? 'b' : 'a'));
        const r1 = await call(Tavern, DB, '/tavern/', { cookie: 'to_tavern=' + forged });
        check('签名被篡改 → 401', r1.status === 401, 'status=' + r1.status);

        const expired = Tavern.signTicket(DB, 'u1').split('.');
        const oldExp = String(Date.now() - 1000);
        const crypto = require('crypto');
        const dbSecret = DB._meta.tavernSecret;
        const badMac = crypto.createHmac('sha256', dbSecret).update('u1.' + oldExp).digest('hex').slice(0, 32);
        const r2 = await call(Tavern, DB, '/tavern/', { cookie: 'to_tavern=u1.' + oldExp + '.' + badMac });
        check('已过期的票 → 401', r2.status === 401, 'status=' + r2.status);
    }

    console.log('\n[5] SSO：上游必须收到 remote-user，ST 才能自动登录');
    {
        seen.length = 0;
        const ticket = Tavern.signTicket(DB, 'u1');
        await call(Tavern, DB, '/tavern/', { cookie: 'to_tavern=' + ticket });
        const last = seen[seen.length - 1];
        check('注入了 remote-user 头', last && last.headers['remote-user'] === 'liming1320', last && last.headers['remote-user']);
    }

    console.log('\n[6] 票的签发/校验往返');
    {
        const t = Tavern.signTicket(DB, 'u1');
        check('verifyTicket 能解回用户 id', Tavern.verifyTicket(DB, t) === 'u1');
        check('空票/垃圾票返回 null', Tavern.verifyTicket(DB, '') === null && Tavern.verifyTicket(DB, 'x.y.z') === null);
    }

    srv.close();
    console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项\n');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(1); });
