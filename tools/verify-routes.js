'use strict';
// 路由冒烟测试（server.js 模块化防回归闸门）
// 不绑端口加载 server.js（MG_NO_LISTEN），断言全部 api 路由注册齐全，
// 并实际调用几个 GET handler 确认不抛错（验证抽取后行为不变、无 ReferenceError）。
// 每次抽完一个域都跑一次：node tools/verify-routes.js
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MG_NO_LISTEN = '1';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'to-routes-'));
process.env.MG_DATA_DIR = tmp;

const server = require('../server.js');
const api = server.api;

// ---- 加固：造 admin token + 测试用户，实跑 admin GET 与 tower/level，捕捉闭包缺变量类回归 ----
const crypto = require('crypto');
// admin 令牌：直接写入 token 表（与 POST /api/admin/login 行为一致）
const ADMIN_TOKEN = 'verify-admin-token';
server.DB.tokens[ADMIN_TOKEN] = '__admin__';
// 普通玩家：带完整 state + 一个上阵英雄，供 tower/level 实跑
// （验证 chapterOf/bossForFloor/floorHpScale/floorAtkScale/mulberry32/enemyPoolFor 等 ctx 注入）
const UID = 'verify-user-' + crypto.randomBytes(4).toString('hex');
server.DB.heroes.push({
    id: 'h_verify', name: '验证英雄', element: '火', baseAtk: 1000, baseHp: 8000,
    skill: { name: '默认技能', desc: '', cd: 5, multiplier: 1.5 },
    skills: [{ name: '默认技能', desc: '', cd: 5, multiplier: 1.5, fx: 'slash', tint: '#ffd56b' }],
});
server.DB.users[UID] = {
    id: UID, username: 'verifyuser', password: '', phone: '',
    createdAt: Date.now(),
    state: {
        tower: { maxFloor: 1 },
        heroes: [{ id: 'h_verify', uid: 'vh1', lv: 1, star: 1, equip: {} }],
        equipped: ['vh1'],
        resources: {}, wishCards: 0, loginDays: 0, lastLoginDay: '', lastFree: 0, wall: { lv: 1 },
    },
};
const USER_TOKEN = 'verify-user-token';
server.DB.tokens[USER_TOKEN] = UID;
// 带 Authorization 头调用（模拟已登录 / 管理员）
function callA(key, token) { return call(key, { headers: { authorization: 'Bearer ' + token } }); }

// 内联路由（rom.js 等已模块化路由不在此清单，但同样会被注册；本测试只锚定正在抽取的这批）
const EXPECTED = [
    'GET /api/health',
    'POST /api/register', 'POST /api/login', 'POST /api/sms/send', 'POST /api/phone/login',
    'POST /api/user/bind-phone', 'POST /api/user/set-password', 'POST /api/logout', 'GET /api/me',
    'GET /api/camp', 'POST /api/camp/collect', 'POST /api/building/upgrade', 'POST /api/wall/upgrade',
    'POST /api/treasure/equip', 'POST /api/treasure/unequip',
    'GET /api/heroes', 'POST /api/hero/levelup', 'POST /api/hero/starup', 'POST /api/hero/equip',
    'POST /api/hero/unequip', 'POST /api/hero/equip-item', 'POST /api/hero/unequip-item',
    'POST /api/hero/equip-ring', 'POST /api/hero/unequip-ring', 'POST /api/hero/equip-artifact',
    'POST /api/hero/artifact-levelup', 'POST /api/hero/artifact-starup', 'POST /api/hero/unequip-artifact',
    'POST /api/hero/set-gem', 'POST /api/hero/forge-levelup', 'POST /api/hero/forge-qualityup',
    'GET /api/events', 'POST /api/event/claim', 'POST /api/wish', 'POST /api/wish/reward',
    'POST /api/shop/buy-wish',
    'GET /api/tower/info', 'GET /api/tower/level', 'POST /api/tower/clear', 'POST /api/tower/start',
    'POST /api/tower/choice', 'POST /api/tower/finish',
    'GET /api/world', 'POST /api/world/gather',
    'GET /api/clans', 'POST /api/clan/create', 'POST /api/clan/join', 'GET /api/clan/mine',
    'POST /api/user/set-nickname',
    'GET /api/chat', 'POST /api/chat/send', 'GET /api/mail', 'POST /api/mail/claim',
    'POST /api/minigame/report', 'GET /api/minigame/progress', 'POST /api/minigame/score',
    'GET /api/minigame/rank',
    'POST /api/admin/login', 'GET /api/minigame/order', 'POST /api/admin/minigame/order',
    'GET /api/admin/minigame/order', 'GET /api/pk32/order', 'POST /api/admin/pk32/order',
    'GET /api/admin/pk32/order', 'POST /api/admin/mail',
    'POST /api/gift/redeem', 'POST /api/account/delete',
    'POST /api/admin/gift/save', 'POST /api/admin/gift/delete', 'GET /api/admin/gift/list',
    'GET /api/admin/tavern/config', 'POST /api/admin/tavern/config', 'POST /api/admin/tavern/test',
    'POST /api/admin/tavern/handles', 'POST /api/admin/tavern/scan',
    'POST /api/admin/user/delete', 'POST /api/admin/hero/add', 'POST /api/admin/hero/update',
    'POST /api/admin/hero/delete', 'POST /api/admin/hero/reload',
    'POST /api/admin/wall/update', 'POST /api/admin/wall/delete',
    'POST /api/admin/event/save', 'POST /api/admin/event/delete', 'POST /api/admin/user/grant',
    'GET /api/admin/overview', 'GET /api/admin/sms-codes',
    'POST /api/free', 'GET /api/tavern/ticket', 'GET /api/tavern/status',
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

// 1) 路由表齐全（抽取后不应丢失任何路由）
const missing = EXPECTED.filter(k => typeof api[k] !== 'function');
ok(missing.length === 0, '路由表齐全（缺失: ' + missing.join(', ') + '）');
ok(typeof api['GET /api/camp'] === 'function', 'camp 路由经模块注册成功');

// 2) 实际调用几个 GET handler（mock req/res），确认不抛错且按预期返回
function mockRes() {
    return {
        _code: 0, _body: null, headersSent: false,
        writeHead(c) { this._code = c; this.headersSent = true; },
        setHeader() {}, end(b) { this._body = b; },
    };
}
function call(key, req) {
    const res = mockRes();
    const _req = Object.assign({ url: key, headers: {} }, req || {});
    const body = (req && req.body) || {};
    try { api[key](_req, res, body); }
    catch (e) { fail++; console.log('  ✗ ' + key + ' 抛错: ' + (e && e.stack || e)); return res; }
    return res;
}
let r = call('GET /api/health');
ok(r._code === 200, 'health 返回 200（实得 ' + r._code + '）');
r = call('GET /api/camp');
ok(r._code === 401, 'camp 未登录返回 401（实得 ' + r._code + '）');
r = call('GET /api/heroes');
ok(r._code === 401, 'heroes 未登录返回 401（实得 ' + r._code + '）');
r = call('GET /api/tower/info');
ok(r._code === 200, 'tower/info 公开信息返回 200（实得 ' + r._code + '）');

// ---- 加固：admin 域 GET 实跑（捕捉 romAdminOk / Tavern / SMS / ELEMENTS 等 ctx 注入缺失 → ReferenceError）----
r = callA('GET /api/admin/overview', ADMIN_TOKEN);
ok(r._code === 200, 'admin/overview 实跑返回 200（实得 ' + r._code + '）');
r = callA('GET /api/admin/sms-codes', ADMIN_TOKEN);
ok(r._code === 200, 'admin/sms-codes 实跑返回 200（实得 ' + r._code + '）');
r = callA('GET /api/admin/gift/list', ADMIN_TOKEN);
ok(r._code === 200, 'admin/gift/list 实跑返回 200（实得 ' + r._code + '）');
r = callA('GET /api/admin/tavern/config', ADMIN_TOKEN);
ok(r._code === 200, 'admin/tavern/config 实跑返回 200（实得 ' + r._code + '，验证 romAdminOk 已注入）');
r = callA('GET /api/admin/minigame/order', ADMIN_TOKEN);
ok(r._code === 200, 'admin/minigame/order 实跑返回 200（实得 ' + r._code + '）');
r = callA('GET /api/admin/pk32/order', ADMIN_TOKEN);
ok(r._code === 200, 'admin/pk32/order 实跑返回 200（实得 ' + r._code + '）');
// 加固：tower/level 实跑（验证塔专用 helper 已注入，chapterOf/bossForFloor/... 若漏注入会 ReferenceError）
r = callA('GET /api/tower/level', USER_TOKEN);
ok(r._code === 200, 'tower/level 实跑返回 200（实得 ' + r._code + '，验证塔专用 helper 已注入）');
// 负向：admin 路由无 token 必须 403（验证鉴权逻辑未被破坏）
r = call('GET /api/admin/overview');
ok(r._code === 403, 'admin/overview 无 token 返回 403（实得 ' + r._code + '）');

// ---- 加固：账号体系域实跑（捕捉 hashPassword/validPhone/genDefaultNickname/defaultUserState/
// touchLogin/newDisplayId/maskPhone/verifyPassword/publicUser 等 ctx 注入缺失 → ReferenceError/TypeError）----
const regName = 'reg' + crypto.randomBytes(3).toString('hex');
const regPw = 'pw1234';
r = call('POST /api/register', { body: { username: regName, password: regPw } });
ok(r._code === 200, 'register 实跑返回 200（实得 ' + r._code + '）');
let regTok = null;
try { regTok = JSON.parse(r._body).token; } catch (e) {}
ok(!!regTok, 'register 返回 token（验证 newId/newToken/newDisplayId/defaultUserState/touchLogin/publicUser 链路）');
r = call('POST /api/login', { body: { username: regName, password: regPw } });
ok(r._code === 200, 'login 实跑返回 200（实得 ' + r._code + '，验证 verifyPassword）');
if (regTok) {
    const rm = callA('GET /api/me', regTok);
    ok(rm._code === 200, 'me 实跑返回 200（实得 ' + rm._code + '，验证 getUserByToken/maskPhone）');
}
// 负向：用错密码登录必须 401
r = call('POST /api/login', { body: { username: regName, password: 'wrong' } });
ok(r._code === 401, 'login 错密码返回 401（实得 ' + r._code + '）');

console.log(`路由冒烟：PASS ${pass} / FAIL ${fail} · 已注册路由 ${Object.keys(api).length} 个`);
process.exit(fail ? 1 : 0);
