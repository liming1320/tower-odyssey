/* 多游戏聚焦探针：进入指定游戏 → 等待 → 可选交互 → 截图 → 采样像素/读状态
 * 用法：
 *   node tools/probe-games.js match3,sokoban,pocketarmy            # 默认等 3s 截图
 *   node tools/probe-games.js match3 --wait 5 --tap "0.5,0.5"      # 等比点击一次再截图
 *   node tools/probe-games.js knife --wait 6 --shot
 *
 * 与 smoke-all-games.js 的区别：后者只验证「能不能启动」，本工具用来看「画得对不对」。
 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9407, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const IDS = (argv.find(a => !a.startsWith('--')) || '').split(',').map(s => s.trim()).filter(Boolean);
const WAIT = +argOf('--wait', 3) * 1000;
const TAPS = argOf('--tap', '').split(';').map(s => s.trim()).filter(Boolean);
const SHOT = argv.includes('--shot') || true;

function getJSON(u) {
    return new Promise((res, rej) => http.get(u, r => {
        let d = ''; r.on('data', c => d += c).on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } });
    }).on('error', rej));
}
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.events = []; }
    static async connect(u) {
        const ws = new WebSocket(u);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
            else if (m.method) c.events.push(m);
        };
        return c;
    }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    drainErrors() {
        const errs = [];
        for (const m of this.events) {
            if (m.method === 'Runtime.exceptionThrown') {
                const d = m.params.exceptionDetails || {};
                errs.push((d.exception && d.exception.description || d.text || 'exception').split('\n')[0].slice(0, 200));
            } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
                errs.push('console.error: ' + (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ').slice(0, 200));
            }
        }
        this.events.length = 0; return errs;
    }
    async shot(f) {
        const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
        return fs.statSync(f).size;
    }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpprobe-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2800);
    cdp.drainErrors();

    for (const id of IDS) {
        const launched = await cdp.eval(`(()=>{try{
            const g=((typeof GAMES!=='undefined'&&GAMES)||[]).find(x=>x.id===${JSON.stringify(id)});
            if(!g) return 'no-game';
            if(window.MinigamesView&&window.MinigamesView.launch) window.MinigamesView.launch(g);
            else if(window.MiniGames&&window.MiniGames.launch) window.MiniGames.launch(g);
            else if(window.OpenGame) window.OpenGame(g);
            else return 'no-launcher';
            return 'ok';
        }catch(e){return 'throw:'+e.message}})()`);
        if (launched !== 'ok') { console.log(`❌ ${id}: ${launched}`); continue; }
        await sleep(500);
        await cdp.eval(`(()=>{try{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)');if(c){c.click();return 1}return 0}catch(e){return -1}})()`);
        await sleep(900);
        cdp.drainErrors();

        // 可选交互：--tap "0.5,0.5;0.3,0.6"（相对 canvas 的比例坐标）
        for (const tp of TAPS) {
            const [fx, fy] = tp.split(',').map(Number);
            await cdp.eval(`(()=>{const cv=document.querySelector('#mini-stage canvas');
                if(!cv) return 0; const r=cv.getBoundingClientRect();
                const x=r.left+r.width*${fx}, y=r.top+r.height*${fy};
                ['mousedown','mouseup'].forEach(t=>cv.dispatchEvent(new MouseEvent(t,{clientX:x,clientY:y,bubbles:true})));
                return 1;})()`);
            await sleep(400);
        }
        await sleep(WAIT);

        const info = await cdp.eval(`(()=>{try{
            const st=document.querySelector('#mini-stage')||document.querySelector('.mini-stage');
            const cv=st?st.querySelector('canvas'):null;
            let sample=[];
            if(cv){ const g=cv.getContext('2d');
                for(const [fx,fy] of [[0.5,0.5],[0.3,0.35],[0.7,0.6],[0.5,0.8]]){
                    try{const d=g.getImageData(Math.floor(cv.width*fx),Math.floor(cv.height*fy),1,1).data;
                        sample.push('#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join(''));}catch(e){sample.push('err')}
                }}
            return { canvas: cv?cv.width:0, cvh: cv?cv.height:0, dom: st?st.querySelectorAll('*').length:0,
                     txt: st?(st.textContent||'').trim().slice(0,160):'', sample };
        }catch(e){return {err:e.message}}})()`);
        const errs = cdp.drainErrors();
        const f = path.join(OUT, `probe-${id}.png`);
        let sz = 0; try { sz = await cdp.shot(f); } catch (e) { }
        console.log(`\n=== ${id} ===`);
        console.log(`  canvas=${info.canvas}x${info.cvh} dom=${info.dom} 采样=${(info.sample || []).join(' ')}`);
        console.log(`  文案: ${(info.txt || '').replace(/\s+/g, ' ').slice(0, 120)}`);
        console.log(`  截图: probe-${id}.png (${sz}B)  ${errs.length ? '❌ ' + errs[0] : '✅ 无报错'}`);
    }
    proc.kill();
    process.exit(0);
})();
