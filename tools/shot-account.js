/* 截图验证：登录双通道（账号/手机号）、个人资料（绑定手机/改密码）、20 波战斗小怪变小
 *   node tools/shot-account.js
 * 输出 tools/shots/acc-login.png / acc-phone.png / acc-profile.png / acc-battle.png
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9354;
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpacc-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
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

    // 1) 登录页：账号通道
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.shot(path.join(OUT, 'acc-login.png'));

    // 2) 登录页：手机号通道
    await cdp.eval(`document.getElementById('tab-phone').click()`);
    await sleep(400);
    await cdp.shot(path.join(OUT, 'acc-phone.png'));

    // 注册并登录（准备后续截图）
    await cdp.eval(`(async () => {
        const n = 'shotacc' + Date.now().toString().slice(-5);
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:n, password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        // 抽卡上阵
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + r.token };
        await fetch('/api/shop/buy-wish', {method:'POST',headers:H,body:JSON.stringify({count:10})});
        for (let i = 0; i < 4; i++) await fetch('/api/wish', {method:'POST',headers:H,body:JSON.stringify({count:10})});
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        const eqAble = [];
        for (const o of (h.owned||[])) {
            const t = (h.heroes||[]).find(x=>x.id===o.id);
            if (t && !t.material && eqAble.length < 4) eqAble.push(o.uid);
        }
        for (const uid of eqAble) await fetch('/api/hero/equip', {method:'POST',headers:H,body:JSON.stringify({uid})});
        return eqAble.length;
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);

    // 3) 个人资料弹窗（绑定手机 / 改密码按钮）
    await cdp.eval(`document.getElementById('btn-profile').click()`);
    await sleep(700);
    await cdp.shot(path.join(OUT, 'acc-profile.png'));
    await cdp.eval(`U.closeModal()`);
    await sleep(300);

    // 4) 战斗：20 波进度 + 小怪变小
    // 捕获页面 JS 错误
    await cdp.eval(`(() => {
        window._shotErrs = [];
        const o = window.onerror; window.onerror = (m,s,l,c,e) => { window._shotErrs.push(String(m)+' @'+(s||'')+':'+l); if (o) o(m,s,l,c,e); return false; };
        window.addEventListener('unhandledrejection', ev => { window._shotErrs.push('unhandledrejection: ' + (ev.reason && ev.reason.message || ev.reason)); });
    })()`);
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
    await sleep(3000);
    const diag = await cdp.eval(`(() => {
        const tabs = [...document.querySelectorAll('.bottomnav button')].map(b => ({t: b.dataset.tab, on: b.classList.contains('active')}));
        const floors = document.querySelectorAll('.floor-btn').length;
        const enabled = document.querySelectorAll('.floor-btn:not([disabled])').length;
        const flEl = document.getElementById('floor-list');
        const title = document.querySelector('.section-title')?.textContent || '';
        const st = window.App && window.App.user && window.App.user.state;
        return {
            tabs, floors, enabled,
            hasFloorList: !!flEl,
            pageHTML: document.getElementById('page-content')?.innerHTML.slice(0, 200) || '',
            title,
            errs: window._shotErrs || [],
            equipped: st ? (st.equipped || []).length : -1,
            cleared: st ? (st.tower ? st.tower.maxFloor : -1) : -1,
        };
    })()`);
    console.log('   📊 标题:', JSON.stringify(diag.title), '有#floor-list:', diag.hasFloorList, '层按钮:', diag.floors, '可点:', diag.enabled, '上阵:', diag.equipped);
    if (diag.errs.length) console.log('   ⚠ 错误:', JSON.stringify(diag.errs).slice(0, 400));
    if (!diag.floors) console.log('   📄 page-content 前 200:', diag.pageHTML);
    const ok = await cdp.eval(`(() => {
        const btn = document.querySelector('.floor-btn:not([disabled])');
        if (btn) { btn.click(); return btn.dataset.f; }
        return null;
    })()`);
    console.log('   🎯 启动第 ' + ok + ' 层战斗');
    await sleep(7000);
    await cdp.shot(path.join(OUT, 'acc-battle.png'));

    proc.kill();
    console.log('✅ 截图完成');
    process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
