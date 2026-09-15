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
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const getJson = url => new Promise((resolve, reject) => {
    http.get(url, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
});

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.waiters = new Map();
        ws.on('message', data => {
            const message = JSON.parse(data);
            if (message.id && this.waiters.has(message.id)) {
                this.waiters.get(message.id)(message);
                this.waiters.delete(message.id);
            }
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
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-jungle-cdp-'));
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://',
        '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, base
    ], { stdio: 'ignore' });
    try {
        let targets;
        for (let attempt = 0; attempt < 40; attempt += 1) {
            try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {}
            if (targets && targets.some(item => item.type === 'page')) break;
            await sleep(100);
        }
        const page = (targets || []).find(item => item.type === 'page');
        if (!page) throw new Error('Chrome page target unavailable');
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const cdp = new CDP(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-jungle-cdp=' + Date.now() });
        for (let attempt = 0; attempt < 50; attempt += 1) {
            if (await cdp.eval('!!(window.PK32Catalog && window.PK32Board && window.MiniGames && window.MiniGames.pk32)')) break;
            await sleep(100);
        }
        const result = await cdp.eval(`(async () => {
            const host = document.createElement('div');
            host.id = 'pk32-jungle-cdp-host';
            document.body.appendChild(host);
            const catalog = window.MiniGames.pk32.start(host, {});
            const record = window.PK32Catalog.find(row => row.name === '斗兽棋');
            const button = record && host.querySelector('[data-pk32-id="' + record.id + '"] button');
            if (!button) throw new Error('斗兽棋 catalog entry unavailable');
            button.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            const board = host.querySelector('.pk32-board-grid');
            const cells = [...host.querySelectorAll('.pk32-animal-cell')];
            const pieces = [...host.querySelectorAll('.pk32-animal-piece')];
            const image = new Image();
            image.src = '/img/pk32/jungle-original.png';
            await new Promise(resolve => { if (image.complete) return resolve(); image.onload = resolve; image.onerror = resolve; });
            const positions = pieces.map(node => ({ rank: node.dataset.rank, position: getComputedStyle(node).backgroundPosition, source: getComputedStyle(node).backgroundImage }));
            const state = window.PK32Board.start('jungle').state;
            const custom = () => {
                const value = window.PK32Board.start('jungle').state;
                value.board = Array.from({ length: 9 }, () => Array(7).fill(0));
                value.turn = 1;
                return value;
            };
            const rat = custom(); rat.board[2][1] = { side: 1, rank: 'rat' }; rat.board[2][2] = { side: 2, rank: 'elephant' };
            const elephant = custom(); elephant.board[2][1] = { side: 1, rank: 'elephant' }; elephant.board[2][2] = { side: 2, rank: 'rat' };
            return {
                cells: board ? board.children.length : 0,
                pieces: pieces.length,
                rivers: cells.filter(node => node.dataset.terrain === 'river').length,
                traps: cells.filter(node => node.dataset.terrain === 'trap').length,
                dens: cells.filter(node => node.dataset.terrain === 'den').length,
                ranks: pieces.map(node => node.dataset.rank),
                positions,
                assetLoaded: image.naturalWidth > 0 && pieces.every(node => /jungle-original\.png/.test(getComputedStyle(node).backgroundImage)),
                assetSize: [image.naturalWidth, image.naturalHeight],
                firstPiece: pieces[0] ? pieces[0].outerHTML : '',
                overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
                piecesInCells: pieces.every(node => !!node.closest('.pk32-animal-cell')),
                pieceCount: state.board.flat().filter(Boolean).length,
                ratCapturesElephant: window.PK32Board.animalCanMove(rat, [2, 1], [2, 2]),
                elephantCapturesRat: window.PK32Board.animalCanMove(elephant, [2, 1], [2, 2])
            };
        })()`);
        assert.equal(result.cells, 63);
        assert.equal(result.pieces, 16);
        assert.equal(result.rivers, 12);
        assert.equal(result.traps, 6);
        assert.equal(result.dens, 2);
        assert.equal(result.pieceCount, 16);
        assert.ok(result.ranks.every(rank => /^[1-8]$/.test(rank)));
        assert.ok(result.assetLoaded);
        assert.ok(result.positions.every(item => item.position.endsWith('px') && Number.parseInt(item.position.split(' ')[1], 10) <= 0));
        assert.ok(result.positions.some(item => item.rank === '1' && / 0px$/.test(item.position)));
        assert.ok(result.positions.some(item => item.rank === '8' && / -371px$/.test(item.position)));
        assert.ok(result.piecesInCells);
        assert.ok(!result.overflow);
        assert.equal(result.ratCapturesElephant, true);
        assert.equal(result.elephantCapturesRat, false);
        console.log(JSON.stringify({ passed: true, result }));
    } finally {
        chrome.kill();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
