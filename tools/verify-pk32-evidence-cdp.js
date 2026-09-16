'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
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
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-evidence-cdp-'));
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
        await cdp.send('Page.navigate', { url: base + '?pk32-evidence-cdp=' + Date.now() });
        await cdp.eval(`new Promise(resolve => { const wait = () => window.MiniGames && window.MiniGames.pk32 && window.PK32Evidence ? resolve(true) : setTimeout(wait, 25); wait(); })`);
        const result = await cdp.eval(`(async () => {
            [...document.body.children].forEach(node => { node.style.display = 'none'; });
            const host = document.createElement('main'); host.id = 'pk32-evidence-test-host'; document.body.appendChild(host);
            const errors = []; const onError = event => errors.push(event.message || String(event.error || 'window error')); const onRejection = event => errors.push(String(event.reason || 'unhandled rejection'));
            window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
            const session = window.MiniGames.pk32.start(host, {});
            const waitFor = async predicate => { const end = performance.now() + 8000; while (performance.now() < end) { if (predicate()) return true; await new Promise(resolve => setTimeout(resolve, 20)); } return predicate(); };
            await waitFor(() => host.querySelectorAll('[data-pk32-evidence]').length === 213);
            const catalog = { evidenceButtons: host.querySelectorAll('[data-pk32-evidence]').length, dedicatedButtons: host.querySelectorAll('[data-pk32-launch],[data-pk32-module],[data-pk32-puzzle],[data-pk32-variant]').length };
            const record = window.PK32Catalog.find(item => item.name === '\\u8001\\u864e\\u673a'); const entry = host.querySelector('[data-pk32-id="' + record.id + '"]'); const onlyEvidence = entry.querySelectorAll('button').length === 1; entry.querySelector('[data-pk32-evidence]').click();
            await waitFor(() => !!host.querySelector('.pk32-evidence-payload') && host.querySelector('.pk32-evidence-payload').textContent.length > 0);
            const evidence = { text: host.querySelector('.pk32-evidence').textContent, payloadLength: host.querySelector('.pk32-evidence-payload').textContent.length, fakeGame: !!host.querySelector('.pk32v-game,.pk32p,.pk32-board-ui') };
            [...host.querySelectorAll('button')].find(button => button.textContent === '返回 PK32 目录').click();
            await waitFor(() => host.querySelectorAll('[data-pk32-evidence]').length === 213);
            const returnedToCatalog = host.querySelectorAll('[data-pk32-evidence]').length === 213; const overflow = document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth;
            session.stop(); window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
            return { catalog, onlyEvidence, evidence, returnedToCatalog, overflow, errors };
        })()`);
        assert.equal(result.catalog.evidenceButtons, 213); assert.equal(result.catalog.dedicatedButtons, 40); assert.equal(result.onlyEvidence, true); assert.match(result.evidence.text, /语义与规则未验证/); assert.ok(result.evidence.payloadLength > 0); assert.equal(result.evidence.fakeGame, false); assert.equal(result.returnedToCatalog, true); assert.equal(result.overflow, false); assert.deepEqual(result.errors, []);
        console.log(JSON.stringify(result));
    } finally { chrome.kill(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
