// 零依赖 CDP 冒烟测试：验证「英雄 → 许愿」页许愿卡数量实时同步 + 每日奖励限制
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9335;
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

const snap = `(() => ({
    页面内数量: (document.querySelector('#wish-cnt')||{}).textContent,
    顶部栏数量: (document.querySelector('#r-wish')||{}).textContent,
    奖励按钮: (() => { const b=document.querySelector('#btn-wish-reward'); return b ? b.textContent.trim() + (b.disabled?' [禁用]':' [可点]') : '-'; })(),
    许愿按钮: (() => { const b=document.querySelector('#btn-wish'); return b ? (b.disabled?'禁用':'可点') : '-'; })(),
}))()`;

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpwish-'));
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
            body: JSON.stringify({username:'wish' + Date.now().toString().slice(-7), password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        return 'ok';
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);

    // 进英雄 → 许愿
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="hero"]').click()`);
    await sleep(1500);
    await cdp.eval(`[...document.querySelectorAll('[data-t]')].find(b=>b.dataset.t==='wish').click()`);
    await sleep(1000);

    console.log('① 初始      :', JSON.stringify(await cdp.eval(snap)));

    // 点领取每日奖励
    await cdp.eval(`document.querySelector('#btn-wish-reward').click()`);
    await sleep(1200);
    console.log('② 领每日奖励:', JSON.stringify(await cdp.eval(snap)));

    // 再点一次（应被拒绝且提示）
    await cdp.eval(`(() => { const b=document.querySelector('#btn-wish-reward'); if(!b.disabled) b.click(); return 1; })()`);
    await sleep(1200);
    console.log('③ 重复领取  :', JSON.stringify(await cdp.eval(snap)), '(应仍是 13，按钮禁用)');

    // 单次许愿
    await cdp.eval(`document.querySelector('#btn-wish').click()`);
    await sleep(1500);
    console.log('④ 单次许愿后:', JSON.stringify(await cdp.eval(snap)));

    // 服务端确认
    const serverState = await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const m = await (await fetch('/api/me',{headers:{Authorization:'Bearer '+T}})).json();
        return { wishCards: m.user.state.wishCards, 最后领取日: m.user.state.lastWishRewardDay || '-' };
    })()`);
    console.log('服务端      :', JSON.stringify(serverState));

    console.log('\n=== JS 报错 ===');
    console.log(errors.length ? errors.slice(0, 10).join('\n') : '无');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
