/* 大富翁端到端冒烟：进入第 1 关 → 掷几轮 → 截图 → 退出再进入验证自动存档 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9397, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id) } }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(f) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(f)); }
}
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpmgy-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) {} await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE + '/?g=monopoly' }); await sleep(2500);

    console.log('— 打开小游戏大厅并进入大富翁 —');
    await cdp.eval(`(()=>{const g=GAMES.find(x=>x.id==='monopoly'); if(g) MinigamesView.launch(g); return !!g})()`);
    await sleep(1800);
    // 选第 1 关
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(2000);
    const info1 = await cdp.eval(`(()=>{const w=document.querySelector('.mgy-wrap');return {has:!!w, cells:document.querySelectorAll('.mgy-cell').length, players:document.querySelectorAll('.mgy-pcard').length, msg:(document.querySelector('.mgy-msg')||{}).textContent||''}})()`);
    console.log('   容器:', JSON.stringify(info1));
    await cdp.shot(path.join(OUT, 'mgy-1-start.png'));

    // 玩家回合：连续点「掷骰 / 买地 / 结束回合」若干次，让 AI 也走几轮
    console.log('— 模拟玩家操作 12 步 —');
    for (let i = 0; i < 12; i++) {
        const acted = await cdp.eval(`(()=>{
            const btns=[...document.querySelectorAll('.mgy-acts button')];
            const pick=btns.find(b=>/掷骰/.test(b.textContent)) || btns.find(b=>/买下/.test(b.textContent)) || btns.find(b=>/结束回合/.test(b.textContent));
            if(pick){pick.click();return pick.textContent.trim()}
            return null;})()`);
        await sleep(1100);
        if (acted) console.log('   点击:', acted);
    }
    const info2 = await cdp.eval(`(()=>{const S=MiniGames.monopoly._debug.S;return {round:S.round,turn:S.turn,cash:S.players.map(p=>p.cash),own:S.own.filter(x=>x>0).length}})()`);
    console.log('   状态:', JSON.stringify(info2));
    await cdp.shot(path.join(OUT, 'mgy-2-playing.png'));

    // 退出（点返回）→ 再进入，验证自动存档
    console.log('— 退出后重新进入，验证自动存档 —');
    await cdp.eval(`document.querySelector('#mini-back').click()`);
    await sleep(600);
    await cdp.eval(`(()=>{const g=GAMES.find(x=>x.id==='monopoly'); MinigamesView.launch(g);})()`);
    await sleep(1500);
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(1800);
    const info3 = await cdp.eval(`(()=>{const S=MiniGames.monopoly._debug.S;return {resumed:(document.querySelector('.mgy-msg')||{}).textContent||'', round:S.round, cash:S.players.map(p=>p.cash), own:S.own.filter(x=>x>0).length}})()`);
    console.log('   重进后:', JSON.stringify(info3));
    await cdp.shot(path.join(OUT, 'mgy-3-resume.png'));

    // 打开建楼弹窗（找一块自己的地直接调 showBuild 不便，这里只截当前状态）
    proc.kill(); process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
