/* 全量小游戏巡检：逐个启动 107 款游戏，检查 JS 报错 / 渲染是否为空 / canvas 尺寸
 * 用法：
 *   node tools/smoke-all-games.js            # 全量巡检（不截图）
 *   node tools/smoke-all-games.js --shot tictactoe,snake,g2048   # 指定游戏并截图
 *   node tools/smoke-all-games.js --shot-all                     # 全部截图（107 张，慢）
 *
 * 为什么需要它：mg-*.js 系列 80+ 款游戏共用 _engine.js 的 E.bg/E.card/E.txt，
 * 改一处等于改全部 —— 必须逐个跑一遍才知道有没有画崩。
 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9403, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const MODE_SHOT = argv.includes('--shot') || argv.includes('--shot-all');
const SHOT_ONLY = argOf('--shot');

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
            else if (m.method) c.events.push(m);   // 异常/控制台类事件
        };
        return c;
    }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    // 取出并清空这段时间内的错误事件
    drainErrors() {
        const errs = [];
        for (const m of this.events) {
            if (m.method === 'Runtime.exceptionThrown') {
                const d = m.params.exceptionDetails || {};
                errs.push((d.exception && d.exception.description || d.text || 'exception').split('\n')[0].slice(0, 160));
            } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
                errs.push('console.error: ' + (m.params.args || []).map(a => a.value != null ? String(a.value) : (a.description || '')).join(' ').slice(0, 160));
            }
        }
        this.events.length = 0;
        return errs;
    }
    async shot(f) {
        const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
        return fs.statSync(f).size;
    }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpall-'));
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

    // 等 GAMES 出现（有些 chrome 启动要 3-5s），最多 8s
    let all = [];
    for (let i = 0; i < 40; i++) {
        all = await cdp.eval(`(()=>{try{return (typeof GAMES!=='undefined' && GAMES && GAMES.length)?GAMES.map(g=>g.id):[]}catch(e){return []}})()`) || [];
        if (all.length) break;
        await sleep(200);
    }
    if (!all.length) { console.error('❌ 8s 拿不到 GAMES 列表（MG.gfx 引入把加载卡住？）'); process.exit(1); }

    const targets = SHOT_ONLY ? SHOT_ONLY.split(',').map(s => s.trim()) : all;
    // emulator 是 ROM 启动器（不在 GAMES 注册），单独跳过
    const wantShot = MODE_SHOT;
    console.log(`— 共 ${all.length} 款游戏，本次处理 ${targets.length} 款（${wantShot ? '含截图' : '仅巡检'}）—\n`);

    const fail = [], okCount = { n: 0 };
    for (let i = 0; i < targets.length; i++) {
        const id = targets[i];
        // 每 25 个重载一次页面，避免长时间累积内存/监听器拖慢
        if (i > 0 && i % 25 === 0) {
            await cdp.send('Page.navigate', { url: BASE + '/?g=pinball' }); await sleep(2400); cdp.drainErrors();
        }
        const launched = await cdp.eval(`(()=>{try{
            // GAMES 是 minigames.js 里的 const，不挂 window；用 typeof 守卫而非 window.GAMES
            const g=((typeof GAMES!=='undefined'&&GAMES)||[]).find(x=>x.id===${JSON.stringify(id)});
            if(!g) return 'no-game';
            if(window.MinigamesView&&window.MinigamesView.launch) window.MinigamesView.launch(g);
            else if(window.MiniGames&&window.MiniGames.launch) window.MiniGames.launch(g);
            else if(window.OpenGame) window.OpenGame(g);
            else return 'no-launcher';
            return 'ok';
        }catch(e){return 'throw:'+e.message}})()`);
        if (launched !== 'ok') { fail.push([id, launched]); continue; }
        await sleep(420);
        // 有选关页就点第一关；无尽入口优先跳过
        await cdp.eval(`(()=>{try{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)');if(c){c.click();return 1}return 0}catch(e){return -1}})()`);
        await sleep(700);
        const probe = await cdp.eval(`(()=>{try{
            const st=document.querySelector('#mini-stage')||document.querySelector('.mini-stage');
            const cv=st?st.querySelector('canvas'):null;
            return { canvas: cv?cv.width:0, cvh: cv?cv.height:0,
                     dom: st?(st.querySelectorAll('*').length):0,
                     txt: st?((st.textContent||'').trim().length):0 };
        }catch(e){return {err:e.message}}})()`);
        const errs = cdp.drainErrors();
        const rendered = (probe.canvas > 0) || (probe.dom > 3) || (probe.txt > 8);
        if (errs.length) fail.push([id, 'JS错误: ' + errs[0]]);
        else if (!rendered) fail.push([id, `空白 (canvas=${probe.canvas} dom=${probe.dom} txt=${probe.txt})`]);
        else okCount.n++;

        if (wantShot) {
            const f = path.join(OUT, `g-${id}.png`);
            try { const sz = await cdp.shot(f); process.stdout.write(`   📷 g-${id}.png ${sz}B\n`); } catch (e) { }
        }
        process.stdout.write(`[${i + 1}/${targets.length}] ${id.padEnd(18)} canvas=${String(probe.canvas).padEnd(5)} dom=${String(probe.dom).padEnd(4)} ${errs.length ? '❌ ' + errs[0].slice(0, 70) : (rendered ? '✅' : '⚠ 空白')}\n`);
    }

    console.log(`\n=========== 汇总 ===========`);
    console.log(`总游戏数：${all.length}　通过：${okCount.n}　失败：${fail.length}`);
    if (fail.length) {
        console.log('\n❌ 失败清单：');
        fail.forEach(([id, why]) => console.log(`   ${id.padEnd(20)} ${why}`));
    } else {
        console.log('✅ 全部通过，无 JS 报错、无空白渲染');
    }
    proc.kill();
    process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
