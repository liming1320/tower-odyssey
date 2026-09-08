/* 截图验证：顶栏昵称 + 展示 ID、修改昵称弹窗、战斗中只有 BOSS 有血条
 *   node tools/shot-nickname.js
 * 输出 tools/shots/nick-topbar.png / nick-edit.png / nick-battle.png
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9353;
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
    async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(file), fs.statSync(file).size + ' B'); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpnick-'));
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
    await sleep(1200);
    const name = await cdp.eval(`(async () => {
        const n = 'shotnick' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        return n;
    })()`);
    // 改个中文昵称 + 抽卡上阵
    await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        await fetch('/api/user/set-nickname', {method:'POST',headers:H,body:JSON.stringify({nickname:'塔界·老王'})});
        for (let i = 0; i < 20; i++) await fetch('/api/wish', {method:'POST',headers:H,body:JSON.stringify({count:1})});
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        for (const o of (h.owned||[]).slice(0,4)) await fetch('/api/hero/equip', {method:'POST',headers:H,body:JSON.stringify({uid:o.uid})});
        return h.owned ? h.owned.length : 0;
    })()`);

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);

    // 1) 顶栏昵称 + 展示 ID
    await cdp.shot(path.join(OUT, 'nick-topbar.png'));

    // 2) 修改昵称弹窗
    await cdp.eval(`document.getElementById('btn-profile').click()`);
    await sleep(700);
    await cdp.shot(path.join(OUT, 'nick-edit.png'));
    await cdp.eval(`U.closeModal()`);
    await sleep(300);

    // 3) 战斗：小怪无血条（只有 BOSS 有）
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
    await sleep(1000);
    await cdp.eval(`(() => { const b = document.querySelector('#btn-launch') || document.querySelector('.launch-btn') || [...document.querySelectorAll('button')].find(x=>/开始|挑战|出征/.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(3500);
    await cdp.shot(path.join(OUT, 'nick-battle.png'));

    proc.kill();
    console.log('✅ 截图完成');
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
