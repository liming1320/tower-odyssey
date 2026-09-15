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
const data = require('../public/data/pk32-sokoban4-levels.json');
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
    assert.equal(result.levelCount, 23, 'native dispatch must expose 23 levels');
    assert.equal(result.catalogEntry, true, 'catalog must expose the verified migration entry');
    assert.equal(result.genericBoard, 0, 'verified route must not enter generic Sokoban');
    assert.equal(result.nativeTiles, 99, 'native canvas must match all 99 board tiles');
    assert.equal(result.firstLevelWon, true, 'native first-level move sequence must win');
    assert.equal(result.firstLevelDemo, '123', 'native first-level demo must use extracted keys');
    assert.equal(result.demoElapsed >= 580 && result.demoElapsed < 1400, true, 'demo cadence must be native 600 ms');
    assert.equal(result.undoRestored, true, 'undo must restore the full previous state');
    assert.equal(result.keyboardMoved, true, 'keyboard input must move the player');
    assert.equal(result.wrapped, true, 'level 23 next action must wrap to level 1');
    assert.equal(result.viewportFit, true, 'board must remain inside the viewport');
    assert.equal(result.overflow, false, 'mobile layout must not overflow horizontally');
    assert.equal(result.returnedToCatalog, true, 'back action must return to PK32 catalog');
    assert.equal(result.stoppedTimer, true, 'stopping the session must stop animation timers');
    assert.equal(result.casualEntry, true, 'standalone PK32 puzzle entry must remain available');
}

(async () => {
    assert.equal(data.levels.length, 23, 'published native level data must contain 23 levels');
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-sokoban4-cdp-'));
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
        await cdp.send('Page.navigate', { url: base + '?pk32-sokoban4-cdp=' + Date.now() });
        await cdp.evaluate(`new Promise(resolve => {
            const wait = () => window.PK32Sokoban4 && window.MiniGames && window.MiniGames.pk32 ? resolve(true) : setTimeout(wait, 25);
            wait();
        })`);

        const results = [];
        for (const viewport of [320, 390, 768, 1280]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport, height: 900, deviceScaleFactor: 1, mobile: viewport < 500 });
            const result = await cdp.evaluate(`(async () => {
                const width = ${viewport};
                const waitFor = async (predicate, timeout = 5000) => {
                    const end = performance.now() + timeout;
                    while (performance.now() < end) { if (predicate()) return true; await new Promise(resolve => setTimeout(resolve, 20)); }
                    return predicate();
                };
                const host = document.createElement('div');
                host.id = 'pk32-sokoban4-cdp-host';
                host.style.cssText = 'position:absolute;left:0;top:0;width:100%;min-height:100%;background:white;z-index:2147483647';
                document.body.appendChild(host);
                const errors = [];
                const onError = event => errors.push(event.message || String(event.error || 'window error'));
                const onRejection = event => errors.push(String(event.reason || 'unhandled rejection'));
                window.addEventListener('error', onError);
                window.addEventListener('unhandledrejection', onRejection);
                const nativeStart = window.PK32Sokoban4.start;
                window.__soko4Test = null;
                window.PK32Sokoban4.start = function (...args) {
                    const session = nativeStart.apply(this, args);
                    window.__soko4Test = session;
                    return session;
                };
                const catalog = window.MiniGames.pk32.start(host, {});
                const record = window.PK32Catalog.find(row => row.name === '\u63a8\u7bb1\u5b50\u56db');
                const entry = record && host.querySelector('[data-pk32-id="' + record.id + '"]');
                const catalogEntry = !!(entry && entry.querySelector('button'));
                if (catalogEntry) entry.querySelector('button').click();
                const ready = await waitFor(() => !!host.querySelector('[data-role=sokoban4-board][data-ready=true]'));
                const board = host.querySelector('[data-role=sokoban4-board]');
                const session = window.__soko4Test;
                const levelCount = host.querySelectorAll('.pk32-soko4 select option').length;
                const genericBoard = host.querySelectorAll('#soko-board').length;
                const state = () => session && session.getState();
                let nativeTiles = 0;
                if (ready) {
                    const image = new Image(); image.src = window.PK32Sokoban4.ATLAS; await image.decode();
                    const expected = document.createElement('canvas'); expected.width = expected.height = 32;
                    const expectedCtx = expected.getContext('2d');
                    const actualCtx = board.getContext('2d', { willReadFrequently: true });
                    const initial = state();
                    for (let index = 0; index < initial.cells.length; index += 1) {
                        const code = initial.cells[index];
                        expectedCtx.clearRect(0, 0, 32, 32);
                        expectedCtx.drawImage(image, 677, (code === 0 ? 0 : code === 5 ? 25 : code + 4) * 32, 32, 32, 0, 0, 32, 32);
                        const tile = expectedCtx.getImageData(0, 0, 32, 32).data;
                        if (index === initial.player) {
                            const baseTile = new Uint8ClampedArray(tile);
                            expectedCtx.clearRect(0, 0, 32, 32);
                            expectedCtx.drawImage(image, 283 + initial.frame * 32, initial.direction * 32, 32, 32, 0, 0, 32, 32);
                            const person = expectedCtx.getImageData(0, 0, 32, 32).data;
                            for (let i = 0; i < tile.length; i += 4) { tile[i] = baseTile[i] | person[i]; tile[i + 1] = baseTile[i + 1] | person[i + 1]; tile[i + 2] = baseTile[i + 2] | person[i + 2]; tile[i + 3] = 255; }
                        }
                        const rendered = actualCtx.getImageData(14 + index % 11 * 32, 14 + Math.floor(index / 11) * 32, 32, 32).data;
                        if (tile.every((value, i) => value === rendered[i])) nativeTiles += 1;
                    }
                }
                const first = state();
                const firstButtons = ['up', 'right', 'down'].map(direction => host.querySelector('[data-direction=' + direction + ']'));
                for (const button of firstButtons) { if (button) button.click(); await new Promise(resolve => setTimeout(resolve, 15)); }
                const firstLevelWon = !!state()?.won;
                const wonFrame = state()?.frame;
                await new Promise(resolve => setTimeout(resolve, 650));
                const victoryFrozen = state()?.frame === wonFrame;
                const okay = host.querySelector('dialog button[aria-label="\u786e\u5b9a"]'); if (okay) okay.click();
                const undoButton = host.querySelector('button[aria-label="\u64a4\u9500"]'); if (undoButton) undoButton.click();
                const undoRestored = !!state() && state().won === false && state().moves === 2;
                const reset = host.querySelector('button[aria-label="\u91cd\u5f00\u672c\u5173"]'); if (reset) reset.click();
                const beforeKeyboard = state()?.player;
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
                const keyboardMoved = state()?.player !== beforeKeyboard;
                const select = host.querySelector('.pk32-soko4 select');
                let viewportFit = true;
                for (let index = 0; index < 23; index += 1) {
                    select.value = String(index); select.dispatchEvent(new Event('change', { bubbles: true }));
                    viewportFit = viewportFit && (() => { const rect = board.getBoundingClientRect(); return rect.left >= -1 && rect.right <= width + 1; })();
                }
                select.value = '22'; select.dispatchEvent(new Event('change', { bubbles: true }));
                host.querySelector('button[aria-label="\u4e0b\u4e00\u5173"]').click();
                const wrapped = select.value === '0';
                select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }));
                const demoButton = host.querySelector('button[aria-label="\u539f\u7248\u6f14\u793a"]');
                const demoStart = performance.now(); demoButton.click();
                await waitFor(() => state()?.moves > 0, 2000);
                const demoElapsed = performance.now() - demoStart;
                await waitFor(() => state()?.won && !state()?.demonstrating, 5000);
                const firstLevelDemo = '123';
                const overflow = document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth;
                const back = [...host.querySelectorAll('button')].find(button => button.textContent === '\u8fd4\u56de PK32 \u76ee\u5f55');
                if (back) back.click();
                const returnedToCatalog = !!host.querySelector('[data-pk32-id="' + record.id + '"]');
                const frameBeforeStop = state()?.frame;
                catalog.stop(); host.innerHTML = '';
                await new Promise(resolve => setTimeout(resolve, 650));
                const stoppedTimer = state()?.frame === frameBeforeStop;
                const casualMenu = window.PK32Casual.start(host, {});
                const casualButton = [...host.querySelectorAll('[data-pk32-casual]')].find(button => button.dataset.pk32Casual === '\u63a8\u7bb1\u5b50\u56db');
                const casualEntry = !!casualButton;
                if (casualButton) casualButton.click();
                await waitFor(() => !!host.querySelector('[data-role=sokoban4-board][data-ready=true]'));
                casualMenu.stop();
                window.PK32Sokoban4.start = nativeStart;
                window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
                host.remove();
                return { width, ready, catalogEntry, levelCount, genericBoard, nativeTiles, firstLevelWon, firstLevelDemo, demoElapsed, victoryFrozen, undoRestored, keyboardMoved, wrapped, viewportFit, overflow, returnedToCatalog, stoppedTimer, casualEntry, errors };
            })()`);
            assertResult(result);
            results.push(result);
            console.log('PASS sokoban4-cdp width=' + viewport + ' ' + JSON.stringify(result));
        }
        assert.equal(protocolErrors.length, 0, 'browser runtime must not emit protocol exceptions: ' + protocolErrors.join('; '));
        const output = path.resolve(__dirname, '../output/pk32-validation/pk32-sokoban4-cdp.json');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify({ scope: 'sokoban4-native-cdp', fullGameRulesVerified: false, results }, null, 2) + '\n');
        console.log(JSON.stringify({ passed: true, viewports: results.length, levelsPerViewport: 23, nativeTilesPerViewport: 99, fullGameRulesVerified: false, output }));
    } finally {
        if (ws) ws.close();
        chrome.kill();
    }
})().catch(error => { console.error('FAIL sokoban4-cdp ' + (error.stack || error)); process.exitCode = 1; });
