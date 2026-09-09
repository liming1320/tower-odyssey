/* 端到端验证：100/103 个小游戏 → 50 关、3 个新游戏可启动、冒险页新按钮、50 关默认显示 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9380, BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => { http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej); }); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id) } }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(f) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(f)); }
}
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp50-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=420,900', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250) }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE }); await sleep(1500);
    await cdp.eval(`(async()=>{const n='hub50'+(Date.now()+'').slice(-5);const r=await(await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,password:'1234'})})).json();if(r.token)localStorage.setItem('game-token',r.token);return 1})()`);
    await cdp.send('Page.navigate', { url: BASE }); await sleep(1800);
    await cdp.eval(`(()=>{window._errs=[];const o=window.onerror;window.onerror=(m,s,l,c,e)=>{window._errs.push(String(m)+'@'+l);if(o)o(m,s,l,c,e);return false;}})()`);

    // 1) 大厅
    await cdp.eval(`MinigamesView.open(window.App)`); await sleep(1500);
    const hub = await cdp.eval(`(() => ({ cards: document.querySelectorAll('#mini-hub .mini-card').length, total: (document.querySelector('.section-title')||{}).textContent||'', errs: window._errs.slice(0,3) }))()`);
    console.log(`🎮 大厅卡片数: ${hub.cards} | ${hub.total.trim()} | 错 ${hub.errs.length}`);
    await cdp.shot(path.join(OUT, 'hub-100plus.png'));

    // 2) 全部游戏扫一遍：50 关 + 新 3 个能启动
    const ids = ['knife', 'sheep', 'pocketarmy', 'gomoku', 'g2048', 'chess', 'junqi', 'monopoly', 'solitaire', 'spider', 'towerdef'];
    let bad = 0;
    for (const id of ids) {
        const r = await cdp.eval(`(() => {
            try {
                window._errs = [];
                const g = GAMES.find(x => x.id === '${id}');
                if (!g) return { id: '${id}', err: 'not-in-GAMES' };
                MinigamesView.launch(g);
                const cells = document.querySelectorAll('#mini-stage .mg-ls-cell').length;
                const extra = document.querySelectorAll('#mini-stage .mg-ls-extra').length;
                const title = (document.querySelector('.mg-ls-title')||{}).textContent || '';
                return { id: '${id}', cells, endless: extra, title: title.slice(0, 20), errs: window._errs.slice(0,1) };
            } catch (e) { return { id: '${id}', err: e.message }; }
        })()`);
        const ok = (r.cells === 50 || (r.id === 'banqi' && r.cells === 15)) && !r.err && !(r.errs && r.errs.length);
        if (!ok) bad++;
        console.log(`   ${ok ? '✓' : '✗'} ${String(r.id).padEnd(12)} 关卡=${r.cells} 无尽=${r.endless ?? '-'} ${r.err ? ' ERR:' + r.err : ''}${r.errs && r.errs.length ? ' ' + JSON.stringify(r.errs) : ''}`);
        await cdp.eval(`document.getElementById('mini-back').click()`);
        await sleep(200);
    }

    // 3) 全部 103 个游戏能打开关卡选择
    const all = await cdp.eval(`(() => {
        window._errs = [];
        const bad2 = [];
        for (const g of GAMES) {
            try {
                MinigamesView.launch(g);
                const cells = document.querySelectorAll('#mini-stage .mg-ls-cell').length;
                const want = g.id === 'banqi' ? 15 : 50;
                if (cells !== want) bad2.push(g.id + ':cells=' + cells);
                document.getElementById('mini-back').click();
            } catch (e) { bad2.push(g.id + ':' + e.message); }
        }
        return { total: GAMES.length, bad: bad2, errs: window._errs.slice(0, 3) };
    })()`);
    console.log(`\n📋 全量扫描: ${all.total} 个游戏, 异常 ${all.bad.length} 个`);
    if (all.bad.length) console.log('   ⚠', JSON.stringify(all.bad).slice(0, 600));
    if (all.errs && all.errs.length) console.log('   ⚠ 页面错误:', JSON.stringify(all.errs).slice(0, 400));

    // 4) 冒险页新按钮
    await cdp.eval(`(() => { document.querySelector('[data-tab=tower]').click(); })()`); await sleep(1500);
    const towerBtn = await cdp.eval(`(() => ({ has: !!document.getElementById('btn-mini'), text: (document.getElementById('btn-mini')||{}).textContent || '' }))()`);
    console.log(`\n🎮 冒险页小游戏按钮: ${towerBtn.has ? '✓' : '✗'} ${towerBtn.text}`);
    await cdp.shot(path.join(OUT, 'tower-mini-btn.png'));

    // 5) 排行榜按钮（随便进 g2048 看 level select 页）
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='g2048'))`); await sleep(1500);
    const rankBar = await cdp.eval(`(() => ({ has: !!document.querySelector('.mg-rank-bar'), btn: !!document.querySelector('.mg-rank-bar button') }))()`);
    console.log(`🏆 排行榜条: ${rankBar.has ? '✓' : '✗'}`);
    await cdp.shot(path.join(OUT, 'g2048-50lv.png'));

    console.log(bad === 0 && all.bad.length === 0 && towerBtn.has && rankBar.has ? '\n✅ 全部通过' : '\n❌ 存在问题');
    proc.kill(); process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });