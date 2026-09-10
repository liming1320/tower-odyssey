/* 三维弹球「台面复刻」实机位图取证：涡轮引擎 / 虫洞 / 火箭管道 / 翻牌 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9407, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id) } }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async bitmap(f) {
        const u = await this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?c.toDataURL('image/png'):''})()`);
        if (!u) { console.log('   ⚠ 无 canvas'); return; }
        fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64'));
        console.log('   🖼', path.basename(f), fs.statSync(f).size + 'B');
    }
}
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdppb2-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2800);

    const launched = await cdp.eval(`(()=>{try{
        window.__MG_TEST=true;
        const g=((typeof GAMES!=='undefined'&&GAMES)||[]).find(x=>x.id==='pinball');
        if(!g) return 'no-game';
        if(window.MinigamesView&&window.MinigamesView.launch) window.MinigamesView.launch(g);
        else if(window.MiniGames&&window.MiniGames.launch) window.MiniGames.launch(g);
        else return 'no-launcher';
        return 'ok';
    }catch(e){return 'throw:'+e.message}})()`);
    console.log('   launch:', launched);
    await sleep(1200);
    await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)'); if(c)c.click(); return !!c})()`);
    await sleep(2200);
    console.log('— 台面全景 —');
    await cdp.bitmap(path.join(OUT, 'pb-table-1-idle.png'));

    // 发射并玩一会儿
    await cdp.eval(`(()=>{if(window.__pinball){window.__pinball.launch(0.85);} return !!window.__pinball})()`);
    await sleep(2200);
    await cdp.bitmap(path.join(OUT, 'pb-table-2-play.png'));

    // 虫洞吸入
    await cdp.eval(`(()=>{if(window.__pinball){window.__pinball.putBallAt(102,212,0,0);} return 1})()`);
    await sleep(260);
    await cdp.bitmap(path.join(OUT, 'pb-table-3-warp.png'));

    // 火箭管道上行
    await sleep(900);
    await cdp.bitmap(path.join(OUT, 'pb-table-4-tube.png'));

    // 翻牌
    await cdp.eval(`(()=>{if(window.__pinball){window.__pinball.putBallAt(140,392,0,20);} return 1})()`);
    await sleep(200);
    await cdp.eval(`(()=>{if(window.__pinball){window.__pinball.putBallAt(176,392,0,20);} return 1})()`);
    await sleep(200);
    await cdp.bitmap(path.join(OUT, 'pb-table-5-cards.png'));

    const st = await cdp.eval(`(()=>{const T=window.__pinball; return T?{score:T.score,cards:T.cards.join(),rail:T.railMode,live:T.liveCount}:null})()`);
    console.log('   状态:', JSON.stringify(st));
    proc.kill();
    console.log('完成');
    process.exit(0);
})();
