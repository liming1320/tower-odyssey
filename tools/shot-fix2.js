/* 精简冒烟：1) 2048 第 1 关 HUD 目标文本；2) 后台排序页中文名 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9395, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d=''; r.on('data', c=>d+=c); r.on('end', ()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws=ws; this.id=0; this.waiters=new Map(); }
    static async connect(u){const ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});const c=new CDP(ws);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&c.waiters.has(m.id)){c.waiters.get(m.id)(m);c.waiters.delete(m.id)}};return c;}
    send(m,p={}){const id=++this.id;this.ws.send(JSON.stringify({id,method:m,params:p}));return new Promise(r=>this.waiters.set(id,r));}
    async eval(e){const r=await this.send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.result&&r.result.result?r.result.result.value:undefined;}
    async click(x, y) {
        for (const type of ['mousePressed', 'mouseReleased'])
            await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    async shot(f){const r=await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(f,Buffer.from(r.result.data,'base64'));console.log('   📷',path.basename(f));}
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpfix2-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
    let t=null;
    for (let i=0;i<40;i++){try{t=await getJSON(`http://127.0.0.1:${PORT}/json/list`);if(t&&t.length)break;}catch(e){}await sleep(250);}
    const cdp=await CDP.connect(t.find(x=>x.type==='page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // 注册登录玩家
    await cdp.send('Page.navigate', { url: BASE }); await sleep(1200);
    await cdp.eval(`(async()=>{const n='fix2'+(Date.now()+'').slice(-6);
        const r=await(await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,password:'1234'})})).json();
        if(r.token)localStorage.setItem('game-token',r.token);return n})()`);
    await cdp.send('Page.navigate', { url: BASE }); await sleep(1500);

    // 进入 2048 第 1 关
    await cdp.send('Page.navigate', { url: BASE + '?g=g2048' }); await sleep(1800);
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='g2048'))`); await sleep(2500);
    // 直接调 start（不走 click），并捕获错误
    const startRet = await cdp.eval(`(()=>{try{const r=MiniGames.g2048.start(document.querySelector('#mini-stage'),{levelIdx:0,totalLevels:50,onScore:s=>document.title=s,onComplete:()=>{},onBack:()=>{},endless:false});return {ok:true,canvas:document.querySelectorAll('#mini-stage canvas').length,type:typeof r, hasN: typeof r === 'object' ? !!r.stop : false};}catch(e){return {ok:false,err:e.message,line:(e.stack||'').split('\\n')[1]||''}}})()`);
    console.log('   启动 2048 start 返回:', JSON.stringify(startRet));
    await sleep(800);
    const hud2048 = await cdp.eval(`document.title||''`);
    const hasCanvas = await cdp.eval(`document.querySelectorAll('#mini-stage canvas').length`);
    console.log(`   2048 canvas=${hasCanvas}  HUD=${hud2048}`);
    await cdp.shot(path.join(OUT, 'fix2-2048.png'));

    // 落几子验证 2048 能合并 + 提升等级
    await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas');const r=c.getBoundingClientRect();window.__cvBox={x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    const cvBox = await cdp.eval(`window.__cvBox`);
    const SIZE = cvBox.w / 4;  // 第 1 关 4×4
    // 模拟按键 4 次左，让两颗 L1 凑到一起合并
    for (let k = 0; k < 5; k++) {
        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}))`); await sleep(280);
    }
    const maxL = await cdp.eval(`document.title||''`);
    console.log(`   2048 操作 5 步后 HUD=${maxL}`);
    await cdp.shot(path.join(OUT, 'fix2-2048-mid.png'));

    // 五子棋第 50 关：直接 start
    await cdp.send('Page.navigate', { url: BASE + '?g=gomoku' }); await sleep(1200);
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='gomoku'))`); await sleep(1500);
    const gRet = await cdp.eval(`(()=>{try{MiniGames.gomoku.start(document.querySelector('#mini-stage'),{levelIdx:49,totalLevels:50,onScore:s=>document.title=s,onComplete:r=>window.__gEnd=r,onBack:()=>{}});return {ok:true,canvas:document.querySelectorAll('#mini-stage canvas').length}}catch(e){return {ok:false,err:e.message,line:(e.stack||'').split('\\n')[1]||''}}})()`);
    console.log(`   gomoku 第 50 关 start:`, JSON.stringify(gRet));
    await sleep(700);
    await cdp.shot(path.join(OUT, 'fix2-gomoku.png'));
    // 模拟落子（点击棋盘中心位置）
    const gbox = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas');const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    for (const [px, py] of [[0.5, 0.5], [0.55, 0.45], [0.45, 0.55]]) {
        const S = gbox.w / 15;
        const x = gbox.x + 8 + px * 15 * S, y = gbox.y + 8 + py * 15 * S;
        await cdp.click(x, y); await sleep(450);
    }
    await sleep(500);
    await cdp.shot(path.join(OUT, 'fix2-gomoku-mid.png'));
    const ghud = await cdp.eval(`document.title||''`);
    console.log(`   gomoku 操作后 HUD=${ghud}`);

    // 后台登录 + 排序页
    await cdp.send('Page.navigate', { url: BASE + '/admin' }); await sleep(1200);
    await cdp.eval(`(async()=>{const r=await(await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'workbuddy'})})).json();
        if(r.token)localStorage.setItem('admin-token',r.token)})()`);
    await cdp.send('Page.navigate', { url: BASE + '/admin' }); await sleep(1400);
    await cdp.eval(`document.querySelector('[data-t="order"]').click()`); await sleep(1200);
    const info = await cdp.eval(`(()=>{const rows=[...document.querySelectorAll('.ord-row')].slice(0,5).map(e=>e.textContent.replace(/\\s+/g,' ').trim());
        return {n:document.querySelectorAll('.ord-row').length, sample:rows}})()`);
    console.log(`   后台排序 ${info.n} 项，前 5：${info.sample.join(' | ')}`);
    await cdp.shot(path.join(OUT, 'fix2-order.png'));

    proc.kill(); process.exit(0);
})().catch(e=>{console.error('✗',e.message);process.exit(1);});