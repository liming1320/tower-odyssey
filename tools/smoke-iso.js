// 玩家端隔离 + 许愿保底 UI 验证
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9353;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) throw new Error(((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text));
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
    async shot(name) { const s = await this.send('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(s.result.data, 'base64')); return f; }
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpiso-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=420,800', 'about:blank',
    ], { stdio: 'ignore' });
    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 800, deviceScaleFactor: 2, mobile: true });

    // ---- 1) 玩家登录页（必须没有任何管理员入口）----
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    const audit = await cdp.eval(`(() => {
        const txt = document.body.innerText;
        return {
            hasAdminLoginBtn: !!document.getElementById('btn-admin-login'),
            txtHasAdmin: /管理员登录|进入后台|admin\\s*\\/\\s*workbuddy/i.test(txt),
            loginButtons: [...document.querySelectorAll('.login-card button')].map(b => b.textContent.trim()),
        };
    })()`);
    console.log('1) 玩家登录页审计:', JSON.stringify(audit));
    console.log('   判定:', (!audit.hasAdminLoginBtn && !audit.txtHasAdmin) ? '✅ 玩家端无任何管理员入口' : '❌ 残留管理员入口');
    await cdp.shot('iso-1-player-login.png');

    // ---- 2) 注册 + 登录 + 抽 5 次看许愿保底 ----
    const u = 'iso' + (Date.now() % 1e6).toString(36);
    // 直接在浏览器里跑注册 + 发卡 + 抽卡，避免跨域 token 复杂度
    const result = await cdp.eval(`(async () => {
        const tk = (await (await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ username: '${u}', password: 't1234' })})).json()).token;
        localStorage.setItem('game-token', tk);
        // 管理员发卡
        const at = (await (await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ username: 'admin', password: 'workbuddy' })})).json()).token;
        await fetch('/api/admin/user/grant', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+at},
            body: JSON.stringify({ username: '${u}', rewards: { wishCards: 30, gold: 99999, gems: 9999, iron: 9999 } })});
        // 抽 5 次
        for (let i = 0; i < 5; i++) {
            await fetch('/api/wish', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},
                body: JSON.stringify({ count: 1 })});
        }
        return 'ok';
    })()`);
    console.log('2) 准备数据:', result);

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);
    // 打开英雄 tab → 许愿 sub-tab
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="hero"]').click()`);
    await sleep(600);
    await cdp.eval(`document.querySelector('.admin-tabs button[data-t="wish"]').click()`);
    await sleep(800);
    const wish = await cdp.eval(`(() => {
        const bar = document.getElementById('pity-bar');
        const txt = document.getElementById('pity-txt');
        const grid = document.querySelectorAll('.hero-card').length;
        const materials = [...document.querySelectorAll('.hero-card')].filter(c => /材料/.test(c.textContent)).length;
        return {
            hasPityBar: !!bar,
            pityWidth: bar ? bar.style.width : '?',
            pityText: txt ? txt.innerText : '',
            heroCardsShown: grid,
        };
    })()`);
    console.log('3) 许愿页保底条:', JSON.stringify(wish));
    console.log('   判定:', wish.hasPityBar ? '✅ 进度条已渲染' : '❌ 进度条缺失');
    await cdp.shot('iso-2-player-wish.png');

    // ---- 4) 英雄背包 tab：确认有材料英雄 ----
    await cdp.eval(`document.querySelector('.admin-tabs button[data-t="bag"]').click()`);
    await sleep(800);
    const bag = await cdp.eval(`(() => {
        const cards = [...document.querySelectorAll('.hero-card')];
        const matCount = cards.filter(c => c.textContent.indexOf('材料') >= 0).length;
        return { total: cards.length, materialCount: matCount };
    })()`);
    console.log('4) 英雄背包:', JSON.stringify(bag));
    console.log('   判定:', bag.materialCount > 0 ? ('✅ 看到 ' + bag.materialCount + ' 个材料英雄') : '❌ 没有材料英雄');
    await cdp.shot('iso-3-player-bag.png');

    const pass = !audit.hasAdminLoginBtn && !audit.txtHasAdmin && wish.hasPityBar && bag.materialCount > 0;
    console.log('\n' + (pass ? '✅ 全部隔离 + 新功能 UI 正常' : '❌ 有问题'));
    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(pass ? 0 : 1), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });