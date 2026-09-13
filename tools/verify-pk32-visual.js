const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, '..', 'output', 'playwright');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); }); }
function json(url) { return new Promise((resolve, reject) => { const req = http.get(url, res => { let d = ''; res.setEncoding('utf8'); res.on('data', x => d += x); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Invalid JSON from ' + url + ': ' + e.message)); } }); }); req.setTimeout(3000, () => req.destroy(new Error('HTTP timeout: ' + url))); req.on('error', reject); }); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) { const ws = new WebSocket(url); await new Promise((r, j) => { const timer = setTimeout(() => { ws.terminate(); j(new Error('CDP websocket timeout: ' + url)); }, 5000); ws.once('open', () => { clearTimeout(timer); r(); }); ws.once('error', error => { clearTimeout(timer); j(error); }); }); const c = new CDP(ws); ws.on('message', data => { const m = JSON.parse(data.toString()); if (m.id != null && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }); return c; }
    send(method, params) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params: params || {} })); return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.waiters.delete(id); reject(new Error('CDP timeout: ' + method)); }, 5000); this.waiters.set(id, message => { clearTimeout(timer); resolve(message); }); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result.result.value; }
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
}
function check(label, ok, value) { console.log((ok ? 'PASS ' : 'FAIL ') + label + (value == null ? '' : ' ' + value)); if (!ok) process.exitCode = 1; }
(async () => {
    console.log('START PK32 visual verification');
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-visual-'));
    const port = await freePort();
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*', '--user-data-dir=' + dir, '--remote-debugging-port=' + port, '--window-size=1000,900', BASE], { stdio: 'ignore' });
    chrome.on('error', error => { console.error('Chrome launch error:', error.message); });
    try {
        let targets;
        for (let i = 0; i < 40; i += 1) { try { targets = await json('http://127.0.0.1:' + port + '/json/list'); if (targets.some(x => x.type === 'page' && x.url.indexOf(BASE) === 0)) break; } catch (e) { if (i === 39) throw e; } await sleep(250); }
        console.log('CDP targets', JSON.stringify((targets || []).map(x => ({ type: x.type, url: x.url }))));
        const page = (targets || []).find(x => x.type === 'page' && x.url.indexOf(BASE) === 0);
        if (!page) throw new Error('Chrome page target unavailable');
        const cdp = await CDP.connect(page.webSocketDebuggerUrl);
        await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
        console.log('CDP connected');
        await cdp.send('Page.navigate', { url: BASE }); await sleep(1500);
        console.log('Page loaded');
        const tower = await cdp.eval("(() => { const h = document.createElement('div'); h.id = 'pk32-visual-tower'; document.body.appendChild(h); const g = window.PK32Tower.startUI(h, { layer: 1 }); const cells = [...h.querySelectorAll('[data-role=grid] button')]; const root = h.querySelector('[data-role=pk32-tower]'); const sets = Object.keys(window.PK32Tower.sets).map(name => { const s = window.PK32Tower.sets[name]; const v = document.createElement('div'); h.appendChild(v); window.PK32Tower.startUI(v, { set: name, layer: 0 }); return { name, width: s.width, height: s.height, maps: s.layers.length, mapCells: s.layers.map(x => x.cells.length), rendered: v.querySelectorAll('[data-role=grid] button').length, columns: getComputedStyle(v.querySelector('[data-role=grid]')).gridTemplateColumns.split(' ').length }; }); return { cells: cells.length, titles: cells.map(x => x.title).filter(Boolean).slice(0, 8), kinds: [...new Set(cells.map(x => x.dataset.kind))], guessedImages: cells.filter(x => getComputedStyle(x).backgroundImage !== 'none').length, wrongImages: cells.filter(x => /tank|board-sheet/i.test(getComputedStyle(x).backgroundImage)).length, assetSource: root && root.dataset.assetSource, assetStatus: root && root.dataset.assetStatus, state: g.getState ? g.getState() : null, sets }; })()");
        check('魔塔显示 11×11 地图', tower.cells === 121, tower.cells); check('魔塔有语义对象提示', tower.titles.some(x => /墙|主角|怪物|钥匙|门|出口/.test(x)), tower.titles.join(' | ')); check('魔塔资源来源已声明', tower.assetSource === 'pk32-tower-sheet', tower.assetSource); check('魔塔资源映射已完成', tower.assetStatus === 'mapped', tower.assetStatus); check('魔塔不渲染坦克或其他图集', tower.wrongImages === 0, tower.wrongImages); check('魔塔对象类型可区分', tower.kinds.length >= 6, tower.kinds.join(','));
        const expectedSets = { '魔塔': [22, 121, 11], '魔塔二': [4, 121, 11], '魔塔三': [3, 121, 11], '魔塔四': [8, 900, 30] };
        check('四套魔塔地图数量与尺寸正确', tower.sets.every(s => { const e = expectedSets[s.name]; return e && s.maps === e[0] && s.mapCells.every(n => n === e[1]) && s.rendered === e[1] && s.columns === e[2]; }), JSON.stringify(tower.sets.map(s => ({ name: s.name, maps: s.maps, cells: s.mapCells, rendered: s.rendered, columns: s.columns }))));
        await cdp.shot(path.join(OUT, 'pk32-tower.png'));
        const richman = await cdp.eval("(async () => { const errors = []; window.addEventListener('error', e => errors.push(e.message)); localStorage.removeItem('pk32-richman-save-v1'); Math.random = () => 0; const h = document.createElement('div'); h.id = 'pk32-visual-richman'; document.body.appendChild(h); const g = window.PK32Richman.start(h, {}); const cells = [...h.querySelectorAll('.pk32-rh-cell')]; const coords = cells.map(x => x.style.gridRow + '/' + x.style.gridColumn); const board = h.querySelector('.pk32-rh-board'); const before = g.getState(); const buttonsBefore = [...h.querySelectorAll('.pk32-rh-actions button')].map(x => x.textContent); h.querySelector('.pk32-rh-actions button').click(); const afterRoll = g.getState(); const buyButton = [...h.querySelectorAll('.pk32-rh-actions button')].find(x => x.textContent === '购买当前地产'); if (buyButton) buyButton.click(); const afterBuy = g.getState(); await new Promise(resolve => setTimeout(resolve, 60)); const afterComputer = g.getState(); return { cells: cells.length, uniqueCoords: new Set(coords).size, players: h.querySelectorAll('.pk32-rh-player').length, image: getComputedStyle(board).backgroundImage, buttons: buttonsBefore.length, hasPass: buttonsBefore.indexOf('放弃购买') >= 0, sourceLayout: board.dataset.pk32Layout || '', sourceEvents: window.PK32Richman.EVENTS ? window.PK32Richman.EVENTS.length : 0, before, afterRoll, afterBuy, afterComputer, errors }; })()");
        check('强手棋显示 40 格路线', richman.cells === 40, richman.cells); check('强手棋格子坐标不重叠', richman.uniqueCoords === 40, richman.uniqueCoords); check('强手棋显示 3 名玩家', richman.players === 3, richman.players); check('强手棋操作按钮齐全', richman.buttons >= 6, richman.buttons); check('强手棋提供放弃购买', richman.hasPass, richman.hasPass); check('强手棋加载 PK32 图集', /board-sheet/.test(richman.image), richman.image); check('强手棋接入原始棋盘编码', richman.sourceLayout.length === 392, richman.sourceLayout.length); check('强手棋接入原始事件表', richman.sourceEvents >= 30, richman.sourceEvents); check('强手棋掷骰子后玩家移动', richman.afterRoll.players[0].pos === 2 && richman.afterRoll.phase === 'buy', JSON.stringify(richman.afterRoll)); check('强手棋购买地产后扣款并归属', richman.afterBuy.own[2] === 0 && richman.afterBuy.players[0].cash === 2740, JSON.stringify(richman.afterBuy)); check('强手棋电脑回合可收束', richman.afterComputer.round === 2 && richman.afterComputer.phase === 'roll' && richman.afterComputer.turn === 0, JSON.stringify(richman.afterComputer)); check('强手棋交互无运行时错误', richman.errors.length === 0, richman.errors.join(' | '));
        await cdp.shot(path.join(OUT, 'pk32-richman.png'));
        console.log(JSON.stringify({ tower, richman, output: OUT }));
    } finally { if (!chrome.killed) chrome.kill(); console.log('END PK32 visual verification'); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
