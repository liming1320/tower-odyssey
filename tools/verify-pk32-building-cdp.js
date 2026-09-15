'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = url => new Promise((resolve, reject) => { http.get(url, response => { let data = ''; response.on('data', chunk => data += chunk); response.on('end', () => resolve(JSON.parse(data))); }).on('error', reject); });
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); ws.on('message', data => { const msg = JSON.parse(data); if (msg.id && this.waiters.has(msg.id)) { this.waiters.get(msg.id)(msg); this.waiters.delete(msg.id); } }); }
    send(method, params) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params: params || {} })); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(method + ' timeout')), 5000); this.waiters.set(id, msg => { clearTimeout(timer); resolve(msg); }); }); }
    eval(expression) { return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => { if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text); return result.result.result.value; }); }
}
(async () => {
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-building-'));
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'http://127.0.0.1:5180'], { stdio: 'ignore' });
    try {
        let targets;
        for (let i = 0; i < 40; i++) { try { targets = await json('http://127.0.0.1:' + port + '/json/list'); } catch (_) {} if (targets && targets.find(x => x.type === 'page')) break; await sleep(100); }
        const page = targets.find(x => x.type === 'page');
        const cdp = new CDP(new WebSocket(page.webSocketDebuggerUrl));
        await new Promise(resolve => cdp.ws.once('open', resolve));
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5180/?pk32-building-verify=' + Date.now() });
        await sleep(1200);
        const result = await cdp.eval("(async () => { const host=document.createElement('div'); document.body.appendChild(host); const game=window.PK32Variants.startGame(host,'建筑制造',{}); for(let i=0;i<100&&!host.querySelector('.pk32v-grid');i++) await new Promise(r=>setTimeout(r,20)); const select=host.querySelector('select'); const first=host.querySelectorAll('.pk32v-grid button').length; if(select){select.value='48';select.dispatchEvent(new Event('change',{bubbles:true}));} await new Promise(r=>setTimeout(r,50)); return {levels:select?select.options.length:0,first:first,level49:host.querySelectorAll('.pk32v-grid button').length, prompt:host.querySelector('.pk32v-prompt')?.textContent||'', errors:[]}; })()");
        const expected = result.first === 36 && result.level49 === 36 && /1 \/ 53/.test(result.prompt);
        console.log(JSON.stringify({ result, passed: expected }));
        if (!expected) process.exitCode = 1;
    } finally { chrome.kill(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
