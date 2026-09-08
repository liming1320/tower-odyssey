#!/usr/bin/env node
/**
 * 冒烟测试：玩家昵称 + 展示 ID + 战斗小怪不显示血条
 *
 * 自带临时服务（端口 5399），测完自动关闭，不影响正在运行的 5180
 *   node tools/smoke-nickname.js
 */
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 5399;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✔ ' + m); };
const no = (m) => { fail++; console.log('  ✗ ' + m); };
const assert = (cond, m) => cond ? ok(m) : no(m);

function req(method, p, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const r = require('http').request(BASE + p, {
            method,
            headers: Object.assign(
                { 'Content-Type': 'application/json' },
                data ? { 'Content-Length': Buffer.byteLength(data) } : {},
                token ? { Authorization: 'Bearer ' + token } : {}
            ),
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(d); } });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitUp() {
    for (let i = 0; i < 40; i++) {
        try { await req('GET', '/api/health'); return true; } catch (e) { await sleep(300); }
    }
    return false;
}

(async () => {
    console.log('▶ 启动临时服务 :' + PORT);
    const srv = spawn(process.execPath, ['server.js'], {
        cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore',
    });
    if (!await waitUp()) { console.log('✗ 服务没起来'); srv.kill(); process.exit(1); }

    try {
        const stamp = Date.now().toString().slice(-6);
        const u1 = 'nicka' + stamp, u2 = 'nickb' + stamp;

        console.log('\n① 注册即生成昵称与展示 ID');
        const r1 = await req('POST', '/api/register', { username: u1, password: '1234' });
        assert(r1.token, '注册成功');
        const t1 = r1.token;
        assert(!r1.error, '无错误：' + (r1.error || ''));
        const me1 = await req('GET', '/api/me', null, t1);
        assert(/^勇者[0-9A-Z]{4}$/.test(me1.user.nickname || ''), `默认昵称为勇者+4位（${me1.user.nickname}）`);
        assert(/^[2-9A-HJ-NP-Z]{14}$/.test(me1.user.displayId || ''), `展示 ID 格式正确（${me1.user.displayId}）`);

        console.log('\n② 修改昵称');
        const nickA = '塔界老王' + stamp;
        const s1 = await req('POST', '/api/user/set-nickname', { nickname: nickA }, t1);
        assert(s1.ok && s1.nickname === nickA, '改为「' + nickA + '」成功');
        const me1b = await req('GET', '/api/me', null, t1);
        assert(me1b.user.nickname === nickA, '持久化后仍为新昵称');
        assert(me1b.user.username === u1, '登录名未受影响');

        console.log('\n③ 昵称校验');
        const bad1 = await req('POST', '/api/user/set-nickname', { nickname: '王' }, t1);
        assert(bad1.error && /2/.test(bad1.error), '过短被拒：' + bad1.error);
        const bad2 = await req('POST', '/api/user/set-nickname', { nickname: '这是一个非常非常长的昵称超过十二个字符' }, t1);
        assert(bad2.error, '超长被拒：' + bad2.error);
        const bad3 = await req('POST', '/api/user/set-nickname', { nickname: '<script>' }, t1);
        assert(bad3.error, '非法字符被拒：' + bad3.error);

        console.log('\n④ 昵称唯一');
        const r2 = await req('POST', '/api/register', { username: u2, password: '1234' });
        const t2 = r2.token;
        const dup = await req('POST', '/api/user/set-nickname', { nickname: '塔界老王' }, t2);
        assert(dup.error && /占用/.test(dup.error), '重名被拒：' + dup.error);
        const ok2 = await req('POST', '/api/user/set-nickname', { nickname: '塔界老李' }, t2);
        assert(ok2.ok, '不同昵称可设置');

        console.log('\n⑤ 展示 ID 唯一且稳定');
        const me2 = await req('GET', '/api/me', null, t2);
        assert(me2.user.displayId && me2.user.displayId !== me1.user.displayId, `两个玩家 ID 不同（${me1.user.displayId} / ${me2.user.displayId}）`);
        await req('POST', '/api/user/set-nickname', { nickname: '老王改名' }, t1);
        const me1c = await req('GET', '/api/me', null, t1);
        assert(me1c.user.displayId === me1.user.displayId, '改昵称不影响展示 ID');

        console.log('\n⑥ 聊天显示昵称 + ID');
        await req('POST', '/api/chat/send', { text: '大家好我是老王' }, t1);
        const chat = await req('GET', '/api/chat?since=0');
        const last = (chat.messages || []).slice(-1)[0] || {};
        assert(last.user === '老王改名', '聊天显示昵称：' + last.user);
        assert(last.displayId === me1.user.displayId, '聊天带展示 ID：' + last.displayId);

        console.log('\n⑦ 老账号自动补齐');
        const health = await req('GET', '/api/health');
        assert(health.ok, '服务健康（players=' + health.players + '）');
        const overview = await req('GET', '/api/admin/overview', null, await adminToken());
        const all = (overview && overview.users) || [];
        const missing = all.filter(u => !u.nickname || !u.displayId);
        assert(missing.length === 0, `所有账号都有昵称和展示 ID（${all.length} 个账号，缺失 ${missing.length}）`);
        const ids = new Set(all.map(u => u.displayId).filter(Boolean));
        assert(ids.size === all.filter(u => u.displayId).length, '展示 ID 无重复');

        console.log('\n⑧ 战斗：小怪不画血条');
        const fs = require('fs');
        const battle = fs.readFileSync(path.join(ROOT, 'public/js/battle.js'), 'utf8');
        assert(/血条：只有 BOSS 显示/.test(battle), '血条逻辑已改为仅 BOSS');
        assert(!/const bw = e\.boss \? 76 : Math\.max\(22/.test(battle), '旧的小怪血条代码已移除');
        assert(/e\.hp \/ e\.maxHp <= 0\.3/.test(battle), '小怪保留濒死闪烁提示');

    } catch (e) {
        no('异常：' + e.message);
    } finally {
        srv.kill();
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} / 失败 ${fail}`);
    process.exit(fail === 0 ? 0 : 1);
})();

async function adminToken() {
    const r = await req('POST', '/api/admin/login', { username: 'admin', password: 'workbuddy' });
    return r.token;
}
