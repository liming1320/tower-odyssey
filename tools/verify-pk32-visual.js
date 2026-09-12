const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:5180';
const PORT = 9477;
const OUT = path.join(__dirname, '..', 'output', 'playwright');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function json(url) { return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', x => d += x); res.on('end', () => resolve(JSON.parse(d))); }).on('error', reject)); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) { const ws = new WebSocket(url); await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }); const c = new CDP(ws); ws.on('message', data => { const m = JSON.parse(data.toString()); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }); return c; }
    send(method, params) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params: params || {} })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result.result.value; }
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
}
function check(label, ok, value) { console.log((ok ? 'PASS ' : 'FAIL ') + label + (value == null ? '' : ' ' + value)); if (!ok) process.exitCode = 1; }
(async () => {
    console.log('START PK32 visual verification');
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-visual-'));
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + dir, '--remote-debugging-port=' + PORT, BASE], { stdio: 'ignore' });
    chrome.on('error', error => { console.error('Chrome launch error:', error.message); });
    try {
        let targets;
        for (let i = 0; i < 40; i += 1) { try { targets = await json('http://127.0.0.1:' + PORT + '/json/list'); if (targets.length) break; } catch (e) { if (i === 39) throw e; } await sleep(250); }
        console.log('CDP targets', targets && targets.length, JSON.stringify(targets && targets[0]));
        if (!targets || !targets.length) throw new Error('Chrome CDP target unavailable');
        const page = targets.find(x => x.type === 'page');
        if (!page) throw new Error('Chrome page target unavailable');
        const cdp = await CDP.connect(page.webSocketDebuggerUrl);
        await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
        console.log('CDP connected');
        await cdp.send('Page.navigate', { url: BASE }); await sleep(1500);
        console.log('Page loaded');
        const tower = await cdp.eval("(() => { const h = document.createElement('div'); h.id = 'pk32-visual-tower'; document.body.appendChild(h); const g = window.PK32Tower.startUI(h, {}); return { cells: h.querySelectorAll('[data-role=grid] button').length, titles: [...h.querySelectorAll('[data-role=grid] button')].map(x => x.title).filter(Boolean).slice(0, 8), image: [...h.querySelectorAll('[data-role=grid] button')].some(x => getComputedStyle(x).backgroundImage.indexOf('tower-sheet') >= 0), state: g.getState ? g.getState() : null }; })()");
        check('魔塔显示 11×11 地图', tower.cells === 121, tower.cells); check('魔塔有语义对象提示', tower.titles.some(x => /墙|主角|怪物|钥匙|门|出口/.test(x)), tower.titles.join(' | ')); check('魔塔加载图集', tower.image);
        await cdp.shot(path.join(OUT, 'pk32-tower.png'));
        const richman = await cdp.eval("(() => { const h = document.createElement('div'); h.id = 'pk32-visual-richman'; document.body.appendChild(h); const g = window.PK32Richman.start(h, {}); return { cells: h.querySelectorAll('.pk32-rh-cell').length, players: h.querySelectorAll('.pk32-rh-player').length, image: getComputedStyle(h.querySelector('.pk32-rh-board')).backgroundImage, buttons: h.querySelectorAll('.pk32-rh-actions button').length }; })()");
        check('强手棋显示 40 格路线', richman.cells === 40, richman.cells); check('强手棋显示 3 名玩家', richman.players === 3, richman.players); check('强手棋操作按钮齐全', richman.buttons >= 5, richman.buttons); check('强手棋加载 PK32 图集', /board-sheet/.test(richman.image), richman.image);
        await cdp.shot(path.join(OUT, 'pk32-richman.png'));
        console.log(JSON.stringify({ tower, richman, output: OUT }));
    } finally { if (!chrome.killed) chrome.kill(); console.log('END PK32 visual verification'); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
