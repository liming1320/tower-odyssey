/* 截图验证：顶栏 SVG 资源图标（木材/铁矿/石币/经验）
 *   node tools/shot-resicon.js
 * 输出 tools/shots/resicon-top.png / resicon-camp.png
 */
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
        http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpres-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=420,900', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });

    // 注册并登录
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => {
        const n = 'iconshot' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        return r.ok;
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);

    // 验证图标注入 + 截营地页（顶栏在上）
    const check = await cdp.eval(`(() => ({
        ric: document.querySelectorAll('.ric').length,
        svg: document.querySelectorAll('.ric svg').length,
        wood: !!document.querySelector('.ric[data-res-icon="wood"] svg'),
    }))()`);
    console.log('   📊 占位图标:', check.ric, '已注入 SVG:', check.svg, '木材:', check.wood);
    await cdp.shot(path.join(OUT, 'resicon-top.png'));

    // 营地页（建筑产出也用 RES_ICON）
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="camp"]').click()`);
    await sleep(1500);
    await cdp.shot(path.join(OUT, 'resicon-camp.png'));

    proc.kill();
    console.log('✅ 截图完成');
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
