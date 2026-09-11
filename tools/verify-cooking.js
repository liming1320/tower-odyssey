/* 烹饪发烧友 实机验证：注册 / 自动上菜 / 点击食材 / 点击客人上菜 / 倒掉 / 无报错 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9413, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }) }).on('error', rej)); }
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.onEvent = () => {}; }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } if (m.method) c.onEvent(m.method, m.params || {}); }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async bitmap(f) { const u = await this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?c.toDataURL('image/png'):''})()`); if (!u) { console.log('   ⚠ 无 canvas'); return; } fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); console.log('   🖼', path.basename(f), fs.statSync(f).size + 'B'); }
}
let FAILED = 0;
function check(name, ok, extra) { console.log((ok ? '✅' : '❌') + ' ' + name + (extra != null ? '  ' + extra : '')); if (!ok) FAILED++; }

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const errs = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpcook-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
        `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) { } await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    cdp.onEvent = (m, p) => { if (m === 'Runtime.exceptionThrown') { const d = (p.exceptionDetails && (p.exceptionDetails.exception || p.exceptionDetails.text)) || 'err'; errs.push(String(d)); } if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errs.push('console:' + (p.args || []).map(a => a.value).join(' ')); };
    await cdp.send('Page.navigate', { url: BASE + '/?cb=' + Date.now() }); await sleep(2800);

    const reg = await cdp.eval(`(()=>{window.__MG_TEST=true; return { has: !!(window.MiniGames&&window.MiniGames.cookingfever), g: (typeof GAMES!=='undefined')&&GAMES.some(g=>g.id==='cookingfever'), total: (typeof GAMES!=='undefined')?GAMES.length:0 };})()`);
    console.log('   注册:', JSON.stringify(reg));
    check('游戏已注册到 MiniGames.cookingfever', reg.has);
    check('GAMES 清单含 cookingfever', reg.g);
    check('小游戏总数增加', reg.total >= 100);

    const launched = await cdp.eval(`(()=>{try{const g=GAMES.find(x=>x.id==='cookingfever'); if(window.MinigamesView&&window.MinigamesView.launch) window.MinigamesView.launch(g); else return 'no-launcher'; return 'ok';}catch(e){return 'throw:'+e.message}})()`);
    console.log('   launch:', launched);
    await sleep(1000);
    await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)'); if(c)c.click(); return !!c})()`);
    await sleep(1800);

    const s0 = await cdp.eval(`(()=>{const S=window.__cook; return S?{heart:S.heart,served:S.served,coin:S.coin,target:S.target,q:S.queue.length}:null})()`);
    console.log('   初始:', JSON.stringify(s0));
    check('初始 3 颗❤', s0 && s0.heart === 3, JSON.stringify(s0));
    check('初始有客人在排队', s0 && s0.q >= 1);
    check('目标服务数 > 0', s0 && s0.target > 0);

    // 注入点击 helper
    await cdp.eval(`(function(){window.__fireTap=function(lx,ly){const c=document.querySelector('#mini-stage canvas');const r=c.getBoundingClientRect();const cx=r.left+lx/360*r.width, cy=r.top+ly/560*r.height;c.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,bubbles:true}));};})()`);

    // B. 自动上菜：把托盘设为某位等待客人的订单，等几帧应被自动上菜
    const b = await cdp.eval(`(()=>{const S=window.__cook; const c=S.queue.find(x=>x.state==='wait'); if(!c) return 'no-cust'; S.tray=c.order.slice(); return {order:c.order.slice(), served:S.served, coin:S.coin};})()`);
    await sleep(300);
    const b2 = await cdp.eval(`(()=>{const S=window.__cook; return {served:S.served, coin:S.coin, tray:S.tray.length};})()`);
    console.log('   自动上菜:', JSON.stringify(b), '→', JSON.stringify(b2));
    check('托盘凑齐订单后自动上菜(服务数+1)', b && b2 && b2.served === b.served + 1, JSON.stringify(b2));
    check('上菜后获得金币', b2 && b2.coin > 0);
    check('上菜后托盘清空', b2 && b2.tray === 0);

    // C. 点击食材按钮（汉堡）加入托盘
    await cdp.eval(`window.__fireTap(51,474);`);   // 第 1 个按钮中心
    await sleep(120);
    const c = await cdp.eval(`(()=>{const S=window.__cook; return S.tray.slice();})()`);
    console.log('   点食材后托盘:', JSON.stringify(c));
    check('点击食材按钮把汉堡放入托盘', Array.isArray(c) && c[0] === 'burger', JSON.stringify(c));

    // D. 点倒掉清空托盘
    await cdp.eval(`window.__fireTap(300,318);`);
    await sleep(120);
    const d = await cdp.eval(`(()=>{const S=window.__cook; return S.tray.length;})()`);
    check('点击🗑倒掉清空托盘', d === 0, 'tray=' + d);

    // E. 点客人上菜：把托盘设为某客人订单，同步点该客人位置（无 tick 间隔）应直接上菜
    const e0 = await cdp.eval(`(()=>{const S=window.__cook; const base=S.served; const c=S.queue.find(x=>x.state==='wait'); if(!c) return {no:1}; const xs=[34,107,180,253,326]; const ord=c.order.slice(); S.tray=ord.slice(); window.__fireTap(xs[c.slot],160); return {base, after:S.served, tray:S.tray.length, toast:S.toast, ord};})()`);
    console.log('   点客人上菜:', JSON.stringify(e0));
    check('点客人也能上菜(服务数+1)', e0 && !e0.no && e0.after === e0.base + 1, JSON.stringify(e0));

    // 截图留存
    await cdp.bitmap(path.join(OUT, 'cooking-1.png'));

    // 错误监控
    check('运行期无 JS 报错', errs.length === 0, errs.slice(0, 3).join(' | '));

    proc.kill();
    console.log(FAILED === 0 ? '\n🎉 全部通过' : `\n❌ 失败 ${FAILED} 项`);
    process.exit(FAILED === 0 ? 0 : 1);
})();
