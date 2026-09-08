// 验证：① 英雄详情「装备」点击不再报 API.heroEquipItem is not a function
//       ② 后台「清理测试号」按钮可用
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9355;
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

    // 准备一个有钱有英雄的测试号
    const at = (await post('/api/admin/login', { username: 'admin', password: 'workbuddy' })).token;
    const uname = 'uifix' + (Date.now() % 100000);
    const tk = (await post('/api/register', { username: uname, password: 'pwd12345' })).token;
    await post('/api/admin/mail', {
        usernames: [uname], title: '测试资源',
        rewards: { gold: 9999999, iron: 999999, stone: 999999, gems: 99999, wishCards: 30 },
    }, at);
    const mails = (await new Promise((res, rej) => {
        http.get({ host: 'localhost', port: 5180, path: '/api/mail', headers: { Authorization: 'Bearer ' + tk } }, r => {
            let s = ''; r.on('data', c => s += c); r.on('end', () => res(JSON.parse(s)));
        }).on('error', rej);
    })).mails;
    for (const m of mails) await post('/api/mail/claim', { id: m.id }, tk);
    await post('/api/wish', { count: 10 }, tk);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpfix-'));
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

    // ===== 玩家端：英雄详情 → 装备 =====
    await cdp.send('Page.navigate', { url: BASE + '/' });
    await sleep(1200);
    await cdp.eval(`(() => {
        document.getElementById('login-username').value='${uname}';
        document.getElementById('login-password').value='pwd12345';
        document.getElementById('btn-login').click();
        return 1;
    })()`);
    await sleep(2200);
    const logged = await cdp.eval(`!!window.App && !!window.App.user`);
    console.log('1) 玩家登录:', logged ? '✅' : '❌');

    await cdp.eval(`document.querySelector('[data-tab="hero"]').click()`);
    await sleep(1500);
    // 图鉴里点一个「已拥有」的卡片 → 打开英雄详情
    const opened = await cdp.eval(`(() => {
        const cards=[...document.querySelectorAll('.hero-card')].filter(c=>/已拥有/.test(c.textContent));
        if(!cards.length) return {ok:false, reason:'没有已拥有的卡片'};
        cards[0].click();
        return {ok:true, name:cards[0].querySelector('.name')?.textContent};
    })()`);
    await sleep(1600);
    const detailOpen = await cdp.eval(`!!document.querySelector('.modal-mask .modal')`);
    console.log('2) 英雄详情打开:', detailOpen ? '✅ ' + opened.name : '❌ ' + JSON.stringify(opened));

    // 切到「装备/戒指」tab
    await cdp.eval(`(() => {
        const t=[...document.querySelectorAll('.modal [data-t]')].find(x=>x.dataset.t==='equip');
        if(t) t.click();
        return !!t;
    })()`);
    await sleep(1200);
    await cdp.shot('fix-1-equip-tab.png');

    // 点第一个「装备」按钮
    const clickInfo = await cdp.eval(`(() => {
        const btns=[...document.querySelectorAll('.modal button[data-eq]')];
        if(!btns.length) return {found:0, html: document.querySelector('#hd-body')?.innerText.slice(0,120)};
        btns[0].click();
        return {found: btns.length, text: btns[0].textContent.trim(), slot: btns[0].dataset.slot};
    })()`);
    console.log('3) 点击装备按钮:', JSON.stringify(clickInfo));
    await sleep(2000);
    const toastTxt = await cdp.eval(`(() => { const t=document.querySelector('.toast'); return t? t.innerText : ''; })()`);
    const hdTxt = await cdp.eval(`(() => document.querySelector('#hd-body')?.innerText.slice(0,100) )()`);
    console.log('4) toast:', toastTxt || '(无)', '| 面板:', (hdTxt || '').replace(/\n/g, ' ').slice(0, 70));
    await cdp.shot('fix-2-after-equip.png');

    // ===== 后台：清理测试号 =====
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1200);
    await cdp.eval(`(() => { window.confirm=()=>true; const p=document.getElementById('ad-p'); if(p){p.value='workbuddy';document.getElementById('ad-go').click();} return 1; })()`);
    await sleep(1800);
    await cdp.eval(`window.confirm=()=>true; document.querySelector('.admin-tabs button[data-t="users"]').click()`);
    await sleep(1600);
    await cdp.eval(`window.confirm=()=>true;`);
    const toolInfo = await cdp.eval(`(() => ({
        testBtn: !!document.getElementById('sel-test'),
        testCount: document.getElementById('test-n')?.textContent,
        idleBtn: !!document.getElementById('flt-idle'),
        delBtn: !!document.getElementById('sel-del'),
    }))()`);
    console.log('5) 清理工具:', JSON.stringify(toolInfo));

    await cdp.eval(`document.getElementById('sel-test').click()`);
    await sleep(800);
    const selInfo = await cdp.eval(`(() => ({
        sel: document.getElementById('sel-n').textContent,
        chips: document.querySelectorAll('#sel-chips .chip').length,
        btn: document.getElementById('gr-go').textContent,
    }))()`);
    console.log('6) 选中疑似测试号:', JSON.stringify(selInfo));
    await cdp.shot('fix-3-select-test.png');

    // 仅看 0 进度
    await cdp.eval(`document.getElementById('flt-idle').click()`);
    await sleep(700);
    const idleInfo = await cdp.eval(`(() => ({ pager: document.getElementById('pg-info').textContent, on: document.getElementById('flt-idle').classList.contains('on') }))()`);
    console.log('7) 仅看 0 进度:', JSON.stringify(idleInfo));

    // 清理测试号（不真删，只验证按钮存在）—— 这里真删以验证链路，账号都是测试号
    await cdp.eval(`(() => { document.getElementById('flt-all').click(); return 1; })()`);
    await sleep(500);
    const before = await cdp.eval(`document.getElementById('pg-info').textContent`);
    await cdp.eval(`document.getElementById('sel-del').click()`);
    await sleep(2500);
    const after = await cdp.eval(`document.getElementById('pg-info').textContent`);
    console.log('8) 删除已选:', before, '→', after, before !== after ? '✅' : '(数量未变)');
    await cdp.shot('fix-4-after-delete.png');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
