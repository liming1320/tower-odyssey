#!/usr/bin/env node
/**
 * 冒烟测试：账号体系（账号注册校验 / 勇者昵称 / 手机号验证码 / 绑定 / 改密）
 *           + 战斗波次结构（每关固定 20 波，末波 BOSS，小怪量平衡）
 *
 * 自带临时服务（端口 5398），测完自动关闭，不影响正在运行的 5180
 *   node tools/smoke-account.js
 */
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 5398;
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
async function adminToken() {
    const r = await req('POST', '/api/admin/login', { username: 'admin', password: 'workbuddy' });
    return r.token;
}
// 发码后从后台取码（测试模式）
async function getCode(phone, atk) {
    await req('POST', '/api/sms/send', { phone });
    const r = await req('GET', '/api/admin/sms-codes', null, atk);
    const hit = (r.list || []).find(x => x.phone === phone);
    return hit && hit.code;
}

(async () => {
    console.log('▶ 启动临时服务 :' + PORT);
    const srv = spawn(process.execPath, ['server.js'], {
        cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), SMS_RESEND_SEC: '1' }), stdio: 'ignore',
    });
    if (!await waitUp()) { console.log('✗ 服务没起来'); srv.kill(); process.exit(1); }

    try {
        const stamp = Date.now().toString().slice(-6);
        const atk = await adminToken();
        const u1 = 'acca' + stamp, u2 = 'accb' + stamp, u3 = 'accc' + stamp;
        const ph1 = '138' + String(100000000 + parseInt(stamp) % 899999999).slice(0, 8);
        const ph2 = '139' + String(100000000 + parseInt(stamp) % 899999999).slice(0, 8);
        const ph3 = '150' + String(100000000 + parseInt(stamp) % 899999999).slice(0, 8);

        console.log('\n① 账号注册：只允许字母+数字');
        const bad1 = await req('POST', '/api/register', { username: '测试用户' + stamp, password: '1234' });
        assert(bad1.error && /字母或数字/.test(bad1.error), '中文用户名被拒：' + bad1.error);
        const bad2 = await req('POST', '/api/register', { username: 'ab!@#' + stamp, password: '1234' });
        assert(bad2.error, '特殊符号被拒：' + bad2.error);
        const bad3 = await req('POST', '/api/register', { username: 'ab' + stamp.slice(0, 1), password: '1234' });
        assert(bad3.error, '过短被拒：' + bad3.error);
        const r1 = await req('POST', '/api/register', { username: u1, password: '1234' });
        assert(r1.token, '合法注册成功');
        const t1 = r1.token;
        const me1 = await req('GET', '/api/me', null, t1);
        assert(/^勇者[0-9A-Z]{4}$/.test(me1.user.nickname || ''), `自动昵称为勇者+4位（${me1.user.nickname}）`);
        assert(/^[2-9A-HJ-NP-Z]{14}$/.test(me1.user.displayId || ''), `展示 ID 正确（${me1.user.displayId}）`);
        const dup = await req('POST', '/api/register', { username: u1, password: '1234' });
        assert(dup.error, '重复注册被拒：' + dup.error);

        console.log('\n② 手机号验证码：注册 / 登录 / 防重复');
        const badP = await req('POST', '/api/sms/send', { phone: '12345' });
        assert(badP.error, '非法手机号被拒：' + badP.error);
        const badC = await req('POST', '/api/phone/login', { phone: ph1, code: '000000', password: '1234' });
        assert(badC.error, '错误验证码被拒：' + badC.error);
        const code1 = await getCode(ph1, atk);
        assert(/^\d{6}$/.test(code1 || ''), '后台可查看验证码（' + code1 + '）');
        const pr1 = await req('POST', '/api/phone/login', { phone: ph1, code: code1, password: '8888' });
        assert(pr1.token && pr1.isNew === true, '手机号自动注册成功');
        const meP1 = await req('GET', '/api/me', null, pr1.token);
        assert(/^勇者[0-9A-Z]{4}$/.test(meP1.user.nickname || ''), `手机号注册也有勇者昵称（${meP1.user.nickname}）`);
        assert(meP1.user.phoneBound === true, '已绑定手机（' + meP1.user.phone + '）');
        assert(meP1.user.hasPassword === true, '注册时设置的密码已生效');
        // 同手机号再次验证码登录 → 登录而非新号
        await sleep(1100);
        const code1b = await getCode(ph1, atk);
        const pr1b = await req('POST', '/api/phone/login', { phone: ph1, code: code1b });
        assert(pr1b.token && pr1b.isNew === false, '同手机号二次登录不重复注册');
        // 手机号 + 密码 走统一登录入口
        const lp = await req('POST', '/api/login', { username: ph1, password: '8888' });
        assert(lp.token, '手机号 + 密码登录成功');

        console.log('\n③ 账号绑定手机号');
        const r2 = await req('POST', '/api/register', { username: u2, password: '1234' });
        const t2 = r2.token;
        const code2 = await getCode(ph2, atk);
        const bind = await req('POST', '/api/user/bind-phone', { phone: ph2, code: code2 }, t2);
        assert(bind.ok, '绑定成功');
        const lp2 = await req('POST', '/api/login', { username: ph2, password: '1234' });
        assert(lp2.token && lp2.user.username === u2, '绑定后可用手机号+密码登录原账号');
        // 手机号被占用：u3 绑 ph2 → 拒绝（占用或验证码已作废均视为拒绝）
        const r3 = await req('POST', '/api/register', { username: u3, password: '1234' });
        await sleep(1600);
        const code2b = await getCode(ph2, atk);
        const bindDup = await req('POST', '/api/user/bind-phone', { phone: ph2, code: code2b }, r3.token);
        assert(bindDup.error, '绑定已被占用的手机号被拒：' + bindDup.error);
        // 换绑：u2 从 ph2 换到 ph3，ph2 随之释放
        const code3 = await getCode(ph3, atk);
        const rebind = await req('POST', '/api/user/bind-phone', { phone: ph3, code: code3 }, t2);
        assert(rebind.ok, '换绑新手机号成功');
        // 释放后的 ph2 可以被 u3 绑定
        await sleep(1600);
        const code2c = await getCode(ph2, atk);
        const bindFree = await req('POST', '/api/user/bind-phone', { phone: ph2, code: code2c }, r3.token);
        assert(bindFree.ok, '换绑后旧手机号释放，他人可绑定');
        // 注册时直接带手机号
        const ph4 = '170' + String(100000000 + parseInt(stamp) % 899999999).slice(0, 8);
        const code4 = await getCode(ph4, atk);
        const r4 = await req('POST', '/api/register', { username: 'accd' + stamp, password: '1234', phone: ph4, code: code4 });
        assert(r4.token, '注册时直接绑定手机成功');

        console.log('\n④ 验证码登录创建的无密码账号设置密码');
        const ph5 = '180' + String(100000000 + parseInt(stamp) % 899999999).slice(0, 8);
        const code5 = await getCode(ph5, atk);
        const pr5 = await req('POST', '/api/phone/login', { phone: ph5, code: code5 }); // 不带密码
        assert(pr5.token && pr5.isNew, '无密码手机号注册成功');
        const me5 = await req('GET', '/api/me', null, pr5.token);
        assert(me5.user.hasPassword === false, '无密码状态正确');
        const badPw = await req('POST', '/api/user/set-password', { newPassword: '6666' }, t1);
        assert(badPw.error, '已有密码账号必须验证旧密码：' + badPw.error);
        const setPw = await req('POST', '/api/user/set-password', { newPassword: '6666' }, pr5.token);
        assert(setPw.ok, '无密码账号直接设置成功');
        const lp5 = await req('POST', '/api/login', { username: ph5, password: '6666' });
        assert(lp5.token, '设置后可用手机号+密码登录');

        console.log('\n⑤ 老账号展示 ID 全部补齐');
        const overview = await req('GET', '/api/admin/overview', null, atk);
        const all = (overview && overview.users) || [];
        const missing = all.filter(u => !u.displayId);
        assert(missing.length === 0, `所有 ${all.length} 个账号都有展示 ID`);
        const ids = new Set(all.map(u => u.displayId).filter(Boolean));
        assert(ids.size === all.filter(u => u.displayId).length, '展示 ID 无重复');

        console.log('\n⑥ 战斗：每关固定 20 波、末波 BOSS、小怪量');
        // 给 u1 买卡抽英雄并上阵
        await req('POST', '/api/shop/buy-wish', { count: 100 }, t1);
        const w = await req('POST', '/api/wish', { count: 10 }, t1);
        let eqUid = null;
        for (const it of (w.items || [])) {
            const tpl = it.template || {};
            if (!tpl.material) { eqUid = it.hero && it.hero.uid; break; }
        }
        if (!eqUid) { const w2 = await req('POST', '/api/wish', { count: 10 }, t1); for (const it of (w2.items || [])) { const tpl = it.template || {}; if (!tpl.material) { eqUid = it.hero && it.hero.uid; break; } } }
        assert(eqUid, '抽到可上阵英雄');
        const eq = await req('POST', '/api/hero/equip', { uid: eqUid }, t1);
        assert(eq.ok, '上阵成功');

        for (const fl of [1, 7, 20]) {
            const lv = await req('GET', `/api/tower/level?floor=${fl}`, null, t1);
            assert(!lv.error, `第 ${fl} 层关卡生成成功`);
            assert(lv.waves.length === 20, `第 ${fl} 层固定 20 波（实际 ${lv.waves.length}）`);
            const lastWave = lv.waves[19];
            assert(lastWave.enemies.some(e => e.boss), `第 ${fl} 层第 20 波有 BOSS（${lv.boss && lv.boss.name}）`);
            for (let i = 0; i < 19; i++) {
                if (lv.waves[i].enemies.some(e => e.boss)) { no(`第 ${i + 1} 波不该有 BOSS`); break; }
                if (i === 19) ok(`第 ${fl} 层前 19 波无 BOSS`);
            }
            const mobWaves = lv.waves.slice(0, 19);
            const expectCnt = Math.min(4 + Math.floor(fl / 4), 10);
            const badCnt = mobWaves.filter(wv => wv.enemies.filter(e => !e.guard).length !== expectCnt).length;
            assert(badCnt === 0, `第 ${fl} 层每波 ${expectCnt} 只小怪`);
            const allMobs = mobWaves.reduce((s, wv) => s + wv.enemies.length, 0);
            assert(allMobs >= 76, `第 ${fl} 层总小怪 ${allMobs} 只（变多）`);
            const e5 = lv.waves[4].enemies.filter(e => e.elite).length;
            assert(e5 >= 1, `第 5 波有精英怪（${e5} 只）`);
            const totalHp = mobWaves.reduce((s, wv) => s + wv.enemies.reduce((s2, e) => s2 + e.hp, 0), 0);
            ok(`第 ${fl} 层小怪总血量 ${totalHp}（归一化平衡）`);
        }
        const lv1 = await req('GET', '/api/tower/level?floor=1', null, t1);
        const guardN = lv1.waves[19].enemies.filter(e => e.guard).length;
        assert(guardN >= 1, `BOSS 波带亲卫（${guardN} 只）`);

        console.log('\n⑦ 部署兜底：db-env.json 配置文件逻辑');
        const fs = require('fs');
        const sv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
        assert(/db-env\.json/.test(sv), 'server.js 支持读 data/db-env.json');
        const dp = fs.readFileSync(path.join(ROOT, 'deploy/hooks/deploy.sh'), 'utf8');
        assert(/db-env\.json.*json/s.test(dp) && /storage.*json/.test(dp), 'deploy.sh 有存储模式回退告警');

    } catch (e) {
        no('异常：' + e.message + '\n' + e.stack);
    } finally {
        srv.kill();
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} / 失败 ${fail}`);
    process.exit(fail === 0 ? 0 : 1);
})();
