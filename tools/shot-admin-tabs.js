/* 验证后台两个 tab：礼品码 / 小游戏排序 是否正常渲染（不再报「加载失败」「API不存在」） */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9391, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
    return new Promise((res, rej) => {
        http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej);
    });
}
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(u) {
        const ws = new WebSocket(u);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        const c = new CDP(ws);
        ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } };
        return c;
    }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(f) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(f)); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpadmin-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await cdp.send('Page.navigate', { url: BASE + '/admin' }); await sleep(1500);
    await cdp.eval(`(async()=>{const r=await(await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'workbuddy'})})).json();
        if(r.token)localStorage.setItem('admin-token',r.token);return !!r.token})()`);
    await cdp.send('Page.navigate', { url: BASE + '/admin' }); await sleep(1800);
    await cdp.eval(`AdminApp.login && 0`);
    await sleep(500);

    for (const [tab, label] of [['gift', '礼品码'], ['order', '小游戏排序']]) {
        await cdp.eval(`document.querySelector('[data-t="${tab}"]').click()`);
        await sleep(1600);
        const info = await cdp.eval(`(()=>{const b=document.querySelector('#ad-body')||document.body;
            const txt=b.innerText||'';
            return { fail: /加载失败|API不存在|is not a function/.test(txt),
                     snippet: txt.replace(/\\s+/g,' ').slice(0,120),
                     rows: b.querySelectorAll('.ord-row').length,
                     tr: b.querySelectorAll('table tbody tr').length }})()`);
        console.log(`   ${label.padEnd(6)} 失败=${info.fail} ord行=${info.rows} 表格行=${info.tr} :: ${info.snippet}`);
        await cdp.shot(path.join(OUT, `admin-${tab}.png`));
    }
    proc.kill(); process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
