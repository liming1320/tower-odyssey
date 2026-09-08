// 零依赖 CDP 验证：冒险战斗改为纵向后，小怪是否真的出现在画面上半部并「从上往下走」
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpv-'));
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
            body: JSON.stringify({username:'vert' + Date.now().toString().slice(-6), password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        return 'ok';
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);

    // 弱化的英雄，避免秒杀小怪，方便观察移动
    await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        for (let i=0;i<5;i++) await fetch('/api/wish',{method:'POST',headers:H});
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        for (const o of h.owned.slice(0,2)) await fetch('/api/hero/equip',{method:'POST',headers:H,body:JSON.stringify({uid:o.uid})});
        return h.owned.length;
    })()`);

    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
    await sleep(1800);
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('.floor-btn')].find(x=>!x.disabled); b.click(); return 1; })()`);
    await sleep(800);

    const info = await cdp.eval(`(() => {
        const c = document.querySelector('#battle-canvas');
        return { 画布: c.width + 'x' + c.height, 显示尺寸: c.clientWidth + 'x' + c.clientHeight,
                 topY: Math.round(Battle.topY), groundY: Math.round(Battle.groundY) };
    })()`);
    console.log('画布:', JSON.stringify(info));

    // 采样：统计上半区「非背景」像素的 y 质心，看它是否随时间下移
    const probe = `(() => {
        const c = document.querySelector('#battle-canvas');
        const ctx = c.getContext('2d');
        const dpr = c.width / c.clientWidth;
        const W = c.width, H = c.height;
        const top = Math.round(Battle.topY * dpr * 0.2);
        const bot = Math.round(Battle.groundY * dpr);
        const d = ctx.getImageData(0, top, W, bot - top).data;
        // 背景是连续渐变，用「水平方向梯度大的像素」判定为前景物体
        let cnt = 0, sy = 0;
        const rowW = W * 4;
        for (let y = 0; y < bot - top; y++) {
            for (let x = 1; x < W; x++) {
                const i = y * rowW + x * 4;
                const j = y * rowW + (x - 1) * 4;
                const diff = Math.abs(d[i]-d[j]) + Math.abs(d[i+1]-d[j+1]) + Math.abs(d[i+2]-d[j+2]);
                if (diff > 90) { cnt++; sy += y; }
            }
        }
        return { 前景像素: cnt, 质心y: cnt ? +(sy / cnt).toFixed(1) : -1,
                 怪数: (Battle.enemies||[]).length,
                 怪y: (Battle.enemies||[]).map(e => Math.round(e.y)).join(',') };
    })()`;

    for (let i = 0; i < 8; i++) {
        const s = await cdp.eval(probe);
        console.log(`  采样${i + 1}:`, JSON.stringify(s));
        await sleep(400);
    }

    // 抓一张图存档，便于人工核对
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const out = path.join('C:\\Users\\li\\Desktop', '战斗画面核对.png');
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log('截图已保存:', out);

    console.log('\n=== JS 报错 ===');
    console.log(errors.length ? errors.slice(0, 10).join('\n') : '无');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
