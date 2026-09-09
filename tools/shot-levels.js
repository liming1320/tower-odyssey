/* 截图验证：小游戏关卡化改造
 *   node tools/shot-levels.js
 * 输出 tools/shots/lv-*.png：hub 星级 / 暗棋关卡选择+猜拳+对局道具栏 / 2048 / 连连看 / 消消乐
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9355;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
    });
}
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } };
        return c;
    }
    send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise(res => this.waiters.set(id, res)); }
    async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(file), fs.statSync(file).size + ' B'); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdplv-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=420,900', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });

    // 注册登录 + 预置一点关卡星级（验证星标显示）
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => {
        const n = 'shotlv' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        // 预置星级：banqi 1 关 2 星 / g2048 2 关 3 星
        const p = JSON.parse(localStorage.getItem('mg-progress-v1') || '{}');
        p.banqi = { unlocked: 2, stars: { 1: 2 } };
        p.g2048 = { unlocked: 3, stars: { 1: 3, 2: 2 } };
        localStorage.setItem('mg-progress-v1', JSON.stringify(p));
        return true;
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);

    // 捕获页面错误
    await cdp.eval(`(() => {
        window._shotErrs = [];
        const o = window.onerror; window.onerror = (m,s,l,c,e) => { window._shotErrs.push(String(m)+' @'+(s||'')+':'+l); if (o) o(m,s,l,c,e); return false; };
        window.addEventListener('unhandledrejection', ev => window._shotErrs.push('rejection: ' + (ev.reason && ev.reason.message || ev.reason)));
    })()`);

    // 1) 小游戏 hub（星级徽标）
    await cdp.eval(`MinigamesView.open(window.App)`);
    await sleep(800);
    await cdp.shot(path.join(OUT, 'lv-hub.png'));

    // 2) 暗棋：关卡选择
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='banqi'))`);
    await sleep(800);
    await cdp.shot(path.join(OUT, 'lv-banqi-select.png'));
    // 点第 1 关 → 猜拳
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(600);
    await cdp.shot(path.join(OUT, 'lv-banqi-rps.png'));
    // 猜拳循环直到分出胜负
    for (let tries = 0; tries < 6; tries++) {
        await cdp.eval(`document.querySelector('.mg-rps-btns [data-i="${tries % 3}"]').click()`);
        await sleep(1100);
        const rpsMsg = await cdp.eval(`(document.getElementById('mg-rps-msg') || {}).textContent || ''`);
        if (rpsMsg && /先行|电脑先行/.test(rpsMsg)) break;  // 分出胜负
        if (!rpsMsg) break;  // 猜拳 UI 已消失
    }
    await sleep(600);
    await cdp.shot(path.join(OUT, 'lv-banqi-game.png'));
    const banqiState = await cdp.eval(`(() => ({
        errs: window._shotErrs || [],
        hasItembar: !!document.querySelector('#mini-mask .mg-itembar'),
        itemBtns: document.querySelectorAll('#mini-mask .mg-item').length,
        hint: (document.querySelector('#mini-mask .mg-hint')||{}).textContent || '',
    }))()`);
    console.log('   📊 暗棋:', JSON.stringify(banqiState));
    // 翻 5 枚棋子看宋金 Q 版小人正面
    await cdp.eval(`(() => {
        const B = window.__banqi;
        if (!B) return;
        // 先等 AI 走完第一次回到玩家
        for (let i = 0; i < 8 && B.turn !== 1; i++) B.tap(0, 0);
        // 玩家先手的话翻 5 枚不同位置
        if (B.turn === 1) {
            B.tap(0, 0); B.tap(0, 2); B.tap(0, 4); B.tap(0, 6); B.tap(1, 5);
        }
    })()`);
    await sleep(700);
    await cdp.shot(path.join(OUT, 'lv-banqi-faces.png'));
    await cdp.eval(`document.getElementById('mini-back').click()`);
    await sleep(400);

    // 3) 2048：关卡选择 + 第 1 关对局
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='g2048'))`);
    await sleep(1500);
    await cdp.shot(path.join(OUT, 'lv-2048-select.png'));
    await cdp.eval(`(() => {
        const c = document.querySelector('#mini-stage .mg-ls-cell');
        if (c && c.onclick) c.onclick();
    })()`);
    await sleep(1500);
    await cdp.shot(path.join(OUT, 'lv-2048-game.png'));
    const g2048state = await cdp.eval(`(() => ({ errs: window._shotErrs || [], score: (document.getElementById('mini-score')||{}).textContent || '' }))()`);
    console.log('   📊 2048:', JSON.stringify(g2048state));
    await cdp.eval(`document.getElementById('mini-back').click()`);
    await sleep(400);

    // 4) 连连看：第 1 关
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='link'))`);
    await sleep(800);
    await cdp.shot(path.join(OUT, 'lv-link-select.png'));
    await cdp.eval(`document.querySelector('#mini-stage .mg-ls-cell').click()`);
    await sleep(900);
    await cdp.shot(path.join(OUT, 'lv-link-game.png'));
    const linkState = await cdp.eval(`(() => ({ errs: window._shotErrs || [], itemBtns: document.querySelectorAll('#mini-mask .mg-item').length }))()`);
    console.log('   📊 连连看:', JSON.stringify(linkState));
    await cdp.eval(`document.getElementById('mini-back').click()`);
    await sleep(400);

    // 5) 消消乐：第 5 关（集红令配额）
    await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='match3'))`);
    await sleep(800);
    await cdp.shot(path.join(OUT, 'lv-match3-select.png'));
    await cdp.eval(`[...document.querySelectorAll('#mini-stage .mg-ls-cell')].find(c=>!c.classList.contains('locked')).click()`);
    await sleep(900);
    await cdp.shot(path.join(OUT, 'lv-match3-game.png'));
    const m3state = await cdp.eval(`(() => ({ errs: window._shotErrs || [], score: (document.getElementById('mini-score')||{}).textContent || '' }))()`);
    console.log('   📊 消消乐:', JSON.stringify(m3state));
    await cdp.eval(`document.getElementById('mini-back').click()`);
    await sleep(400);

    // 6) 新游戏关卡选择快速验证：snake / mole / slide15 / hanoi / bulls / sudoku6 / jump / breakout / piano / reaction / memory / mine / shooter / gomoku / xiangqi
    const newGames = ['snake', 'mole', 'slide15', 'hanoi', 'bulls', 'sudoku6', 'jump', 'breakout', 'piano', 'reaction', 'memory', 'mine', 'shooter', 'gomoku', 'xiangqi'];
    for (const gid of newGames) {
        try {
            await cdp.eval(`MinigamesView.launch(GAMES.find(g=>g.id==='${gid}'))`);
            await sleep(500);
            await cdp.shot(path.join(OUT, 'lv-' + gid + '-select.png'));
            const sel = await cdp.eval(`(() => ({
                errs: window._shotErrs || [],
                cellCount: document.querySelectorAll('#mini-stage .mg-ls-cell').length,
                title: (document.querySelector('#mini-stage .mg-ls-title')||{}).textContent || '',
                locked: document.querySelectorAll('#mini-stage .mg-ls-cell.locked').length,
            }))()`);
            console.log(`   📊 ${gid}: ${sel.cellCount} cells / locked=${sel.locked} / ${(sel.title || '').slice(0, 30)}`);
            await cdp.eval(`document.getElementById('mini-back').click()`);
            await sleep(300);
        } catch (e) {
            console.log(`   ✗ ${gid}: ${e.message}`);
        }
    }

    const errs = await cdp.eval(`window._shotErrs || []`);
    if (errs.length) console.log('   ⚠ 页面错误:', JSON.stringify(errs).slice(0, 500));

    proc.kill();
    console.log('✅ 截图完成');
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
