'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const WebSocket = require('ws');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const getJson = url => new Promise((resolve, reject) => { http.get(url, response => { let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve(JSON.parse(body))); }).on('error', reject); });

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); ws.on('message', raw => { const message = JSON.parse(raw); if (message.id && this.waiters.has(message.id)) { this.waiters.get(message.id)(message); this.waiters.delete(message.id); } }); }
    send(method, params) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params: params || {} })); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(method + ' timeout')), 20000); this.waiters.set(id, message => { clearTimeout(timer); resolve(message); }); }); }
    eval(expression) { return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }).then(result => { if (result.result && result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text || 'Runtime.evaluate failed'); return result.result.result.value; }); }
}

(async () => {
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-pipe-cdp-'));
    const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, base], { stdio: 'ignore' });
    try {
        let targets;
        for (let attempt = 0; attempt < 50; attempt += 1) { try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {} if (targets && targets.some(item => item.type === 'page')) break; await sleep(100); }
        const page = (targets || []).find(item => item.type === 'page');
        assert(page);
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const cdp = new CDP(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-pipe-cdp=' + Date.now() });
        await cdp.eval(`new Promise(resolve => { const wait = () => window.PK32Catalog && window.MiniGames && window.MiniGames.pk32 ? resolve(true) : setTimeout(wait, 25); wait(); })`);
        const result = await cdp.eval(`(async () => {
            const host = document.createElement('div'); host.id = 'pk32-pipe-cdp-host'; host.style.cssText = 'position:absolute;left:0;top:0;width:100%;min-height:100%;background:#fff;z-index:2147483647'; document.body.appendChild(host);
            const errors = []; const onError = event => errors.push(event.message || String(event.error || 'window error')); const onRejection = event => errors.push(String(event.reason || 'unhandled rejection'));
            window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
            const catalog = window.MiniGames.pk32.start(host, {}); const record = window.PK32Catalog.find(row => row.name === '\\u63a5\\u6c34\\u7ba1'); const entry = record && host.querySelector('[data-pk32-id="' + record.id + '"]'); const launch = entry && entry.querySelector('[data-pk32-variant="' + record.id + '"]'); if (launch) launch.click();
            const waitFor = async predicate => { const end = performance.now() + 6000; while (performance.now() < end) { if (predicate()) return true; await new Promise(resolve => setTimeout(resolve, 20)); } return predicate(); };
            const ready = await waitFor(() => !!host.querySelector('select[aria-label="接水管难度"]') && host.querySelectorAll('.pipe-connect-native-board > button').length === 96); if (!ready) throw new Error('pipe connect launch did not become ready');
            const select = host.querySelector('select[aria-label="接水管难度"]'); const loaded = [];
            for (let index = 0; index < select.options.length; index += 1) { select.value = String(index + 1); select.dispatchEvent(new Event('change', { bubbles: true })); await waitFor(() => host.querySelectorAll('.pipe-connect-native-board > button').length === 96); const board = host.querySelector('.pipe-connect-native-board'); const prompt = (host.querySelector('.pk32v-prompt') || {}).textContent || ''; loaded.push({ difficulty: index + 1, prompt, cells: board.children.length, required: Number(board.dataset.required) }); }
            const candidate = [...host.querySelectorAll('.pipe-connect-native-board > button')].find(node => Number(node.dataset.nativeCode) < 0); const cell = candidate ? candidate.dataset.cell : ''; const before = candidate ? candidate.dataset.nativeCode : ''; if (candidate) candidate.click(); await new Promise(resolve => setTimeout(resolve, 20)); const replacement = cell ? host.querySelector('.pipe-connect-native-board > button[data-cell="' + cell + '"]') : null; const after = replacement ? replacement.dataset.nativeCode : '';
            const overflow = document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth; if (catalog && catalog.stop) catalog.stop(); window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
            return { catalogEntry: !!(entry && launch), ready, levelCount: select.options.length, loaded, placed: !!replacement && before !== after, onlyFiveExposed: select.options.length === 5, overflow, errors, destroyed: !host.querySelector('.pk32v-game') };
        })()`);
        console.log(JSON.stringify({ game: '\u63a5\u6c34\u7ba1', result }));
        assert.equal(result.catalogEntry, true); assert.equal(result.ready, true); assert.equal(result.levelCount, 5); assert.ok(result.loaded.every(item => item.cells === 96 && item.prompt.includes('12×8') && item.required === item.difficulty * 10 + 20)); assert.equal(result.onlyFiveExposed, true); assert.equal(result.placed, true); assert.equal(result.overflow, false); assert.deepEqual(result.errors, []); assert.equal(result.destroyed, true);
        console.log(JSON.stringify({ game: '\u63a5\u6c34\u7ba1', result, passed: true }));
    } finally { chrome.kill(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
