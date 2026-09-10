/* 2026-09-12 四项修复实机验证：
   1) 转刀「指哪走哪」——拖到哪人走到哪（红袍像素断言）
   2) 象棋棋盘格——9 列竖线齐全 + 楚河汉界中间断开
   3) 口袋奇兵射击——Math.random 固定强制出敌，验证子弹像素 + 无 tick 异常
   4) 弹球防球海——多球后台面球数封顶 4 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9413, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej)); }

let pass = 0, fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : '')); ok ? pass++ : fail++; };

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.errors = []; this.errPhase = ''; }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') c.errors.push('[' + c.errPhase + '] 异常: ' + (m.params.exceptionDetails.exception && (m.params.exceptionDetails.exception.description || m.params.exceptionDetails.exception.value) || m.params.exceptionDetails.text)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') c.errors.push('[' + c.errPhase + '] console.error: ' + JSON.stringify(m.params.args).slice(0, 160)); }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async bitmap(f) { const u = await this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?c.toDataURL('image/png'):''})()`); if (!u) { console.log('   ⚠ 无 canvas'); return; } fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); console.log('   🖼', path.basename(f), fs.statSync(f).size + 'B'); }
    async mouse(type, x, y, extra = {}) { await this.send('Input.dispatchMouseEvent', Object.assign({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }, extra)); }
    phase(p) { const n = this.errors.length; this.errPhase = p; return n; }
    async launchGame(id) {
        const r = await this.eval(`(()=>{try{
            window.__MG_TEST=true;
            const g=((typeof GAMES!=='undefined'&&GAMES)||[]).find(x=>x.id==='${id}');
            if(!g) return 'no-game';
            if(window.MinigamesView&&window.MinigamesView.launch) window.MinigamesView.launch(g);
            else if(window.MiniGames&&window.MiniGames.launch) window.MiniGames.launch(g);
            else return 'no-launcher';
            return 'ok';
        }catch(e){return 'throw:'+e.message}})()`);
        if (r !== 'ok') throw new Error('launch ' + id + ': ' + r);
        await sleep(1000);
        await this.eval(`(()=>{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)'); if(c)c.click(); return !!c})()`);
        await sleep(1400);
    }
    canvasInfo() { return this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); if(!c)return null; const r=c.getBoundingClientRect(); return {l:r.left,t:r.top,w:r.width,h:r.height,iw:c.width,ih:c.height}})()`); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpvfy-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });

    /* ════ 1. 鸠摩智转刀：指哪走哪 ════ */
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2800);
    let e0 = cdp.phase('knife');
    await cdp.launchGame('knife');
    const ci = await cdp.canvasInfo();
    const toClient = (x, y) => ({ x: ci.l + x / 360 * ci.w, y: ci.t + y / 520 * ci.h });
    // 按住（在角色出发点）→ 拖到 (100,150) → 持续按住 2s
    const A = toClient(180, 300), B = toClient(100, 150);
    await cdp.mouse('mousePressed', A.x, A.y);
    for (let k = 1; k <= 6; k++) {
        const x = A.x + (B.x - A.x) * k / 6, y = A.y + (B.y - A.y) * k / 6;
        await cdp.mouse('mouseMoved', x, y, { buttons: 1 }); await sleep(60);
    }
    await sleep(600);
    await cdp.bitmap(path.join(OUT, 'vfy-knife-drag.png'));       // 按住中：金色目标环 + 角色正在赶路
    await sleep(900);
    const knifeScan = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); const g=c.getContext('2d');
        const sc=c.width/360;
        const redIn=(x0,y0,x1,y1)=>{let n=0;for(let y=y0;y<=y1;y+=2)for(let x=x0;x<=x1;x+=2){const d=g.getImageData(Math.round(x*sc),Math.round(y*sc),1,1).data;if(d[0]>170&&d[1]<115&&d[2]<115)n++;}return n;};
        return {atTarget:redIn(60,110,140,190),atStart:redIn(145,265,215,335)};})()`);
    await cdp.mouse('mouseReleased', B.x, B.y);
    check('转刀：角色走到手指位置（红袍出现在目标区）', knifeScan && knifeScan.atTarget >= 25, 'red@target=' + (knifeScan && knifeScan.atTarget));
    check('转刀：角色离开出发点', knifeScan && knifeScan.atStart < 25, 'red@start=' + (knifeScan && knifeScan.atStart));
    check('转刀：无 JS 异常', cdp.errors.length === e0, cdp.errors.slice(e0).join(' | ') || 'clean');

    /* ════ 2. 中国象棋：棋盘格 ════ */
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2600);
    e0 = cdp.phase('xiangqi');
    await cdp.launchGame('xiangqi');
    await cdp.bitmap(path.join(OUT, 'vfy-xiangqi-board.png'));
    const board = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); if(!c)return null; const g=c.getContext('2d');
        const sc=c.width/416;
        const dark=(x,y)=>{const d=g.getImageData(Math.round(x*sc),Math.round(y*sc),1,1).data;return (d[0]+d[1]+d[2])<300;};
        const colHas=(j,y)=>{for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)if(dark(10+j*44+dx,y+dy))return true;return false;};
        const top=[],river=[];
        for(let j=0;j<9;j++){top.push(colHas(j,121));river.push(colHas(j,193));}
        return {top,river};})()`);
    check('象棋：上半场 9 列竖线全部存在', board && board.top.every(v => v), JSON.stringify(board && board.top));
    check('象棋：中间 7 列在楚河汉界处断开', board && board.river.slice(1, 8).every(v => !v), JSON.stringify(board && board.river));
    check('象棋：两侧边线纵贯河界', board && board.river[0] && board.river[8], JSON.stringify(board && board.river));
    check('象棋：无 JS 异常', cdp.errors.length === e0, cdp.errors.slice(e0).join(' | ') || 'clean');

    /* ════ 3. 口袋奇兵：自动射击 ════ */
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2600);
    e0 = cdp.phase('pocketarmy');
    await cdp.launchGame('pocketarmy');
    await cdp.eval(`(()=>{window.__origRandom=Math.random; Math.random=()=>0.95; return 1})()`);   // 强制障碍全为敌人
    await sleep(3200);
    const paScan = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); const g=c.getContext('2d');
        const sc=c.width/360; let n=0;
        for(let y=120;y<=400;y+=2)for(let x=0;x<360;x+=2){const d=g.getImageData(Math.round(x*sc),Math.round(y*sc),1,1).data;if(d[0]>230&&d[1]>195&&d[2]<185)n++;}
        return n;})()`);
    await cdp.bitmap(path.join(OUT, 'vfy-pocketarmy-fire.png'));
    await cdp.eval(`(()=>{Math.random=window.__origRandom||Math.random; return 1})()`);
    await sleep(400);
    const alive = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?1:0})()`);
    check('口袋奇兵：士兵自动射出黄色子弹', paScan >= 8, 'yellowPx=' + paScan);
    check('口袋奇兵：游戏未冻结（canvas 存活且无异常）', alive === 1 && cdp.errors.length === e0, cdp.errors.slice(e0).join(' | ') || 'clean');

    /* ════ 4. 三维弹球：防球海 ════ */
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2600);
    e0 = cdp.phase('pinball');
    await cdp.launchGame('pinball');
    const st1 = await cdp.eval(`(()=>{const T=window.__pinball; if(!T)return null; T.launch(0.8); return 1})()`);
    await sleep(1200);
    const mb = await cdp.eval(`(()=>{const T=window.__pinball; if(!T)return null; T.startMultiball(3); return {live:T.liveCount}})()`);
    await sleep(2600);
    await cdp.bitmap(path.join(OUT, 'vfy-pinball-mb.png'));
    const st2 = await cdp.eval(`(()=>{const T=window.__pinball; return T?{live:T.liveCount,score:T.score}:null})()`);
    check('弹球：多球开启（4 颗）', mb && mb.live === 4, 'live=' + (mb && mb.live));
    check('弹球：运行后球数仍封顶 ≤4', st2 && st2.live >= 1 && st2.live <= 4, 'live=' + (st2 && st2.live));
    check('弹球：无 JS 异常', cdp.errors.length === e0, cdp.errors.slice(e0).join(' | ') || 'clean');

    proc.kill();
    console.log(`\n${pass} 通过 · ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
