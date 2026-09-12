/* 抽样截图：各分区代表游戏现状（升级前基准）
 *   node tools/shot-sample.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');
const GAMES = ['tictactoe', 'connect4', 'solitaire', 'blackjack', 'slots', 'maze', 'sudoku9', 'flashnum', 'mathquiz', 'flappy', 'towerdef', 'plinko'];

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
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(file), fs.statSync(file).size + ' B'); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpsamp-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=460,900', 'about:blank'], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 440, height: 900, deviceScaleFactor: 2, mobile: true });

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => {
        const n = 'sampchk' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        if (r.token) localStorage.setItem('game-token', r.token);
        location.reload();
        return true;
    })()`);
    await sleep(2000);

    for (const id of GAMES) {
        await cdp.send('Page.navigate', { url: BASE + '/?cls=' + Date.now() });
        await sleep(2000);
        const open = await cdp.eval(`(() => {
            try {
                const g = (typeof GAMES !== 'undefined') && GAMES.find(x => x.id === '${id}');
                if (!g) return { err: 'not-in-GAMES' };
                MinigamesView.launch(g);
                const cell = document.querySelector('#mini-stage .mg-ls-cell');
                if (!cell) return { err: 'no-level-cell' };
                cell.click();
                return { ok: true };
            } catch (e) { return { err: e.message }; }
        })()`);
        console.log('打开', id + ':', JSON.stringify(open));
        await sleep(1100);
        await cdp.shot(path.join(OUT, 'base-' + id + '.png'));
    }
    proc.kill();
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
