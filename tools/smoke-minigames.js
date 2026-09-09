// 端到端冒烟：账号体系 + 个人信息 + 设置 + 小游戏 20 个 + 礼品码 + 账号注销
//   node tools/smoke-minigames.js
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://127.0.0.1:5180';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, 'shots');
const PORT = 9357;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const assert = (cond, label) => { if (cond) { passed++; console.log('  ✔', label); } else { failed++; console.log('  ✗', label); } };

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } }); }).on('error', reject);
    });
}
function postJSON(p, body, token) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
        });
        req.on('error', reject); req.write(data); req.end();
    });
}
function getJSONWithToken(url, token) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'GET', headers: token ? { Authorization: 'Bearer ' + token } : {} }, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
        });
        req.on('error', reject); req.end();
    });
}

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } };
        return c;
    }
    send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise(res => this.waiters.set(id, res)); }
    async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(file), fs.statSync(file).size + ' B'); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const stamp = Date.now().toString().slice(-8);

    // ① 注册测试账号
    console.log('\n① 注册测试账号');
    const u = 'mgtest' + stamp;
    const reg = await postJSON(BASE + '/api/register', { username: u, password: '1234' });
    assert(reg.token, '注册成功（token 拿到）');
    assert(reg.user.nickname && reg.user.nickname.startsWith('勇者'), '默认昵称是勇者XXXX');
    assert(/^[2-9A-HJ-NP-Z]{14}$/.test(reg.user.displayId || ''), '展示 ID 14 位新格式');
    const token = reg.token;

    // ② 管理员登录
    console.log('\n② 管理员登录 + 创建礼品码');
    const ad = await postJSON(BASE + '/api/admin/login', { username: 'admin', password: 'workbuddy' });
    assert(ad.token, '管理员登录成功');
    const adToken = ad.token;
    const code = 'TOWER' + stamp.slice(-4).toUpperCase();
    const save = await postJSON(BASE + '/api/admin/gift/save', {
        code, name: '测试礼包', content: '感谢测试！',
        rewards: { gold: 1000, gems: 50, wishCards: 3 }, maxUses: 0, enabled: true,
    }, adToken);
    assert(save.ok, '管理员创建礼品码成功');

    // ③ 玩家兑换
    console.log('\n③ 玩家兑换礼品码');
    const r1 = await postJSON(BASE + '/api/gift/redeem', { code }, token);
    assert(r1.ok && r1.mail, '兑换成功（生成邮件）');
    const r1b = await postJSON(BASE + '/api/gift/redeem', { code }, token);
    assert(r1b.error && /已兑换/.test(r1b.error), '同一账号二次兑换被拒');
    const r2 = await postJSON(BASE + '/api/gift/redeem', { code: 'NOPE' }, token);
    assert(r2.error, '不存在的码被拒');
    const r3 = await postJSON(BASE + '/api/gift/redeem', { code }, adToken);
    assert(r3.ok, '管理员用另一个账号兑换成功');

    // ④ /api/me 包含冒险进度字段
    console.log('\n④ /api/me 字段');
    const me = await getJSONWithToken(BASE + '/api/me', token);
    if (!me.user) console.log('   [debug] me =', JSON.stringify(me).slice(0, 300));
    assert(me.user, 'me 返回 user');
    assert(me.user && me.user.displayId, 'me.user.displayId 存在');
    assert(me.user && me.user.state && typeof me.user.state.tower === 'object', 'state.tower 存在');

    // ⑤ 头像 + 个人信息 + 设置 + 小游戏 hub + 20 个游戏 UI 验证
    console.log('\n⑤ UI 验证（CDP 截图）');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpmg-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=420,900', 'about:blank',
    ], { stdio: 'ignore' });
    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) {}
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);

    // 注入 token 直接进主界面
    await cdp.eval(`localStorage.setItem('game-token', ${JSON.stringify(token)})`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(2000);

    // 1) 头像 + 顶栏资源
    await cdp.shot(path.join(OUT, 'feat-topbar.png'));
    const topCheck = await cdp.eval(`(() => ({
        avatar: !!document.getElementById('player-avatar').querySelector('svg'),
        profile: document.getElementById('p-nick').textContent,
        uid: document.getElementById('p-uid').textContent,
    }))()`);
    assert(topCheck.avatar, '顶栏头像 SVG 渲染');
    assert(topCheck.profile && topCheck.profile.length > 0, '顶栏昵称显示');
    assert(/^[2-9A-HJ-NP-Z]{14}$/.test(topCheck.uid), '顶栏展示 ID 14 位');

    // 2) 个人信息弹窗
    await cdp.eval(`document.getElementById('btn-avatar').click()`);
    await sleep(800);
    await cdp.shot(path.join(OUT, 'feat-personal.png'));
    const piCheck = await cdp.eval(`(() => {
        const m = document.querySelector('.modal');
        if (!m) return { ok: false };
        return {
            ok: true,
            hasNick: !!m.querySelector('#pi-nick'),
            hasId: !!m.querySelector('#pi-id'),
            hasLineup: !!m.querySelector('.pi-lineup'),
            hasSettings: !!m.querySelector('#pi-settings'),
        };
    })()`);
    assert(piCheck.ok && piCheck.hasNick, '个人信息弹窗：昵称');
    assert(piCheck.hasId, '个人信息弹窗：展示 ID');
    assert(piCheck.hasLineup, '个人信息弹窗：冒险阵容区');
    assert(piCheck.hasSettings, '个人信息弹窗：设置入口');

    // 3) 设置弹窗
    await cdp.eval(`document.getElementById('pi-settings').click()`);
    await sleep(800);
    await cdp.shot(path.join(OUT, 'feat-settings.png'));
    const stCheck = await cdp.eval(`(() => {
        const m = document.querySelector('.modal');
        return {
            music: !!m.querySelector('#s-music'),
            float: !!m.querySelector('#s-float'),
            gift: !!m.querySelector('[data-act="gift"]'),
            mini: !!m.querySelector('[data-act="mini"]'),
            privacy: !!m.querySelector('[data-act="privacy"]'),
            del: !!m.querySelector('[data-act="delete"]'),
        };
    })()`);
    assert(stCheck.music, '设置：音乐开关');
    assert(stCheck.float, '设置：战斗飘字开关');
    assert(stCheck.gift, '设置：礼包码入口');
    assert(stCheck.mini, '设置：小游戏入口');
    assert(stCheck.privacy, '设置：隐私政策入口');
    assert(stCheck.del, '设置：账号注销入口');

    // 4) 小游戏入口（竖版卡片）
    await cdp.eval(`document.querySelector('[data-act="mini"]').click()`);
    await sleep(1000);
    await cdp.shot(path.join(OUT, 'feat-minihub.png'));
    const hubCheck = await cdp.eval(`(() => ({
        count: document.querySelectorAll('.mini-card').length,
        names: [...document.querySelectorAll('.mini-name')].map(x => x.textContent),
    }))()`);
    assert(hubCheck.count >= 20, '小游戏入口卡片数 >= 20（实际 ' + hubCheck.count + '）');
    console.log('     游戏名册：', hubCheck.names.join(' / '));

    // 5) 20 个游戏全部能打开
    console.log('\n⑥ 20 个小游戏启动测试');
    const expected = ['五子棋','2048','暗棋圣手','中国象棋','连连看','消消乐','贪吃蛇','俄罗斯方块','打地鼠','扫雷','记忆翻牌','数字华容道','猜数字','迷你数独','汉诺塔','别踩白块','反应力测试','打砖块','跳一跳','飞机大战'];
    const ids = ['gomoku','g2048','banqi','xiangqi','link','match3','snake','tetris','mole','mine','memory','slide15','bulls','sudoku6','hanoi','piano','reaction','breakout','jump','shooter'];
    for (let i = 0; i < ids.length; i++) {
        await cdp.eval(`(async () => {
            const c = document.querySelector('.mini-card[data-id="${ids[i]}"]');
            if (c) c.click();
        })()`);
        await sleep(700);
        const ok = await cdp.eval(`(() => {
            const m = document.getElementById('mini-mask');
            const s = document.getElementById('mini-stage');
            if (!m) return { ok: false, why: 'no-mask' };
            if (!s) return { ok: false, why: 'no-stage' };
            const has = s.children.length > 0;
            return { ok: has, why: has ? '' : 'empty-stage', title: document.querySelector('.mini-title')?.textContent || '' };
        })()`);
        assert(ok.ok, expected[i] + ' (' + ids[i] + ') 启动成功');
        if (i === 0) await cdp.shot(path.join(OUT, 'feat-mg-gomoku.png'));
        if (i === 1) await cdp.shot(path.join(OUT, 'feat-mg-2048.png'));
        if (i === 5) await cdp.shot(path.join(OUT, 'feat-mg-match3.png'));
        if (i === 19) await cdp.shot(path.join(OUT, 'feat-mg-shooter.png'));
        // 返回
        await cdp.eval(`document.getElementById('mini-back').click()`);
        await sleep(400);
    }

    // 6) 账号注销
    console.log('\n⑦ 账号注销');
    const del = await postJSON(BASE + '/api/account/delete', { password: '1234', confirm: '确认注销' }, token);
    assert(del.ok, '账号注销成功');
    const me2 = await getJSONWithToken(BASE + '/api/me', token);
    assert(me2.error, '注销后 token 失效');

    proc.kill();
    console.log(`\n==== 冒烟完成：${passed} 通过 / ${failed} 失败 ====`);
    if (failed > 0) process.exit(1);
})().catch(e => { console.error('异常：', e); process.exit(1); });
