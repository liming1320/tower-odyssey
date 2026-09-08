/* 截图游戏内：英雄图鉴 + 背包（含星级标识）
 *   node tools/shot-game.js
 * 输出 tools/shots/game-atlas.png / game-bag.png / game-admin-heroes.png
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9351;
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpgg-'));
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1200);
    await cdp.eval(`(async () => {
        const name = 'art_' + Date.now().toString().slice(-6);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:name, password:'1234'})})).json();
        localStorage.setItem('game-token', r.token); return name;
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    // 给账号一个 h01（程序生成角色），并把星级调到 7 便于看到红色星
    await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        // 一次性塞入 5 个测试英雄到背包（直接走后端 API 没办法，因为没有 seed 接口；改用 /api/wish 抽 30 次，期望中 h01..h06）
        let got = new Set();
        for (let i = 0; i < 30 && got.size < 6; i++) {
            const r = await (await fetch('/api/wish', {method:'POST',headers:H,body:JSON.stringify({count:1})})).json();
            (r.owned || []).forEach(o => got.add(o.id));
        }
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        // 把前 4 个上阵
        for (const o of h.owned.slice(0, 4)) await fetch('/api/hero/equip', {method:'POST',headers:H,body:JSON.stringify({uid:o.uid})});
        return {拥有: h.owned.length, 唯一ID: [...got]};
    })()`);

    // 1) 图鉴
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="hero"]').click()`);
    await sleep(800);
    await cdp.eval(`(() => {
        const t = document.querySelectorAll('.tabbar button'); for (const x of t) if (x.textContent.includes('图鉴')) x.click();
    })()`);
    await sleep(900);
    await cdp.shot(path.join(OUT, 'game-atlas.png'));

    // 2) 背包（应有刚抽到的英雄，背包需 heroes >= 1）
    await cdp.eval(`(() => {
        const t = document.querySelectorAll('.tabbar button'); for (const x of t) if (x.textContent.includes('背包')) x.click();
    })()`);
    await sleep(900);
    await cdp.shot(path.join(OUT, 'game-bag.png'));

    // 3) 管理员英雄管理
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1200);
    await cdp.eval(`(async () => {
        const r = await (await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'admin', password:'workbuddy'})})).json();
        localStorage.setItem('admin-token', r.token); return 'ok';
    })()`);
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1500);
    await cdp.eval(`(() => {
        const t = [...document.querySelectorAll('.admin-tabs button, .tabbar button, button')].find(b => b.textContent.trim() === '英雄管理');
        if (t) t.click();
    })()`);
    await sleep(1000);
    await cdp.shot(path.join(OUT, 'game-admin-heroes.png'));

    proc.kill();
    console.log('✅ 完成');
})().catch(e => { console.error('失败:', e.message); process.exit(1); });