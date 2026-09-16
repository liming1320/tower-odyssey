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
const shipData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/data/pk32-ships-puzzle-levels.json'), 'utf8'));
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const getJson = url => new Promise((resolve, reject) => {
    http.get(url, response => { let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve(JSON.parse(body))); }).on('error', reject);
});
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); ws.on('message', raw => { const message = JSON.parse(raw); if (message.id && this.waiters.has(message.id)) { this.waiters.get(message.id)(message); this.waiters.delete(message.id); } }); }
    send(method, params) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params: params || {} })); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(method + ' timeout')), 20000); this.waiters.set(id, message => { clearTimeout(timer); resolve(message); }); }); }
    async eval(expression) { const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (result.result && result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text || 'Runtime.evaluate failed'); return result.result.result.value; }
}

(async () => {
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-ships-cdp-'));
    const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, base], { stdio: 'ignore' });
    let ws;
    try {
        let targets;
        for (let attempt = 0; attempt < 60; attempt += 1) { try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {} if (targets && targets.some(item => item.type === 'page' && item.webSocketDebuggerUrl)) break; await sleep(100); }
        const page = (targets || []).find(item => item.type === 'page' && item.webSocketDebuggerUrl);
        assert.ok(page, 'Chrome page target unavailable');
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const cdp = new CDP(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-ships-cdp=' + Date.now() });
        const result = await cdp.eval(`(async () => {
            const wait = async predicate => { const end = performance.now() + 5000; while (performance.now() < end) { if (predicate()) return true; await new Promise(resolve => setTimeout(resolve, 20)); } return predicate(); };
            await wait(() => !!window.PK32Variants);
            const host = document.createElement('div'); host.id = 'pk32-ships-cdp-host'; document.body.appendChild(host);
            const errors = []; const onError = event => errors.push(event.message || String(event.error || 'window error'));
            window.addEventListener('error', onError); window.addEventListener('unhandledrejection', event => errors.push(String(event.reason || 'unhandled rejection')));
            window.PK32Variants.startGame(host, '航海迷题', {});
            const ready = await wait(() => host.querySelectorAll('.ships-board [data-cell]').length === 100);
            const next = [...host.querySelectorAll('button')].find(button => button.textContent === '下一关');
            const clear = [...host.querySelectorAll('button')].find(button => button.textContent === '清除连线');
            const color4 = [...host.querySelectorAll('.ships-board button[data-color="4"]')];
            let afterFirst = null, afterSecond = null;
            if (color4.length === 2) {
                color4[0].click();
                afterFirst = { selected: host.querySelectorAll('.ships-board button.selected').length, cells: [...host.querySelectorAll('.ships-board button[data-color="4"]')].map(node => node.dataset.cell) };
                [...host.querySelectorAll('.ships-board button[data-color="4"]')][1].click();
                afterSecond = { selected: host.querySelectorAll('.ships-board button.selected').length, cells: [...host.querySelectorAll('.ships-board button[data-color="4"]')].map(node => node.dataset.cell) };
            }
            const routeTest = { color4Count: host.querySelectorAll('.ships-board button[data-color="4"]').length, afterFirst, afterSecond, selected: host.querySelectorAll('.ships-board button.selected').length, lineCount: host.querySelectorAll('.pk32v-ships-lines polyline').length, pathLength: Number(host.querySelector('.pk32v-ships-lines polyline')?.dataset.pathLength || 0), status: (host.querySelector('.pk32v-status') || {}).textContent || '' };
            if (clear) clear.click();
            const levelStats = [];
            for (let i = 0; i < 52; i += 1) {
                await wait(() => (host.querySelector('.pk32v-status') || {}).textContent?.includes('第 ' + (i + 1) + ' / 52 关'));
                const grid = host.querySelector('.ships-board');
                levelStats.push({ width: Number(grid?.dataset.layoutWidth || 0), height: Number(grid?.dataset.layoutHeight || 0), endpoints: Number(grid?.dataset.endpointCount || 0), vortices: Number(grid?.dataset.vortexCount || 0), cells: grid ? grid.children.length : 0 });
                if (i < 51 && next) next.click();
            }
            const level52 = await wait(() => (host.querySelector('.pk32v-status') || {}).textContent?.includes('第 52 / 52 关'));
            const sprites = [...host.querySelectorAll('.pk32-ship-sprite')].map(node => ({ kind: node.dataset.kind, color: node.dataset.color, source: getComputedStyle(node).backgroundImage, x: getComputedStyle(node).backgroundPositionX, y: getComputedStyle(node).backgroundPositionY }));
            const overflow = document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth;
            window.removeEventListener('error', onError); host.remove();
            return { ready, level52, routeTest, levelStats, sprites, overflow, errors };
        })()`);
        console.log(JSON.stringify({ game: '航海迷题', result }));
        assert.equal(result.ready, true);
        assert.equal(result.level52, true);
        assert.equal(result.routeTest.lineCount, 1);
        assert.ok(result.routeTest.pathLength > 2);
        assert.equal(result.levelStats.length, 52);
        result.levelStats.forEach((item, index) => {
            const source = shipData.levels[index].cells.match(/.{2}/g) || [];
            const layout = shipData.layouts[index];
            const offsetX = Math.floor((10 - layout.width) / 2), offsetY = Math.floor((10 - layout.height) / 2);
            const special = source.map(value => { const x = Number(value[0]), y = Number(value[1]), lx = x - offsetX, ly = y - offsetY; return layout.cells[ly * layout.width + lx] || '0'; });
            assert.equal(item.width, layout.width);
            assert.equal(item.height, layout.height);
            assert.equal(item.cells, 100);
            assert.equal(item.endpoints, special.filter(value => value !== '0').length);
            assert.equal(item.vortices, special.filter(value => value === '0').length);
        });
        assert.equal(result.overflow, false);
        assert.equal(result.sprites.length, result.levelStats[51].endpoints);
        assert.ok(result.sprites.every(item => /ships-original\.png/.test(item.source)));
        assert.ok(result.sprites.some(item => item.kind === 'ship' && item.color === '3' && item.x === '-70px'));
        assert.ok(result.sprites.some(item => item.kind === 'monster' && item.color === '3' && item.y === '-25px'));
        assert.deepEqual(result.errors, []);
        console.log(JSON.stringify({ game: '航海迷题', nativeLevels: 52, result, fullGameRulesVerified: false }));
    } finally { if (ws) ws.close(); chrome.kill(); }
})().catch(error => { console.error('FAIL ships-cdp ' + (error.stack || error)); process.exitCode = 1; });
