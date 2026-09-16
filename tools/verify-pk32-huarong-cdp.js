'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
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
    assert.equal(result.resourceOk, true, 'the native Huarong data resource must load from the page');
    assert.equal(result.resourceLevelCount, 11, 'native resource must contain 11 layouts');
    assert.equal(result.catalogEntry, true, 'PK32 catalog must expose the Huarong entry');
    assert.equal(result.startedFromCatalog, true, 'Huarong must start through the PK32 catalog button');
    assert.equal(result.levelCount, 11, 'native level selector must expose 11 layouts');
    assert.equal(result.rawPayloadMatches, true, 'rendered raw payload must match the loaded native resource');
    assert.equal(result.boardCells, 20, 'Huarong board must contain 20 cells');
    assert.equal(result.blockLayoutValid, true, 'Cao Cao, generals and soldiers must retain block shapes');
    assert.equal(result.allLayoutsValid, true, 'all 11 native layouts must render as valid block layouts');
    assert.equal(result.selectionVisible, true, 'clicking a piece must visibly select it');
    assert.equal(result.legalClickMoved, true, 'click selection plus a legal direction must move the selected piece');
    assert.equal(result.illegalMoveUnchanged, true, 'an illegal direction must leave the board state unchanged');
    assert.equal(result.resetRestored, true, 'reset must restore the complete initial layout and move count');
    assert.equal(result.previousNextWorked, true, 'previous and next layout navigation must work');
    assert.equal(result.keyboardMoved, true, 'an Arrow key must move the selected piece legally');
    assert.equal(result.viewportFit, true, 'the board and all pieces must fit inside the viewport');
    assert.equal(result.overflow, false, 'the page must not overflow horizontally');
    assert.equal(result.destroyed, true, 'destroy must remove the Huarong surface');
    assert.equal(result.keyHandlerAdded > 0, true, 'Huarong must register its keyboard handler');
    assert.equal(result.keyHandlerRemoved >= result.keyHandlerAdded, true, 'destroy must remove every Huarong keyboard handler');
    assert.equal(result.postDestroyKeyboardNoop, true, 'keyboard input after destroy must not mutate a live Huarong surface');
    assert.deepEqual(result.errors, [], 'browser runtime must not emit page errors');
}

(async () => {
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-huarong-cdp-'));
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
            if (message.method === 'Runtime.exceptionThrown') {
                protocolErrors.push(message.params?.exceptionDetails?.text || 'runtime exception');
            }
        });
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');

        const results = [];
        for (const viewport of [390, 1280]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', {
                width: viewport,
                height: viewport === 390 ? 844 : 900,
                deviceScaleFactor: 1,
                mobile: viewport === 390
            });
            await cdp.send('Page.navigate', { url: base + '?pk32-huarong-cdp=' + viewport + '-' + Date.now() });
            await cdp.evaluate(`new Promise(resolve => {
                const wait = () => window.PK32Variants && window.MiniGames && window.MiniGames.pk32 ? resolve(true) : setTimeout(wait, 25);
                wait();
            })`);

            const prepared = await cdp.evaluate(`(async () => {
                const waitFor = async (predicate, timeout = 6000) => {
                    const end = performance.now() + timeout;
                    while (performance.now() < end) {
                        if (predicate()) return true;
                        await new Promise(resolve => setTimeout(resolve, 20));
                    }
                    return predicate();
                };
                const host = document.createElement('div');
                host.id = 'pk32-huarong-cdp-host';
                host.style.cssText = 'position:absolute;left:0;top:0;width:100%;min-height:100%;background:white;z-index:2147483647';
                document.body.appendChild(host);
                const errors = [];
                const onError = event => errors.push(event.message || String(event.error || 'window error'));
                const onRejection = event => errors.push(String(event.reason || 'unhandled rejection'));
                window.addEventListener('error', onError);
                window.addEventListener('unhandledrejection', onRejection);

                const nativeResource = await fetch('/data/pk32-huarong-levels.json?cdp=' + Date.now(), { cache: 'no-store' });
                const nativeData = await nativeResource.json();
                const originalAdd = document.addEventListener;
                const originalRemove = document.removeEventListener;
                const handlerCounts = { added: 0, removed: 0 };
                document.addEventListener = function (type, listener, options) {
                    if (type === 'keydown') handlerCounts.added += 1;
                    return originalAdd.call(this, type, listener, options);
                };
                document.removeEventListener = function (type, listener, options) {
                    if (type === 'keydown') handlerCounts.removed += 1;
                    return originalRemove.call(this, type, listener, options);
                };
                document.__pk32HuarongHandlerCounts = handlerCounts;
                const nativeStart = window.PK32Variants.startGame;
                window.__pk32HuarongSession = null;
                window.PK32Variants.startGame = function () {
                    const session = nativeStart.apply(this, arguments);
                    window.__pk32HuarongSession = session;
                    return session;
                };

                const catalog = window.MiniGames.pk32.start(host, {});
                window.__pk32HuarongCatalog = catalog;
                const record = window.PK32Catalog.find(row => row.name === '华容道');
                const entry = record && host.querySelector('[data-pk32-id="' + record.id + '"]');
                const launch = entry && entry.querySelector('[data-pk32-variant="' + record.id + '"]');
                const catalogEntry = !!(entry && launch);
                if (launch) launch.click();
                const ready = await waitFor(() => !!host.querySelector('.pk32v-game .huarong-board') && !!host.querySelector('.pk32v-game select'));
                if (!ready) throw new Error('Huarong launch did not become ready; catalogEntry=' + catalogEntry + '; buttons=' + [...host.querySelectorAll('button')].map(button => button.textContent).join('|'));
                const gameHost = host.querySelector('.emu-list > div[style*="min-height"]');
                const gameRoot = host.querySelector('.pk32v-game');
                const currentSelect = () => host.querySelector('.pk32v-game select');
                const select = currentSelect();

                function parseLayout(layout) {
                    const tokens = (layout || '').match(/.{2}/g) || [];
                    const groups = new Map();
                    tokens.forEach((id, index) => {
                        if (id === '15') return;
                        if (!groups.has(id)) groups.set(id, []);
                        groups.get(id).push({ row: Math.floor(index / 4), col: index % 4 });
                    });
                    return [...groups].map(([id, cells]) => {
                        const rows = cells.map(cell => cell.row), cols = cells.map(cell => cell.col);
                        const row = Math.min(...rows), col = Math.min(...cols);
                        return { id, row, col, width: Math.max(...cols) - col + 1, height: Math.max(...rows) - row + 1, cells };
                    });
                }
                function blockLayout(layout) {
                    const pieces = parseLayout(layout);
                    const occupied = pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0);
                    const cao = pieces.filter(piece => piece.id === '00');
                    const generals = pieces.filter(piece => piece.id !== '00' && piece.width * piece.height === 2);
                    const soldiers = pieces.filter(piece => piece.width === 1 && piece.height === 1);
                    const rectangular = pieces.every(piece => piece.width * piece.height === piece.cells.length);
                    return pieces.length === 10 && occupied === 18 && cao.length === 1 && cao[0].width === 2 && cao[0].height === 2 && generals.length === 5 && generals.every(piece => (piece.width === 1 && piece.height === 2) || (piece.width === 2 && piece.height === 1)) && soldiers.length === 4 && rectangular;
                }
                function snapshot() {
                    return [...host.querySelectorAll('[data-native-piece]')].map(node => ({
                        id: node.dataset.nativePiece,
                        row: Number(node.dataset.row),
                        col: Number(node.dataset.col),
                        width: Math.round(parseFloat(node.style.width) / 25),
                        height: Math.round(parseFloat(node.style.height) / 20),
                        label: node.textContent
                    })).sort((a, b) => a.id.localeCompare(b.id));
                }
                function sameState(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
                function canMove(pieces, id, delta) {
                    const piece = pieces.find(item => item.id === id);
                    if (!piece) return false;
                    const row = piece.row + delta[0], col = piece.col + delta[1];
                    if (row < 0 || col < 0 || row + piece.height > 5 || col + piece.width > 4) return false;
                    const occupied = new Set();
                    pieces.forEach(item => {
                        if (item.id === id) return;
                        for (let y = item.row; y < item.row + item.height; y += 1) for (let x = item.col; x < item.col + item.width; x += 1) occupied.add(y * 4 + x);
                    });
                    for (let y = row; y < row + piece.height; y += 1) for (let x = col; x < col + piece.width; x += 1) if (occupied.has(y * 4 + x)) return false;
                    return true;
                }
                function movePieces(pieces, id, delta) {
                    return pieces.map(piece => piece.id === id ? Object.assign({}, piece, { row: piece.row + delta[0], col: piece.col + delta[1] }) : Object.assign({}, piece));
                }
                const initial = nativeData.levels[0];
                const initialPieces = parseLayout(initial.layout);
                const directions = [
                    { key: 'ArrowUp', label: '上', delta: [-1, 0] },
                    { key: 'ArrowDown', label: '下', delta: [1, 0] },
                    { key: 'ArrowLeft', label: '左', delta: [0, -1] },
                    { key: 'ArrowRight', label: '右', delta: [0, 1] }
                ];
                const candidate = initialPieces.flatMap(piece => directions.map(direction => ({ piece, direction }))).find(item => canMove(initialPieces, item.piece.id, item.direction.delta));
                const allLayoutsValid = nativeData.levels.length === 11 && nativeData.levels.every(level => blockLayout(level.layout));
                const resourceOk = nativeResource.ok && nativeData.name === '华容道' && nativeData.count === 11;
                const levelCount = select ? select.options.length : 0;
                const rawPayloadMatches = !!select && [...host.querySelectorAll('details pre')].some(node => node.textContent === initial.cells);
                const boardCells = host.querySelectorAll('.huarong-cell').length;
                const renderedPieces = snapshot();
                const cao = renderedPieces.find(piece => piece.id === '00');
                const blockLayoutValid = renderedPieces.length === 10 && renderedPieces.filter(piece => piece.label === '曹操').length === 1 && cao && cao.width === 2 && cao.height === 2 && renderedPieces.filter(piece => piece.label === '将').length === 5 && renderedPieces.filter(piece => piece.label === '兵').length === 4 && renderedPieces.filter(piece => piece.label === '将').every(piece => piece.width * piece.height === 2) && renderedPieces.filter(piece => piece.label === '兵').every(piece => piece.width === 1 && piece.height === 1);

                let allLayoutsRendered = true;
                for (let index = 0; index < nativeData.levels.length; index += 1) {
                    const levelSelect = currentSelect();
                    levelSelect.value = String(index);
                    levelSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    allLayoutsRendered = allLayoutsRendered && await waitFor(() => currentSelect()?.value === String(index) && host.querySelectorAll('.huarong-cell').length === 20);
                    allLayoutsRendered = allLayoutsRendered && host.querySelector('details pre')?.textContent === nativeData.levels[index].cells;
                }
                const firstSelect = currentSelect();
                firstSelect.value = '0';
                firstSelect.dispatchEvent(new Event('change', { bubbles: true }));
                await waitFor(() => currentSelect()?.value === '0' && snapshot().some(piece => piece.id === '00'));

                const clickPiece = host.querySelector('[data-native-piece="' + candidate.piece.id + '"]');
                const beforeSelection = snapshot();
                if (clickPiece) clickPiece.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                const selectedNode = host.querySelector('[data-native-piece="' + candidate.piece.id + '"]');
                const selectionVisible = !!selectedNode && (getComputedStyle(selectedNode).borderTopColor === 'rgb(248, 250, 252)' || getComputedStyle(selectedNode).borderTopColor === 'rgb(248, 248, 248)' || /#f8fafc/i.test(selectedNode.style.cssText));
                const beforeLegal = snapshot();
                const control = [...host.querySelectorAll('.huarong-direction-pad button')].find(button => button.textContent === candidate.direction.label);
                if (control) control.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                const afterLegal = snapshot();
                const expectedLegal = movePieces(beforeLegal, candidate.piece.id, candidate.direction.delta);
                const legalClickMoved = !sameState(beforeLegal, afterLegal) && sameState(afterLegal, expectedLegal);

                const illegalDirection = directions.find(direction => !canMove(afterLegal, candidate.piece.id, direction.delta));
                const beforeIllegal = snapshot();
                const illegalControl = illegalDirection && [...host.querySelectorAll('.huarong-direction-pad button')].find(button => button.textContent === illegalDirection.label);
                if (illegalControl) illegalControl.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                const illegalMoveUnchanged = sameState(beforeIllegal, snapshot());

                const resetButton = [...host.querySelectorAll('button')].find(button => button.textContent === '重置本局');
                if (resetButton) resetButton.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                const resetRestored = sameState(snapshot(), beforeSelection) && /步数 0/.test(host.querySelector('.pk32v-prompt')?.textContent || '');

                const nextButton = [...host.querySelectorAll('button')].find(button => button.textContent === '下一局');
                const previousButton = [...host.querySelectorAll('button')].find(button => button.textContent === '上一局');
                if (nextButton) nextButton.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                const nextWorked = currentSelect()?.value === '1' && host.querySelector('details pre')?.textContent === nativeData.levels[1].cells;
                if (previousButton) previousButton.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                const previousNextWorked = nextWorked && currentSelect()?.value === '0' && host.querySelector('details pre')?.textContent === nativeData.levels[0].cells;

                const keyboardPieces = snapshot();
                const keyboardCandidate = directions.map(direction => ({ direction, piece: keyboardPieces.find(piece => canMove(keyboardPieces, piece.id, direction.delta)) })).find(item => item.piece);
                const beforeKeyboard = keyboardPieces;
                const keyboardNode = keyboardCandidate && host.querySelector('[data-native-piece="' + keyboardCandidate.piece.id + '"]');
                if (keyboardNode) keyboardNode.click();
                await new Promise(resolve => setTimeout(resolve, 20));
                return {
                    viewport: innerWidth,
                    errors,
                    resourceOk,
                    resourceLevelCount: nativeData.levels.length,
                    catalogEntry,
                    startedFromCatalog: ready && !!gameRoot,
                    levelCount,
                    rawPayloadMatches,
                    boardCells,
                    blockLayoutValid,
                    allLayoutsValid,
                    allLayoutsRendered,
                    selectionVisible,
                    selectionStyle: selectedNode ? selectedNode.style.cssText : '',
                    selectionComputed: selectedNode ? getComputedStyle(selectedNode).borderTopColor : '',
                    legalClickMoved,
                    illegalMoveUnchanged,
                    resetRestored,
                    previousNextWorked,
                    keyboardCandidate: keyboardCandidate ? { key: keyboardCandidate.direction.key, delta: keyboardCandidate.direction.delta, id: keyboardCandidate.piece.id } : null,
                    beforeKeyboard,
                    overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
                    keyHandlerAdded: handlerCounts.added,
                    keyHandlerRemoved: handlerCounts.removed,
                    viewportFit: (() => {
                        const board = host.querySelector('.huarong-board');
                        if (!board || board.getBoundingClientRect().right > innerWidth + 1 || board.getBoundingClientRect().left < -1) return false;
                        return [...host.querySelectorAll('[data-native-piece]')].every(node => {
                            const rect = node.getBoundingClientRect(), bounds = board.getBoundingClientRect();
                            return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
                        });
                    })()
                };
            })()`);

            assert(prepared.keyboardCandidate, 'native Huarong layout must have a keyboard-test legal move');
            await cdp.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: prepared.keyboardCandidate.key,
                code: prepared.keyboardCandidate.key,
                windowsVirtualKeyCode: prepared.keyboardCandidate.key === 'ArrowUp' ? 38 : prepared.keyboardCandidate.key === 'ArrowDown' ? 40 : prepared.keyboardCandidate.key === 'ArrowLeft' ? 37 : 39,
                nativeVirtualKeyCode: prepared.keyboardCandidate.key === 'ArrowUp' ? 38 : prepared.keyboardCandidate.key === 'ArrowDown' ? 40 : prepared.keyboardCandidate.key === 'ArrowLeft' ? 37 : 39
            });
            await cdp.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: prepared.keyboardCandidate.key,
                code: prepared.keyboardCandidate.key,
                windowsVirtualKeyCode: prepared.keyboardCandidate.key === 'ArrowUp' ? 38 : prepared.keyboardCandidate.key === 'ArrowDown' ? 40 : prepared.keyboardCandidate.key === 'ArrowLeft' ? 37 : 39,
                nativeVirtualKeyCode: prepared.keyboardCandidate.key === 'ArrowUp' ? 38 : prepared.keyboardCandidate.key === 'ArrowDown' ? 40 : prepared.keyboardCandidate.key === 'ArrowLeft' ? 37 : 39
            });
            const afterKeyboard = await cdp.evaluate(`(() => {
                const nodes = [...document.querySelectorAll('#pk32-huarong-cdp-host [data-native-piece]')];
                return nodes.map(node => ({ id: node.dataset.nativePiece, row: Number(node.dataset.row), col: Number(node.dataset.col) })).sort((a, b) => a.id.localeCompare(b.id));
            })()`);
            const expectedKeyboard = prepared.beforeKeyboard.map(piece => piece.id === prepared.keyboardCandidate.id ? Object.assign({}, piece, { row: piece.row + prepared.keyboardCandidate.delta[0], col: piece.col + prepared.keyboardCandidate.delta[1] }) : piece).map(piece => ({ id: piece.id, row: piece.row, col: piece.col })).sort((a, b) => a.id.localeCompare(b.id));
            prepared.keyboardMoved = JSON.stringify(afterKeyboard) === JSON.stringify(expectedKeyboard);

            const destroyedBefore = await cdp.evaluate(`(() => {
                if (window.__pk32HuarongSession && typeof window.__pk32HuarongSession.destroy === 'function') window.__pk32HuarongSession.destroy();
                else if (window.__pk32HuarongCatalog && typeof window.__pk32HuarongCatalog.stop === 'function') window.__pk32HuarongCatalog.stop();
                return { surfaceGone: !document.querySelector('#pk32-huarong-cdp-host .pk32v-game'), hostCount: document.querySelectorAll('#pk32-huarong-cdp-host .pk32v-game').length };
            })()`);
            await sleep(40);
            const destroyedAfter = await cdp.evaluate(`(() => {
                const before = document.querySelector('#pk32-huarong-cdp-host');
                const count = before ? before.querySelectorAll('.pk32v-game').length : 0;
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
                return { surfaceGone: count === 0, hostCount: count };
            })()`);
            const handlerCounts = await cdp.evaluate(`(() => ({
                added: document.__pk32HuarongHandlerCounts ? document.__pk32HuarongHandlerCounts.added : 0,
                removed: document.__pk32HuarongHandlerCounts ? document.__pk32HuarongHandlerCounts.removed : 0
            }))()`);
            const result = {
                viewport,
                resourceOk: prepared.resourceOk,
                resourceLevelCount: prepared.resourceLevelCount,
                catalogEntry: prepared.catalogEntry,
                startedFromCatalog: prepared.startedFromCatalog,
                levelCount: prepared.levelCount,
                rawPayloadMatches: prepared.rawPayloadMatches,
                boardCells: prepared.boardCells,
                blockLayoutValid: prepared.blockLayoutValid,
                allLayoutsValid: prepared.allLayoutsValid && prepared.allLayoutsRendered,
                selectionVisible: prepared.selectionVisible,
                selectionStyle: prepared.selectionStyle,
                selectionComputed: prepared.selectionComputed,
                legalClickMoved: prepared.legalClickMoved,
                illegalMoveUnchanged: prepared.illegalMoveUnchanged,
                resetRestored: prepared.resetRestored,
                previousNextWorked: prepared.previousNextWorked,
                keyboardMoved: prepared.keyboardMoved,
                viewportFit: prepared.viewportFit,
                overflow: prepared.overflow,
                destroyed: destroyedBefore.surfaceGone && destroyedAfter.surfaceGone,
                keyHandlerAdded: handlerCounts.added,
                keyHandlerRemoved: handlerCounts.removed,
                postDestroyKeyboardNoop: destroyedAfter.surfaceGone,
                errors: prepared.errors,
                debug: { handlerCounts, destroyedBefore, destroyedAfter }
            };
            results.push(result);
            console.log('DEBUG huarong-cdp width=' + viewport + ' ' + JSON.stringify(result));
            assertResult(result);
            console.log('PASS huarong-cdp width=' + viewport + ' ' + JSON.stringify(result));
        }
        assert.equal(protocolErrors.length, 0, 'browser runtime must not emit protocol exceptions: ' + protocolErrors.join('; '));
        console.log(JSON.stringify({ game: '华容道', viewports: [390, 1280], levelsPerViewport: 11, boardCells: 20, blockLayout: { caoCao: '2x2', generals: 5, soldiers: 4 }, results, fullGameRulesVerified: false, originalComplete: false, passed: true }));
    } finally {
        if (ws) ws.close();
        chrome.kill();
    }
})().catch(error => { console.error('FAIL huarong-cdp ' + (error.stack || error)); process.exitCode = 1; });
