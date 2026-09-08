// 零依赖 CDP 冒烟测试：许愿 1 连/10 连 + 背包升级涨属性 + 冒险页上阵
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
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
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpgacha-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=420,860', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    if (!targets || !targets.length) { console.error('无法连接 Chrome'); proc.kill(); process.exit(1); }
    const page = targets.find(t => t.type === 'page');
    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    const errors = [];
    const origPush = cdp.events.push.bind(cdp.events);
    cdp.events.push = m => {
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            errors.push('[exception] ' + ((d.exception && d.exception.description) || d.text).split('\n')[0]);
        }
        return origPush(m);
    };

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1200);
    await cdp.eval(`(async () => {
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'gacha' + Date.now().toString().slice(-6), password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        // 给足许愿卡和金币
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + r.token };
        for (let i=0;i<3;i++) await fetch('/api/free', {method:'POST', headers: H});
        return 'ok';
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);

    const give = `(() => {})()`;
    // 直接给卡+金币便于测试
    await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        await fetch('/api/wish/reward', {method:'POST', headers: H});
        return 1;
    })()`);

    // ---- 许愿页 ----
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="hero"]').click()`);
    await sleep(1500);
    await cdp.eval(`[...document.querySelectorAll('[data-t]')].find(b=>b.dataset.t==='wish').click()`);
    await sleep(1000);

    const before = await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const m = await (await fetch('/api/me',{headers:{Authorization:'Bearer '+T}})).json();
        return { 卡: m.user.state.wishCards, 英雄数: m.user.state.heroes.length };
    })()`);
    console.log('① 许愿前    :', JSON.stringify(before));

    await cdp.eval(`document.querySelector('#btn-wish1').click()`);
    await sleep(1500);
    const after1 = await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const m = await (await fetch('/api/me',{headers:{Authorization:'Bearer '+T}})).json();
        return { 卡: m.user.state.wishCards, 英雄数: m.user.state.heroes.length };
    })()`);
    console.log('② 许愿一次后:', JSON.stringify(after1), '(英雄 +1，卡 -1)');

    await cdp.eval(`document.querySelector('#btn-wish10').click()`);
    await sleep(2000);
    const after10 = await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const m = await (await fetch('/api/me',{headers:{Authorization:'Bearer '+T}})).json();
        const lvs = m.user.state.heroes.map(h=>h.lv);
        return { 卡: m.user.state.wishCards, 英雄数: m.user.state.heroes.length, 等级全为1: lvs.every(l=>l===1) };
    })()`);
    console.log('③ 许愿十次后:', JSON.stringify(after10), '(英雄 +10，卡 -10，不应自动升级)');

    const grid = await cdp.eval(`document.querySelectorAll('#wish-result .hero-card').length`);
    console.log('   十连结果卡片数:', grid);

    // ---- 背包升级 ----
    await cdp.eval(`[...document.querySelectorAll('[data-t]')].find(b=>b.dataset.t==='bag').click()`);
    await sleep(1200);
    const cardBefore = await cdp.eval(`(() => {
        const c = document.querySelector('#hg .hero-card');
        return { 名字: c.querySelector('.name').textContent.trim(), 攻: c.querySelector('[data-s="atk"]').textContent, 生命: c.querySelector('[data-s="hp"]').textContent, 按钮: c.querySelector('button').textContent.trim() };
    })()`);
    console.log('④ 背包首卡  :', JSON.stringify(cardBefore));

    await cdp.eval(`document.querySelector('#hg .hero-card [data-act="up"]').click()`);
    await sleep(1500);
    const cardAfter = await cdp.eval(`(() => {
        const c = document.querySelector('#hg .hero-card');
        return { 名字: c.querySelector('.name').textContent.trim(), 攻: c.querySelector('[data-s="atk"]').textContent, 生命: c.querySelector('[data-s="hp"]').textContent, 按钮: c.querySelector('button').textContent.trim() };
    })()`);
    console.log('⑤ 升级后    :', JSON.stringify(cardAfter), '(攻/生命应上涨)');

    const hasEqBtn = await cdp.eval(`document.querySelectorAll('#hg [data-act="eq"]').length`);
    console.log('   背包内上阵按钮数:', hasEqBtn, '(应为 0，已移到冒险页)');

    // ---- 冒险页上阵 ----
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
    await sleep(1800);
    const hasFmBtn = await cdp.eval(`(() => { const b=document.querySelector('#btn-formation'); return b ? b.textContent.trim() : '无'; })()`);
    console.log('⑥ 冒险页按钮:', hasFmBtn);

    await cdp.eval(`document.querySelector('#btn-formation').click()`);
    await sleep(1500);
    const fmBefore = await cdp.eval(`(() => ({
        弹窗: !!document.querySelector('#fm-grid'),
        可选英雄: document.querySelectorAll('#fm-grid [data-uid]').length,
        已选: (document.querySelector('#fm-cnt')||{}).textContent,
    }))()`);
    console.log('   上阵弹窗  :', JSON.stringify(fmBefore));

    // 点前 3 个英雄上阵
    await cdp.eval(`(() => { const cs=[...document.querySelectorAll('#fm-grid [data-uid]')].slice(0,3); cs.forEach(c=>c.click()); return cs.length; })()`);
    await sleep(1800);
    const fmAfter = await cdp.eval(`(() => ({
        已选: (document.querySelector('#fm-cnt')||{}).textContent,
        高亮数: [...document.querySelectorAll('#fm-grid [data-uid]')].filter(c=>c.querySelector('.fm-badge').textContent==='已上阵').length,
    }))()`);
    console.log('   点3个后   :', JSON.stringify(fmAfter));

    await cdp.eval(`document.querySelector('#fm-ok').click()`);
    await sleep(1800);
    const home = await cdp.eval(`(() => ({
        上阵按钮: (document.querySelector('#btn-formation')||{}).textContent.trim(),
        头像数: document.querySelectorAll('#formation-list img').length,
        层数按钮可用: [...document.querySelectorAll('.floor-btn')].filter(b=>!b.disabled).length,
    }))()`);
    console.log('⑦ 完成上阵  :', JSON.stringify(home));

    const serverState = await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const m = await (await fetch('/api/me',{headers:{Authorization:'Bearer '+T}})).json();
        return { 上阵: m.user.state.equipped.length, 英雄数: m.user.state.heroes.length };
    })()`);
    console.log('   服务端    :', JSON.stringify(serverState));

    console.log('\n=== JS 报错 ===');
    console.log(errors.length ? errors.slice(0, 10).join('\n') : '无');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
