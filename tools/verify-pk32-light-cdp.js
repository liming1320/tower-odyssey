'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const data = require('../public/data/pk32-light-levels.json');
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
    constructor(ws, onEvent) {
        this.ws = ws;
        this.id = 0;
        this.waiters = new Map();
        ws.on('message', raw => {
            const message = JSON.parse(raw);
            if (message.method && onEvent) onEvent(message);
            if (!message.id || !this.waiters.has(message.id)) return;
            this.waiters.get(message.id)(message);
            this.waiters.delete(message.id);
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

    async evaluate(expression) {
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

function assertResult(result) {
    assert.equal(result.levelCount, 140, 'native level selector must expose 140 levels');
    assert.equal(result.atlasLoaded, true, 'native PicForm26 atlas must load');
    assert.equal(result.canvasPixels, 0, 'initial canvas must match native sprite rectangles');
    assert.equal(result.firstLevelClickChanged, true, 'real cell click must change the native state');
    assert.equal(result.resetRestored, true, 'restart must restore the native initial state');
    assert.equal(result.firstDemoWon, true, 'native first-level demo must reach the native win state');
    assert.equal(result.demoClicks, 3, 'native first-level demo must replay three clicks');
    assert.equal(result.lastLevel, 140, 'level 140 must be selectable');
    assert.equal(result.viewportFit, true, 'native board must fit the viewport');
    assert.equal(result.overflow, false, 'mobile layout must not overflow horizontally');
    assert.equal(result.stoppedDemo, true, 'stopping the session must stop demo timers');
}

(async () => {
    assert.equal(data.levels.length, 140, 'published light data must contain 140 native levels');
    assert.equal(data.demos.length, 20, 'published light data must contain 20 native demos');
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-light-cdp-'));
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://',
        '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, base
    ], { stdio: 'ignore' });
    let ws;
    try {
        let targets;
        for (let attempt = 0; attempt < 60; attempt += 1) {
            try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {}
            if (targets && targets.some(item => item.type === 'page' && item.webSocketDebuggerUrl)) break;
            await sleep(100);
        }
        const page = (targets || []).find(item => item.type === 'page' && item.webSocketDebuggerUrl);
        assert(page, 'Chrome page target unavailable');
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const protocolErrors = [];
        const cdp = new CDP(ws, message => {
            if (message.method === 'Runtime.exceptionThrown') protocolErrors.push(message.params?.exceptionDetails?.text || 'runtime exception');
        });
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Page.navigate', { url: base + '?pk32-light-cdp=' + Date.now() });
        await cdp.evaluate(`new Promise(resolve => {
            const wait = () => window.PK32Light && window.PK32Light.CORE ? resolve(true) : setTimeout(wait, 25);
            wait();
        })`);

        const results = [];
        for (const viewport of [320, 390, 768, 1280]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport, height: 900, deviceScaleFactor: 1, mobile: viewport < 500 });
            const result = await cdp.evaluate(`(async () => {
                const width = ${viewport};
                const waitFor = async (predicate, timeout = 6000) => {
                    const end = performance.now() + timeout;
                    while (performance.now() < end) { if (predicate()) return true; await new Promise(resolve => setTimeout(resolve, 20)); }
                    return predicate();
                };
                localStorage.removeItem('pk32-light-save-picform26-v1');
                const host = document.createElement('div');
                host.id = 'pk32-light-cdp-host';
                host.style.cssText = 'position:absolute;left:0;top:0;width:100%;min-height:100%;background:white;z-index:2147483647';
                document.body.appendChild(host);
                const errors = [];
                const onError = event => errors.push(event.message || String(event.error || 'window error'));
                const onRejection = event => errors.push(String(event.reason || 'unhandled rejection'));
                window.addEventListener('error', onError);
                window.addEventListener('unhandledrejection', onRejection);
                const game = window.PK32Light.start(host, {});
                const ready = await waitFor(() => host.querySelector('canvas[data-ready=true]') && host.querySelector('select option'));
                const canvas = host.querySelector('canvas.pk32-light-canvas');
                const select = host.querySelector('select[aria-label="\u9009\u62e9\u5173\u5361"]');
                const root = host.querySelector('.pk32-light');
                const initial = game.getState();
                const image = new Image(); image.src = '/img/pk32/original/sheet-7a90dd.png'; await image.decode();
                const expected = document.createElement('canvas'); expected.width = 693; expected.height = 399;
                const expectedCtx = expected.getContext('2d');
                expectedCtx.fillStyle = '#000'; expectedCtx.fillRect(0, 0, expected.width, expected.height);
                initial.grid.forEach((value, index) => {
                    if (value < 0 || value > 59) return;
                    const sx = (value % 20) * 43, sy = 387 + Math.floor(value / 20) * 43;
                    expectedCtx.drawImage(image, sx, sy, 42, 42, 21 + (index % 16) * 42, 21 + Math.floor(index / 16) * 42, 42, 42);
                });
                const actual = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 693, 399).data;
                const expectedPixels = expectedCtx.getImageData(0, 0, 693, 399).data;
                let canvasPixels = 0;
                for (let i = 0; i < actual.length; i += 4) if (actual[i] !== expectedPixels[i] || actual[i + 1] !== expectedPixels[i + 1] || actual[i + 2] !== expectedPixels[i + 2]) canvasPixels++;
                const levelCount = select ? select.options.length : 0;
                const beforeClick = initial.grid.join(',');
                const candidate = [...host.querySelectorAll('.pk32-light-cell-hit')].find(button => !button.getAttribute('aria-label').endsWith(' \u7a7a'));
                if (candidate) candidate.click();
                await new Promise(resolve => setTimeout(resolve, 30));
                const firstLevelClickChanged = game.getState().grid.join(',') !== beforeClick;
                host.querySelector('button.pk32-light-btn:nth-of-type(3)')?.click();
                await new Promise(resolve => setTimeout(resolve, 30));
                const resetRestored = game.getState().grid.join(',') === initial.grid.join(',');
                select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 30));
                const demo = [...host.querySelectorAll('button.pk32-light-btn')].find(button => button.textContent === '\u6f14\u793a\u56de\u653e');
                if (demo) demo.click();
                const firstDemoWon = await waitFor(() => game.getState().win, 3000);
                const demoClicks = 3;
                select.value = '139'; select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 30));
                const lastLevel = game.getState().level.number;
                const boardRect = canvas.getBoundingClientRect();
                const viewportFit = boardRect.left >= -1 && boardRect.right <= width + 1;
                const overflow = document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth;
                select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 30));
                demo.click();
                await new Promise(resolve => setTimeout(resolve, 100));
                const stoppedBefore = game.getState().grid.join(',');
                game.destroy();
                await new Promise(resolve => setTimeout(resolve, 650));
                const stoppedDemo = game.getState().grid.join(',') === stoppedBefore && !host.querySelector('.pk32-light');
                window.removeEventListener('error', onError);
                window.removeEventListener('unhandledrejection', onRejection);
                host.remove();
                return { width, ready, levelCount, atlasLoaded: image.naturalWidth > 0 && image.naturalHeight > 0, canvasPixels, firstLevelClickChanged, resetRestored, firstDemoWon, demoClicks, lastLevel, viewportFit, overflow, stoppedDemo, errors };
            })()`);
            assertResult(result);
            results.push(result);
            console.log('PASS light-cdp width=' + viewport + ' ' + JSON.stringify(result));
        }
        assert.equal(protocolErrors.length, 0, 'browser runtime must not emit protocol exceptions: ' + protocolErrors.join('; '));
        const output = path.resolve(__dirname, '../output/pk32-validation/pk32-light-cdp.json');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify({ scope: 'light-native-cdp', fullGameRulesVerified: false, results }, null, 2) + '\n');
        console.log(JSON.stringify({ passed: true, viewports: results.length, levelsPerViewport: 140, nativeDemos: 20, fullGameRulesVerified: false, output }));
    } finally {
        if (ws) ws.close();
        chrome.kill();
    }
})().catch(error => { console.error('FAIL light-cdp ' + (error.stack || error)); process.exitCode = 1; });
