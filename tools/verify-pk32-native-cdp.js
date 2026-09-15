'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const WebSocket = require('ws');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
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
            if (message.method === 'Runtime.consoleAPICalled') {
                const values = (message.params.args || []).map(arg => arg.value == null ? '' : arg.value);
                console.log('PAGE ' + values.join(' '));
            }
            if (message.id && this.waiters.has(message.id)) { this.waiters.get(message.id)(message); this.waiters.delete(message.id); }
        });
    }
    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(method + ' timeout')), 20000);
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
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-native-cdp=' + Date.now() });
        await sleep(1000);
        const smoke = await cdp.eval('JSON.stringify({ ready: document.readyState, title: document.title, variants: !!window.PK32Variants, body: document.body ? document.body.children.length : -1 })');
        console.log('SMOKE ' + smoke);
        const result = await cdp.eval(`(async () => {
            const output = [];
            async function check(name, expected) {
                const startedAt = performance.now();
                console.log('CHECK_START ' + name);
                const host = document.createElement('div');
                document.body.appendChild(host);
                const errors = [];
                const onError = event => errors.push(event.message);
                const onRejection = event => errors.push(String(event.reason && event.reason.message || event.reason));
                window.addEventListener('error', onError);
                window.addEventListener('unhandledrejection', onRejection);
                window.__MG_TEST = true;
                let game = null;
                let row;
                try {
                    game = window.PK32Variants.startGame(host, name, {});
                    const deadline = performance.now() + 2500;
                    let ready = false;
                    while (performance.now() < deadline) {
                        ready = name === '电磁彩球' ? host.querySelectorAll('[data-board=electromagnetic] [data-cell]').length === 256 :
                            name === '同色方块' ? host.querySelectorAll('.pk32v-native-data [data-cell]').length === 192 :
                                !!host.querySelector('.pk32v-grid');
                        if (ready) break;
                        await new Promise(resolve => setTimeout(resolve, 20));
                    }
                    row = {
                        name,
                        ready,
                        elapsed: Math.round(performance.now() - startedAt),
                        grid: host.querySelector('[data-board=electromagnetic]') ? host.querySelectorAll('[data-board=electromagnetic] [data-cell]').length : host.querySelector('.pk32v-grid') ? host.querySelector('.pk32v-grid').children.length : host.querySelectorAll('[data-cell]').length,
                        options: host.querySelector('select') ? host.querySelector('select').options.length : 0,
                        prompt: host.querySelector('.pk32v-prompt') ? host.querySelector('.pk32v-prompt').textContent : '',
                        errors
                    };
                } catch (error) {
                    row = { name, ready: false, elapsed: Math.round(performance.now() - startedAt), grid: host.querySelectorAll('[data-cell]').length, options: host.querySelector('select') ? host.querySelector('select').options.length : 0, prompt: host.querySelector('.pk32v-prompt') ? host.querySelector('.pk32v-prompt').textContent : '', errors, error: String(error && error.stack || error) };
                }
                try {
                if (name === '电磁彩球' && row.ready) {
                    const nodes = [...host.querySelectorAll('[data-board=electromagnetic] [data-cell]')];
                    const fixed = nodes.find(node => node.dataset.value === '5');
                    const empty = nodes.find(node => node.dataset.value === '0');
                    const fixedImage = fixed ? getComputedStyle(fixed).backgroundImage : '';
                    const emptyImage = empty ? getComputedStyle(empty).backgroundImage : '';
                    const debug = window.__pk32ElectromagneticDebug;
                    const blank = () => Array(256).fill('0');
                    const chain = blank(); chain[1] = '1'; chain[2] = '2';
                    const blocked = blank(); blocked[0] = '5'; blocked[1] = '1'; blocked[2] = '2';
                    const joined = blank(); joined[1] = '1'; joined[2] = '1';
                    const before = debug.getState().cells.join('');
                    const moves = [['ArrowLeft', -1, 0], ['ArrowUp', 0, -1], ['ArrowRight', 1, 0], ['ArrowDown', 0, 1]];
                    const legal = moves.find(move => debug.shift(debug.getState().cells, move[1], move[2]).join('') !== before);
                    if (legal) document.dispatchEvent(new KeyboardEvent('keydown', { key: legal[0], bubbles: true }));
                    const after = debug.getState().cells.join('');
                    const undo = [...host.querySelectorAll('button')].find(button => button.textContent === '撤销上一步');
                    if (undo) undo.click();
                    row.electromagnetic = {
                        fixedImage,
                        emptyImage,
                        chain: debug.shift(chain, -1, 0).slice(0, 4).join(''),
                        blocked: debug.shift(blocked, -1, 0).slice(0, 4).join(''),
                        joined: debug.shift(joined, -1, 0).slice(0, 4).join(''),
                        moved: before !== after,
                        undone: debug.getState().cells.join('') === before,
                        overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth
                    };
                }
                if (name === '同色方块' && row.ready) {
                    const nodes = [...host.querySelectorAll('.pk32v-native-data [data-cell]')], values = nodes.map(node => node.dataset.value);
                    function connected(start) { const value = values[start], found = [], queue = [start], seen = new Set([start]); while (queue.length) { const index = queue.shift(); found.push(index); const x = index % 12, y = Math.floor(index / 12); [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (point) { if (point[0] < 0 || point[0] >= 12 || point[1] < 0 || point[1] >= 16) return; const next = point[1] * 12 + point[0]; if (!seen.has(next) && values[next] === value) { seen.add(next); queue.push(next); } }); } return found; }
                    const candidate = values.findIndex(function (value, index) { return value !== '0' && connected(index).length >= 2; });
                    const group = candidate >= 0 ? connected(candidate) : [];
                    const before = values.filter(function (value) { return value !== '0'; }).length;
                    if (candidate >= 0) nodes[candidate].click();
                    await new Promise(resolve => setTimeout(resolve, 30));
                    const after = [...host.querySelectorAll('.pk32v-native-data [data-cell]')].filter(function (node) { return node.dataset.value !== '0'; }).length;
                    row.sameColor = { candidate: candidate, group: group.length, before: before, after: after, overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth };
                }
                } catch (error) {
                    row.error = String(error && error.stack || error);
                }
                output.push(row);
                console.log('CHECK_DONE ' + JSON.stringify(row));
                try { if (game && game.destroy) game.destroy(); } catch (error) { row.cleanupError = String(error && error.stack || error); }
                window.removeEventListener('error', onError);
                window.removeEventListener('unhandledrejection', onRejection);
                host.remove();
            }
            await check('同步移动', { grid: 142, options: 261 });
            await check('木乃伊', { grid: 42, options: 222 });
            await check('电磁彩球', { grid: 256, options: 160 });
            await check('同色方块', { grid: 192, options: 3 });
            return output;
        })()`);
        const expected = {
            '同步移动': row => row.grid === 142 && row.options === 261,
            '木乃伊': row => row.grid === 42 && row.options === 222,
            '电磁彩球': row => row.grid === 256 && row.options === 160 &&
                /sheet-d3525b\.png/.test(row.electromagnetic.fixedImage) && row.electromagnetic.emptyImage === 'none' &&
                row.electromagnetic.chain === '1200' && row.electromagnetic.blocked === '5120' &&
                row.electromagnetic.joined === '1100' && row.electromagnetic.moved && row.electromagnetic.undone &&
                !row.electromagnetic.overflow,
            '同色方块': row => row.grid === 192 && row.options === 3 && row.sameColor && row.sameColor.candidate >= 0 && row.sameColor.group >= 2 && row.sameColor.after === row.sameColor.before - row.sameColor.group && !row.sameColor.overflow
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
