/* 一次性诊断：泡泡龙打开后 stage 里有什么、有无报错 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const BASE = 'http://localhost:5180';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(url) { return new Promise((resolve, reject) => { http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject); }); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }; return c; }
    send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise(res => this.waiters.set(id, res)); }
    async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
}
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpdiag-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=460,900', 'about:blank'], { stdio: 'ignore' });
    let targets = null;
    for (let i = 0; i < 40; i++) { try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => { const n='diag'+Date.now().toString().slice(-5); const r=await (await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,password:'1234'})})).json(); if(r.token) localStorage.setItem('game-token', r.token); location.reload(); return true; })()`);
    await sleep(2000);
    // 挂错误捕获
    await cdp.eval(`window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.filename+':'+e.lineno)); true`);
    const open = await cdp.eval(`(() => { const g=GAMES.find(x=>x.id==='bubble'); MinigamesView.launch(g); const cell=document.querySelector('#mini-stage .mg-ls-cell'); cell.click(); return true; })()`);
    await sleep(1500);
    const diag = await cdp.eval(`(() => {
        const st = document.querySelector('#mini-stage');
        const cv = st.querySelector('canvas');
        let sample = 'no-canvas', rect = null;
        if (cv) {
            const r = cv.getBoundingClientRect();
            rect = { x: r.x, y: r.y, w: r.width, h: r.height };
            try { const d = cv.toDataURL('image/png'); sample = d.length + ' chars, head=' + d.slice(0, 60); } catch (e) { sample = 'ERR ' + e.message; }
        }
        return { canvases: st ? st.querySelectorAll('canvas').length : -1, rect, sample, errs: window.__errs };
    })()`);
    fs.writeFileSync(path.join(__dirname, 'shots', 'diag.txt'), JSON.stringify(diag, null, 2), 'utf8');
    const r2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shots', 'bubble-diag.png'), Buffer.from(r2.result.data, 'base64'));
    proc.kill(); process.exit(0);
})().catch(e => { require('fs').writeFileSync(require('path').join(__dirname, 'shots', 'diag.txt'), 'ERR ' + e.message, 'utf8'); process.exit(1); });
