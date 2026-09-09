/* 截 3 个新小游戏（鸠摩智转刀 / 羊了个羊 / 口袋奇兵）验证渲染与美术 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9388, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, '..', 'tools', 'shots');
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpnew-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,940', 'about:blank'], { stdio: 'ignore' });

    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

    await cdp.send('Page.navigate', { url: BASE }); await sleep(1500);
    await cdp.eval(`(async()=>{const n='new'+(Date.now()+'').slice(-6);
        const r=await(await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,password:'1234'})})).json();
        if(r.token)localStorage.setItem('game-token',r.token);return 1})()`);
    await cdp.send('Page.navigate', { url: BASE }); await sleep(1800);

    const games = [
        ['knife', '鸠摩智转刀'],
        ['sheep', '羊了个羊'],
        ['pocketarmy', '口袋奇兵'],
    ];
    for (const [id, name] of games) {
        // 每个游戏都重新导航，避免上一局残留状态干扰
        await cdp.send('Page.navigate', { url: BASE + '?g=' + id }); await sleep(1600);
        await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='${id}'))`); await sleep(1000);
        await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`); await sleep(1600);
        const n = await cdp.eval(`(()=>{const s=document.querySelector('#mini-stage');
            return (s.querySelectorAll('canvas').length?'canvas×'+s.querySelectorAll('canvas').length:'')
                 + '|tiles:'+s.querySelectorAll('.sheep-tile').length
                 + '|html:'+s.innerHTML.length})()`);
        console.log(`   ${id.padEnd(11)} ${name.padEnd(6)} ${n}`);
        await cdp.shot(path.join(OUT, `new-${id}.png`));
    }
    proc.kill(); process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
