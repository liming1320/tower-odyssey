'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const WebSocket = require('ws');

const base = 'http://127.0.0.1:5180';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = url => new Promise((resolve, reject) => {
    http.get(url, response => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
});
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.waiters = new Map();
        ws.on('message', data => {
            const message = JSON.parse(data);
            if (message.id && this.waiters.has(message.id)) { this.waiters.get(message.id)(message); this.waiters.delete(message.id); }
        });
    }
    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(method + ' timeout')), 5000);
            this.waiters.set(id, message => { clearTimeout(timer); resolve(message); });
        });
    }
    eval(expression) {
        return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => {
            if (result.result && result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
            return result.result.result.value;
        });
    }
}

(async () => {
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-native-cdp-'));
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://',
        '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, base
    ], { stdio: 'ignore' });
    try {
        let targets;
        for (let attempt = 0; attempt < 40; attempt += 1) {
            try { targets = await json('http://127.0.0.1:' + port + '/json/list'); } catch (_) {}
            if (targets && targets.some(item => item.type === 'page')) break;
            await sleep(100);
        }
        const page = (targets || []).find(item => item.type === 'page');
        if (!page) throw new Error('Chrome page target unavailable');
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const cdp = new CDP(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Page.navigate', { url: base + '?pk32-native-cdp=' + Date.now() });
        await sleep(1000);
        const result = await cdp.eval(`(async () => {
            const output = [];
            async function check(name, expected) {
                const host = document.createElement('div');
                document.body.appendChild(host);
                const errors = [];
                const onError = event => errors.push(event.message);
                window.addEventListener('error', onError);
                const game = window.PK32Variants.startGame(host, name, {});
                for (let i = 0; i < 250; i += 1) {
                    const ready = name === '电磁彩球' ? host.querySelectorAll('[data-board=electromagnetic] [data-cell]').length === 256 :
                        name === '建筑制造' ? /53 条盘面已加载/.test(host.querySelector('.pk32v-prompt')?.textContent || '') :
                            !!host.querySelector('.pk32v-grid');
                    if (ready) break;
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
                const row = {
                    name,
                    grid: host.querySelector('[data-board=electromagnetic]') ? host.querySelectorAll('[data-board=electromagnetic] [data-cell]').length : host.querySelector('.pk32v-grid') ? host.querySelector('.pk32v-grid').children.length : 0,
                    options: host.querySelector('select') ? host.querySelector('select').options.length : 0,
                    prompt: host.querySelector('.pk32v-prompt') ? host.querySelector('.pk32v-prompt').textContent : '',
                    errors
                };
                if (name === '建筑制造') {
                    const next = [...host.querySelectorAll('button')].find(button => button.textContent === '下一关');
                    if (next) next.click();
                    row.afterNext = host.querySelector('.pk32v-prompt') ? host.querySelector('.pk32v-prompt').textContent : '';
                }
                output.push(row);
                if (game && game.destroy) game.destroy();
                window.removeEventListener('error', onError);
            }
            await check('同步移动', { grid: 142, options: 261 });
            await check('木乃伊', { grid: 42, options: 222 });
            await check('电磁彩球', { grid: 256, options: 160 });
            await check('建筑制造', { grid: 36, options: 0 });
            return output;
        })()`);
        const expected = {
            '同步移动': row => row.grid === 142 && row.options === 261,
            '木乃伊': row => row.grid === 42 && row.options === 222,
            '电磁彩球': row => row.grid === 256 && row.options === 160,
            '建筑制造': row => row.grid === 36 && row.options === 0 && /1 \/ 53/.test(row.prompt) && /2 \/ 53/.test(row.afterNext || '')
        };
        for (const row of result) {
            const passed = expected[row.name](row) && row.errors.length === 0;
            console.log((passed ? 'PASS ' : 'FAIL ') + row.name + ' ' + JSON.stringify(row));
            if (!passed) process.exitCode = 1;
        }
    } finally {
        chrome.kill();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
