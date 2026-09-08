// 零依赖 CDP 冒烟测试：驱动本机 Chrome 真实点击「冒险 → 第1层」，捕获 JS 报错
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
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
            throw new Error('页面 JS 异常: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text));
        }
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
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
    await cdp.send('Network.enable');

    const errors = [];
    const origPush = cdp.events.push.bind(cdp.events);
    cdp.events.push = m => {
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            errors.push('[exception] ' + (d.exception && d.exception.description ? d.exception.description.split('\n')[0] : d.text));
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            errors.push('[console.error] ' + m.params.args.map(a => a.value || a.description || '').join(' '));
        }
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
            errors.push('[log] ' + m.params.entry.text + (m.params.entry.url ? ' <- ' + m.params.entry.url : ''));
        }
        if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
            errors.push('[http ' + m.params.response.status + '] ' + m.params.response.url);
        }
        if (m.method === 'Network.loadingFailed') {
            errors.push('[加载失败] ' + m.params.errorText);
        }
        return origPush(m);
    };

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);

    // 注册 + 写入 token
    await cdp.eval(`(async () => {
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'cdp' + Date.now().toString().slice(-7), password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        return r.token ? 'ok' : JSON.stringify(r);
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);

    // 许愿 + 上阵
    const prep = await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        for (let i=0;i<5;i++) await fetch('/api/wish',{method:'POST',headers:H});
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        for (const o of h.owned.slice(0,5)) await fetch('/api/hero/equip',{method:'POST',headers:H,body:JSON.stringify({uid:o.uid})});
        return h.owned.length + ' 英雄 / 上阵 ' + Math.min(5,h.owned.length);
    })()`);
    console.log('准备:', prep);

    // 进冒险
    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
    await sleep(1800);
    let info = await cdp.eval(`(() => {
        const btns = [...document.querySelectorAll('.floor-btn')];
        return { n: btns.length, labels: btns.map(b => b.textContent.trim().replace(/\\s+/g,' ')), disabled: btns.map(b => b.disabled) };
    })()`);
    console.log('层数按钮:', JSON.stringify(info));

    // 点第一个可点的层
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('.floor-btn')].find(x=>!x.disabled); b.click(); return b.textContent.trim(); })()`);
    await sleep(2500);

    const battle = await cdp.eval(`(() => {
        const c = document.querySelector('#battle-canvas');
        if (!c) return { canvas: false };
        return { canvas: true, w: c.width, h: c.height, battleDefined: typeof Battle !== 'undefined', running: (typeof Battle !== 'undefined') && !!Battle.raf };
    })()`);
    console.log('战场:', JSON.stringify(battle));

    // 每 500ms 采样一次，观察战斗推进
    for (let i = 0; i < 60; i++) {
        await sleep(500);
        const s = await cdp.eval(`(() => {
            if (typeof Battle === 'undefined') return { err: 'no Battle' };
            const ba = document.querySelector('#buff-area');
            return {
                t: Math.round(performance.now()),
                波: (Battle.waveIdx|0) + 1 + '/' + (Battle.waves||[]).length,
                场上怪: (Battle.enemies||[]).filter(e=>!e.dead).length,
                待出: (Battle.spawnQueue||[]).length,
                增益弹窗: ba ? ba.innerHTML.length > 0 : false,
                存活英雄: (Battle.heroes||[]).filter(h=>!h.dead).length,
                塔血: Battle.towerHp !== undefined ? Math.round(Battle.towerHp) : '-',
            };
        })()`);
        console.log(' ', JSON.stringify(s));
        // 出现增益弹窗就选第一个，继续下一波
        if (s.增益弹窗) {
            await cdp.eval(`(() => { const b=document.querySelector('.buff-item'); if(b){b.click(); return b.textContent.trim();} return 'none'; })()`);
            console.log('   -> 已选择增益，继续');
        }
    }

    // 确认通关结算弹窗
    const result = await cdp.eval(`(() => {
        const m = document.querySelector('#modal-root');
        const txt = m ? m.textContent.replace(/\\s+/g,' ').trim() : '';
        return { 有弹窗: !!m && m.innerHTML.length > 0, 内容: txt.slice(0, 120) };
    })()`);
    console.log('结算:', JSON.stringify(result));

    console.log('\n=== JS 报错 ===');
    console.log(errors.length ? errors.slice(0, 15).join('\n') : '无');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
