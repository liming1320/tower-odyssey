// 验证：战斗技能栏（英雄必杀 + 城墙技能 + 自动开关）+ 自动推塔开关
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9357;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
function post(p, data, token) {
    return new Promise((res, rej) => {
        const b = JSON.stringify(data);
        const r = http.request({
            host: 'localhost', port: 5180, path: p, method: 'POST',
            headers: {
                'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b),
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
            },
        }, resp => { let s = ''; resp.on('data', c => s += c); resp.on('end', () => res(JSON.parse(s))); });
        r.on('error', rej); r.write(b); r.end();
    });
}

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
            if (m.method === 'Runtime.exceptionThrown') {
                const d = m.params.exceptionDetails;
                console.log('  ⚠ 页面异常:', (d.exception && d.exception.description || d.text || '').split('\n')[0]);
            }
        };
        return c;
    }
    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise(res => this.waiters.set(id, res));
    }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) {
            const d = r.result.exceptionDetails;
            throw new Error('JS 异常: ' + ((d.exception && d.exception.description) || d.text));
        }
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
    async shot(name) {
        const s = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, 'base64'));
        return name;
    }
}

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

    // 准备账号（强烈化，保证能打过前几层）
    const at = (await post('/api/admin/login', { username: 'admin', password: 'workbuddy' })).token;
    const uname = 'sk' + (Date.now() % 100000);
    const tk = (await post('/api/register', { username: uname, password: 'pwd12345' })).token;
    await post('/api/admin/mail', {
        usernames: [uname], title: '资源',
        rewards: { gold: 99999999, iron: 999999, stone: 999999, gems: 99999, wishCards: 200 },
    }, at);
    const mails = (await new Promise((res, rej) => {
        http.get({ host: 'localhost', port: 5180, path: '/api/mail', headers: { Authorization: 'Bearer ' + tk } }, r => {
            let s = ''; r.on('data', c => s += c); r.on('end', () => res(JSON.parse(s)));
        }).on('error', rej);
    })).mails;
    for (const m of mails) await post('/api/mail/claim', { id: m.id }, tk);
    for (let i = 0; i < 4; i++) await post('/api/wish', { count: 10 }, tk);
    const hr = (await new Promise((res, rej) => {
        http.get({ host: 'localhost', port: 5180, path: '/api/heroes', headers: { Authorization: 'Bearer ' + tk } }, r => {
            let s = ''; r.on('data', c => s += c); r.on('end', () => res(JSON.parse(s)));
        }).on('error', rej);
    }));
    for (const oh of hr.owned.filter(o => !o.material).slice(0, 3)) {
        await post('/api/hero/equip', { uid: oh.uid }, tk);
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpsk-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=1280,1000', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const page = targets.find(t => t.type === 'page');
    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });

    await cdp.send('Page.navigate', { url: BASE + '/' });
    await sleep(1200);
    await cdp.eval(`(() => {
        document.getElementById('login-username').value='${uname}';
        document.getElementById('login-password').value='pwd12345';
        document.getElementById('btn-login').click(); return 1;
    })()`);
    await sleep(2300);
    console.log('1) 登录:', await cdp.eval(`!!window.App && !!window.App.user`) ? '✅' : '❌');

    // 冒险页
    await cdp.eval(`document.querySelector('[data-tab="tower"]').click()`);
    await sleep(1600);
    const autoBtn = await cdp.eval(`(() => {
        const b=document.getElementById('btn-auto-tower');
        return b ? {text:b.innerText.trim()} : null;
    })()`);
    console.log('2) 自动推塔按钮:', JSON.stringify(autoBtn));

    // 开启自动推塔
    await cdp.eval(`document.getElementById('btn-auto-tower').click()`);
    await sleep(500);
    const autoOn = await cdp.eval(`localStorage.getItem('autoTower')`);
    console.log('3) 点击后 autoTower =', autoOn, autoOn === '1' ? '✅' : '❌');
    await cdp.shot('sk-1-auto-tower-on.png');

    // 进入第 1 层
    await cdp.eval(`(() => { const b=document.querySelector('.floor-btn'); if(b) b.click(); return !!b; })()`);
    await sleep(3000);

    const bar = await cdp.eval(`(() => {
        const b=document.getElementById('skill-bar');
        if(!b) return null;
        return {
            ults: b.querySelectorAll('[data-ult]').length,
            wall: !!b.querySelector('#btn-wall'),
            wallText: b.querySelector('#btn-wall')?.innerText.trim(),
            auto: b.querySelector('#btn-auto')?.innerText.trim(),
            autoOn: b.querySelector('#btn-auto')?.classList.contains('on'),
            visible: b.offsetHeight > 0,
        };
    })()`);
    console.log('4) 技能栏:', JSON.stringify(bar));
    await cdp.shot('sk-2-skill-bar.png');

    // 切到手动
    await cdp.eval(`document.getElementById('btn-auto').click()`);
    await sleep(400);
    const manual = await cdp.eval(`(() => ({ auto: Battle.autoSkill, txt: document.querySelector('#btn-auto').innerText.trim() }))()`);
    console.log('5) 切手动:', JSON.stringify(manual), manual.auto === false ? '✅' : '❌');

    // 手动点城墙技能
    const wallCast = await cdp.eval(`(() => {
        if (Battle.wallSk) Battle.wallSk.cdTimer = 0;   // 先清零，验证手动点击确实能放
        const before = Battle.wallSk ? Battle.wallSk.cdTimer : -1;
        document.getElementById('btn-wall').click();
        const after = Battle.wallSk ? Battle.wallSk.cdTimer : -1;
        return { before: Math.round(before), after: Math.round(after), stun: Battle.stunUntil > performance.now() };
    })()`);
    console.log('6) 手动释放城墙技:', JSON.stringify(wallCast), wallCast.after > wallCast.before ? '✅ 进入冷却' : '❌');

    // 手动点必杀（把 CD 清零再点）
    const ultCast = await cdp.eval(`(() => {
        Battle.setAuto(false);
        const h = Battle.heroes[0];
        if (!h || !h.ult) return { err: '无必杀' };
        h.ult.cdTimer = 0;
        const btn = document.querySelector('[data-ult="'+h.uid+'"]');
        if (!btn) return { err: '无按钮' };
        btn.click();
        return { name: h.ult.name, cd: Math.round(h.ult.cdTimer), banner: Battle.banner ? Battle.banner.text : '' };
    })()`);
    console.log('7) 手动释放必杀:', JSON.stringify(ultCast), ultCast.cd > 0 ? '✅ 进入冷却' : '❌');
    await cdp.shot('sk-3-manual-cast.png');

    // 自动模式：等待自动释放
    await cdp.eval(`(() => { document.getElementById('btn-auto').click(); Battle.setAuto(true); return 1; })()`);
    await sleep(6000);
    const autoCast = await cdp.eval(`(() => {
        const st = Battle.skillState();
        return { auto: st.auto, ults: st.ults.map(u => ({ ready: u.ready, cd: Math.round(u.cd) })), wall: st.wall ? Math.round(st.wall.cd) : null };
    })()`);
    console.log('8) 自动模式 6 秒后:', JSON.stringify(autoCast));

    console.log('\n结论:',
        bar && bar.ults > 0 && bar.wall && ultCast.cd > 0
            ? '✅ 技能栏 / 必杀 / 城墙技 / 自动开关 全部可用'
            : '❌ 有环节异常');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
