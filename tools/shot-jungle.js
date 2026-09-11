/* 斗兽棋视觉验证：无头 Chrome 打开第 1 关，截图 + 点击走一步再截图。
 *   node tools/shot-jungle.js
 * 输出：tools/shots/jungle-1.png / jungle-2.png
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
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
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(file), fs.statSync(file).size + ' B'); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpjungle-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=460,860', 'about:blank'], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 440, height: 840, deviceScaleFactor: 2, mobile: true });

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => {
        const n = 'junglechk' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        if (r.token) localStorage.setItem('game-token', r.token);
        location.reload();
        return true;
    })()`);
    await sleep(2000);

    // 打开斗兽棋第 1 关
    const open = await cdp.eval(`(() => {
        try {
            const g = (typeof GAMES !== 'undefined') && GAMES.find(x => x.id === 'jungle');
            if (!g) return { err: 'not-in-GAMES' };
            MinigamesView.launch(g);
            const cell = document.querySelector('#mini-stage .mg-ls-cell');
            if (!cell) return { err: 'no-level-cell' };
            cell.click();
            return { ok: true };
        } catch (e) { return { err: e.message }; }
    })()`);
    console.log('打开斗兽棋:', JSON.stringify(open));
    await sleep(1400);
    await cdp.shot(path.join(OUT, 'jungle-1.png'));

    // 走一步：点红方鼠 (0,6) → 上移 (0,5)。棋盘几何：cell=52, x0=(440-364)/2=38, y0=66
    const moved = await cdp.eval(`(() => {
        try {
            const cvs = document.querySelector('#mini-stage canvas');
            if (!cvs) return { err: 'no canvas' };
            const rect = cvs.getBoundingClientRect();
            const sx = rect.width / 440, sy = rect.height / 596;
            const tap = (gx, gy) => {
                const cx = rect.left + (38 + (gx + 0.5) * 52) * sx;
                const cy = rect.top + (66 + (gy + 0.5) * 52) * sy;
                const o = { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 };
                cvs.dispatchEvent(new PointerEvent('pointerdown', o));
                cvs.dispatchEvent(new PointerEvent('pointerup', o));
            };
            tap(0, 6);
            tap(0, 5);
            return { ok: true };
        } catch (e) { return { err: e.message }; }
    })()`);
    console.log('走一步:', JSON.stringify(moved));
    await sleep(1000);
    await cdp.shot(path.join(OUT, 'jungle-2.png'));

    proc.kill();
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
