/* 经典 7 款视觉验证：无头 Chrome 逐个进第 1 关截图；拼图额外验证块数切换
 *   node tools/shot-classics.js
 * 输出：tools/shots/{id}-1.png（拼图另有 -2）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9339;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');
const GAMES = ['zuma', 'bejeweled', 'bubble', 'alienshoot', 'mummymaze', 'rocketmania', 'jigsaw'];
const _log = [];
const say = (...a) => { const l = a.join(' '); _log.push(l); console.log(l); };

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpclass-'));
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
        const n = 'claschk' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        if (r.token) localStorage.setItem('game-token', r.token);
        location.reload();
        return true;
    })()`);
    await sleep(2000);

    let fails = 0;
    for (const id of GAMES) {
        // 每个游戏都整页刷新（#hash 是同页导航不重载，上个游戏的残留状态会让后续游戏渲染不出来）
        await cdp.send('Page.navigate', { url: BASE + '/?cls=' + Date.now() });
        await sleep(2200);
        const open = await cdp.eval(`(() => {
            try {
                const g = (typeof GAMES !== 'undefined') && GAMES.find(x => x.id === '${id}');
                if (!g) return { err: 'not-in-GAMES' };
                MinigamesView.launch(g);
                const cell = document.querySelector('#mini-stage .mg-ls-cell');
                if (!cell) return { err: 'no-level-cell' };
                cell.click();
                return { ok: true, cells: document.querySelectorAll('#mini-stage .mg-ls-cell').length };
            } catch (e) { return { err: e.message }; }
        })()`);
        say('打开', id + ':', JSON.stringify(open));
        await sleep(1100);
        await cdp.shot(path.join(OUT, id + '-1.png'));
        if (id === 'jigsaw') {
            const chg = await cdp.eval(`(() => {
                const sel = [...document.querySelectorAll('#mini-stage select')].pop();
                if (!sel) return { err: 'no-select' };
                sel.value = '6';
                sel.dispatchEvent(new Event('change'));
                return { ok: true, options: sel.options.length };
            })()`);
            console.log('拼图切块切换:', JSON.stringify(chg));
            await sleep(800);
            await cdp.shot(path.join(OUT, 'jigsaw-2.png'));
        }
    }
    proc.kill();
    fs.writeFileSync(path.join(OUT, 'shot-classics-log.txt'), _log.join('\n'), 'utf8');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
