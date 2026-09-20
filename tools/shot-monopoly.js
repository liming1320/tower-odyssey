/* 大富翁端到端冒烟（桌面端 1440×900）：进入第 1 关 → 掷几轮 → 截图 → 退出再进入验证自动存档
   并断言：11×11 方盘渲染出 40 格、棋盘占满舞台高度、无横向溢出、无 JS 报错 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9399, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.onEvent = null; }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id) } else if (c.onEvent) c.onEvent(m); }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(f) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(f)); }
}
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpmgy-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) {} await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    const errors = [];
    cdp.onEvent = m => {
        if (m.method === 'Runtime.exceptionThrown') { try { errors.push('exception: ' + (m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text)); } catch (e) {} }
        if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) { try { errors.push(m.params.type + ': ' + m.params.args.map(a => a.value || a.description || '').join(' ')); } catch (e) {} }
    };
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: BASE + '/?g=monopoly' }); await sleep(2500);

    console.log('— 打开小游戏大厅并进入大富翁 —');
    await cdp.eval(`(()=>{const g=GAMES.find(x=>x.id==='monopoly'); if(g) MinigamesView.launch(g); return !!g})()`);
    await sleep(1800);
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(2000);
    const info1 = await cdp.eval(`(()=>{
        const wrap=document.querySelector('.mgy-wrap.mono');
        const board=document.querySelector('.mgy-board');
        const cells=document.querySelectorAll('.mgy-cell');
        const stage=document.querySelector('#mini-stage');
        const r=board?board.getBoundingClientRect():null;
        const sr=stage?stage.getBoundingClientRect():null;
        return {
            hasWrap:!!wrap, hasBoard:!!board, cellCount:cells.length,
            boardW:r?Math.round(r.width):0, boardH:r?Math.round(r.height):0,
            stageW:sr?Math.round(sr.width):0, stageH:sr?Math.round(sr.height):0,
            fillH: sr&&r? +(r.height/sr.height).toFixed(2):0,
            fillW: sr&&r? +(r.width/sr.width).toFixed(2):0,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
            msg:(document.querySelector('.mgy-msg')||{}).textContent||''
        };
    })()`);
    console.log('   棋盘渲染:', JSON.stringify(info1));
    await cdp.shot(path.join(OUT, 'mgy-desktop-1-start.png'));

    console.log('— 强制建楼，验证 3D 立体楼宇 —');
    const cubeInfo = await cdp.eval(`(()=>{
        const dbg=MiniGames.monopoly._debug, CE=dbg.CELLS, S=dbg.S;
        const props=[]; for(let i=0;i<CE.length;i++) if(CE[i].t==='prop') props.push(i);
        props.slice(0,7).forEach((i,k)=>{ S.own[i]=k%2; S.lv[i]=(k===1?5:(k%4)+1); S.mort[i]=false; });
        try{ dbg.render(); }catch(e){ return {err:String(e&&e.stack||e)}; }
        return { cubes:document.querySelectorAll('.mono-cube').length,
                 hotel:document.querySelectorAll('.mono-cube.hotel').length,
                 deco:document.querySelectorAll('.mgy-center .mono-deco').length };
    })()`);
    console.log('   楼宇:', JSON.stringify(cubeInfo));
    await cdp.shot(path.join(OUT, 'mgy-desktop-4-buildings.png'));

    console.log('— 模拟玩家操作 14 步 —');
    for (let i = 0; i < 14; i++) {
        const acted = await cdp.eval(`(()=>{
            const btns=[...document.querySelectorAll('.mgy-acts button')];
            const pick=btns.find(b=>/掷骰/.test(b.textContent)) || btns.find(b=>/买下/.test(b.textContent)) || btns.find(b=>/结束回合/.test(b.textContent)) || btns.find(b=>/用免罪卡/.test(b.textContent)) || btns.find(b=>/付/.test(b.textContent));
            if(pick){pick.click();return pick.textContent.trim()}
            return null;})()`);
        await sleep(1000);
        if (acted) console.log('   点击:', acted);
    }
    const info2 = await cdp.eval(`(()=>{const S=MiniGames.monopoly._debug.S;return {round:S.round,turn:S.turn,cash:S.players.map(p=>p.cash),own:S.own.filter(x=>x>0).length, msg:(document.querySelector('.mgy-msg')||{}).textContent||''}})()`);
    console.log('   状态:', JSON.stringify(info2));
    await cdp.shot(path.join(OUT, 'mgy-desktop-2-playing.png'));

    console.log('— 退出后重新进入，验证自动存档 —');
    await cdp.eval(`document.querySelector('#mini-back').click()`);
    await sleep(600);
    await cdp.eval(`(()=>{const g=GAMES.find(x=>x.id==='monopoly'); MinigamesView.launch(g);})()`);
    await sleep(1500);
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(1800);
    const info3 = await cdp.eval(`(()=>{const S=MiniGames.monopoly._debug.S;return {resumed:(document.querySelector('.mgy-msg')||{}).textContent||'', round:S.round, cash:S.players.map(p=>p.cash), own:S.own.filter(x=>x>0).length}})()`);
    console.log('   重进后:', JSON.stringify(info3));
    await cdp.shot(path.join(OUT, 'mgy-desktop-3-resume.png'));

    console.log('\n=== 断言 ===');
    const okCells = info1.cellCount === 40;
    const okBig = info1.boardH >= 480 && info1.fillH >= 0.55;
    const okNoOverflow = !info1.overflowX;
    const okNoErr = errors.length === 0;
    console.log('40 格方盘:', okCells ? '✓' : '✗ (' + info1.cellCount + ')');
    console.log('棋盘足够大(高≥480 且占舞台≥55%):', okBig ? '✓' : '✗ (H=' + info1.boardH + ' fillH=' + info1.fillH + ')');
    const okCubes = !!(cubeInfo && cubeInfo.cubes > 0 && cubeInfo.hotel > 0);
    console.log('无横向溢出:', okNoOverflow ? '✓' : '✗');
    console.log('3D 立体楼宇渲染:', okCubes ? '✓' : '✗ → ' + JSON.stringify(cubeInfo));
    console.log('无 JS 报错:', okNoErr ? '✓' : '✗ → ' + errors.slice(0, 5).join(' | '));
    if (errors.length) console.log('   报错明细:\n   ' + errors.join('\n   '));
    console.log(okCells && okBig && okCubes && okNoOverflow && okNoErr ? '\n✅ 桌面端大富翁渲染通过' : '\n❌ 存在问题需修复');

    proc.kill(); process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
