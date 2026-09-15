'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        }).on('error', reject);
    });
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.on('message', data => {
            const message = JSON.parse(data);
            const resolve = this.pending.get(message.id);
            if (!resolve) return;
            this.pending.delete(message.id);
            resolve(message);
        });
    }

    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(method + ' timeout')), 8000);
            this.pending.set(id, message => { clearTimeout(timer); resolve(message); });
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (result.result && result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text || 'Runtime.evaluate failed');
        return result.result && result.result.result ? result.result.result.value : undefined;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-burst-balls-levels.json'), 'utf8'));
    assert(source.name === '爆破彩球' && source.levels.length === 29, 'native burst data count mismatch');
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-burst-cdp-'));
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://',
        '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank'
    ], { stdio: 'ignore' });
    let ws;
    try {
        let targets;
        for (let attempt = 0; attempt < 50; attempt += 1) {
            try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {}
            if (targets && targets.some(item => item.type === 'page')) break;
            await sleep(100);
        }
        const page = (targets || []).find(item => item.type === 'page');
        assert(page && page.webSocketDebuggerUrl, 'Chrome page target unavailable');
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const cdp = new CDP(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-burst-cdp=' + Date.now() });
        await cdp.evaluate(`new Promise(resolve => {
            const wait = () => window.PK32Variants ? resolve(true) : setTimeout(wait, 25);
            wait();
        })`);
        const result = await cdp.evaluate(`(async () => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const errors = [];
            window.addEventListener('error', event => errors.push(event.message || String(event.error || 'window error')));
            const game = window.PK32Variants.startGame(host, '爆破彩球', {});
            const cells = () => [...host.querySelectorAll('.pk32v-native-data [data-cell]')];
            const values = () => cells().map(node => node.dataset.value);
            for (let i = 0; i < 200; i += 1) {
                if (cells().length > 0) break;
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            const initial = values();
            const options = host.querySelectorAll('select option').length;
            const width = initial.length === 192 ? 12 : initial.length === 40 ? 8 : 6;
            function groupAt(start, board) {
                const color = board[start]; if (color === '0') return [];
                const result = [], queue = [start], seen = new Set([start]);
                while (queue.length) {
                    const index = queue.shift(); result.push(index);
                    const x = index % width, y = Math.floor(index / width);
                    [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
                        if (nx < 0 || nx >= width || ny < 0 || ny >= Math.ceil(board.length / width)) return;
                        const next = ny * width + nx;
                        if (!seen.has(next) && board[next] === color) { seen.add(next); queue.push(next); }
                    });
                }
                return result;
            }
            let candidate = -1, group = [];
            for (let index = 0; index < initial.length; index += 1) {
                const found = groupAt(index, initial);
                if (found.length >= 2) { candidate = index; group = found; break; }
            }
            const beforeCount = initial.filter(value => value !== '0').length;
            if (candidate >= 0) cells()[candidate].click();
            await new Promise(resolve => setTimeout(resolve, 30));
            const after = values();
            const afterCount = after.filter(value => value !== '0').length;
            const status = host.querySelector('.pk32v-status')?.textContent || '';
            const overflow = { innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth };
            if (game && game.destroy) game.destroy();
            return { options, initialLength: initial.length, candidate, groupLength: group.length, beforeCount, afterCount, status, overflow, errors };
        })()`);
        const checks = [
            ['29 native levels are selectable', result.options === 29],
            ['a native board loads', result.initialLength > 0],
            ['a connected group is selectable', result.candidate >= 0 && result.groupLength >= 2],
            ['selection removes exactly the connected group', result.afterCount === result.beforeCount - result.groupLength],
            ['mobile board does not overflow', result.overflow.document <= result.overflow.innerWidth && result.overflow.body <= result.overflow.innerWidth],
            ['no page runtime error', result.errors.length === 0]
        ];
        for (const [name, passed] of checks) console.log((passed ? 'PASS ' : 'FAIL ') + name);
        console.log(JSON.stringify({ game: '爆破彩球', result }, null, 2));
        if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
    } finally {
        if (ws) ws.close();
        chrome.kill();
    }
})().catch(error => { console.error('FAIL burst-cdp ' + (error.stack || error)); process.exitCode = 1; });
