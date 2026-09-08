// 验证独立管理后台 /admin：登录 → 5 个 tab 渲染 → 截图
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9351;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
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
            throw new Error('页面 JS 异常: ' + ((d.exception && d.exception.description) || d.text));
        }
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
    async shot(name) {
        const s = await this.send('Page.captureScreenshot', { format: 'png' });
        const f = path.join(OUT, name);
        fs.writeFileSync(f, Buffer.from(s.result.data, 'base64'));
        return f;
    }
}

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpadm-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=1280,900', 'about:blank',
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // ---- 打开后台 ----
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1200);
    const loginPage = await cdp.eval(`!!document.getElementById('ad-login-view') && !document.getElementById('ad-login-view').classList.contains('hidden')`);
    console.log('1) 后台登录页显示:', loginPage ? '✅' : '❌');
    await cdp.shot('admin-1-login.png');

    // ---- 登录 ----
    await cdp.eval(`(() => { document.getElementById('ad-p').value='workbuddy'; document.getElementById('ad-go').click(); return 1; })()`);
    await sleep(1800);
    const logged = await cdp.eval(`!!document.getElementById('ad-main') && !document.getElementById('ad-main').classList.contains('hidden')`);
    console.log('2) 登录后进入后台:', logged ? '✅' : '❌');

    // ---- 逐个 tab ----
    const results = {};
    for (const [t, label] of [['overview', '概览'], ['hero', '英雄管理'], ['wall', '城墙管理'], ['event', '活动管理'], ['users', '玩家列表']]) {
        await cdp.eval(`document.querySelector('.admin-tabs button[data-t="${t}"]').click()`);
        await sleep(1400);
        const info = await cdp.eval(`(() => {
            const b = document.getElementById('admin-body');
            return { len: b.innerHTML.length, txt: b.innerText.slice(0, 90), err: b.innerText.indexOf('加载失败') >= 0 };
        })()`);
        results[label] = info;
        console.log(`3) [${label}]`, info.err ? '❌ 加载失败' : '✅', '| 内容长度', info.len, '|', info.txt.replace(/\n/g, ' ').slice(0, 60));
        await cdp.shot(`admin-tab-${t}.png`);
    }

    console.log('\n结论:', Object.values(results).every(r => !r.err && r.len > 100) ? '✅ 后台全部 tab 正常' : '❌ 有 tab 异常');
    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
