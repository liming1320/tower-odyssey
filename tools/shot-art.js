/* 截图：英雄美术预览页（立绘 / 头像 / 星级）
 *   node tools/shot-art.js
 * 输出 tools/shots/art-preview.png（整页）与 art-stars.png（星级规则区）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9347;
const BASE = 'http://localhost:5180/art-preview.html';
const OUT = path.join(__dirname, 'shots');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
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
        if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
    async shot(file, clip) {
        const p = { format: 'png', captureBeyondViewport: true };
        if (clip) { p.clip = Object.assign({ scale: 1 }, clip); delete p.captureBeyondViewport; }
        const r = await this.send('Page.captureScreenshot', p);
        fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
        console.log('   📷', path.basename(file), fs.statSync(file).size + ' B');
    }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpart-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=1300,1000', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });

    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);

    const info = await cdp.eval(`(() => ({
        卡片数: document.querySelectorAll('.ac').length,
        星标数: document.querySelectorAll('.star-line .stars').length,
        立绘加载失败: [...document.querySelectorAll('img.full')].filter(i => !i.complete || i.naturalWidth === 0).length,
        头像加载失败: [...document.querySelectorAll('img.ava')].filter(i => !i.complete || i.naturalWidth === 0).length,
        页高: document.body.scrollHeight,
    }))()`);
    console.log('页面检查:', JSON.stringify(info));

    // 星级规则区
    const box = await cdp.eval(`(() => { const r = document.querySelector('.rules').getBoundingClientRect();
        return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; })()`);
    await cdp.shot(path.join(OUT, 'art-stars.png'), box);

    // 前 12 个英雄
    const g = await cdp.eval(`(() => { const items = [...document.querySelectorAll('.ac')].slice(0, 12);
        const a = items[0].getBoundingClientRect(), b = items[items.length-1].getBoundingClientRect();
        return { x: a.x - 8, y: a.y - 8, width: b.right - a.x + 16, height: b.bottom - a.y + 16 }; })()`);
    await cdp.shot(path.join(OUT, 'art-heroes.png'), g);

    await cdp.shot(path.join(OUT, 'art-preview.png'));
    proc.kill();
    console.log('✅ 完成');
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
