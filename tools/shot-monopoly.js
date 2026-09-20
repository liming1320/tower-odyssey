/* 大富翁端到端冒烟（桌面端 1440×900）：进入第 1 关 → 验证真 3D 场景 → 强制建楼 → 模拟掷骰 → 截图 → 退出再进入验证自动存档
   并断言：Three.js 加载、WebGL canvas 存在、40 格 + 4 小人、立体楼宇/酒店可见、棋子随移动更新目标、无 JS 报错 */
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
    async shotClip(f, clip) { const r = await this.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(f)); }
}
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpmgy-'));
    const proc = spawn(CHROME, ['--headless=new', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
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

    console.log('— 等待 Three.js / WebGL 场景就绪 —');
    let ready = false;
    for (let i = 0; i < 40; i++) {
        ready = await cdp.eval(`(()=>{ try { if(!window.THREE) return false; const dbg=MiniGames.monopoly._debug; return !!(dbg && dbg.gl && dbg.gl().hasBoard && dbg.raf() !== 0 && document.querySelector('.mono-canvas')); } catch(e){ return false; } })()`);
        if (ready) break; await sleep(300);
    }
    await sleep(600);   // 让渲染循环跑几帧
    const info1 = await cdp.eval(`(()=>{
        const dbg=MiniGames.monopoly._debug, gl=dbg.gl();
        const cv=document.querySelector('.mono-canvas'); const stage=document.querySelector('#mini-stage');
        const r=cv?cv.getBoundingClientRect():null; const sr=stage?stage.getBoundingClientRect():null;
        return { three:gl.three, threeRev:gl.threeRev, tiles:gl.tiles, pawns:gl.pawns, hasBoard:gl.hasBoard, deco:gl.deco,
            raf:dbg.raf(), draws:dbg.drawCalls(),
            emblem:((document.querySelector('.mono-emblem')||{}).textContent||'').trim(),
            hasCanvas:!!cv, canvasW:r?Math.round(r.width):0, canvasH:r?Math.round(r.height):0,
            stageW:sr?Math.round(sr.width):0, stageH:sr?Math.round(sr.height):0,
            fillH: sr&&r? +(r.height/sr.height).toFixed(2):0,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    })()`);
    console.log('   场景:', JSON.stringify(info1));
    await cdp.shot(path.join(OUT, 'mgy-3d-1-start.png'));

    console.log('— 强制建楼，验证 3D 立体楼宇 + 酒店 —');
    const cubeInfo = await cdp.eval(`(()=>{
        const dbg=MiniGames.monopoly._debug, S=dbg.S, CE=dbg.CELLS;
        const props=[]; for(let i=0;i<CE.length;i++) if(CE[i].t==='prop') props.push(i);
        props.slice(0,8).forEach((i,k)=>{ S.own[i]=(k%4)+1; S.lv[i]=(k===2?5:(k%3)+1); S.mort[i]=false; });
        try{ dbg.render(); }catch(e){ return {err:String(e&&e.stack||e)}; }
        const hotelIdx=props[2];
        return { vis:dbg.visBld(), hotel: dbg.blv(hotelIdx)? dbg.blv(hotelIdx).hotel : null,
                 slotsVisible: dbg.blv(props[1])? dbg.blv(props[1]).slots.filter(x=>x).length : -1 };
    })()`);
    console.log('   楼宇:', JSON.stringify(cubeInfo));
    await cdp.shot(path.join(OUT, 'mgy-3d-2-buildings.png'));

    console.log('— 验证棋子随移动更新目标 —');
    const pawnInfo = await cdp.eval(`(()=>{
        const dbg=MiniGames.monopoly._debug, S=dbg.S;
        S.players[0].pos=0; dbg.render(); const a=dbg.pawnTarget()[0];
        S.players[0].pos=4; dbg.render(); const b=dbg.pawnTarget()[0];
        return { a, b };
    })()`);
    console.log('   棋子目标:', JSON.stringify(pawnInfo));
    await cdp.shot(path.join(OUT, 'mgy-3d-3-pawn.png'));
    const br = await cdp.eval("(()=>{const r=document.querySelector('.mgy-board').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
    await cdp.shotClip(path.join(OUT, 'mgy-3d-3b-board-zoom.png'), { x: Math.max(0, br.x), y: Math.max(0, br.y), width: br.w, height: br.h, scale: 1.7 });
    const ps = await cdp.eval(`(()=>MiniGames.monopoly._debug.pawnScreen())()`);
    console.log('   小人屏幕坐标:', JSON.stringify(ps));
    const p0 = ps && ps[0] ? ps[0] : { x: 0, y: 0 };
    await cdp.shotClip(path.join(OUT, 'mgy-3d-3c-pawn-zoom.png'), { x: Math.max(0, br.x + p0.x - 160), y: Math.max(0, br.y + p0.y - 160), width: 320, height: 320, scale: 2.4 });

    console.log('— 验证相机控制按钮（放大/缩小/旋转/复位）—');
    const camB0 = await cdp.eval(`(()=>{ const c=MiniGames.monopoly._debug.camPos(); return {az:+c.az.toFixed(3), rad:+c.rad.toFixed(2)} })()`);
    await cdp.eval(`document.querySelector('.mono-camctl button[data-a="zin"]').click()`);
    const camBz = await cdp.eval(`(()=>{ const c=MiniGames.monopoly._debug.camPos(); return {az:+c.az.toFixed(3), rad:+c.rad.toFixed(2)} })()`);
    await cdp.eval(`document.querySelector('.mono-camctl button[data-a="rr"]').click()`);
    const camBr = await cdp.eval(`(()=>{ const c=MiniGames.monopoly._debug.camPos(); return {az:+c.az.toFixed(3), rad:+c.rad.toFixed(2)} })()`);
    await cdp.eval(`document.querySelector('.mono-camctl button[data-a="reset"]').click()`);
    const camBx = await cdp.eval(`(()=>{ const c=MiniGames.monopoly._debug.camPos(); return {az:+c.az.toFixed(3), rad:+c.rad.toFixed(2)} })()`);
    console.log('   按钮: 放大→', JSON.stringify(camBz), ' 右转→', JSON.stringify(camBr), ' 复位→', JSON.stringify(camBx));
    const camBtnRes = camBz.rad < camB0.rad - 0.1 && Math.abs(camBr.az - camBz.az) > 0.1 && Math.abs(camBx.az - camB0.az) < 0.01;

    console.log('— 模拟玩家操作 14 步（小人行走 + 拖拽视角不报错）—');
    const cellBefore = await cdp.eval(`(()=>MiniGames.monopoly._debug.pawnCell()[0])()`);
    // 先模拟一次拖拽旋转，确保相机控制不抛错
    const camBefore = await cdp.eval(`(()=>{ const dbg=MiniGames.monopoly._debug; const c=dbg.camPos(); return {az:+c.az.toFixed(3), rad:+c.rad.toFixed(2)} })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 450, button: 'left', clickCount: 0 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 820, y: 470 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y: 470 });
    const camAfter = await cdp.eval(`(()=>{ const dbg=MiniGames.monopoly._debug; const c=dbg.camPos(); return {az:+c.az.toFixed(3), rad:+c.rad.toFixed(2)} })()`);
    console.log('   相机(拖拽前→后):', JSON.stringify(camBefore), '->', JSON.stringify(camAfter));

    for (let i = 0; i < 14; i++) {
        const acted = await cdp.eval(`(()=>{
            const btns=[...document.querySelectorAll('.mgy-acts button')];
            const pick=btns.find(b=>/掷骰/.test(b.textContent)) || btns.find(b=>/买下/.test(b.textContent)) || btns.find(b=>/结束回合/.test(b.textContent)) || btns.find(b=>/用免罪卡/.test(b.textContent)) || btns.find(b=>/付/.test(b.textContent));
            if(pick){pick.click();return pick.textContent.trim()}
            return null;})()`);
        await sleep(1000);
        if (acted) console.log('   点击:', acted);
    }
    const info2 = await cdp.eval(`(()=>{const S=MiniGames.monopoly._debug.S;return {round:S.round,turn:S.turn,cash:S.players.map(p=>p.cash),own:S.own.filter(x=>x>0).length, over:S.over, msg:(document.querySelector('.mgy-msg')||{}).textContent||''}})()`);
    console.log('   状态:', JSON.stringify(info2));
    // 等所有行走动画队列排空（AI 可能刚起步行进），再判定落点与残留
    let qwait = 0;
    while (qwait++ < 60) {
        const q = await cdp.eval(`(()=>MiniGames.monopoly._debug.pawnQueueLen())()`);
        if (Array.isArray(q) && q.every(n => n === 0)) break;
        await sleep(100);
    }
    const cellAfter = await cdp.eval(`(()=>MiniGames.monopoly._debug.pawnCell()[0])()`);
    const qTail = await cdp.eval(`(()=>MiniGames.monopoly._debug.pawnQueueLen())()`);
    console.log('   小人落点(操作前→后):', cellBefore, '→', cellAfter, ' 动画队列残留:', JSON.stringify(qTail));
    await cdp.shot(path.join(OUT, 'mgy-3d-4-playing.png'));

    console.log('— 退出后重新进入，验证自动存档 —');
    await cdp.eval(`document.querySelector('#mini-back').click()`);
    await sleep(600);
    await cdp.eval(`(()=>{const g=GAMES.find(x=>x.id==='monopoly'); MinigamesView.launch(g);})()`);
    await sleep(1500);
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(1800);
    const info3 = await cdp.eval(`(()=>{const S=MiniGames.monopoly._debug.S;return {resumed:(document.querySelector('.mgy-msg')||{}).textContent||'', round:S.round, cash:S.players.map(p=>p.cash), own:S.own.filter(x=>x>0).length}})()`);
    console.log('   重进后:', JSON.stringify(info3));
    await cdp.shot(path.join(OUT, 'mgy-3d-5-resume.png'));

    console.log('\n=== 断言 ===');
    const okThree = !!(info1.three && info1.threeRev);
    const okLoop = info1.raf !== 0 && info1.draws > 0 && !info1.emblem;   // 渲染循环在跑 + 真有绘制调用 + 无错误文案
    const okCanvas = info1.hasCanvas && info1.canvasW >= 200 && info1.canvasH >= 200;
    const okTiles = info1.tiles === 40;
    const okPawns = info1.pawns === 4;
    const okDeco = info1.deco >= 8;
    const okBld = !!(cubeInfo && cubeInfo.vis > 0 && cubeInfo.hotel === true);
    const okPawn = !!(pawnInfo && pawnInfo.b === 4 && pawnInfo.b !== pawnInfo.a);
    const okPawnVis = Array.isArray(ps) && ps.length === 4 && ps.every(p => p.vis && p.x >= 4 && p.x <= info1.canvasW - 4 && p.y >= 4 && p.y <= info1.canvasH - 4);
    const okCam = !!camAfter && (camAfter.az !== camBefore.az || camAfter.rad !== camBefore.rad);
    const okCamBtn = camBtnRes;
    const okWalk = cellAfter !== cellBefore;
    const okNoQ = Array.isArray(qTail) && qTail.every(n => n === 0);
    const okPlay = !!info2 && info2.round >= 1 && !info2.over;
    const okNoErr = errors.length === 0;
    console.log('Three.js 已加载:', okThree ? '✓' : '✗ (' + info1.threeRev + ')');
    console.log('渲染循环运行 + 有绘制调用:', okLoop ? '✓' : '✗ → raf=' + info1.raf + ' draws=' + info1.draws + ' emblem="' + info1.emblem + '"');
    console.log('WebGL canvas 存在且尺寸足够:', okCanvas ? '✓' : '✗ (' + info1.canvasW + 'x' + info1.canvasH + ')');
    console.log('40 格场景:', okTiles ? '✓' : '✗ (' + info1.tiles + ')');
    console.log('4 个小人:', okPawns ? '✓' : '✗ (' + info1.pawns + ')');
    console.log('中央装饰(广场/logo/牌堆/标记):', okDeco ? '✓' : '✗ → deco=' + info1.deco);
    console.log('立体楼宇 + 酒店可见:', okBld ? '✓' : '✗ → ' + JSON.stringify(cubeInfo));
    console.log('棋子目标随移动更新:', okPawn ? '✓' : '✗ → ' + JSON.stringify(pawnInfo));
    console.log('全部小人在视口内:', okPawnVis ? '✓' : '✗ → ' + JSON.stringify(ps));
    console.log('拖拽可旋转视角:', okCam ? '✓' : '✗');
    console.log('相机按钮可控制(放大/旋转/复位):', okCamBtn ? '✓' : '✗');
    console.log('小人逐格行走(落点变化):', okWalk ? '✓' : '✗ → ' + cellBefore + '→' + cellAfter);
    console.log('行走动画队列已排空:', okNoQ ? '✓' : '✗ → ' + JSON.stringify(qTail));
    console.log('模拟操作推进有效:', okPlay ? '✓' : '✗ → ' + JSON.stringify(info2));
    console.log('无 JS 报错:', okNoErr ? '✓' : '✗ → ' + errors.slice(0, 5).join(' | '));
    if (errors.length) console.log('   报错明细:\n   ' + errors.join('\n   '));
    const pass = okThree && okLoop && okCanvas && okTiles && okPawns && okDeco && okBld && okPawn && okPawnVis && okCam && okCamBtn && okWalk && okNoQ && okPlay && okNoErr;
    console.log(pass ? '\n✅ 大富翁真 3D 渲染通过' : '\n❌ 存在问题需修复');

    proc.kill(); process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
