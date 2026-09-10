/* 弹球发射专项：完全蓄力后球必须能脱离发射巷进入台面顶端 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9401, BASE = 'http://127.0.0.1:5180';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws=ws; this.id=0; this.waiters=new Map(); }
    static async connect(u){ const ws=new WebSocket(u); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j}); const c=new CDP(ws); ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&c.waiters.has(m.id)){c.waiters.get(m.id)(m);c.waiters.delete(m.id)}}; return c; }
    send(m,p={}){ const id=++this.id; this.ws.send(JSON.stringify({id,method:m,params:p})); return new Promise(r=>this.waiters.set(id,r)); }
    async eval(e){ const r=await this.send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); return r.result&&r.result.result?r.result.result.value:undefined; }
}
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdplaunch-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: BASE + '/?g=pinball' }); await sleep(2500);
    await cdp.eval('(()=>{window.__MG_TEST=true; MinigamesView.launch(GAMES.find(x=>x.id===\'pinball\')); return 1})()');
    await sleep(1200);
    await cdp.eval('(()=>{const c=document.querySelector(\'#mini-stage .mg-ls-cell\'); if(c) c.click(); return !!c})()');
    await sleep(1500);
    await cdp.eval('(()=>{window.dispatchEvent(new KeyboardEvent(\'keydown\',{code:\'Space\'})); return 1})()');
    await sleep(1100);
    await cdp.eval('(()=>{window.dispatchEvent(new KeyboardEvent(\'keyup\',{code:\'Space\'})); return 1})()');
    await sleep(1500);
    const r = await cdp.eval('(()=>{const p=window.__pinball; if(!p) return \'no-hook\'; return {ball:p.ball, launched:p.launched, score:p.score, mult:p.mult, rail:p.rail}})()');
    console.log('发射 1.5s 后:', JSON.stringify(r));
    const ok = r && r.ball && (r.ball.x < 348 || r.ball.y < 400);
    console.log(ok ? '✅ 球已脱离发射巷' : '❌ 球仍困在巷里');
    await sleep(1500);
    const r2 = await cdp.eval('(()=>{const p=window.__pinball; return p?{ball:p.ball, score:p.score}:null})()');
    console.log('3s 后:', JSON.stringify(r2));
    proc.kill();
    process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
