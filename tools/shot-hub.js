/* 浏览器验证：小游戏大厅渲染 100 张卡片 + 抽查重点游戏（含用户点名的 5 个）
 *   node tools/shot-hub.js
 * 输出：tools/shots/hub-100.png 及逐项日志
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdphub-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=420,900', 'about:blank'], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => {
        const n = 'hubchk' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        if (r.token) localStorage.setItem('game-token', r.token);
        return true;
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);
    await cdp.eval(`(() => {
        window._errs = [];
        const o = window.onerror;
        window.onerror = (m,s,l,c,e) => { window._errs.push(String(m)+' @'+l); if (o) o(m,s,l,c,e); return false; };
        window.addEventListener('unhandledrejection', ev => window._errs.push('reject:'+((ev.reason&&ev.reason.message)||ev.reason)));
    })()`);

    // 1) 大厅
    await cdp.eval(`MinigamesView.open(window.App)`);
    await sleep(1200);
    const hub = await cdp.eval(`(() => ({
        cards: document.querySelectorAll('#mini-hub .mini-card').length,
        ids: [...document.querySelectorAll('#mini-hub .mini-card')].map(c => c.dataset.id).length,
        errs: window._errs.slice(0, 3),
    }))()`);
    console.log('🎮 大厅卡片数:', hub.cards, hub.errs.length ? '⚠' + JSON.stringify(hub.errs) : '✓ 无错误');
    await cdp.shot(path.join(OUT, 'hub-100.png'));

    // 2) 抽查：用户点名的 5 个 + 各类代表
    const ids = ['chess', 'junqi', 'monopoly', 'solitaire', 'spider', 'sokoban', 'maze', 'flappy',
        'mathquiz', 'chimp', 'slots', 'towerdef', 'simon', 'growfarm', 'blackjack', 'sudoku9', 'reversi', 'plinko'];
    let bad = 0;
    for (const id of ids) {
        const r = await cdp.eval(`(() => {
            try {
                window._errs = [];
                const g = (typeof GAMES !== 'undefined') && GAMES.find(x => x.id === '${id}');
                if (!g) return { id: '${id}', err: 'not-in-GAMES' };
                MinigamesView.launch(g);
                const cells = document.querySelectorAll('#mini-stage .mg-ls-cell').length;
                const extra = document.querySelectorAll('#mini-stage .mg-ls-extra').length;
                return { id: '${id}', cells, endless: extra, errs: window._errs.slice(0,2) };
            } catch (e) { return { id: '${id}', err: e.message }; }
        })()`);
        const ok = r.cells === 20 && !r.err && !(r.errs && r.errs.length);
        if (!ok) bad++;
        console.log(`   ${ok ? '✓' : '✗'} ${String(r.id).padEnd(10)} 关卡=${r.cells ?? '-'} 无尽=${r.endless ?? '-'}${r.err ? ' ERR:' + r.err : ''}${r.errs && r.errs.length ? ' ' + JSON.stringify(r.errs) : ''}`);
        await cdp.eval(`document.getElementById('mini-back').click()`);
        await sleep(250);
    }

    // 3) 全量快速扫描：所有 100 个游戏能否打开关卡选择界面
    const all = await cdp.eval(`(() => {
        window._errs = [];
        const bad2 = [];
        for (const g of GAMES) {
            try {
                MinigamesView.launch(g);
                const cells = document.querySelectorAll('#mini-stage .mg-ls-cell').length;
                const extra = document.querySelectorAll('#mini-stage .mg-ls-extra').length;
                const want = g.id === 'banqi' ? 15 : 20;   // 暗棋沿用 DOS 原版 15 关
                if (cells !== want) bad2.push(g.id + ':cells=' + cells);
                document.getElementById('mini-back').click();
            } catch (e) { bad2.push(g.id + ':' + e.message); }
        }
        return { total: GAMES.length, bad: bad2, errs: window._errs.slice(0, 5) };
    })()`);
    console.log(`\n📋 全量扫描: ${all.total} 个游戏, 异常 ${all.bad.length} 个`);
    if (all.bad.length) console.log('   ⚠', JSON.stringify(all.bad).slice(0, 600));
    if (all.errs && all.errs.length) console.log('   ⚠ 页面错误:', JSON.stringify(all.errs).slice(0, 400));
    console.log(bad === 0 && all.bad.length === 0 ? '\n✅ 全部通过' : '\n❌ 存在问题');

    proc.kill();
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
