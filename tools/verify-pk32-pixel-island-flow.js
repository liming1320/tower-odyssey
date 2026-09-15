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
        this.waiters = new Map();
        this.events = new Map();
        ws.on('message', data => {
            const message = JSON.parse(data);
            if (message.id && this.waiters.has(message.id)) {
                this.waiters.get(message.id)(message);
                this.waiters.delete(message.id);
            }
            if (message.method && this.events.has(message.method)) {
                this.events.get(message.method).forEach(handler => handler(message.params || {}));
            }
        });
    }

    on(method, handler) {
        if (!this.events.has(method)) this.events.set(method, []);
        this.events.get(method).push(handler);
    }

    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(method + ' timeout')), 8000);
            this.waiters.set(id, message => { clearTimeout(timer); resolve(message); });
        });
    }

    async eval(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
            userGesture: true
        });
        if (result.result && result.result.exceptionDetails) {
            throw new Error(result.result.exceptionDetails.text || 'Runtime.evaluate failed');
        }
        return result.result && result.result.result ? result.result.result.value : undefined;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-pixel-island-levels.json'), 'utf8'));
    const nativeBoards = (data.levels || []).filter(level => level && level.length === 100);
    assert(nativeBoards.length > 0, 'no native 5x5 pixel-island boards in data');

    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-pixel-island-flow-'));
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://',
        '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, base
    ], { stdio: 'ignore' });

    let ws;
    try {
        let targets;
        for (let attempt = 0; attempt < 50; attempt += 1) {
            try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {}
            if (targets && targets.some(item => item.type === 'page' && item.url && item.url.startsWith(base))) break;
            await sleep(100);
        }
        const page = (targets || []).find(item => item.type === 'page' && item.url && item.url.startsWith(base));
        assert(page, 'Chrome page target unavailable');
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const cdp = new CDP(ws);
        const protocolErrors = [];
        cdp.on('Runtime.exceptionThrown', event => {
            const details = event.exceptionDetails || {};
            protocolErrors.push(details.text || details.exception?.description || 'Runtime exception');
        });
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-pixel-island-flow=' + Date.now() });
        await cdp.eval(`new Promise(resolve => {
            const wait = () => window.PK32Variants ? resolve(true) : setTimeout(wait, 25);
            wait();
        })`);

        const result = await cdp.eval(`(async () => {
            const host = document.createElement('div');
            host.id = 'pk32-pixel-island-flow-test';
            document.body.appendChild(host);
            const errors = [];
            const rejections = [];
            const onError = event => errors.push(event.message || String(event.error || 'window error'));
            const onRejection = event => rejections.push(String(event.reason || 'unhandled rejection'));
            window.addEventListener('error', onError);
            window.addEventListener('unhandledrejection', onRejection);
            window.__MG_TEST = true;
            let game;
            try { game = window.PK32Variants.startGame(host, '像素岛', {}); }
            catch (error) { errors.push(String(error && error.stack || error)); }

            for (let i = 0; i < 100; i += 1) {
                if (host.querySelectorAll('.pixel-island-board [data-cell]').length === 25) break;
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            const cells = () => [...host.querySelectorAll('.pixel-island-board [data-cell]')];
            const state = () => cells().map(cell => ({
                text: cell.textContent,
                raw: cell.dataset.rawState || '',
                selected: cell.classList.contains('selected'),
                disabled: cell.disabled
            }));
            const before = state();
            const first = cells()[0];
            if (first) first.click();
            await new Promise(resolve => setTimeout(resolve, 30));
            const after = state();
            const overflow = { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth };

            // A completion check must come from the game, not from this test changing the DOM.
            const completionBefore = /过关|成功|完成|恭喜|消失/.test(host.textContent || '');
            const completionApi = window.__pk32PixelIslandDebug || null;
            let simpleBoardPassed = false;
            if (completionApi && typeof completionApi.solveSimpleBoard === 'function') {
                simpleBoardPassed = !!(await completionApi.solveSimpleBoard());
            } else {
                const passButton = [...host.querySelectorAll('button')].find(button => /过关|完成|验证/.test(button.textContent || ''));
                if (passButton) { passButton.click(); await new Promise(resolve => setTimeout(resolve, 30)); }
                simpleBoardPassed = /过关|成功|完成|恭喜/.test(host.textContent || '') && !completionBefore;
            }
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            if (game && typeof game.destroy === 'function') game.destroy();
            return {
                cellCount: before.length,
                before,
                after,
                overflow,
                errors,
                rejections,
                simpleBoardPassed,
                hasCompletionApi: !!completionApi
            };
        })()`);

        const checks = [
            ['native 5x5 board loads', result.cellCount === 25],
            ['click changes puzzle state', result.before.some((cell, i) => cell.raw !== result.after[i]?.raw || cell.text !== result.after[i]?.text)],
            ['a solvable simple board can pass', result.simpleBoardPassed],
            ['mobile viewport has no horizontal overflow', result.overflow.scrollWidth <= result.overflow.innerWidth && result.overflow.bodyScrollWidth <= result.overflow.innerWidth],
            ['no pageerror/runtime error', protocolErrors.length === 0 && result.errors.length === 0 && result.rejections.length === 0]
        ];
        for (const [name, passed] of checks) console.log((passed ? 'PASS ' : 'FAIL ') + name);
        console.log(JSON.stringify({ dataBoards: nativeBoards.length, result, protocolErrors }, null, 2));
        if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
    } finally {
        if (ws) ws.close();
        chrome.kill();
    }
})().catch(error => { console.error('FAIL pixel-island-flow ' + (error.stack || error)); process.exitCode = 1; });
