/* 画布诊断：启动指定游戏，等待渲染后输出 canvas 的几何信息与像素采样，
 * 判断「smoke 截图空白」是渲染 bug 还是 headless 截图假象。
 * 用法：node tools/probe-canvas.js slide15 reaction piano
 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9411, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ids = process.argv.slice(2);
if (!ids.length) { console.error('用法: node tools/probe-canvas.js <gameId...>'); process.exit(1); }

function getJSON(u) {
    return new Promise((res, rej) => http.get(u, r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } });
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
        this.events.length = 0;
        return errs;
    }
    async shot(f) {
        const r = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
        return fs.statSync(f).size;
    }
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpprobe-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2600);
    cdp.drainErrors();

    for (const id of ids) {
        const launched = await cdp.eval(`(()=>{try{
            const g=((typeof GAMES!=='undefined'&&GAMES)||[]).find(x=>x.id===${JSON.stringify(id)});
            if(!g) return 'no-game';
            window.MinigamesView.launch(g);
            return 'ok';
        }catch(e){return 'throw:'+e.message}})()`);
        if (launched !== 'ok') { console.log(id, 'launch失败:', launched); continue; }
        await sleep(500);
        await cdp.eval(`(()=>{try{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)');if(c){c.click();return 1}return 0}catch(e){return -1}})()`);
        await sleep(2000);   // 给足渲染时间
        const diag = await cdp.eval(`(()=>{try{
            const st=document.querySelector('#mini-stage');
            const cv=st&&st.querySelector('canvas');
            if(!cv) return JSON.stringify({canvas:false, domN: st?st.querySelectorAll('*').length:-1, txt:(st?(st.textContent||'').trim().slice(0,80):'')});
            const r=cv.getBoundingClientRect();
            const sr=st.getBoundingClientRect();
            const ctx=cv.getContext('2d');
            let corner='',center='',paintWords='';
            try{const d=ctx.getImageData(0,0,1,1).data;corner=[d[0],d[1],d[2],d[3]].join(',');}catch(e){corner='err:'+e.message}
            try{const w=cv.width,h=cv.height;const d2=ctx.getImageData(Math.floor(w/2),Math.floor(h/2),1,1).data;center=[d2[0],d2[1],d2[2],d2[3]].join(',');}catch(e){center='err:'+e.message}
            try{
                // 统计非透明像素比例（抽样 400 点）
                const w=cv.width,h=cv.height;const img=ctx.getImageData(0,0,w,h);let op=0,n=0;
                for(let i=0;i<img.data.length;i+=4*(Math.max(1,Math.floor(img.data.length/4/400))*4)){n++;if(img.data[i+3]>10)op++;}
                paintWords='opaquePct='+Math.round(op/Math.max(1,n)*100)+'%';
            }catch(e){paintWords='err:'+e.message}
            return JSON.stringify({canvas:true, backing:[cv.width,cv.height], display:{w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x-sr.x),y:Math.round(r.y-sr.y)}, stage:{w:Math.round(sr.width),h:Math.round(sr.height)}, corner, center, paintWords, styleW:cv.style.width, styleH:cv.style.height});
        }catch(e){return 'err:'+e.message}})()`);
        const errs = cdp.drainErrors();
        console.log('====', id, 'launch=' + launched);
        console.log('  diag:', diag);
        if (errs.length) console.log('  JS错误:', errs.slice(0, 3).join(' | ')); else console.log('  JS错误: 无');
        const f = path.join(OUT, `probe-${id}.png`);
        const sz = await cdp.shot(f);
        console.log('  截图:', `probe-${id}.png`, sz + 'B（viewport 截图，非 beyondViewport）');
        // 返回选关，准备下一个
        await cdp.eval(`(()=>{try{const b=document.getElementById('mini-back');if(b)b.click();return 1}catch(e){return 0}})()`);
        await sleep(400);
    }
    proc.kill();
    process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
