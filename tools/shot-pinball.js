/* 三维弹球实机截图：进入 → 发射 → 玩几秒 → 截台面 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9399, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id) } }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(f) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(f), fs.statSync(f).size + 'B'); }
}
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdppb-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE + '/?g=pinball' }); await sleep(2500);

    console.log('— 进入三维弹球 —');
    const ok = await cdp.eval(`(()=>{const g=GAMES.find(x=>x.id==='pinball'); if(g){MinigamesView.launch(g); return true} return false})()`);
    console.log('   launch:', ok);
    await sleep(1500);
    // 选第 1 关
    await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage .mg-ls-cell'); if(c)c.click(); return !!c})()`);
    await sleep(2000);
    const info = await cdp.eval(`(()=>{
        const cv=document.querySelector('#mini-stage canvas');
        return {canvas: !!cv, w: cv?cv.width:0, h: cv?cv.height:0,
                hud:(document.querySelector('.mg-hud')||{}).textContent||'',
                stage:(document.querySelector('#mini-stage')||{}).textContent?.slice(0,120)||''}
    })()`);
    console.log('   状态:', JSON.stringify(info));
    await cdp.shot(path.join(OUT, 'pinball-1-idle.png'));

    // 发射：按住空格蓄力再松开
    console.log('— 蓄力发射 —');
    await cdp.eval(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));return 1})()`);
    await sleep(900);
    await cdp.shot(path.join(OUT, 'pinball-2-charge.png'));
    await cdp.eval(`(()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));return 1})()`);
    await sleep(1200);
    // 玩一会儿（随机按挡板）
    for (let i = 0; i < 8; i++) {
        await cdp.eval(`(()=>{const k=${i % 2 ? "'ArrowLeft'" : "'ArrowRight'"};window.dispatchEvent(new KeyboardEvent('keydown',{code:k}));setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:k})),200);return 1})()`);
        await sleep(500);
    }
    const st = await cdp.eval(`(()=>window.__pinball?{score:window.__pinball.score,launched:window.__pinball.launched,balls:window.__pinball.balls,ball:window.__pinball.ball}:null)()`);
    console.log('   运行状态:', JSON.stringify(st));
    await cdp.shot(path.join(OUT, 'pinball-3-play.png'));
    proc.kill();
    console.log('✅ 完成');
    process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });