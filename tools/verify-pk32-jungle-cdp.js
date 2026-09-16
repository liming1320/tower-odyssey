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
const mobileWidth = Number((process.argv.find(arg => arg.startsWith('--width=')) || '').slice(8)) || 390;
const mobileHeight = Number((process.argv.find(arg => arg.startsWith('--height=')) || '').slice(9)) || 844;
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
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: mobileWidth, height: mobileHeight, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await cdp.send('Page.navigate', { url: base + '?pk32-jungle-cdp=' + Date.now() });
        for (let attempt = 0; attempt < 50; attempt += 1) {
            if (await cdp.eval('!!(window.PK32Catalog && window.PK32Board && window.MiniGames && window.MiniGames.pk32)')) break;
            await sleep(100);
        }
        const result = await cdp.eval(`(async () => {
            const mask = document.createElement('div');
            mask.id = 'pk32-mask';
            mask.className = 'mini-mask';
            const topbar = document.createElement('div');
            topbar.className = 'mini-topbar';
            mask.appendChild(topbar);
            const stageEl = document.createElement('div');
            stageEl.className = 'mini-stage';
            const host = document.createElement('div');
            host.id = 'pk32-jungle-cdp-host';
            stageEl.appendChild(host);
            mask.appendChild(stageEl);
            document.body.appendChild(mask);
            const catalog = window.MiniGames.pk32.start(host, {});
            const record = window.PK32Catalog.find(row => row.name === '斗兽棋');
            const button = record && host.querySelector('[data-pk32-id="' + record.id + '"] button');
            if (!button) throw new Error('斗兽棋 catalog entry unavailable');
            button.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            const board = host.querySelector('.pk32-board-grid');
            const scroll = host.querySelector('.pk32-board-scroll');
            const stage = document.querySelector('#pk32-mask .mini-stage');
            const cells = [...host.querySelectorAll('.pk32-animal-cell')];
            const pieces = [...host.querySelectorAll('.pk32-animal-piece')];
            const image = new Image();
            image.src = '/img/pk32/jungle-original.png';
            await new Promise(resolve => { if (image.complete) return resolve(); image.onload = resolve; image.onerror = resolve; });
            const initialAssetLoaded = image.naturalWidth > 0 && pieces.every(node => /jungle-original\.png/.test(getComputedStyle(node).backgroundImage));
            const positions = pieces.map(node => ({ rank: node.dataset.rank, position: getComputedStyle(node).backgroundPosition, source: getComputedStyle(node).backgroundImage }));
            const pieceBounds = pieces.map(node => {
                const piece = node.getBoundingClientRect();
                const cell = node.closest('.pk32-animal-cell').getBoundingClientRect();
                return piece.left >= cell.left - 1 && piece.right <= cell.right + 1 && piece.top >= cell.top - 1 && piece.bottom <= cell.bottom + 1;
            });
            const sourceTiles = pieces.map(node => {
                const style = getComputedStyle(node);
                return { width: style.width, height: style.height, scale: style.transform };
            });
            const scrollBeforeSwipe = stage ? stage.scrollTop : 0;
            const swipeRect = stage ? stage.getBoundingClientRect() : null;
            if (stage && swipeRect && stage.scrollHeight > stage.clientHeight) {
                stage.scrollTop = 0;
            }
            // 先把两个滚动层都定位到底，验证最后一行确实能被看到。
            if (scroll && scroll.scrollHeight > scroll.clientHeight) scroll.scrollTop = scroll.scrollHeight;
            if (stage) stage.scrollTop = stage.scrollHeight;
            const lastCell = cells[cells.length - 1];
            const lastCellVisible = lastCell ? (() => { const rect = lastCell.getBoundingClientRect(); const shell = (stage || scroll).getBoundingClientRect(); return rect.bottom <= shell.bottom + 1 && rect.top >= shell.top - 1; })() : false;
            const state = window.PK32Board.start('jungle').state;
            const downFrom = () => host.querySelector('[data-row="6"][data-col="0"]');
            const downTo = () => host.querySelector('[data-row="7"][data-col="0"]');
            downFrom().click();
            const selectedFeedback = {
                selected: downFrom().dataset.selected === 'true',
                legalTargets: host.querySelectorAll('.pk32-animal-cell[data-legal="true"]').length,
                status: (host.querySelector('.pk32-board-ui > p') || {}).textContent || ''
            };
            downTo().click();
            const downMove = !downFrom().querySelector('.pk32-animal-piece') && !!downTo().querySelector('.pk32-animal-piece[data-side="1"]');
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
                assetLoaded: initialAssetLoaded,
                assetSize: [image.naturalWidth, image.naturalHeight],
                firstPiece: pieces[0] ? pieces[0].outerHTML : '',
                overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
                piecesInCells: pieces.every(node => !!node.closest('.pk32-animal-cell')),
                piecesFullyVisible: pieceBounds.every(Boolean),
                sourceTiles,
                scrollMetrics: scroll ? {
                    overflowY: getComputedStyle(scroll).overflowY,
                    touchAction: getComputedStyle(scroll).touchAction,
                    scrollHeight: scroll.scrollHeight,
                    clientHeight: scroll.clientHeight,
                    canScrollVertically: scroll.scrollHeight > scroll.clientHeight,
                    lastCellVisible,
                    maxScrollTop: Math.max(0, scroll.scrollHeight - scroll.clientHeight)
                } : null,
                stageScroll: stage ? {
                    overflowY: getComputedStyle(stage).overflowY,
                    scrollHeight: stage.scrollHeight,
                    clientHeight: stage.clientHeight
                } : null,
                scrollBeforeSwipe,
                verticalScrollReady: !!stage && stage.scrollHeight >= stage.clientHeight && lastCellVisible,
                selectedFeedback,
                downMove,
                pieceCount: state.board.flat().filter(Boolean).length,
                ratCapturesElephant: window.PK32Board.animalCanMove(rat, [2, 1], [2, 2]),
                elephantCapturesRat: window.PK32Board.animalCanMove(elephant, [2, 1], [2, 2])
            };
        })()`);
        const swipe = await cdp.eval(`(() => {
            const stage = document.querySelector('#pk32-mask .mini-stage');
            const scroll = document.querySelector('#pk32-mask .pk32-board-scroll');
            if (!stage || !scroll) return null;
            stage.scrollTop = 0;
            scroll.scrollTop = 0;
            const rect = scroll.getBoundingClientRect();
            const view = stage.getBoundingClientRect();
            const top = Math.max(rect.top, view.top + 12);
            const bottom = Math.min(rect.bottom, view.bottom - 12);
            return { x: Math.round(rect.left + rect.width / 2), y: Math.round(top + Math.max(24, Math.min(Math.max(24, bottom - top - 24), (bottom - top) * 0.72))) };
        })()`);
        if (swipe) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipe.x, y: swipe.y }], modifiers: 0 });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: swipe.x, y: Math.max(48, swipe.y - Math.round(mobileHeight * 0.32)) }], modifiers: 0 });
            await sleep(80);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], modifiers: 0 });
            await sleep(80);
            result.touchScrollTop = await cdp.eval('(() => { const stage = document.querySelector("#pk32-mask .mini-stage"); const scroll = document.querySelector("#pk32-mask .pk32-board-scroll"); return { stage: stage ? stage.scrollTop : 0, board: scroll ? scroll.scrollTop : 0, total: (stage ? stage.scrollTop : 0) + (scroll ? scroll.scrollTop : 0) }; })()');
        }
        if (process.argv.includes('--screenshot')) {
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
            const file = path.join('output', 'playwright', 'pk32-jungle-mobile-' + mobileWidth + '.png');
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
            result.screenshot = file;
        }
        assert.equal(result.cells, 63);
        assert.equal(result.pieces, 16);
        assert.equal(result.rivers, 12);
        assert.equal(result.traps, 6);
        assert.equal(result.dens, 2);
        assert.equal(result.pieceCount, 16);
        assert.ok(result.ranks.every(rank => /^[1-8]$/.test(rank)));
        assert.ok(result.assetLoaded);
        assert.ok(result.positions.every(item => /^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(item.position)));
        assert.ok(result.positions.some(item => item.rank === '1' && / 0%$/.test(item.position)));
        assert.ok(result.positions.some(item => item.rank === '8' && / 90\.048%$/.test(item.position)));
        assert.ok(result.piecesInCells);
        assert.ok(result.piecesFullyVisible);
        assert.ok(result.sourceTiles.every(tile => Number.parseFloat(tile.width) >= 30 && Number.parseFloat(tile.width) <= 66 && Number.parseFloat(tile.height) >= 24 && Number.parseFloat(tile.height) <= 60));
        assert.ok(result.verticalScrollReady);
        assert.ok(result.stageScroll.scrollHeight <= result.stageScroll.clientHeight || result.touchScrollTop.stage > 0);
        assert.equal(result.scrollMetrics.overflowY, 'visible');
        assert.equal(result.scrollMetrics.touchAction, 'pan-y');
        assert.ok(result.stageScroll.scrollHeight <= result.stageScroll.clientHeight || result.touchScrollTop.stage > 0);
        assert.equal(result.selectedFeedback.selected, true);
        assert.ok(result.selectedFeedback.legalTargets > 0);
        assert.ok(result.selectedFeedback.status.includes('已选中棋子'));
        assert.ok(result.downMove);
        assert.ok(!result.overflow);
        assert.equal(result.ratCapturesElephant, true);
        assert.equal(result.elephantCapturesRat, false);
        console.log(JSON.stringify({ passed: true, result }));
    } finally {
        chrome.kill();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
