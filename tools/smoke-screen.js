// 零依赖 CDP 验证：战斗全屏层在不同视口下的位置与尺寸
//   桌面宽屏（1280x900）：应跟随主界面 420px 宽度并水平居中
//   手机窄屏（390x844）：应铺满整个屏幕
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9343;
const BASE = 'http://localhost:5180';

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.events = []; }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
            else if (m.method) c.events.push(m);
        };
        return c;
    }
    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise(res => this.waiters.set(id, res));
    }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) {
            const d = r.result.exceptionDetails;
            throw new Error('页面 JS 异常: ' + ((d.exception && d.exception.description) || d.text));
        }
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
    async viewport(w, h, mobile) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile,
        });
        await sleep(500);
    }
}

const PROBE = `(() => {
    const layer = document.getElementById('battle-layer');
    const c = document.querySelector('#battle-canvas');
    if (!layer || layer.classList.contains('hidden')) return { 错误: '战斗层未显示' };
    const r = layer.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return {
        视口: window.innerWidth + 'x' + window.innerHeight,
        层_left: Math.round(r.left), 层_right: Math.round(r.right),
        层宽: Math.round(r.width), 层高: Math.round(r.height),
        左边距: Math.round(r.left), 右边距: Math.round(window.innerWidth - r.right),
        画布: Math.round(cr.width) + 'x' + Math.round(cr.height),
        画布高占比: Math.round(cr.height / window.innerHeight * 100) + '%',
    };
})()`;

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpsc-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=1280,900', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const page = targets.find(t => t.type === 'page');
    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1200);
    await cdp.eval(`(async () => {
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'scr' + Date.now().toString().slice(-6), password:'1234'})})).json();
        localStorage.setItem('game-token', r.token); return 'ok';
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        await fetch('/api/wish',{method:'POST',headers:H,body:JSON.stringify({count:10})});
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        for (const o of h.owned.slice(0,3)) await fetch('/api/hero/equip',{method:'POST',headers:H,body:JSON.stringify({uid:o.uid})});
        return h.owned.length;
    })()`);

    const enterBattle = async () => {
        await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
        await sleep(1500);
        await cdp.eval(`(() => { const b=[...document.querySelectorAll('.floor-btn')].find(x=>!x.disabled); if(b) b.click(); return 1; })()`);
        await sleep(1200);
    };

    // ---- 1) 桌面宽屏 ----
    await cdp.viewport(1280, 900, false);
    await enterBattle();
    const desktop = await cdp.eval(PROBE);
    console.log('【桌面 1280x900】', JSON.stringify(desktop));
    const ok1 = desktop.左边距 === 0 && desktop.右边距 === 0 && desktop.层宽 === 1280;
    console.log('  判定:', ok1 ? '✅ 铺满整个窗口（无黑边）' : '❌ 未铺满');

    // 宽屏下战斗单位应保持在画面中央，而不是散开到两边
    const center = await cdp.eval(`(() => {
        const mid = (Battle.heroes || []).length
            ? (Math.min(...Battle.heroes.map(h=>h.x)) + Math.max(...Battle.heroes.map(h=>h.x))) / 2 : -1;
        return { 画布宽: Math.round(Battle.W), 内容区: Math.round(Battle.contentW),
                 英雄群中心: Math.round(mid), 画面中心: Math.round(Battle.W/2) };
    })()`);
    console.log('  居中检查:', JSON.stringify(center));
    const ok1b = Math.abs(center.英雄群中心 - center.画面中心) <= 6 && center.内容区 === 560;
    console.log('  判定:', ok1b ? '✅ 战斗单位居中（内容区 560px）' : '❌ 战斗单位未居中');

    let shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join('C:\\Users\\li\\Desktop', '战斗布局-桌面.png'), Buffer.from(shot.result.data, 'base64'));

    // ---- 2) 手机窄屏 ----
    await cdp.viewport(390, 844, true);
    await sleep(600);
    const mobile = await cdp.eval(PROBE);
    console.log('【手机 390x844】', JSON.stringify(mobile));
    const ok2 = mobile.层宽 === 390 && mobile.左边距 === 0 && mobile.右边距 === 0;
    console.log('  判定:', ok2 ? '✅ 满屏铺开' : '❌ 未铺满');

    shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join('C:\\Users\\li\\Desktop', '战斗布局-手机.png'), Buffer.from(shot.result.data, 'base64'));

    console.log('\n结论:', (ok1 && ok1b && ok2) ? '两种视口都正确' : '仍有问题');
    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit((ok1 && ok1b && ok2) ? 0 : 1), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
